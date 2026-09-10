// Empties operational tables to reset database to initial configuration.

import "dotenv/config";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "./index";

// Accounts that survive the reset, matched case-insensitively on email.
const KEEP_ACCOUNTS = ["admin@bwtee.com"];

// Operational tables emptied via TRUNCATE CASCADE.
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

// Tables cleared via DELETE to preserve foreign key nullification.
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

  // Guard against cascade truncating protected tables.
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

  // Delete non-whitelisted users after dependent rows are cleared.
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

// Identifies dependent tables that would be affected by cascade truncation.
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
