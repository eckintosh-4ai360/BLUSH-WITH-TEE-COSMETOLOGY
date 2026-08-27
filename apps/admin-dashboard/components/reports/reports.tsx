"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Card } from "@blush/ui/components/ui/card";
import { formatMoney } from "@blush/ui/lib/viz";
import { DataTable, type Column } from "@/components/DataTable";
import { ReportTable, type ReportColumn } from "@/components/reports/ReportTable";
import { collectAllPages } from "@/lib/exportAll";
import type { ExportMeta } from "@/lib/exportTable";
import { describeRange, resolveRange, type RangeKey } from "@/lib/reportRange";
import { trpc } from "@/lib/trpc";

/**
 * The individual reports.
 *
 * Two shapes, for two kinds of question. A report that aggregates the whole
 * database into a handful of rows renders with ReportTable; one that lists
 * records renders with DataTable, which pages on the server and walks every
 * page when exporting so a download is never just the rows on screen.
 */

function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function useRange(rangeKey: RangeKey) {
  return useMemo(() => resolveRange(rangeKey), [rangeKey]);
}

/** The window is printed on the export, so a saved file says what it covers. */
function rangeMeta(rangeKey: RangeKey): ExportMeta[] {
  return [{ label: "Period", value: describeRange(resolveRange(rangeKey)) }];
}

