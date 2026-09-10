import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ENV } from "@blush/env";
import { inventoryItems, people, suppliers, systemSettings, users } from "@blush/db/schema";
import { isStorageConfigured, storagePut } from "@blush/storage";
import type { Database, DbExecutor } from "../dbOrThrow";
import { recordAudit, type AuditActor } from "./audit";
import { announce, schoolName } from "./messaging/announce";
import { readMessagingConfig } from "./messaging/config";
import { flushInBackground } from "./messaging/dispatch";
import { money } from "./money";
import { buildLowStockPdf } from "./lowStockPdf";

// Telling the people who buy the stock that the stock is running out.
const ALERT_STATE_KEY = "inventory.lowStockAlert";

// Quiet period between automatic alerts.
const QUIET_PERIOD_MS = 30 * 60 * 1000;

// How many items the message itself names before deferring to the report.
const NAMED_IN_MESSAGE = 3;

export type LowStockRow = {
  id: number;
  sku: string;
  name: string;
  category: string;
  supplier: string | null;
  quantityOnHand: number;
  reorderLevel: number;
  // Units needed to climb back to the reorder level.
  shortfall: number;
  unitCost: number;
};

export type AlertState = { lastSentAt: string | null; itemIds: number[] };

export type LowStockAlertResult = {
  sent: boolean;
  // Items currently at or below their reorder level.
  lowCount: number;
  // Of those, the ones nobody had been told about yet.
  newlyLowCount: number;
  recipients: number;
  reportUrl: string | null;
  // Why nothing was sent, when nothing was.
  reason?: string;
};

// Everything currently at or below its reorder level.
export async function lowStockItems(db: DbExecutor, limit = 500): Promise<LowStockRow[]> {
  const rows = await db
    .select({
      id: inventoryItems.id,
      sku: inventoryItems.sku,
      name: inventoryItems.name,
      category: inventoryItems.category,
      supplier: suppliers.name,
      quantityOnHand: inventoryItems.quantityOnHand,
      reorderLevel: inventoryItems.reorderLevel,
      unitCost: inventoryItems.unitCost,
    })
    .from(inventoryItems)
    .leftJoin(suppliers, eq(inventoryItems.supplierId, suppliers.id))
    .where(
      and(
        eq(inventoryItems.isActive, true),
        isNull(inventoryItems.deletedAt),
        sql`${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`,
      ),
    )
    // Emptiest shelves first, ties broken by name so two reports run minutes apart list.
    .orderBy(asc(inventoryItems.quantityOnHand), asc(inventoryItems.name))
    .limit(limit);

  return rows.map(row => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    supplier: row.supplier ?? null,
    quantityOnHand: row.quantityOnHand,
    reorderLevel: row.reorderLevel,
    // An item sitting exactly on its reorder level still needs buying.
    shortfall: Math.max(1, row.reorderLevel - row.quantityOnHand),
    unitCost: money(row.unitCost),
  }));
}

// "Relaxer (out of stock, reorder at 5)" - one item, as a person would say it.
export function describeItem(row: Pick<LowStockRow, "name" | "quantityOnHand" | "reorderLevel">) {
  const left = row.quantityOnHand === 0 ? "out of stock" : `${row.quantityOnHand} left`;
  return `${row.name} (${left}, reorder at ${row.reorderLevel})`;
}

// Absolute link to something this dashboard serves.
export function absoluteAdminUrl(path: string): string {
  const origin = (ENV.adminUrl || ENV.siteUrl).replace(/\/+$/, "");
  return origin ? `${origin}${path}` : path;
}

async function readAlertState(db: DbExecutor): Promise<AlertState> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, ALERT_STATE_KEY))
    .limit(1);

  const stored = (row?.value ?? {}) as Partial<AlertState>;
  return {
    lastSentAt: typeof stored.lastSentAt === "string" ? stored.lastSentAt : null,
    itemIds: Array.isArray(stored.itemIds)
      ? stored.itemIds.filter((id): id is number => Number.isInteger(id))
      : [],
  };
}

async function writeAlertState(db: DbExecutor, state: AlertState): Promise<void> {
  await db
    .insert(systemSettings)
    .values({
      key: ALERT_STATE_KEY,
      category: "inventory",
      value: state as never,
      description: "Which items administrators have already been alerted about, and when.",
    })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: state as never } });
}

// Decides whether a crossing is worth a message.
export function shouldAlert(
  state: AlertState,
  currentIds: number[],
  now: Date,
  force = false,
): { send: boolean; newlyLow: number[]; reason?: string } {
  // Only items that are still low count as reported.
  const current = new Set(currentIds);
  const alreadyTold = new Set(state.itemIds.filter(id => current.has(id)));
  const newlyLow = currentIds.filter(id => !alreadyTold.has(id));

  if (!currentIds.length) return { send: false, newlyLow, reason: "Nothing is low." };
  if (force) return { send: true, newlyLow };
  if (!newlyLow.length) {
    return { send: false, newlyLow, reason: "Everything low has already been reported." };
  }

  const last = state.lastSentAt ? Date.parse(state.lastSentAt) : Number.NaN;
  if (Number.isFinite(last) && now.getTime() - last < QUIET_PERIOD_MS) {
    return { send: false, newlyLow, reason: "An alert went out within the last half hour." };
  }

  return { send: true, newlyLow };
}

