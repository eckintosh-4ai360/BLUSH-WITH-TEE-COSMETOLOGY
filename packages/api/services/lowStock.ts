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

/**
 * Telling the people who buy the stock that the stock is running out.
 *
 * The alert is raised wherever stock is consumed, the moment a movement takes
 * an item down to its reorder level, and it goes out on every channel an
 * administrator has: the in-app notification, an email, and a text message.
 * The text is the point of the exercise - an owner is rarely at the dashboard
 * when the last tub of relaxer is sold - so it has to carry the whole story in
 * the space a text message has. It cannot, so it carries a link to a PDF of
 * the full list instead.
 *
 * Two things this is careful about:
 *
 *   Text messages cost money. An alert is sent for an item the administrators
 *   have not already been told about, and not again for that item until it has
 *   been restocked - otherwise every sale of an already-low item would send
 *   another text. `inventory.lowStockAlert` is where that memory lives.
 *
 *   Nothing here may break a sale. Every automatic entry point runs after the
 *   transaction has committed and swallows its own failures: a storage outage
 *   or an empty SMS balance must not turn a completed checkout into an error
 *   the customer sees.
 */

/** Where the record of what has already been alerted on is kept. */
const ALERT_STATE_KEY = "inventory.lowStockAlert";

/**
 * Quiet period between automatic alerts.
 *
 * Booking in a delivery that takes thirty items past their reorder level, each
 * in its own transaction, should not send thirty texts. Items that go low
 * during the quiet period are deliberately not marked as reported, so they
 * lead the next alert rather than being lost.
 */
const QUIET_PERIOD_MS = 30 * 60 * 1000;

/** How many items the message itself names before deferring to the report. */
const NAMED_IN_MESSAGE = 3;

export type LowStockRow = {
  id: number;
  sku: string;
  name: string;
  category: string;
  supplier: string | null;
  quantityOnHand: number;
  reorderLevel: number;
  /** Units needed to climb back to the reorder level. Never less than one. */
  shortfall: number;
  unitCost: number;
};

export type AlertState = { lastSentAt: string | null; itemIds: number[] };

export type LowStockAlertResult = {
  sent: boolean;
  /** Items currently at or below their reorder level. */
  lowCount: number;
  /** Of those, the ones nobody had been told about yet. */
  newlyLowCount: number;
  recipients: number;
  reportUrl: string | null;
  /** Why nothing was sent, when nothing was. */
  reason?: string;
};

/**
 * Everything currently at or below its reorder level.
 *
 * The comparison is `<=`, matching the low-stock filter, the dashboard tile
 * and the reports page. Worst first, because the reader is deciding what to
 * buy today rather than reading alphabetically.
 */
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
    // Emptiest shelves first, ties broken by name so two reports run minutes
    // apart list the same items in the same order.
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
    // An item sitting exactly on its reorder level still needs buying, so the
    // shortfall never reports as nothing to do.
    shortfall: Math.max(1, row.reorderLevel - row.quantityOnHand),
    unitCost: money(row.unitCost),
  }));
}

/** "Relaxer (out of stock, reorder at 5)" - one item, as a person would say it. */
export function describeItem(row: Pick<LowStockRow, "name" | "quantityOnHand" | "reorderLevel">) {
  const left = row.quantityOnHand === 0 ? "out of stock" : `${row.quantityOnHand} left`;
  return `${row.name} (${left}, reorder at ${row.reorderLevel})`;
}

/**
 * Absolute link to something this dashboard serves.
 *
 * Falls back to the relative path when no origin is configured. A link that
 * opens nowhere is still more use in an email than no link at all, and the
 * messages are worded so they read sensibly either way.
 */
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

/**
 * Decides whether a crossing is worth a message.
 *
 * Kept pure, so the rule that governs how much the school spends on text
 * messages can be read - and tested - without a database.
 */
export function shouldAlert(
  state: AlertState,
  currentIds: number[],
  now: Date,
  force = false,
): { send: boolean; newlyLow: number[]; reason?: string } {
  // Only items that are still low count as reported. One that was restocked
  // and has fallen again is news a second time.
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

/**
 * Who hears about it.
 *
 * Administrators and staff both get the in-app row and the email, because both
 * work the stockroom. Only administrators get the text: it is chargeable, and
 * replacing the stock is the owner's decision to make.
 */
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

/**
 * Publishes the report and returns the link the messages carry.
 *
 * The file goes under `reports/`, which `classifyStorageKey` treats as
 * internal, so the link only opens for somebody signed in to the dashboard.
 * That matters here: the URL travels by SMS, and a text message is not a
 * private channel.
 *
 * Returns null when storage is unconfigured or the upload fails, and the alert
 * then points at the low-stock list in the dashboard instead. Being told about
 * the shelf without a PDF beats not being told.
 */
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
    // Swallowed deliberately. The fallback below is a working alert, and why a
    // PDF failed to render is not something an administrator being warned
    // about their stock can act on.
    return null;
  }
}

/**
 * Raises the alert: compiles the report, then writes the messages.
 *
 * Call it once the transaction that consumed the stock has committed. It opens
 * its own transaction, so the notifications, the delivery rows and the record
 * of what was reported are written together and none survives if any fails.
 */
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
    // An item that has been restocked is forgotten, so that falling again
    // counts as news. Only worth a write when something actually changed.
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

  // The worst few lead, because a reader stops after the first line. The rest
  // are a count, not a wall of names.
  const named = rows.slice(0, NAMED_IN_MESSAGE);
  const remainder = rows.length - named.length;
  const listed = named.map(row => `- ${describeItem(row)}`).join("\n");

  const facts = {
    school,
    count: rows.length,
    items: remainder > 0 ? `${listed}\n- and ${remainder} more in the report` : listed,
    topItem: rows[0] ? describeItem(rows[0]) : "",
    url: reportUrl,
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
            // Staff get the in-app row and the email. The chargeable channel
            // is reserved for the people who authorise the purchase.
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

/**
 * The same thing, for a caller that has just finished a sale.
 *
 * Nothing is awaited and nothing can throw. The checkout is already complete
 * by the time this runs, and a failed alert is not the customer's problem;
 * whatever went wrong is still on the delivery row, which is where anybody
 * looking into it would look.
 */
export function alertLowStockInBackground(db: Database, actor?: AuditActor): void {
  void alertLowStock(db, { actor }).catch(() => {});
}
