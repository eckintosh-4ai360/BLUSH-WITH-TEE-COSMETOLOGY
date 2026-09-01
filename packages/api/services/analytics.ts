import { and, count, desc, eq, gte, isNull, lte, ne, sql, type SQL } from "drizzle-orm";
import {
  applications,
  courses,
  enrollments,
  expenses,
  feeCharges,
  inventoryItems,
  inventoryMovements,
  orderItems,
  payments,
  revenueTransactions,
  storeOrders,
  studentProfiles,
} from "@blush/db/schema";
import type { DbExecutor } from "../dbOrThrow";
import { fromMinor, toMinor } from "./money";

/**
 * Ghana keeps GMT year-round, so a UTC day boundary is the local business day.
 * Centralised here so every "today" figure on the dashboard agrees.
 */
export function startOfToday(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function startOfMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function startOfMonthsAgo(months: number, now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
}

const asNumber = (value: unknown) => Number(value ?? 0);

/* -------------------------------------------------------------------------- */
/* Headline metrics (§20)                                                     */
/* -------------------------------------------------------------------------- */

export async function studentMetrics(db: DbExecutor) {
  const monthStart = startOfMonth();

  const [statusRows, [newAdmissions], [owing]] = await Promise.all([
    db
      .select({ status: studentProfiles.status, total: count() })
      .from(studentProfiles)
      .where(isNull(studentProfiles.deletedAt))
      .groupBy(studentProfiles.status),
    db
      .select({ total: count() })
      .from(studentProfiles)
      .where(and(isNull(studentProfiles.deletedAt), gte(studentProfiles.createdAt, monthStart))),
    // Students with at least one charge still carrying a balance.
    db
      .select({ total: sql<number>`count(distinct ${feeCharges.studentId})` })
      .from(feeCharges)
      .where(sql`${feeCharges.status} in ('open', 'partially_paid') and ${feeCharges.amountDue} > ${feeCharges.amountPaid}`),
  ]);

  const byStatus = new Map(statusRows.map(row => [row.status, asNumber(row.total)]));
  const total = statusRows.reduce((sum, row) => sum + asNumber(row.total), 0);

  return {
    total,
    active: byStatus.get("active") ?? 0,
    newAdmissions: asNumber(newAdmissions?.total),
    graduated: byStatus.get("graduated") ?? 0,
    suspended: byStatus.get("suspended") ?? 0,
    completed: byStatus.get("completed") ?? 0,
    withdrawn: byStatus.get("withdrawn") ?? 0,
    withOutstandingFees: asNumber(owing?.total),
  };
}

/**
 * What share of the money taken in was kept, as a percentage.
 *
 * Both arguments are in minor units so the division is not taken from an
 * already-rounded cedi figure. A period with no income has no margin to
 * report rather than a division by zero - the same guard the profit-and-loss
 * report uses.
 */
export function profitMargin(incomeMinor: number, expenseMinor: number): number {
  if (incomeMinor <= 0) return 0;
  return ((incomeMinor - expenseMinor) / incomeMinor) * 100;
}

export async function financeMetrics(db: DbExecutor) {
  const todayStart = startOfToday();
  const monthStart = startOfMonth();

  const sumRevenue = (where?: SQL) =>
    db
      .select({ total: sql<string>`coalesce(sum(${revenueTransactions.amount}), 0)` })
      .from(revenueTransactions)
      .where(where);

  const [
    [todayIncome],
    [monthIncome],
    [feeIncome],
    [productIncome],
    [monthExpenses],
    [allExpenses],
    [outstanding],
    [totalIncome],
  ] = await Promise.all([
    sumRevenue(gte(revenueTransactions.occurredAt, todayStart)),
    sumRevenue(gte(revenueTransactions.occurredAt, monthStart)),
    sumRevenue(
      sql`${revenueTransactions.source} in ('student_fee', 'application_fee', 'registration')`,
    ),
    sumRevenue(eq(revenueTransactions.source, "product_sale")),
    db
      .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
      .from(expenses)
      .where(
        and(
          isNull(expenses.deletedAt),
          ne(expenses.approvalStatus, "rejected"),
          gte(expenses.expenseDate, monthStart),
        ),
      ),
    db
      .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
      .from(expenses)
      .where(and(isNull(expenses.deletedAt), ne(expenses.approvalStatus, "rejected"))),
    db
      .select({
        total: sql<string>`coalesce(sum(${feeCharges.amountDue} - ${feeCharges.amountPaid}), 0)`,
      })
      .from(feeCharges)
      .where(sql`${feeCharges.status} in ('open', 'partially_paid')`),
    sumRevenue(undefined),
  ]);

  const monthIncomeMinor = toMinor(monthIncome?.total);
  const monthExpenseMinor = toMinor(monthExpenses?.total);
  const lifetimeIncomeMinor = toMinor(totalIncome?.total);
  const lifetimeExpenseMinor = toMinor(allExpenses?.total);

  return {
    todayIncome: fromMinor(toMinor(todayIncome?.total)),
    monthlyIncome: fromMinor(monthIncomeMinor),
    studentFeesCollected: fromMinor(toMinor(feeIncome?.total)),
    productSales: fromMinor(toMinor(productIncome?.total)),
    monthlyExpenses: fromMinor(monthExpenseMinor),
    totalExpenses: fromMinor(lifetimeExpenseMinor),
    totalIncome: fromMinor(lifetimeIncomeMinor),
    monthlyNetIncome: fromMinor(monthIncomeMinor - monthExpenseMinor),
    netIncome: fromMinor(lifetimeIncomeMinor - lifetimeExpenseMinor),
    monthlyMargin: profitMargin(monthIncomeMinor, monthExpenseMinor),
    margin: profitMargin(lifetimeIncomeMinor, lifetimeExpenseMinor),
    outstandingFees: fromMinor(toMinor(outstanding?.total)),
  };
}

export async function inventoryMetrics(db: DbExecutor) {
  const [[totals], [lowStock], [outOfStock]] = await Promise.all([
    db
      .select({
        products: count(),
        value: sql<string>`coalesce(sum(${inventoryItems.quantityOnHand} * ${inventoryItems.unitCost}), 0)`,
        retailValue: sql<string>`coalesce(sum(${inventoryItems.quantityOnHand} * ${inventoryItems.sellingPrice}), 0)`,
      })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.isActive, true), isNull(inventoryItems.deletedAt))),
    db
      .select({ total: count() })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.isActive, true),
          isNull(inventoryItems.deletedAt),
          sql`${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`,
          sql`${inventoryItems.quantityOnHand} > 0`,
        ),
      ),
    db
      .select({ total: count() })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.isActive, true),
          isNull(inventoryItems.deletedAt),
          eq(inventoryItems.quantityOnHand, 0),
        ),
      ),
  ]);

  return {
    totalProducts: asNumber(totals?.products),
    lowStock: asNumber(lowStock?.total),
    outOfStock: asNumber(outOfStock?.total),
    inventoryValue: fromMinor(toMinor(totals?.value)),
    retailValue: fromMinor(toMinor(totals?.retailValue)),
  };
}

