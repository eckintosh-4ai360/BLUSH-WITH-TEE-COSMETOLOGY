"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import type { PermissionKey } from "@blush/shared/permissions";
import { Button } from "@blush/ui/components/ui/button";
import { Card } from "@blush/ui/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import { PermissionGate } from "@/components/PermissionGate";
import {
  AttendanceReport,
  CoursePerformanceReport,
  FeeCollectionReport,
  GraduatesReport,
  IncomeVsExpensesReport,
  ProductSalesReport,
  ProfitAndLossReport,
  StockValuationReport,
} from "@/components/reports/reports";
import { usePermissions } from "@/hooks/usePermissions";
import { RANGE_OPTIONS, resolveRange, type RangeKey } from "@/lib/reportRange";

type ReportId =
  | "income_vs_expenses"
  | "profit_and_loss"
  | "fee_collection"
  | "course_performance"
  | "attendance"
  | "graduates"
  | "stock_valuation"
  | "product_sales";

type ReportDefinition = {
  id: ReportId;
  label: string;
  summary: string;
  group: string;
  /** Every one is needed, matching what the procedure itself demands. */
  permissions: PermissionKey[];
  /** Reports whose figures do not depend on a window. */
  ignoresRange?: boolean;
};

const REPORTS: ReportDefinition[] = [
  {
    id: "income_vs_expenses",
    label: "Income vs expenses",
    summary: "Money in against money out, month by month, with the profit line.",
    group: "Finance",
    permissions: ["reports.read", "finance.read"],
  },
  {
    id: "profit_and_loss",
    label: "Profit and loss",
    summary: "Where income came from, where it went, and what is left.",
    group: "Finance",
    permissions: ["reports.read", "finance.read"],
  },
  {
    id: "fee_collection",
    label: "Fee collection",
    summary: "Billed against collected by fee type, and what is still owed.",
    group: "Finance",
    permissions: ["reports.read", "fees.read"],
  },
  {
    id: "course_performance",
    label: "Course performance",
    summary: "Enrolment, completion, average score and certificates per programme.",
    group: "School",
    permissions: ["reports.read", "academics.read"],
  },
  {
    id: "attendance",
    label: "Attendance",
    summary: "Sessions attended per student, and the rate against them.",
    group: "School",
    permissions: ["reports.read", "attendance.read"],
  },
  {
    id: "graduates",
    label: "Graduates",
    summary: "Everyone awarded a certificate, with grade and completion date.",
    group: "School",
    permissions: ["reports.read", "certificates.read"],
  },
  {
    id: "stock_valuation",
    label: "Stock valuation",
    summary: "What the stock on hand is worth, at cost and at retail.",
    group: "Stock and commerce",
    permissions: ["reports.read", "inventory.read"],
    ignoresRange: true,
  },
  {
    id: "product_sales",
    label: "Product sales",
    summary: "Units and revenue per product, cancelled orders excluded.",
    group: "Stock and commerce",
    permissions: ["reports.read", "orders.read"],
  },
];

/**
 * Screens that are already their own exportable feed.
 *
 * Listed rather than rebuilt: each of these pages pages, filters and exports
 * on the server already, and a second copy here would be a second thing to
 * keep correct.
 */
const ACTIVITY_FEEDS: Array<{
  label: string;
  path: string;
  summary: string;
  permissions: PermissionKey[];
}> = [
  {
    label: "Payments",
    path: "/finance/payments",
    summary: "Every payment and refund",
    permissions: ["payments.read"],
  },
  {
    label: "Expenses",
    path: "/finance/expenses",
    summary: "Spending with approval status",
    permissions: ["expenses.read"],
  },
  {
    label: "Fees owed",
    path: "/finance/fees",
    summary: "Outstanding balances per student",
    permissions: ["fees.read"],
  },
  {
    label: "Students",
    path: "/students",
    summary: "The full register",
    permissions: ["students.read"],
  },
  {
    label: "Admissions",
    path: "/admissions",
    summary: "Applications and decisions",
    permissions: ["admissions.read"],
  },
  {
    label: "Certificates",
    path: "/students/certificates",
    summary: "Issued and revoked awards",
    permissions: ["certificates.read"],
  },
  {
    label: "Orders",
    path: "/orders",
    summary: "Store orders and fulfilment",
    permissions: ["orders.read"],
  },
  {
    label: "Stock",
    path: "/inventory",
    summary: "Items and levels",
    permissions: ["inventory.read"],
  },
  {
    label: "Stock movements",
    path: "/inventory/movements",
    summary: "Every unit in and out",
    permissions: ["inventory.read"],
  },
  {
    label: "Suppliers",
    path: "/suppliers",
    summary: "Who supplies what, and what is owed",
    permissions: ["suppliers.read"],
  },
  {
    label: "Clinic bookings",
    path: "/operations",
    summary: "Appointments and their status",
    permissions: ["appointments.read"],
  },
  {
    label: "Audit log",
    path: "/audit",
    summary: "Who changed what, and when",
    permissions: ["audit.read"],
  },
];