type Recipient = {
  userId: number;
  name: string;
  email: string | null;
  phone: string | null;
  isAdmin: boolean;
};

// Who hears about it.
async function alertRecipients(db: DbExecutor): Promise<Recipient[]> {
  const rows = await db
    .select({
      userId: users.id,
      role: users.role,
      accountName: users.name,
      email: users.email,
      personName: people.fullName,
      phone: people.phone,
    })
    .from(users)
    .leftJoin(people, eq(users.personId, people.id))
    .where(and(inArray(users.role, ["admin", "staff"]), eq(users.isActive, true)));

  return rows.map(row => ({
    userId: row.userId,
    name: row.personName ?? row.accountName ?? row.email ?? "Administrator",
    email: row.email,
    phone: row.phone,
    isAdmin: row.role === "admin",
  }));
}

// Publishes the report and returns the link the email carries.
async function publishReport(
  rows: LowStockRow[],
  meta: { schoolName: string; requestedBy?: string | null },
): Promise<{ url: string; key: string } | null> {
  if (!isStorageConfigured()) return null;

  try {
    const pdf = await buildLowStockPdf(rows, {
      schoolName: meta.schoolName,
      generatedAt: new Date(),
      requestedBy: meta.requestedBy,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const stored = await storagePut(`reports/low-stock-${stamp}.pdf`, pdf, "application/pdf");
    return { url: absoluteAdminUrl(stored.url), key: stored.key };
  } catch {
    // Swallowed deliberately.
    return null;
  }
}

// Raises the alert.
export async function alertLowStock(
  db: Database,
  options: { force?: boolean; actor?: AuditActor } = {},
): Promise<LowStockAlertResult> {
  const rows = await lowStockItems(db);
  const currentIds = rows.map(row => row.id);
  const state = await readAlertState(db);
  const now = new Date();

  const decision = shouldAlert(state, currentIds, now, options.force);

  if (!decision.send) {
    // An item that has been restocked is forgotten, so that falling again counts as news.
    const pruned = state.itemIds.filter(id => currentIds.includes(id));
    if (pruned.length !== state.itemIds.length) {
      await writeAlertState(db, { ...state, itemIds: pruned });
    }

    return {
      sent: false,
      lowCount: rows.length,
      newlyLowCount: decision.newlyLow.length,
      recipients: 0,
      reportUrl: null,
      reason: decision.reason,
    };
  }

  const [school, recipients, config] = await Promise.all([
    schoolName(db),
    alertRecipients(db),
    readMessagingConfig(db),
  ]);

  const report = await publishReport(rows, {
    schoolName: school,
    requestedBy: options.actor?.name ?? null,
  });
  const reportUrl = report?.url ?? absoluteAdminUrl("/inventory?filter=low");

  // The worst few lead, because a reader stops after the first line.
  const named = rows.slice(0, NAMED_IN_MESSAGE);
  const remainder = rows.length - named.length;
  const listed = named.map(row => `- ${describeItem(row)}`).join("\n");

  const facts = {
    school,
    count: rows.length,
    items: remainder > 0 ? `${listed}\n- and ${remainder} more in the report` : listed,
    topItem: rows[0] ? describeItem(rows[0]) : "",
    // The report itself.
    url: reportUrl,
    // Where the text message points instead.
    dashboard: absoluteAdminUrl("/inventory?filter=low"),
  };

  const title = `${rows.length} item${rows.length === 1 ? "" : "s"} at or below reorder level`;
  const body = named.map(describeItem).join(", ");

  await db.transaction(async tx => {
    for (const recipient of recipients) {
      await announce(
        tx,
        {
          type: "low_stock",
          recipient: {
            name: recipient.name,
            email: recipient.email,
            // Staff get the in-app row and the email.
            phone: recipient.isAdmin ? recipient.phone : null,
            userId: recipient.userId,
          },
          title,
          body,
          facts,
          entityType: "inventory",
          link: "/inventory?filter=low",
        },
        config,
      );
    }

    await writeAlertState(tx, { lastSentAt: now.toISOString(), itemIds: currentIds });

    if (options.actor) {
      await recordAudit(tx, options.actor, {
        action: "low_stock_alert",
        entity: "inventory",
        newValue: {
          items: rows.length,
          newlyLow: decision.newlyLow.length,
          recipients: recipients.length,
          reportKey: report?.key ?? null,
        },
        summary: `${rows.length} item${rows.length === 1 ? "" : "s"} reported low to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`,
      });
    }
  });

  flushInBackground(db);

  return {
    sent: true,
    lowCount: rows.length,
    newlyLowCount: decision.newlyLow.length,
    recipients: recipients.length,
    reportUrl,
  };
}

// The same thing, for a caller that has just finished a sale.
export function alertLowStockInBackground(db: Database, actor?: AuditActor): void {
  void alertLowStock(db, { actor }).catch(() => {});
}