/** Headline figures above a report. */
function Figures({ items }: { items: Array<{ label: string; value: ReactNode; tone?: "good" | "bad" }> }) {
  return (
    <Card className="p-5">
      <dl className="flex flex-wrap gap-x-10 gap-y-4">
        {items.map(item => (
          <div key={item.label}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {item.label}
            </dt>
            <dd
              className={`mt-1 text-xl font-semibold tabular-nums ${
                item.tone === "bad"
                  ? "text-destructive"
                  : item.tone === "good"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-foreground"
              }`}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** Reads "2026-03" as a month a person recognises. */
function monthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/* Finance                                                                    */
/* -------------------------------------------------------------------------- */

type MonthRow = { month: string; income: number; expenses: number; profit: number };

export function IncomeVsExpensesReport({ rangeKey }: { rangeKey: RangeKey }) {
  const range = useRange(rangeKey);
  const query = trpc.reports.incomeVsExpenses.useQuery({
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  });

  const totals = query.data?.totals;

  const columns: ReportColumn<MonthRow>[] = [
    { key: "month", header: "Month", cell: row => monthLabel(row.month), value: row => row.month },
    {
      key: "income",
      header: "Income",
      align: "right",
      cell: row => formatMoney(row.income),
      value: row => row.income,
    },
    {
      key: "expenses",
      header: "Expenses",
      align: "right",
      cell: row => formatMoney(row.expenses),
      value: row => row.expenses,
    },
    {
      key: "profit",
      header: "Profit",
      align: "right",
      cell: row => (
        <span className={row.profit < 0 ? "font-medium text-destructive" : "font-medium"}>
          {formatMoney(row.profit)}
        </span>
      ),
      value: row => row.profit,
    },
  ];

  return (
    <div className="space-y-6">
      {totals ? (
        <Figures
          items={[
            { label: "Income", value: formatMoney(totals.income) },
            { label: "Expenses", value: formatMoney(totals.expenses) },
            {
              label: "Profit",
              value: formatMoney(totals.profit),
              tone: totals.profit < 0 ? "bad" : "good",
            },
          ]}
        />
      ) : null}

      <ReportTable
        title="Income vs expenses"
        description="One row per month with activity. Refunds are already netted off income."
        columns={columns}
        rows={query.data?.rows ?? []}
        rowKey={row => row.month}
        isLoading={query.isLoading}
        error={query.error ? { message: query.error.message } : null}
        exportFileName="income-vs-expenses"
        meta={rangeMeta(rangeKey)}
        footer={
          totals ? (
            <span className="flex flex-wrap gap-6">
              <span>
                Income <strong>{formatMoney(totals.income)}</strong>
              </span>
              <span>
                Expenses <strong>{formatMoney(totals.expenses)}</strong>
              </span>
              <span>
                Profit <strong>{formatMoney(totals.profit)}</strong>
              </span>
            </span>
          ) : null
        }
      />
    </div>
  );
}

type LineRow = { label: string; amount: number };

export function ProfitAndLossReport({ rangeKey }: { rangeKey: RangeKey }) {
  const range = useRange(rangeKey);
  const query = trpc.reports.profitAndLoss.useQuery({
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  });

  const data = query.data;

  const columns = (total: number): ReportColumn<LineRow>[] => [
    {
      key: "label",
      header: "Line",
      cell: row => <span className="capitalize">{row.label.replaceAll("_", " ")}</span>,
      value: row => row.label.replaceAll("_", " "),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: row => formatMoney(row.amount),
      value: row => row.amount,
    },
    {
      key: "share",
      header: "Share",
      align: "right",
      cell: row => (total > 0 ? percent((row.amount / total) * 100) : "—"),
      value: row => (total > 0 ? Number(((row.amount / total) * 100).toFixed(1)) : 0),
    },
  ];

  return (
    <div className="space-y-6">
      {data ? (
        <Figures
          items={[
            { label: "Total income", value: formatMoney(data.totalIncome) },
            { label: "Total expenses", value: formatMoney(data.totalExpenses) },
            {
              label: "Net profit",
              value: formatMoney(data.netProfit),
              tone: data.netProfit < 0 ? "bad" : "good",
            },
            { label: "Margin", value: percent(data.margin) },
          ]}
        />
      ) : null}

      <ReportTable
        title="Income by source"
        columns={columns(data?.totalIncome ?? 0)}
        rows={data?.income ?? []}
        rowKey={row => row.label}
        isLoading={query.isLoading}
        error={query.error ? { message: query.error.message } : null}
        exportFileName="profit-and-loss-income"
        meta={rangeMeta(rangeKey)}
        emptyMessage="No income recorded in this period."
      />

      <ReportTable
        title="Expenses by category"
        description="Rejected expenses are left out — a proposal turned down is not money spent."
        columns={columns(data?.totalExpenses ?? 0)}
        rows={data?.expenses ?? []}
        rowKey={row => row.label}
        isLoading={query.isLoading}
        error={query.error ? { message: query.error.message } : null}
        exportFileName="profit-and-loss-expenses"
        meta={rangeMeta(rangeKey)}
        emptyMessage="No expenses recorded in this period."
      />
    </div>
  );
}

type FeeRow = {
  feeType: string;
  charges: number;
  billed: number;
  collected: number;
  outstanding: number;
  collectionRate: number;
};

export function FeeCollectionReport({ rangeKey }: { rangeKey: RangeKey }) {
  const range = useRange(rangeKey);
  const query = trpc.reports.feeCollection.useQuery({
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  });

  const totals = query.data?.totals;

  const columns: ReportColumn<FeeRow>[] = [
    {
      key: "feeType",
      header: "Fee type",
      cell: row => <span className="capitalize">{row.feeType}</span>,
      value: row => row.feeType,
    },
    { key: "charges", header: "Charges", align: "right", value: row => row.charges },
    {
      key: "billed",
      header: "Billed",
      align: "right",
      cell: row => formatMoney(row.billed),
      value: row => row.billed,
    },
    {
      key: "collected",
      header: "Collected",
      align: "right",
      cell: row => formatMoney(row.collected),
      value: row => row.collected,
    },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right",
      cell: row => (
        <span className={row.outstanding > 0 ? "font-medium text-destructive" : undefined}>
          {formatMoney(row.outstanding)}
        </span>
      ),
      value: row => row.outstanding,
    },
    {
      key: "collectionRate",
      header: "Collected %",
      align: "right",
      cell: row => percent(row.collectionRate),
      value: row => Number(row.collectionRate.toFixed(1)),
    },
  ];

  return (
    <div className="space-y-6">
      {totals ? (
        <Figures
          items={[
            { label: "Billed", value: formatMoney(totals.billed) },
            { label: "Collected", value: formatMoney(totals.collected) },
            {
              label: "Outstanding",
              value: formatMoney(totals.outstanding),
              tone: totals.outstanding > 0 ? "bad" : undefined,
            },
            { label: "Collection rate", value: percent(totals.collectionRate) },
          ]}
        />
      ) : null}

      <ReportTable
        title="Fee collection"
        description="Collection is read from each charge, so a part payment counts against the charge it settled."
        columns={columns}
        rows={query.data?.rows ?? []}
        rowKey={row => row.feeType}
        isLoading={query.isLoading}
        error={query.error ? { message: query.error.message } : null}
        exportFileName="fee-collection"
        meta={rangeMeta(rangeKey)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* School                                                                     */
/* -------------------------------------------------------------------------- */

type CourseRow = {
  courseId: number;
  code: string;
  title: string;
  enrolled: number;
  completed: number;
  completionRate: number;
  averageProgress: number;
  resultsRecorded: number;
  averageScore: number;
  certificatesIssued: number;
};

export function CoursePerformanceReport({ rangeKey }: { rangeKey: RangeKey }) {
  const range = useRange(rangeKey);
  const query = trpc.reports.coursePerformance.useQuery({
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  });

  const totals = query.data?.totals;

  const columns: ReportColumn<CourseRow>[] = [
    {
      key: "title",
      header: "Programme",
      cell: row => (
        <span>
          <span className="font-medium text-foreground">{row.title}</span>
          <span className="block text-xs text-muted-foreground">{row.code}</span>
        </span>
      ),
      value: row => row.title,
    },
    { key: "enrolled", header: "Enrolled", align: "right", value: row => row.enrolled },
    { key: "completed", header: "Completed", align: "right", value: row => row.completed },
    {
      key: "completionRate",
      header: "Completed %",
      align: "right",
      cell: row => percent(row.completionRate),
      value: row => Number(row.completionRate.toFixed(1)),
    },
    {
      key: "averageProgress",
      header: "Avg progress",
      align: "right",
      cell: row => percent(row.averageProgress),
      value: row => Number(row.averageProgress.toFixed(1)),
    },
    {
      key: "averageScore",
      header: "Avg score",
      align: "right",
      cell: row =>
        row.resultsRecorded > 0 ? percent(row.averageScore) : <span className="text-muted-foreground">—</span>,
      value: row => (row.resultsRecorded > 0 ? Number(row.averageScore.toFixed(1)) : ""),
    },
    {
      key: "certificatesIssued",
      header: "Certificates",
      align: "right",
      value: row => row.certificatesIssued,
    },
  ];

  return (
    <div className="space-y-6">
      {totals ? (
        <Figures
          items={[
            { label: "Programmes", value: totals.courses },
            { label: "Enrolled", value: totals.enrolled },
            { label: "Completed", value: totals.completed },
            { label: "Certificates", value: totals.certificatesIssued },
          ]}
        />
      ) : null}

      <ReportTable
        title="Course performance"
        description="Average score is out of each assessment's own total, so programmes marked differently still compare."
        columns={columns}
        rows={query.data?.rows ?? []}
        rowKey={row => row.courseId}
        isLoading={query.isLoading}
        error={query.error ? { message: query.error.message } : null}
        exportFileName="course-performance"
        meta={rangeMeta(rangeKey)}
        emptyMessage="No programmes have been created yet."
      />
    </div>
  );
}

type AttendanceRow = {
  studentId: number;
  studentNumber: string;
  fullName: string;
  sessions: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  attendanceRate: number;
};

export function AttendanceReport({ rangeKey }: { rangeKey: RangeKey }) {
  const range = useRange(rangeKey);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  const filters = {
    sortDir: "desc" as const,
    search: search || undefined,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  };

  const query = trpc.reports.attendance.useQuery({ ...filters, page, pageSize: 25 });

  const columns: Column<AttendanceRow>[] = [
    {
      key: "fullName",
      header: "Student",
      cell: row => (
        <span>
          <span className="font-medium text-foreground">{row.fullName}</span>
          <span className="block text-xs text-muted-foreground">{row.studentNumber}</span>
        </span>
      ),
      value: row => row.fullName,
    },
    { key: "sessions", header: "Sessions", align: "right" },
    { key: "present", header: "Present", align: "right" },
    { key: "late", header: "Late", align: "right" },
    { key: "absent", header: "Absent", align: "right" },
    { key: "excused", header: "Excused", align: "right", optional: true },
    {
      key: "attendanceRate",
      header: "Rate",
      align: "right",
      cell: row => (
        <span className={row.attendanceRate < 75 ? "font-medium text-destructive" : "font-medium"}>
          {percent(row.attendanceRate)}
        </span>
      ),
      value: row => Number(row.attendanceRate.toFixed(1)),
    },
  ];

  return (
    <DataTable
      title="Attendance"
      description="Excused absences are left out of the rate — an authorised absence is not a missed session."
      pdfTitle={`Attendance — ${describeRange(range)}`}
      columns={columns}
      data={query.data}
      isLoading={query.isLoading}
      isFetching={query.isFetching}
      error={query.error ? { message: query.error.message } : null}
      search={search}
      onSearchChange={value => {
        setSearch(value);
        setPage(1);
      }}
      searchPlaceholder="Search by name or student number..."
      page={page}
      onPageChange={setPage}
      rowKey={row => row.studentId}
      exportFileName="attendance"
      fetchAllRows={() =>
        collectAllPages((page, pageSize) =>
          utils.reports.attendance.fetch({ ...filters, page, pageSize }),
        )
      }
      emptyMessage="No attendance has been recorded in this period."
    />
  );
}

type GraduateRow = {
  certificateId: number;
  certificateNumber: string;
  studentNumber: string;
  fullName: string;
  email: string;
  courseTitle: string;
  finalGrade: string | null;
  completionDate: Date;
  issuedAt: Date;
};

export function GraduatesReport({ rangeKey }: { rangeKey: RangeKey }) {
  const range = useRange(rangeKey);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  const filters = {
    sortDir: "desc" as const,
    search: search || undefined,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  };

  const query = trpc.reports.graduates.useQuery({ ...filters, page, pageSize: 25 });

  const columns: Column<GraduateRow>[] = [
    {
      key: "fullName",
      header: "Graduate",
      cell: row => (
        <span>
          <span className="font-medium text-foreground">{row.fullName}</span>
          <span className="block text-xs text-muted-foreground">{row.studentNumber}</span>
        </span>
      ),
      value: row => row.fullName,
    },
    { key: "courseTitle", header: "Programme" },
    { key: "certificateNumber", header: "Certificate" },
    { key: "finalGrade", header: "Grade", cell: row => row.finalGrade ?? "—" },
    { key: "email", header: "Email", optional: true },
    {
      key: "completionDate",
      header: "Completed",
      cell: row => new Date(row.completionDate).toLocaleDateString("en-GB"),
      value: row => new Date(row.completionDate).toISOString().slice(0, 10),
    },
    {
      key: "issuedAt",
      header: "Issued",
      cell: row => new Date(row.issuedAt).toLocaleDateString("en-GB"),
      value: row => new Date(row.issuedAt).toISOString().slice(0, 10),
    },
  ];

  return (
    <DataTable
      title="Graduates"
      description="Students holding an issued certificate. Revoked awards are excluded."
      pdfTitle={`Graduates — ${describeRange(range)}`}
      columns={columns}
      data={query.data}
      isLoading={query.isLoading}
      isFetching={query.isFetching}
      error={query.error ? { message: query.error.message } : null}
      search={search}
      onSearchChange={value => {
        setSearch(value);
        setPage(1);
      }}
      searchPlaceholder="Search by name, student number or certificate..."
      page={page}
      onPageChange={setPage}
      rowKey={row => row.certificateId}
      exportFileName="graduates"
      fetchAllRows={() =>
        collectAllPages((page, pageSize) =>
          utils.reports.graduates.fetch({ ...filters, page, pageSize }),
        )
      }
      emptyMessage="No certificates have been issued in this period."
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Stock and commerce                                                         */
/* -------------------------------------------------------------------------- */

type StockRow = {
  id: number;
  sku: string;
  name: string;
  categoryName: string | null;
  supplierName: string | null;
  quantityOnHand: number;
  reorderLevel: number;
  unitCost: number;
  sellingPrice: number;
  isSellable: boolean;
  costValue: number;
  retailValue: number;
  isLowStock: boolean;
};

export function StockValuationReport() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  const filters = { sortDir: "desc" as const, search: search || undefined };
  const query = trpc.reports.stockValuation.useQuery({ ...filters, page, pageSize: 25 });
  const totals = query.data?.totals;

  const columns: Column<StockRow>[] = [
    {
      key: "name",
      header: "Item",
      cell: row => (
        <span>
          <span className="font-medium text-foreground">{row.name}</span>
          <span className="block text-xs text-muted-foreground">{row.sku}</span>
        </span>
      ),
      value: row => row.name,
    },
    { key: "categoryName", header: "Category", cell: row => row.categoryName ?? "—" },
    { key: "supplierName", header: "Supplier", optional: true, cell: row => row.supplierName ?? "—" },
    {
      key: "quantityOnHand",
      header: "On hand",
      align: "right",
      cell: row => (
        <span className={row.isLowStock ? "font-medium text-destructive" : undefined}>
          {row.quantityOnHand}
        </span>
      ),
      value: row => row.quantityOnHand,
    },
    {
      key: "unitCost",
      header: "Unit cost",
      align: "right",
      cell: row => formatMoney(row.unitCost),
      value: row => row.unitCost,
    },
    {
      key: "costValue",
      header: "Value at cost",
      align: "right",
      cell: row => <span className="font-medium">{formatMoney(row.costValue)}</span>,
      value: row => row.costValue,
    },
    {
      key: "retailValue",
      header: "Value at retail",
      align: "right",
      cell: row =>
        row.isSellable ? (
          formatMoney(row.retailValue)
        ) : (
          <span className="text-muted-foreground">Not sold</span>
        ),
      value: row => (row.isSellable ? row.retailValue : ""),
    },
  ];

  return (
    <div className="space-y-6">
      {totals ? (
        <Figures
          items={[
            { label: "Value at cost", value: formatMoney(totals.atCost) },
            { label: "Value at retail", value: formatMoney(totals.atRetail) },
            { label: "Potential margin", value: formatMoney(totals.potentialMargin) },
            { label: "Units on hand", value: totals.units },
            {
              label: "Low stock",
              value: totals.lowStock,
              tone: totals.lowStock > 0 ? "bad" : undefined,
            },
          ]}
        />
      ) : null}

      <DataTable
        title="Stock valuation"
        description="Retail value counts only items offered for sale, so classroom consumables are not valued at a price they will never be sold at."
        pdfTitle="Stock valuation"
        columns={columns}
        data={query.data}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        error={query.error ? { message: query.error.message } : null}
        search={search}
        onSearchChange={value => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search by item name or SKU..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        exportFileName="stock-valuation"
        fetchAllRows={() =>
          collectAllPages((page, pageSize) =>
            utils.reports.stockValuation.fetch({ ...filters, page, pageSize }),
          )
        }
        emptyMessage="No stock items have been added yet."
      />
    </div>
  );
}

type SalesRow = {
  itemName: string;
  unitsSold: number;
  orderCount: number;
  revenue: number;
};

export function ProductSalesReport({ rangeKey }: { rangeKey: RangeKey }) {
  const range = useRange(rangeKey);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  const filters = {
    sortDir: "desc" as const,
    search: search || undefined,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  };

  const query = trpc.reports.productSales.useQuery({ ...filters, page, pageSize: 25 });

  const columns: Column<SalesRow>[] = [
    { key: "itemName", header: "Product" },
    { key: "unitsSold", header: "Units sold", align: "right" },
    { key: "orderCount", header: "Orders", align: "right" },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      cell: row => <span className="font-medium">{formatMoney(row.revenue)}</span>,
      value: row => row.revenue,
    },
  ];

  return (
    <DataTable
      title="Product sales"
      description="Cancelled orders are excluded — an order placed and withdrawn is not a sale."
      pdfTitle={`Product sales — ${describeRange(range)}`}
      columns={columns}
      data={query.data}
      isLoading={query.isLoading}
      isFetching={query.isFetching}
      error={query.error ? { message: query.error.message } : null}
      search={search}
      onSearchChange={value => {
        setSearch(value);
        setPage(1);
      }}
      searchPlaceholder="Search by product name..."
      page={page}
      onPageChange={setPage}
      rowKey={row => row.itemName}
      exportFileName="product-sales"
      fetchAllRows={() =>
        collectAllPages((page, pageSize) =>
          utils.reports.productSales.fetch({ ...filters, page, pageSize }),
        )
      }
      emptyMessage="No products have been sold in this period."
    />
  );
}
