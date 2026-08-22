"use client";

import { useState } from "react";
import { Plus, Undo2 } from "lucide-react";
import { toast } from "@blush/ui/components/ui/sonner";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import { formatMoney } from "@blush/ui/lib/viz";
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog";
import { RefundPaymentDialog } from "@/components/finance/RefundPaymentDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

const METHODS = ["cash", "mobile_money", "bank", "card", "online"] as const;

type PaymentRow = {
  id: number;
  reference: string;
  studentName: string | null;
  studentNumber: string | null;
  amount: number;
  refundedAmount: number;
  paymentMethod: string;
  status: string;
  transactionReference: string | null;
  paidAt: Date;
};

export default function PaymentsPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["payments.read"]}>
        <PaymentsContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function PaymentsContent() {
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [method, setMethod] = useState<string>("all");
  const [recordOpen, setRecordOpen] = useState(false);
  const [refunding, setRefunding] = useState<PaymentRow | null>(null);

  const query = trpc.finance.payments.useQuery({
    page,
    pageSize: 25,
    sortDir: "desc",
    search: search || undefined,
    method: method === "all" ? undefined : (method as (typeof METHODS)[number]),
  });

  const columns: Column<PaymentRow>[] = [
    {
      key: "reference",
      header: "Reference",
      cell: row => <span className="font-medium text-foreground">{row.reference}</span>,
    },
    {
      key: "studentName",
      header: "Student",
      cell: row =>
        row.studentName ? (
          <span>
            {row.studentName}
            <span className="block text-xs text-muted-foreground">{row.studentNumber}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Store sale</span>
        ),
      value: row => row.studentName ?? "Store sale",
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: row => formatMoney(row.amount),
      value: row => row.amount,
    },
    {
      key: "refundedAmount",
      header: "Refunded",
      align: "right",
      optional: true,
      cell: row => (row.refundedAmount ? formatMoney(row.refundedAmount) : "-"),
      value: row => row.refundedAmount,
    },
    {
      key: "paymentMethod",
      header: "Method",
      cell: row => <span className="capitalize">{row.paymentMethod.replaceAll("_", " ")}</span>,
      value: row => row.paymentMethod,
    },
    {
      key: "status",
      header: "Status",
      cell: row => (
        <Badge variant={row.status === "completed" ? "secondary" : "outline"} className="capitalize">
          {row.status}
        </Badge>
      ),
      value: row => row.status,
    },
    {
      key: "transactionReference",
      header: "Transaction ref",
      optional: true,
      cell: row => row.transactionReference ?? "-",
    },
    {
      key: "paidAt",
      header: "Paid",
      cell: row => new Date(row.paidAt).toLocaleDateString("en-GB"),
      value: row => new Date(row.paidAt).toISOString().slice(0, 10),
    },
    ...(can("payments.write")
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: PaymentRow) =>
              row.status === "completed" && row.refundedAmount < row.amount ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={event => {
                    event.stopPropagation();
                    setRefunding(row);
                  }}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Refund
                </Button>
              ) : null,
            value: () => "",
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <DataTable
        title="Payments"
        description="Every payment received, with the charges it settled."
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
        searchPlaceholder="Search by reference, transaction or student..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        exportFileName="payments"
        emptyMessage="No payments match these filters."
        filters={
          <Select
            value={method}
            onValueChange={value => {
              setMethod(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[11rem]" aria-label="Filter by payment method">
              <SelectValue placeholder="All methods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              {METHODS.map(item => (
                <SelectItem key={item} value={item} className="capitalize">
                  {item.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        actions={
          can("payments.write") ? (
            <Button className="gap-2" onClick={() => setRecordOpen(true)}>
              <Plus className="h-4 w-4" />
              Record payment
            </Button>
          ) : null
        }
      />

      <RecordPaymentDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        onRecorded={() => {
          toast.success("Payment recorded and the balance updated.");
          query.refetch();
        }}
      />

      <RefundPaymentDialog
        payment={refunding}
        onOpenChange={open => !open && setRefunding(null)}
        onRefunded={() => {
          toast.success("Refund recorded as a reversing entry.");
          setRefunding(null);
          query.refetch();
        }}
      />
    </div>
  );
}
