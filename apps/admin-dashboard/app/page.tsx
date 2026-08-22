"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  BadgeCheck,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  Clock,
  FileCheck2,
  FileX2,
  GraduationCap,
  Layers,
  PackageX,
  Receipt,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Truck,
  UserRoundPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { ChartFrame } from "@blush/ui/components/viz/ChartFrame";
import {
  CategoryBarChart,
  DualLineChart,
  GroupedBarChart,
  MoneyTrendChart,
  SingleColumnChart,
} from "@blush/ui/components/viz/Charts";
import { StatGroup, StatTile } from "@blush/ui/components/viz/StatTile";
import { SERIES, compactMoney, compactNumber, formatMoney } from "@blush/ui/lib/viz";
import DashboardLayout from "@/components/DashboardLayout";
import { QuickActions } from "@/components/QuickActions";
import { trpc } from "@/lib/trpc";

/** Trims "Aug 2026" to "Aug" so a twelve-month axis does not collide. */
const shortMonth = (label: string) => label.split(" ")[0] ?? label;

const countFormat = (value: number) => compactNumber(value);

export default function AdminOverviewPage() {
  const overview = trpc.dashboard.overview.useQuery();
  const charts = trpc.dashboard.charts.useQuery();
  const activity = trpc.dashboard.activity.useQuery();

  const students = overview.data?.students;
  const finance = overview.data?.finance;
  const inventory = overview.data?.inventory;
  const commerce = overview.data?.commerce;
  const admissions = overview.data?.admissions;

  const revenueRows = (charts.data?.revenue ?? []).map(row => ({
    ...row,
    short: shortMonth(row.label),
  }));
  const enrollmentRows = (charts.data?.enrollment ?? []).map(row => ({
    ...row,
    short: shortMonth(row.label),
  }));
  const movementRows = (charts.data?.movement ?? []).map(row => ({
    ...row,
    short: shortMonth(row.label),
  }));
  const expenseRows = charts.data?.expenses ?? [];
  const productRows = charts.data?.products ?? [];
  const popularityRows = charts.data?.popularity ?? [];

  const loading = overview.isLoading;
  const chartsLoading = charts.isLoading;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-8 pb-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Blush With Tee
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
              The school, at a glance
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every figure below is calculated from real transactions, not stored totals.
            </p>
          </div>
          <QuickActions />
        </header>

        {students ? (
          <StatGroup title="Students" description="Enrolment health across the school.">
            <StatTile
              label="Total students"
              value={compactNumber(students.total)}
              icon={Users}
              href="/students"
              isLoading={loading}
              emphasis
            />
            <StatTile
              label="Active"
              value={compactNumber(students.active)}
              icon={GraduationCap}
              tone="good"
              href="/students?status=active"
              isLoading={loading}
            />
            <StatTile
              label="New admissions"
              value={compactNumber(students.newAdmissions)}
              hint="This month"
              icon={UserRoundPlus}
              href="/students"
              isLoading={loading}
            />
            <StatTile
              label="Graduated"
              value={compactNumber(students.graduated)}
              icon={BadgeCheck}
              href="/students?status=graduated"
              isLoading={loading}
            />
            <StatTile
              label="Suspended"
              value={compactNumber(students.suspended)}
              icon={Ban}
              tone={students.suspended > 0 ? "warning" : "default"}
              href="/students?status=suspended"
              isLoading={loading}
            />
            <StatTile
              label="Owing fees"
              value={compactNumber(students.withOutstandingFees)}
              icon={Wallet}
              tone={students.withOutstandingFees > 0 ? "warning" : "good"}
              href="/finance/fees"
              isLoading={loading}
            />
          </StatGroup>
        ) : null}

        {finance ? (
          <StatGroup title="Finance" description="Money in, money out, and what is still owed.">
            <StatTile
              label="Today's income"
              value={formatMoney(finance.todayIncome)}
              icon={CircleDollarSign}
              href="/finance"
              isLoading={loading}
              emphasis
            />
            <StatTile
              label="Monthly income"
              value={formatMoney(finance.monthlyIncome)}
              icon={TrendingUp}
              href="/finance"
              isLoading={loading}
            />
            <StatTile
              label="Student fees"
              value={formatMoney(finance.studentFeesCollected)}
              hint="Collected to date"
              icon={Receipt}
              href="/finance/payments"
              isLoading={loading}
            />
            <StatTile
              label="Product sales"
              value={formatMoney(finance.productSales)}
              icon={ShoppingBag}
              href="/orders"
              isLoading={loading}
            />
            <StatTile
              label="Expenses"
              value={formatMoney(finance.monthlyExpenses)}
              hint="This month"
              icon={TrendingDown}
              href="/finance/expenses"
              isLoading={loading}
            />
            <StatTile
              label="Net income"
              value={formatMoney(finance.monthlyNetIncome)}
              hint="This month"
              icon={Wallet}
              tone={finance.monthlyNetIncome >= 0 ? "good" : "critical"}
              href="/finance"
              isLoading={loading}
            />
            <StatTile
              label="Outstanding fees"
              value={formatMoney(finance.outstandingFees)}
              icon={AlertTriangle}
              tone={finance.outstandingFees > 0 ? "warning" : "good"}
              href="/finance/fees"
              isLoading={loading}
            />
          </StatGroup>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          {inventory ? (
            <StatGroup title="Inventory" description="One shared stock pool.">
              <StatTile
                label="Products"
                value={compactNumber(inventory.totalProducts)}
                icon={Boxes}
                href="/inventory"
                isLoading={loading}
              />
              <StatTile
                label="Low stock"
                value={compactNumber(inventory.lowStock)}
                icon={AlertTriangle}
                tone={inventory.lowStock > 0 ? "warning" : "good"}
                href="/inventory?filter=low"
                isLoading={loading}
              />
              <StatTile
                label="Out of stock"
                value={compactNumber(inventory.outOfStock)}
                icon={PackageX}
                tone={inventory.outOfStock > 0 ? "critical" : "good"}
                href="/inventory?filter=out"
                isLoading={loading}
              />
              <StatTile
                label="Stock value"
                value={formatMoney(inventory.inventoryValue)}
                hint="At cost"
                icon={Layers}
                href="/inventory"
                isLoading={loading}
              />
            </StatGroup>
          ) : null}

          {commerce ? (
            <StatGroup title="E-commerce" description="Storefront orders and revenue.">
              <StatTile
                label="Today's orders"
                value={compactNumber(commerce.todayOrders)}
                icon={ShoppingBag}
                href="/orders"
                isLoading={loading}
              />
              <StatTile
                label="Pending"
                value={compactNumber(commerce.pendingOrders)}
                icon={Clock}
                tone={commerce.pendingOrders > 0 ? "warning" : "default"}
                href="/orders?status=pending"
                isLoading={loading}
              />
              <StatTile
                label="Delivered"
                value={compactNumber(commerce.deliveredOrders)}
                icon={Truck}
                tone="good"
                href="/orders?status=delivered"
                isLoading={loading}
              />
              <StatTile
                label="Sales revenue"
                value={formatMoney(commerce.salesRevenue)}
                icon={CircleDollarSign}
                href="/orders"
                isLoading={loading}
              />
            </StatGroup>
          ) : null}
        </div>

        {admissions ? (
          <StatGroup title="Admissions" description="The application pipeline.">
            <StatTile
              label="Applications"
              value={compactNumber(admissions.total)}
              icon={ClipboardList}
              href="/admissions"
              isLoading={loading}
            />
            <StatTile
              label="Pending review"
              value={compactNumber(admissions.pending)}
              icon={Clock}
              tone={admissions.pending > 0 ? "warning" : "good"}
              href="/admissions?status=pending"
              isLoading={loading}
            />
            <StatTile
              label="Approved"
              value={compactNumber(admissions.approved)}
              icon={FileCheck2}
              tone="good"
              href="/admissions?status=approved"
              isLoading={loading}
            />
            <StatTile
              label="Rejected"
              value={compactNumber(admissions.rejected)}
              icon={FileX2}
              href="/admissions?status=rejected"
              isLoading={loading}
            />
          </StatGroup>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* Analytics                                                        */}
        {/* ---------------------------------------------------------------- */}

        <div className="grid gap-4 xl:grid-cols-2">
          {charts.data?.revenue ? (
            <ChartFrame
              title="Revenue and expenses"
              subtitle="Monthly, in cedis. Income streams stack; spend is the line."
              series={[
                { key: "studentFees", label: "Student fees", color: SERIES[0], format: formatMoney },
                { key: "productSales", label: "Product sales", color: SERIES[1], format: formatMoney },
                { key: "otherIncome", label: "Other income", color: SERIES[2], format: formatMoney },
                { key: "expenses", label: "Expenses", color: SERIES[3], format: formatMoney },
              ]}
              rows={revenueRows}
              categoryLabel="Month"
              isLoading={chartsLoading}
              isEmpty={revenueRows.every(row => row.total === 0 && row.expenses === 0)}
              emptyMessage="No revenue or expenses recorded yet."
              className="xl:col-span-2"
            >
              <MoneyTrendChart
                data={revenueRows}
                stacked={[
                  { key: "studentFees", label: "Student fees", color: SERIES[0] },
                  { key: "productSales", label: "Product sales", color: SERIES[1] },
                  { key: "otherIncome", label: "Other income", color: SERIES[2] },
                ]}
                line={{ key: "expenses", label: "Expenses", color: SERIES[3] }}
                format={compactMoney}
              />
            </ChartFrame>
          ) : null}

          {charts.data?.expenses ? (
            <ChartFrame
              title="Expenses by category"
              subtitle="Last twelve months."
              series={[{ key: "total", label: "Spend", color: SERIES[0], format: formatMoney }]}
              rows={expenseRows}
              categoryLabel="Category"
              isLoading={chartsLoading}
              isEmpty={!expenseRows.length}
              emptyMessage="No expenses recorded yet."
            >
              <CategoryBarChart
                data={expenseRows}
                dataKey="total"
                color={SERIES[0]}
                format={compactMoney}
              />
            </ChartFrame>
          ) : null}

          {charts.data?.enrollment ? (
            <ChartFrame
              title="New enrolments"
              subtitle="Students starting a course each month."
              series={[{ key: "enrollments", label: "Enrolments", color: SERIES[2] }]}
              rows={enrollmentRows}
              categoryLabel="Month"
              isLoading={chartsLoading}
              isEmpty={enrollmentRows.every(row => row.enrollments === 0)}
              emptyMessage="No enrolments recorded yet."
            >
              <SingleColumnChart
                data={enrollmentRows}
                dataKey="enrollments"
                color={SERIES[2]}
                format={countFormat}
              />
            </ChartFrame>
          ) : null}

          {charts.data?.products ? (
            <ChartFrame
              title="Best-selling products"
              subtitle="Revenue from paid orders."
              series={[{ key: "revenue", label: "Revenue", color: SERIES[0], format: formatMoney }]}
              rows={productRows}
              categoryKey="name"
              categoryLabel="Product"
              isLoading={chartsLoading}
              isEmpty={!productRows.length}
              emptyMessage="No paid product orders yet."
            >
              <CategoryBarChart
                data={productRows}
                dataKey="revenue"
                categoryKey="name"
                color={SERIES[0]}
                format={compactMoney}
              />
            </ChartFrame>
          ) : null}

          {charts.data?.popularity ? (
            <ChartFrame
              title="Course popularity"
              subtitle="Applications received against students enrolled."
              series={[
                { key: "enrollments", label: "Enrolments", color: SERIES[2] },
                { key: "applications", label: "Applications", color: SERIES[1] },
              ]}
              rows={popularityRows}
              categoryKey="title"
              categoryLabel="Course"
              isLoading={chartsLoading}
              isEmpty={!popularityRows.length}
              emptyMessage="No courses recorded yet."
            >
              <GroupedBarChart
                data={popularityRows}
                categoryKey="title"
                series={[
                  { key: "enrollments", label: "Enrolments", color: SERIES[2] },
                  { key: "applications", label: "Applications", color: SERIES[1] },
                ]}
                format={countFormat}
              />
            </ChartFrame>
          ) : null}

          {charts.data?.movement ? (
            <ChartFrame
              title="Inventory movement"
              subtitle="Units received against units issued, from the stock ledger."
              series={[
                { key: "received", label: "Received", color: SERIES[3] },
                { key: "issued", label: "Issued", color: SERIES[0] },
              ]}
              rows={movementRows}
              categoryLabel="Month"
              isLoading={chartsLoading}
              isEmpty={movementRows.every(row => row.received === 0 && row.issued === 0)}
              emptyMessage="No stock movements recorded yet."
            >
              <DualLineChart
                data={movementRows}
                series={[
                  { key: "received", label: "Received", color: SERIES[3] },
                  { key: "issued", label: "Issued", color: SERIES[0] },
                ]}
                format={countFormat}
              />
            </ChartFrame>
          ) : null}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Recent activity                                                  */}
        {/* ---------------------------------------------------------------- */}

        <div className="grid gap-4 xl:grid-cols-2">
          <ActivityPanel
            title="Recent applications"
            href="/admissions"
            isLoading={activity.isLoading}
            isEmpty={!activity.data?.recentApplications.length}
            emptyMessage="No applications received yet."
          >
            {activity.data?.recentApplications.map(item => (
              <ActivityRow
                key={item.id}
                href={`/admissions?application=${item.id}`}
                primary={item.fullName}
                secondary={`${item.reference} · ${item.courseTitle}`}
                badge={item.status.replaceAll("_", " ")}
              />
            ))}
          </ActivityPanel>

          <ActivityPanel
            title="Recent orders"
            href="/orders"
            isLoading={activity.isLoading}
            isEmpty={!activity.data?.recentOrders.length}
            emptyMessage="No store orders yet."
          >
            {activity.data?.recentOrders.map(order => (
              <ActivityRow
                key={order.id}
                href={`/orders/${order.id}`}
                primary={order.orderNumber}
                secondary={`${order.customerName} · ${formatMoney(order.total)}`}
                badge={order.fulfillmentStatus}
              />
            ))}
          </ActivityPanel>

          <ActivityPanel
            title="Recent payments"
            href="/finance/payments"
            isLoading={activity.isLoading}
            isEmpty={!activity.data?.recentPayments.length}
            emptyMessage="No payments recorded yet."
          >
            {activity.data?.recentPayments.map(payment => (
              <ActivityRow
                key={payment.id}
                href="/finance/payments"
                primary={payment.studentName ?? payment.reference}
                secondary={`${payment.reference} · ${payment.paymentMethod.replaceAll("_", " ")}`}
                badge={formatMoney(payment.amount)}
              />
            ))}
          </ActivityPanel>

          <ActivityPanel
            title="Low stock"
            href="/inventory?filter=low"
            isLoading={activity.isLoading}
            isEmpty={!activity.data?.lowStock.length}
            emptyMessage="Every item is above its reorder level."
          >
            {activity.data?.lowStock.map(item => (
              <ActivityRow
                key={item.id}
                href={`/inventory?item=${item.id}`}
                primary={item.name}
                secondary={`${item.sku} · reorder at ${item.reorderLevel}`}
                badge={`${item.quantityOnHand} left`}
                tone={item.quantityOnHand === 0 ? "critical" : "warning"}
              />
            ))}
          </ActivityPanel>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ActivityPanel({
  title,
  href,
  isLoading,
  isEmpty,
  emptyMessage,
  children,
}: {
  title: string;
  href: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
        <Link href={href} className="text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </div>
      <div className="mt-4 space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(index => (
              <div key={index} className="h-14 animate-pulse rounded-2xl bg-muted/60" />
            ))}
          </div>
        ) : isEmpty ? (
          <p className="rounded-2xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function ActivityRow({
  href,
  primary,
  secondary,
  badge,
  tone = "default",
}: {
  href: string;
  primary: string;
  secondary: string;
  badge: string;
  tone?: "default" | "warning" | "critical";
}) {
  const toneClass =
    tone === "critical"
      ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
      : tone === "warning"
        ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
        : "bg-muted text-muted-foreground";

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-4 py-3 transition-colors hover:bg-muted"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{primary}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{secondary}</span>
      </span>
      <Badge className={`shrink-0 capitalize hover:${toneClass} ${toneClass}`}>{badge}</Badge>
    </Link>
  );
}