export async function commerceMetrics(db: DbExecutor) {
  const todayStart = startOfToday();

  const [[todayOrders], statusRows, [salesRevenue]] = await Promise.all([
    db
      .select({ total: count() })
      .from(storeOrders)
      .where(gte(storeOrders.createdAt, todayStart)),
    db
      .select({ status: storeOrders.fulfillmentStatus, total: count() })
      .from(storeOrders)
      .groupBy(storeOrders.fulfillmentStatus),
    db
      .select({ total: sql<string>`coalesce(sum(${revenueTransactions.amount}), 0)` })
      .from(revenueTransactions)
      .where(eq(revenueTransactions.source, "product_sale")),
  ]);

  const byStatus = new Map(statusRows.map(row => [row.status, asNumber(row.total)]));
  const pending =
    (byStatus.get("new") ?? 0) +
    (byStatus.get("confirmed") ?? 0) +
    (byStatus.get("processing") ?? 0) +
    (byStatus.get("ready") ?? 0);

  return {
    todayOrders: asNumber(todayOrders?.total),
    pendingOrders: pending,
    shippedOrders: byStatus.get("shipped") ?? 0,
    deliveredOrders: byStatus.get("delivered") ?? 0,
    cancelledOrders: byStatus.get("cancelled") ?? 0,
    salesRevenue: fromMinor(toMinor(salesRevenue?.total)),
  };
}

