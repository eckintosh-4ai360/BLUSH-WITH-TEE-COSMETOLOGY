/**
 * Empties the operational tables so a real school can be entered from scratch.
 *
 *   pnpm --filter @blush/db db:reset -- --confirm
 *
 * What survives, and why:
 *
 *   permissions, roles, rolePermissions   The authorisation catalogue. Wiping
 *                                         it locks everybody out until the next
 *                                         request happens to reseed it.
 *   systemSettings                        School profile, currency, grading
 *                                         bands — configuration, not content.
 *   expenseCategories                     Reference data the expense form needs.
 *   users / userRoles                     Only the owner account named by
 *                                         KEEP_ACCOUNTS, so there is still a
 *                                         way to sign in afterwards.
 *
 * Everything else goes, including the sample courses, stock and clinic
 * services. Those used to be re-created automatically by
 * `initializeFoundationData` on the next public page load; that call was
 * removed from the public routers precisely so this reset holds.
 *
 * There is no undo. The script refuses to run without `--confirm`, and refuses
 * outright in production.
 */

import "dotenv/config";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "./index";

/** Accounts that survive the reset, matched case-insensitively on email. */
const KEEP_ACCOUNTS = ["admin@bwtee.com"];

/**
 * Emptied with TRUNCATE, in one statement.
 *
 * `people` is deliberately NOT here. TRUNCATE CASCADE ignores `ON DELETE SET
 * NULL` and truncates the whole referencing table, so truncating `people`
 * would take `users` with it (`users.personId`), and `users` would take
 * `systemSettings` (`updatedByUserId`). It is deleted further down instead,
 * where the foreign keys behave the way they were declared to.
 */
const TRUNCATE_TABLES = [
  "applicationDocuments",
  "applications",
  "appointments",
  "assessmentResults",
  "assessments",
  "attendanceRecords",
  "auditLogs",
  "banners",
  "blogCategories",
  "blogPosts",
  "cartItems",
  "carts",
  "certificateVerifications",
  "certificates",
  "classSessions",
  "classes",
  "clinicServices",
  "coupons",
  "courseModules",
  "courses",
  "customerAddresses",
  "customers",
  "enrollments",
  "events",
  "expenses",
  "faqs",
  "feeAdjustments",
  "feeCharges",
  "feeStructures",
  "galleryItems",
  "intakes",
  "inventoryItems",
  "inventoryMovements",
  "mediaFiles",
  "notificationDeliveries",
  "notificationPreferences",
  "notifications",
  "orderAddresses",
  "orderItems",
  "orderStatusEvents",
  "pages",
  "paymentAllocations",
  "paymentIntents",
  "paymentPlans",
  "payments",
  "productCategories",
  "productImages",
  "productVariations",
  "purchaseOrderItems",
  "purchaseOrders",
  "revenueTransactions",
  "siteServices",
  "staffAssignments",
  "staffProfiles",
  "storeOrders",
  "studentProfiles",
  "supplierPayments",
  "suppliers",
  "testimonials",
  "webhookEvents",
];

/**
 * Cleared with DELETE rather than TRUNCATE, so `ON DELETE SET NULL` is honoured
 * and the accounts pointing at these rows survive. Safe to do plainly: every
 * table that references them has already been truncated above.
 */
const DELETE_TABLES = ["people"];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to reset a production database.");
  }

  if (!process.argv.includes("--confirm")) {
    console.error(
      "This deletes every student, application, payment, order and stock row.\n" +
        "There is no undo. Re-run with --confirm if that is what you want.",
    );
    process.exitCode = 1;
    return;
  }

  const db = await getDb();
  if (!db) throw new Error("Could not connect to the database");

  const before = await db.execute(sql`select count(*)::int as n from users`);
  const userCountBefore = Number((before.rows[0] as { n: number }).n);

  // Refuse if CASCADE would reach a table that is meant to survive. This is
  // the check that was missing the first time: `people` pulled `users` and
  // `systemSettings` down with it, both of which were supposed to be kept.
  const escapes = await cascadeEscapes(db, TRUNCATE_TABLES);
  if (escapes.length) {
    throw new Error(
      `TRUNCATE CASCADE would also empty: ${escapes.join(", ")}. ` +
        "Move those to DELETE_TABLES or add them to the list deliberately.",
    );
  }

  const list = sql.join(
    TRUNCATE_TABLES.map(table => sql.identifier(table)),
    sql`, `,
  );
  await db.execute(sql`truncate table ${list} restart identity cascade`);

  for (const table of DELETE_TABLES) {
    await db.execute(sql`delete from ${sql.identifier(table)}`);
  }

  // Done last: the tables that referenced these accounts are already empty, so
  // nothing is left pointing at a row that vanishes here.
  const keep = sql.join(
    KEEP_ACCOUNTS.map(email => sql`${email.toLowerCase()}`),
    sql`, `,
  );
  await db.execute(sql`delete from users where lower(email) not in (${keep})`);

  const after = await db.execute(sql`select count(*)::int as n from users`);
  const userCountAfter = Number((after.rows[0] as { n: number }).n);

  console.log(`Cleared ${TRUNCATE_TABLES.length + DELETE_TABLES.length} tables.`);
  console.log(`Accounts: ${userCountBefore} → ${userCountAfter} (kept ${KEEP_ACCOUNTS.join(", ")}).`);

  if (userCountAfter === 0) {
    console.warn(
      "\nNo account survived. Signing in will recreate the default owner with " +
        "the seeded password, which must then be changed.",
    );
  }

  const remaining = await db.execute(sql`
    select relname as table, n_live_tup as rows
    from pg_stat_user_tables
    where schemaname = 'public' and n_live_tup > 0
    order by n_live_tup desc
  `);

  console.log("\nStill holding rows (kept on purpose):");
  for (const row of remaining.rows as Array<{ table: string; rows: number }>) {
    console.log(`  ${String(row.rows).padStart(5)}  ${row.table}`);
  }

  await closeDb();
}

/**
 * Tables TRUNCATE CASCADE would reach beyond the ones asked for.
 *
 * Walks the foreign-key graph outward: anything referencing a table on the
 * list is truncated too, transitively, whatever its ON DELETE action says.
 */
async function cascadeEscapes(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  tables: string[],
): Promise<string[]> {
  const edges = await db.execute(sql`
    select
      child.relname  as referencing,
      parent.relname as referenced
    from pg_constraint c
    join pg_class child  on child.oid  = c.conrelid
    join pg_class parent on parent.oid = c.confrelid
    join pg_namespace n  on n.oid = child.relnamespace
    where c.contype = 'f' and n.nspname = 'public'
  `);

  const dependents = new Map<string, string[]>();
  for (const row of edges.rows as Array<{ referencing: string; referenced: string }>) {
    if (row.referencing === row.referenced) continue;
    const list = dependents.get(row.referenced) ?? [];
    list.push(row.referencing);
    dependents.set(row.referenced, list);
  }

  const reached = new Set(tables);
  const queue = [...tables];
  while (queue.length) {
    const current = queue.shift() as string;
    for (const child of dependents.get(current) ?? []) {
      if (!reached.has(child)) {
        reached.add(child);
        queue.push(child);
      }
    }
  }

  return [...reached].filter(table => !tables.includes(table)).sort();
}

main().catch(async error => {
  console.error(error);
  await closeDb().catch(() => {});
  process.exitCode = 1;
});
