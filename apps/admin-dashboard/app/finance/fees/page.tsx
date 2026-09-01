"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Receipt, Megaphone } from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { toast } from "@blush/ui/components/ui/sonner";
import { formatMoney } from "@blush/ui/lib/viz";
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog";
import {
  FeeArrearsRunDialog,
  type ArrearsRunResult,
} from "@/components/finance/FeeArrearsRunDialog";
import { SendFeeReminderDialog } from "@/components/finance/SendFeeReminderDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { collectAllPages } from "@/lib/exportAll";
import { trpc } from "@/lib/trpc";

type OwingRow = {
  studentId: number;
  studentNumber: string;
  fullName: string;
  email: string;
  phone: string;
  status: string;
  totalFees: number;
  amountPaid: number;
  outstanding: number;
};

/**
 * Says what actually happened, not what was attempted.
 *
 * A run that reached most of the school but not all of it is the normal
 * outcome, and rounding that up to "sent" would hide the students who still
 * have not been told.
 */
function reportArrearsRun(result: ArrearsRunResult) {
  const skipped = result.skippedNoPhone + result.skippedAlreadySentToday;
  const aside = skipped ? ` ${skipped} skipped.` : "";

  if (!result.sent && (result.failed || result.queued)) {
    toast.error(result.firstError ?? "None of the reminders could be delivered.");
    return;
  }

  if (result.failed || result.queued) {
    toast.warning(
      `Texted ${result.sent}, but ${result.failed + result.queued} did not go through.${aside}`,
    );
    return;
  }

  toast.success(
    `Texted ${result.sent} student${result.sent === 1 ? "" : "s"} what they owe.${aside}`,
  );
}

export default function OutstandingFeesPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["fees.read"]}>
        <OutstandingFeesContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function OutstandingFeesContent() {
  const router = useRouter();
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [payingStudentId, setPayingStudentId] = useState<number | null>(null);
  const [remindingStudentId, setRemindingStudentId] = useState<number | null>(null);
  const [arrearsRunOpen, setArrearsRunOpen] = useState(false);

  const utils = trpc.useUtils();

  // Shared by the table and by export, so a download covers exactly what the
  // filters describe rather than the page on screen.
  const filters = { sortDir: "desc" as const, search: search || undefined };

  const query = trpc.finance.outstanding.useQuery({ ...filters, page, pageSize: 25 });

  const columns: Column<OwingRow>[] = [
    {
      key: "fullName",
      header: "Student",
      cell: row => (
        <span>
          <span className="font-medium text-foreground">{row.fullName}</span>
          <span className="block text-xs text-muted-foreground">{row.studentNumber}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: row => (
        <Badge variant="outline" className="capitalize">
          {row.status}
        </Badge>
      ),
    },
    { key: "phone", header: "Phone", optional: true },
    { key: "email", header: "Email", optional: true },
    {
      key: "totalFees",
      header: "Total fees",
      align: "right",
      cell: row => formatMoney(row.totalFees),
      value: row => row.totalFees,
    },
    {
      key: "amountPaid",
      header: "Paid",
      align: "right",
      cell: row => formatMoney(row.amountPaid),
      value: row => row.amountPaid,
    },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right",
      cell: row => (
        <span className="font-semibold text-foreground">{formatMoney(row.outstanding)}</span>
      ),
      value: row => row.outstanding,
    },
    ...(can("payments.write") || can("fees.write")
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: OwingRow) => (
              <span className="flex justify-end gap-1">
                {can("fees.write") ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    // The row click opens the student; this must not do both.
                    onClick={event => {
                      event.stopPropagation();
                      setRemindingStudentId(row.studentId);
                    }}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Remind
                  </Button>
                ) : null}
                {can("payments.write") ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={event => {
                      event.stopPropagation();
                      setPayingStudentId(row.studentId);
                    }}
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    Record
                  </Button>
                ) : null}
              </span>
            ),
            value: () => "",
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <DataTable
        title="Outstanding fees"
        description="Students carrying a balance, largest first."
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
        onRowClick={row => router.push(`/students/${row.studentId}`)}
        exportFileName="outstanding-fees"
        fetchAllRows={() =>
          collectAllPages((page, pageSize) =>
            utils.finance.outstanding.fetch({ ...filters, page, pageSize }),
          )
        }
        emptyMessage="Every student is up to date."
        actions={
          can("fees.write") ? (
            <Button className="gap-2" onClick={() => setArrearsRunOpen(true)}>
              <Megaphone className="h-4 w-4" />
              Fee Arrears
            </Button>
          ) : null
        }
      />

      <FeeArrearsRunDialog
        open={arrearsRunOpen}
        onOpenChange={setArrearsRunOpen}
        onSent={(result: ArrearsRunResult) => {
          query.refetch();
          reportArrearsRun(result);
        }}
      />

      <SendFeeReminderDialog
        studentId={remindingStudentId}
        onOpenChange={open => !open && setRemindingStudentId(null)}
        onSent={result => {
          setRemindingStudentId(null);
          // Only "sent" is a send. A row left "queued" was refused by the
          // provider and still has retries, which is a failure to report now.
          if (result.status === "sent") toast.success("The reminder was sent.");
          else toast.error(result.error ?? "The reminder could not be delivered.");
        }}
      />

      <RecordPaymentDialog
        open={payingStudentId !== null}
        studentId={payingStudentId ?? undefined}
        onOpenChange={open => !open && setPayingStudentId(null)}
        onRecorded={() => {
          toast.success("Payment recorded and the balance updated.");
          setPayingStudentId(null);
          query.refetch();
        }}
      />
    </div>
  );
}
