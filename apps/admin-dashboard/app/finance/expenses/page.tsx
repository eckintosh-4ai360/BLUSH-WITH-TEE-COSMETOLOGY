"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
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
import { AddExpenseDialog } from "@/components/finance/AddExpenseDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

const CATEGORIES = [
  "rent",
  "utilities",
  "salaries",
  "transport",
  "equipment",
  "beauty_products",
  "maintenance",
  "marketing",
  "stationery",
  "cleaning",
  "other",
] as const;

type ExpenseRow = {
  id: number;
  title: string;
  category: string;
  amount: number;
  expenseDate: Date;
  vendor: string | null;
  paymentMethod: string;
  approvalStatus: string;
};

export default function ExpensesPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["expenses.read"]}>
        <ExpensesContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function ExpensesContent() {
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

  const query = trpc.finance.expenses.useQuery({
    page,
    pageSize: 25,
    sortDir: "desc",
    search: search || undefined,
    category: category === "all" ? undefined : (category as (typeof CATEGORIES)[number]),
    approvalStatus:
      status === "all" ? undefined : (status as "pending" | "approved" | "rejected"),
  });

  const review = trpc.finance.reviewExpense.useMutation({
    onSuccess: () => {
      toast.success("Expense updated.");
      query.refetch();
    },
    onError: error => toast.error(error.message),
  });

  const columns: Column<ExpenseRow>[] = [
    {
      key: "title",
      header: "Expense",
      cell: row => (
        <span>
          <span className="font-medium text-foreground">{row.title}</span>
          {row.vendor ? (
            <span className="block text-xs text-muted-foreground">{row.vendor}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "category",
      header: "Category",
      cell: row => <span className="capitalize">{row.category.replaceAll("_", " ")}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: row => formatMoney(row.amount),
      value: row => row.amount,
    },
    {
      key: "expenseDate",
      header: "Date",
      cell: row => new Date(row.expenseDate).toLocaleDateString("en-GB"),
      value: row => new Date(row.expenseDate).toISOString().slice(0, 10),
    },
    {
      key: "paymentMethod",
      header: "Paid by",
      optional: true,
      cell: row => <span className="capitalize">{row.paymentMethod.replaceAll("_", " ")}</span>,
    },
    {
      key: "approvalStatus",
      header: "Approval",
      cell: row => (
        <Badge
          variant={row.approvalStatus === "approved" ? "secondary" : "outline"}
          className="capitalize"
        >
          {row.approvalStatus}
        </Badge>
      ),
    },
    ...(can("expenses.approve")
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: ExpenseRow) =>
              row.approvalStatus === "pending" ? (
                <span className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    disabled={review.isPending}
                    onClick={() => review.mutate({ expenseId: row.id, decision: "approved" })}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-destructive"
                    disabled={review.isPending}
                    onClick={() => review.mutate({ expenseId: row.id, decision: "rejected" })}
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </span>
              ) : null,
            value: () => "",
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <DataTable
        title="Expenses"
        description="Categorised spending, with approval where it is required."
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
        searchPlaceholder="Search by title or vendor..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        exportFileName="expenses"
        emptyMessage="No expenses match these filters."
        footer={
          query.data ? (
            <span className="mr-2 text-xs text-muted-foreground">
              Filtered total:{" "}
              <span className="font-semibold text-foreground">
                {formatMoney(query.data.filteredTotal)}
              </span>
            </span>
          ) : null
        }
        filters={
          <>
            <Select
              value={category}
              onValueChange={value => {
                setCategory(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[11rem]" aria-label="Filter by category">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map(item => (
                  <SelectItem key={item} value={item} className="capitalize">
                    {item.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={status}
              onValueChange={value => {
                setStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[10rem]" aria-label="Filter by approval status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        actions={
          can("expenses.write") ? (
            <Button className="gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add expense
            </Button>
          ) : null
        }
      />

      <AddExpenseDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => {
          toast.success("Expense recorded.");
          query.refetch();
        }}
      />
    </div>
  );
}
