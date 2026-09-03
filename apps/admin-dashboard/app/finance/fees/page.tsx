"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, MessageSquare, Pencil, Printer } from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { Input } from "@blush/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
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
import { useDocuments } from "@/hooks/useDocuments";
import { usePermissions } from "@/hooks/usePermissions";
import { collectAllPages } from "@/lib/exportAll";
import { trpc } from "@/lib/trpc";

type LastPayment = {
  reference: string;
  amount: number;
  refundedAmount: number;
  paymentMethod: string;
  transactionReference: string | null;
  paidAt: Date | string | null;
};

type RegisterRow = {
  studentId: number;
  studentNumber: string;
  fullName: string;
  phone: string;
  email: string;
  status: string;
  programme: string | null;
  intake: string | null;
  totalFees: number;
  amountPaid: number;
  outstanding: number;
  billedAnything: boolean;
  lastPayment: LastPayment | null;
};

const STANDINGS = [
  { value: "all", label: "All students" },
  { value: "pending", label: "Owing" },
  { value: "paid", label: "Settled" },
] as const;

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

export default function FeeRegisterPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["fees.read"]}>
        <FeeRegisterContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function FeeRegisterContent() {
  const router = useRouter();
  const { can } = usePermissions();
  const documents = useDocuments();

  const [search, setSearch] = useState("");
  const [standing, setStanding] = useState<(typeof STANDINGS)[number]["value"]>("all");
  const [page, setPage] = useState(1);
  const [payingStudentId, setPayingStudentId] = useState<number | null>(null);
  const [remindingStudentId, setRemindingStudentId] = useState<number | null>(null);
  const [arrearsRunOpen, setArrearsRunOpen] = useState(false);

  /**
   * Amounts typed into the rows, keyed by student.
   *
   * Held here rather than in each row so a half-typed figure survives the
   * table re-rendering underneath it - which it does on every refetch.
   */
  const [intake, setIntake] = useState<Record<number, string>>({});

  const utils = trpc.useUtils();

  // Shared by the table and by export, so a download covers exactly what the
  // filters describe rather than the page on screen.
  const filters = { sortDir: "desc" as const, search: search || undefined, standing };

  const query = trpc.finance.feeRegister.useQuery({ ...filters, page, pageSize: 25 });

  const writable = can("payments.write");

  const openPayment = (row: RegisterRow) => {
    setPayingStudentId(row.studentId);
  };

  const columns: Column<RegisterRow>[] = [
    {
      key: "studentNumber",
      header: "Student ID",
      cell: row => (
        <span className="font-mono text-xs text-primary">{row.studentNumber}</span>
      ),
    },
    {
      key: "fullName",
      header: "Full name",
      cell: row => <span className="font-semibold text-foreground">{row.fullName}</span>,
    },
    {
      key: "programme",
      header: "Programme",
      cell: row => (
        <span className="text-xs text-muted-foreground">{row.programme ?? "Not enrolled"}</span>
      ),
      value: row => row.programme ?? "",
    },
    {
      key: "intake",
      header: "Intake",
      cell: row => <span className="text-xs text-muted-foreground">{row.intake ?? "--"}</span>,
      value: row => row.intake ?? "",
    },
    {
      key: "status",
      header: "Status",
      cell: row => {
        // Nothing billed is its own answer. Calling it "paid" would tell a
        // clerk the account is settled when in fact it was never raised.
        if (!row.billedAnything) {
          return (
            <Badge variant="outline" className="text-muted-foreground">
              Not billed
            </Badge>
          );
        }
        return row.outstanding > 0 ? (
          <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300">
            Pending
          </Badge>
        ) : (
          <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
            Paid
          </Badge>
        );
      },
      value: row =>
        !row.billedAnything ? "not billed" : row.outstanding > 0 ? "pending" : "paid",
    },
    {
      key: "totalFees",
      header: "Total fees",
      align: "right",
      cell: row => <span className="tabular-nums">{formatMoney(row.totalFees)}</span>,
      value: row => row.totalFees,
    },
    {
      key: "amountPaid",
      header: "Paid",
      align: "right",
      cell: row => (
        <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
          {formatMoney(row.amountPaid)}
        </span>
      ),
      value: row => row.amountPaid,
    },
    {
      key: "outstanding",
      header: "Arrears",
      align: "right",
      cell: row => (
        <span
          className={`font-semibold tabular-nums ${
            row.outstanding > 0
              ? "text-orange-600 dark:text-orange-400"
              : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {formatMoney(row.outstanding)}
        </span>
      ),
      value: row => row.outstanding,
    },
    ...(writable
      ? [
          {
            key: "receive",
            header: "Receive payment",
            // The whole point of the register: take the money on the row you
            // are already looking at, rather than opening a dialog to re-find
            // the student you just found.
            cell: (row: RegisterRow) => (
              <span
                className="flex items-center gap-2"
                onClick={event => event.stopPropagation()}
              >
                <Input
                  value={intake[row.studentId] ?? ""}
                  onChange={event =>
                    setIntake(current => ({ ...current, [row.studentId]: event.target.value }))
                  }
                  placeholder="Amount"
                  inputMode="decimal"
                  aria-label={`Amount to receive from ${row.fullName}`}
                  className="h-9 w-28"
                />
                <Button
                  variant={row.outstanding > 0 ? "default" : "outline"}
                  size="sm"
                  className="h-9 whitespace-nowrap text-xs"
                  onClick={() => openPayment(row)}
                >
                  {row.outstanding > 0 ? "Receive payment" : "Full payment"}
                </Button>
              </span>
            ),
            value: () => "",
          },
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: RegisterRow) => (
              <span
                className="flex justify-end gap-1"
                onClick={event => event.stopPropagation()}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label={`Adjust ${row.fullName}'s account`}
                  onClick={() => router.push(`/students/${row.studentId}`)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>

                {/*
                  Receipt printing moved here with the rest of the intake. It
                  reprints the student's most recent payment - the one a clerk
                  is asked to reissue - and is disabled outright when there is
                  no payment to reprint, rather than producing a blank slip.
                */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label={`Print ${row.fullName}'s last receipt`}
                  title={
                    row.lastPayment
                      ? `Reprint receipt ${row.lastPayment.reference}`
                      : "No payment has been taken from this student yet"
                  }
                  disabled={!documents.ready || !row.lastPayment}
                  onClick={() => {
                    if (!row.lastPayment) return;
                    documents.paymentReceipt({
                      ...row.lastPayment,
                      studentName: row.fullName,
                      studentNumber: row.studentNumber,
                    });
                  }}
                >
                  <Printer className="h-3.5 w-3.5" />
                </Button>

                {can("fees.write") ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label={`Remind ${row.fullName}`}
                    disabled={row.outstanding <= 0}
                    onClick={() => setRemindingStudentId(row.studentId)}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
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
    <div className="mx-auto max-w-[1600px]">
      <DataTable
        title="Fee register"
        description="Student balances and payment intake."
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
        searchPlaceholder="Search by name, student ID or phone..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.studentId}
        onRowClick={row => router.push(`/students/${row.studentId}`)}
        exportFileName="fee-register"
        fetchAllRows={() =>
          collectAllPages((page, pageSize) =>
            utils.finance.feeRegister.fetch({ ...filters, page, pageSize }),
          )
        }
        emptyMessage="No students match this filter."
        filters={
          <Select
            value={standing}
            onValueChange={value => {
              setStanding(value as typeof standing);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[10rem]" aria-label="Filter by standing">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STANDINGS.map(item => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
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
        presetAmount={payingStudentId ? intake[payingStudentId] : undefined}
        onOpenChange={open => !open && setPayingStudentId(null)}
        onRecorded={() => {
          toast.success("Payment recorded and the balance updated.");
          // The typed figure has been banked; leaving it in the box invites
          // somebody to press the button a second time.
          if (payingStudentId !== null) {
            setIntake(current => {
              const next = { ...current };
              delete next[payingStudentId];
              return next;
            });
          }
          setPayingStudentId(null);
          query.refetch();
        }}
      />
    </div>
  );
}