export async function admissionMetrics(db: DbExecutor) {
  const rows = await db
    .select({ status: applications.status, total: count() })
    .from(applications)
    .where(isNull(applications.deletedAt))
    .groupBy(applications.status);

  const byStatus = new Map(rows.map(row => [row.status, asNumber(row.total)]));
  const total = rows.reduce((sum, row) => sum + asNumber(row.total), 0);

  return {
    total,
    pending:
      (byStatus.get("submitted") ?? 0) +
      (byStatus.get("under_review") ?? 0) +
      (byStatus.get("more_information") ?? 0),
    approved: byStatus.get("approved") ?? 0,
    rejected: byStatus.get("rejected") ?? 0,
    draft: byStatus.get("draft") ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Chart series (§20, §70)                                                    */
/* -------------------------------------------------------------------------- */

const MONTH_KEY = (column: unknown) => sql<string>`to_char(${column}, 'YYYY-MM')`;

/** Revenue by month, split into the streams the owner compares. */
export async function revenueByMonth(db: DbExecutor, months = 12) {
  const since = startOfMonthsAgo(months - 1);

  const [revenueRows, expenseRows] = await Promise.all([
    db
      .select({
        month: MONTH_KEY(revenueTransactions.occurredAt),
        source: revenueTransactions.source,
        total: sql<string>`coalesce(sum(${revenueTransactions.amount}), 0)`,
      })
      .from(revenueTransactions)
      .where(gte(revenueTransactions.occurredAt, since))
      .groupBy(MONTH_KEY(revenueTransactions.occurredAt), revenueTransactions.source),
    db
      .select({
        month: MONTH_KEY(expenses.expenseDate),
        total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
      })
      .from(expenses)
      .where(
        and(
          isNull(expenses.deletedAt),
          ne(expenses.approvalStatus, "rejected"),
          gte(expenses.expenseDate, since),
        ),
      )
      .groupBy(MONTH_KEY(expenses.expenseDate)),
  ]);

  const expenseByMonth = new Map(expenseRows.map(row => [row.month, toMinor(row.total)]));
  const buckets = monthBuckets(months);

  return buckets.map(bucket => {
    const forMonth = revenueRows.filter(row => row.month === bucket.key);
    const pick = (sources: string[]) =>
      fromMinor(
        forMonth
          .filter(row => sources.includes(row.source))
          .reduce((sum, row) => sum + toMinor(row.total), 0),
      );

    const total = fromMinor(forMonth.reduce((sum, row) => sum + toMinor(row.total), 0));
    const expenseTotal = fromMinor(expenseByMonth.get(bucket.key) ?? 0);

    return {
      month: bucket.key,
      label: bucket.label,
      studentFees: pick(["student_fee", "application_fee", "registration"]),
      productSales: pick(["product_sale"]),
      otherIncome: pick(["service", "other"]),
      total,
      expenses: expenseTotal,
      net: Math.round((total - expenseTotal) * 100) / 100,
    };
  });
}

/** Expenses grouped by category, for the spend breakdown chart. */
export async function expensesByCategory(db: DbExecutor, months = 12) {
  const since = startOfMonthsAgo(months - 1);

  const rows = await db
    .select({
      category: expenses.category,
      total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
      entries: count(),
    })
    .from(expenses)
    .where(
      and(
        isNull(expenses.deletedAt),
        ne(expenses.approvalStatus, "rejected"),
        gte(expenses.expenseDate, since),
      ),
    )
    .groupBy(expenses.category)
    .orderBy(desc(sql`sum(${expenses.amount})`));

  return rows.map(row => ({
    category: row.category,
    label: humanise(row.category),
    total: fromMinor(toMinor(row.total)),
    entries: asNumber(row.entries),
  }));
}

/** New enrolments per month, so intake momentum is visible. */
export async function enrollmentByMonth(db: DbExecutor, months = 12) {
  const since = startOfMonthsAgo(months - 1);

  const rows = await db
    .select({
      month: MONTH_KEY(enrollments.enrolledAt),
      total: count(),
    })
    .from(enrollments)
    .where(gte(enrollments.enrolledAt, since))
    .groupBy(MONTH_KEY(enrollments.enrolledAt));

  const byMonth = new Map(rows.map(row => [row.month, asNumber(row.total)]));

  return monthBuckets(months).map(bucket => ({
    month: bucket.key,
    label: bucket.label,
    enrollments: byMonth.get(bucket.key) ?? 0,
  }));
}

/** Best-selling products by units and revenue. */
export async function productSales(db: DbExecutor, limit = 8) {
  const rows = await db
    .select({
      inventoryItemId: orderItems.inventoryItemId,
      name: orderItems.itemName,
      units: sql<number>`coalesce(sum(${orderItems.quantity} - ${orderItems.quantityReturned}), 0)`,
      revenue: sql<string>`coalesce(sum(${orderItems.lineTotal}), 0)`,
    })
    .from(orderItems)
    .innerJoin(storeOrders, eq(orderItems.orderId, storeOrders.id))
    .where(eq(storeOrders.paymentStatus, "paid"))
    .groupBy(orderItems.inventoryItemId, orderItems.itemName)
    .orderBy(desc(sql`sum(${orderItems.lineTotal})`))
    .limit(limit);

  return rows.map(row => ({
    inventoryItemId: row.inventoryItemId,
    name: row.name,
    units: asNumber(row.units),
    revenue: fromMinor(toMinor(row.revenue)),
  }));
}

/** Which courses attract applications and enrolments (§70 course popularity). */
export async function coursePopularity(db: DbExecutor, limit = 8) {
  const rows = await db
    .select({
      courseId: courses.id,
      title: courses.title,
      enrollments: sql<number>`count(distinct ${enrollments.id})`,
      applications: sql<number>`count(distinct ${applications.id})`,
    })
    .from(courses)
    .leftJoin(enrollments, eq(enrollments.courseId, courses.id))
    .leftJoin(applications, eq(applications.courseId, courses.id))
    .where(isNull(courses.deletedAt))
    .groupBy(courses.id, courses.title)
    .orderBy(desc(sql`count(distinct ${enrollments.id})`))
    .limit(limit);

  return rows.map(row => ({
    courseId: row.courseId,
    title: row.title,
    enrollments: asNumber(row.enrollments),
    applications: asNumber(row.applications),
  }));
}

/** Stock in vs stock out per month, from the movement ledger. */
export async function inventoryMovementByMonth(db: DbExecutor, months = 12) {
  const since = startOfMonthsAgo(months - 1);

  const rows = await db
    .select({
      month: MONTH_KEY(inventoryMovements.createdAt),
      received: sql<number>`coalesce(sum(case when ${inventoryMovements.quantityDelta} > 0 then ${inventoryMovements.quantityDelta} else 0 end), 0)`,
      issued: sql<number>`coalesce(sum(case when ${inventoryMovements.quantityDelta} < 0 then -${inventoryMovements.quantityDelta} else 0 end), 0)`,
    })
    .from(inventoryMovements)
    .where(gte(inventoryMovements.createdAt, since))
    .groupBy(MONTH_KEY(inventoryMovements.createdAt));

  const byMonth = new Map(rows.map(row => [row.month, row]));

  return monthBuckets(months).map(bucket => {
    const row = byMonth.get(bucket.key);
    return {
      month: bucket.key,
      label: bucket.label,
      received: asNumber(row?.received),
      issued: asNumber(row?.issued),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Dense month axis, so a quiet month renders as zero rather than vanishing. */
export function monthBuckets(months: number, now = new Date()) {
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - index), 1),
    );
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return { key, label: `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}` };
  });
}

export function humanise(value: string): string {
  return value
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export { lte };
