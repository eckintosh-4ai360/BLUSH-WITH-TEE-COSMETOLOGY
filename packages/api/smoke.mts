/**
 * Runs the read-side of the admin API against the real database.
 *
 * Type checking cannot catch a malformed query - only executing it can. This
 * exercises every dashboard, list and analytics procedure with an owner-level
 * context and reports what came back.
 *
 * Run from packages/api:  npx tsx smoke.mts
 */

// Environment comes from `node --env-file`, so no dotenv dependency is needed.
import { adminAppRouter } from "./adminRouter";
import { clientAppRouter } from "./clientRouter";
import type { TrpcContext } from "./context";
import { closeDb, getDb, users } from "@blush/db";
import { eq } from "drizzle-orm";

async function adminContext(): Promise<TrpcContext> {
  const db = await getDb();
  if (!db) throw new Error("No database connection - check DATABASE_URL.");

  const [owner] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  if (!owner) throw new Error("No admin user found. Seed the demo data first.");

  return {
    req: new Request("http://localhost/"),
    ipAddress: "127.0.0.1",
    userAgent: "smoke-test",
    user: owner as TrpcContext["user"],
  };
}

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

async function check(name: string, run: () => Promise<unknown>) {
  try {
    const value = await run();
    results.push({ name, ok: true, detail: summarise(value) });
  } catch (error) {
    results.push({ name, ok: false, detail: (error as Error).message });
  }
}

function summarise(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `${value.length} rows`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.rows)) return `${record.rows.length} of ${record.total} rows`;
    return Object.entries(record)
      .slice(0, 4)
      .map(([key, entry]) => `${key}=${brief(entry)}`)
      .join(" ");
  }
  return String(value);
}

function brief(value: unknown): string {
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value && typeof value === "object") return "{...}";
  return String(value);
}

async function main() {
  const ctx = await adminContext();
  const admin = adminAppRouter.createCaller(ctx);
  const client = clientAppRouter.createCaller(ctx);
  const list = { page: 1, pageSize: 5, sortDir: "desc" as const };

  await check("dashboard.overview", () => admin.dashboard.overview());
  await check("dashboard.charts", () => admin.dashboard.charts());
  await check("dashboard.activity", () => admin.dashboard.activity());
  await check("dashboard.search", () => admin.dashboard.search({ term: "STU" }));

  await check("finance.payments", () => admin.finance.payments(list));
  await check("finance.expenses", () => admin.finance.expenses(list));
  await check("finance.revenue", () => admin.finance.revenue(list));
  await check("finance.outstanding", () => admin.finance.outstanding(list));
  await check("finance.feeStructures", () => admin.finance.feeStructures());
  await check("finance.expenseCategories", () => admin.finance.expenseCategories());

  await check("inventory.items", () => admin.inventory.items({ ...list, stockFilter: "all" }));
  await check("inventory.movements", () => admin.inventory.movements(list));
  await check("inventory.suppliers", () => admin.inventory.suppliers(list));
  await check("inventory.purchaseOrders", () => admin.inventory.purchaseOrders(list));
  await check("inventory.categories", () => admin.inventory.categories());

  await check("orders.list", () => admin.orders.list(list));
  await check("certificates.list", () => admin.certificates.list(list));
  await check("certificates.eligible", () => admin.certificates.eligible());

  await check("platform.auditLog", () => admin.platform.auditLog(list));
  await check("platform.auditFacets", () => admin.platform.auditFacets());
  await check("platform.roles", () => admin.platform.roles());
  await check("platform.accounts", () => admin.platform.accounts(list));
  await check("platform.settings", () => admin.platform.settings());

  await check("notifications.list", () => admin.notifications.list({ unreadOnly: false, limit: 5 }));
  await check("auth.session", () => admin.auth.session());

  await check("store.products", () => client.store.products());
  await check("certificates.verify", () => client.certificates.verify({ value: "COS-2026-00001" }));

  // Detail views need a real id, so pick one up from the lists above.
  const orders = await admin.orders.list({ ...list, pageSize: 1 });
  if (orders.rows[0]) {
    await check("orders.detail", () => admin.orders.detail({ orderId: orders.rows[0]!.id }));
  }

  const owing = await admin.finance.outstanding({ ...list, pageSize: 1 });
  if (owing.rows[0]) {
    await check("finance.studentAccount", () =>
      admin.finance.studentAccount({ studentId: owing.rows[0]!.studentId }),
    );
  }

  const failures = results.filter(result => !result.ok);

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name.padEnd(30)} ${result.detail}`);
  }

  console.log(`\n${results.length - failures.length}/${results.length} passed`);
  if (failures.length) process.exitCode = 1;
}

main()
  .catch(error => {
    console.error("Smoke run failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