export default function ReportsPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["reports.read"]}>
        <ReportsContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function ReportsContent() {
  const { can } = usePermissions();
  const [rangeKey, setRangeKey] = useState<RangeKey>("last_12");

  // A report the caller cannot run is not offered: the procedure would refuse
  // it anyway, and a menu of dead ends is worse than a short menu.
  const available = useMemo(
    () => REPORTS.filter(report => report.permissions.every(can)),
    [can],
  );

  const [selectedId, setSelectedId] = useState<ReportId | null>(null);
  const selected =
    available.find(report => report.id === selectedId) ?? available[0] ?? null;

  const range = useMemo(() => resolveRange(rangeKey), [rangeKey]);
  const feeds = ACTIVITY_FEEDS.filter(feed => feed.permissions.every(can));

  const groups = useMemo(() => {
    const byGroup = new Map<string, ReportDefinition[]>();
    for (const report of available) {
      byGroup.set(report.group, [...(byGroup.get(report.group) ?? []), report]);
    }
    return [...byGroup.entries()];
  }, [available]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every figure is computed when you ask for it, from the same rows the ledger
            screens show. Each report exports to CSV and PDF.
          </p>
        </div>

        <Select
          value={rangeKey}
          onValueChange={value => setRangeKey(value as RangeKey)}
          disabled={selected?.ignoresRange}
        >
          <SelectTrigger className="w-[12rem]" aria-label="Reporting period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map(option => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {!available.length ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Your role does not include any reports. Ask an administrator for the
            permissions covering the data you need.
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <nav className="space-y-4">
            {groups.map(([group, reports]) => (
              <div key={group}>
                <p className="px-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {group}
                </p>
                <div className="space-y-0.5">
                  {reports.map(report => {
                    const isActive = selected?.id === report.id;
                    return (
                      <button
                        key={report.id}
                        type="button"
                        onClick={() => setSelectedId(report.id)}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? "bg-primary/10 font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {report.label}
                        <ChevronRight
                          className={`h-3.5 w-3.5 ${isActive ? "opacity-70" : "opacity-0"}`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="min-w-0 space-y-6">
            {selected ? (
              <>
                <div>
                  <h2 className="text-lg font-medium">{selected.label}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selected.summary}
                    {selected.ignoresRange ? null : ` · ${range.label}`}
                  </p>
                </div>
                <SelectedReport id={selected.id} rangeKey={rangeKey} />
              </>
            ) : null}
          </div>
        </div>
      )}

      {feeds.length ? (
        <section className="space-y-3 pt-2">
          <div>
            <h2 className="text-sm font-semibold">Activity logs</h2>
            <p className="text-xs text-muted-foreground">
              Full records rather than summaries. Each one filters, pages and exports on
              its own screen.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {feeds.map(feed => (
              <Button
                key={feed.path}
                asChild
                variant="outline"
                className="h-auto justify-between px-4 py-3"
              >
                <Link href={feed.path}>
                  <span className="text-left">
                    <span className="block text-sm font-medium">{feed.label}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {feed.summary}
                    </span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 opacity-60" />
                </Link>
              </Button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SelectedReport({ id, rangeKey }: { id: ReportId; rangeKey: RangeKey }) {
  switch (id) {
    case "income_vs_expenses":
      return <IncomeVsExpensesReport rangeKey={rangeKey} />;
    case "profit_and_loss":
      return <ProfitAndLossReport rangeKey={rangeKey} />;
    case "fee_collection":
      return <FeeCollectionReport rangeKey={rangeKey} />;
    case "course_performance":
      return <CoursePerformanceReport rangeKey={rangeKey} />;
    case "attendance":
      return <AttendanceReport rangeKey={rangeKey} />;
    case "graduates":
      return <GraduatesReport rangeKey={rangeKey} />;
    case "stock_valuation":
      return <StockValuationReport />;
    case "product_sales":
      return <ProductSalesReport rangeKey={rangeKey} />;
    default:
      return null;
  }
}
