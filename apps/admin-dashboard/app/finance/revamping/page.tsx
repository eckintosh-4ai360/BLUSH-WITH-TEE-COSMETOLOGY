"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@blush/ui/components/ui/alert-dialog";
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
import {
  SaveRevampingDialog,
  type EditableRevamping,
} from "@/components/finance/SaveRevampingDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { collectAllPages } from "@/lib/exportAll";
import { trpc } from "@/lib/trpc";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank", label: "Bank" },
  { value: "card", label: "Card" },
  { value: "memo", label: "Memo (credit)" },
] as const;

type RevampingRow = {
  id: number;
  revampDate: Date | string;
  clientName: string;
  quantity: number;
  style: string;
  totalAmount: number;
  amountPaid: number;
  amountLeft: number;
  paymentMethod: string;
  recordedByUserId: number | null;
  createdAt: Date | string;
};

const readableDate = (value: Date | string) =>
  new Date(value).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const methodLabel = (value: string) =>
  METHODS.find(item => item.value === value)?.label ??
  value.replaceAll("_", " ");

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function RevampingPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["revamping.read"]}>
        <RevampingContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function RevampingContent() {
  const { can, isAdmin } = usePermissions();
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("all");
  const [revampDate, setRevampDate] = useState(today);
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<EditableRevamping | null>(null);
  const [removing, setRemoving] = useState<RevampingRow | null>(null);

  const utils = trpc.useUtils();
  const writable = can("revamping.write");

  const filters = {
    sortDir: "desc" as const,
    search: search || undefined,
    paymentMethod:
      method === "all"
        ? undefined
        : (method as (typeof METHODS)[number]["value"]),
    dateFrom: revampDate,
    dateTo: revampDate,
  };

  const query = trpc.revamping.list.useQuery({ ...filters, page, pageSize: 25 });

  const remove = trpc.revamping.remove.useMutation({
    onSuccess: result => {
      setRemoving(null);
      toast.success(`"${result.title}" removed from the register.`);
      query.refetch();
    },
    onError: error => toast.error(error.message),
  });

  const columns: Column<RevampingRow>[] = [
    {
      key: "revampDate",
      header: "Date",
      cell: row => (
        <span className="whitespace-nowrap">
          {readableDate(row.revampDate)}
        </span>
      ),
      value: row => new Date(row.revampDate).toISOString().slice(0, 10),
    },
    {
      key: "clientName",
      header: "Name",
      cell: row => (
        <span className="font-medium text-foreground">{row.clientName}</span>
      ),
    },
    {
      key: "quantity",
      header: "Quantity",
      align: "right",
      cell: row => <span className="tabular-nums">{row.quantity}</span>,
      value: row => row.quantity,
    },
    { key: "style", header: "Style" },
    {
      key: "totalAmount",
      header: "Total amount",
      align: "right",
      cell: row => (
        <span className="tabular-nums">{formatMoney(row.totalAmount)}</span>
      ),
      value: row => row.totalAmount,
    },
    {
      key: "amountPaid",
      header: "Amount paid",
      align: "right",
      cell: row => (
        <span className="tabular-nums">{formatMoney(row.amountPaid)}</span>
      ),
      value: row => row.amountPaid,
    },
    {
      key: "amountLeft",
      header: "Amount left",
      align: "right",
      cell: row => (
        <span
          className={`tabular-nums ${row.amountLeft > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : ""}`}
        >
          {formatMoney(row.amountLeft)}
        </span>
      ),
      value: row => row.amountLeft,
    },
    {
      key: "paymentMethod",
      header: "Paid type",
      cell: row => (
        <Badge variant="outline" className="whitespace-nowrap">
          {methodLabel(row.paymentMethod)}
        </Badge>
      ),
      value: row => methodLabel(row.paymentMethod),
    },
    ...(writable
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: RevampingRow) => (
              <span className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label={`Correct ${row.style} for ${row.clientName}`}
                  onClick={() => setEditing(row)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {isAdmin ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${row.style} for ${row.clientName}`}
                    onClick={() => setRemoving(row)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
    <div className="mx-auto max-w-[1400px] space-y-4">
      <DataTable
        title="Revamping"
        description="The salon revamping register: date, name, quantity, style, total, paid, and what is left."
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
        searchPlaceholder="Search by client or style..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        exportFileName="revamping"
        fetchAllRows={() =>
          collectAllPages((page, pageSize) =>
            utils.revamping.list.fetch({ ...filters, page, pageSize })
          )
        }
        emptyMessage="No revamping recorded yet."
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="sr-only">Revamping date</span>
              <input
                type="date"
                value={revampDate}
                max={today()}
                onChange={event => {
                  setRevampDate(event.target.value || today());
                  setPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                aria-label="Filter revamping records by date"
              />
            </label>
            <Select
              value={method}
              onValueChange={value => {
                setMethod(value);
                setPage(1);
              }}
            >
              <SelectTrigger
                className="w-[11rem]"
                aria-label="Filter by paid type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All paid types</SelectItem>
                {METHODS.map(item => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        actions={
          writable ? (
            <Button className="gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Record revamping
            </Button>
          ) : null
        }
      />

      {/* Totals for the filter, not for the page. */}
      {query.data && query.data.total > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm">
          <span className="text-xs text-muted-foreground">
            {query.data.total} record{query.data.total === 1 ? "" : "s"}
          </span>
          <span className="ml-auto flex flex-wrap gap-2">
            <Badge variant="outline" className="gap-1 text-xs">
              Total
              <span className="font-semibold">
                {formatMoney(query.data.filteredTotal)}
              </span>
            </Badge>
            <Badge variant="outline" className="gap-1 text-xs">
              Paid
              <span className="font-semibold">
                {formatMoney(query.data.filteredPaid)}
              </span>
            </Badge>
            <Badge
              variant="outline"
              className={`gap-1 text-xs ${query.data.filteredLeft > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}
            >
              Left
              <span className="font-semibold">
                {formatMoney(query.data.filteredLeft)}
              </span>
            </Badge>
          </span>
        </div>
      ) : null}

      <SaveRevampingDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => {
          toast.success("Revamping recorded.");
          query.refetch();
        }}
      />

      <SaveRevampingDialog
        open={editing !== null}
        onOpenChange={open => !open && setEditing(null)}
        editing={editing}
        onSaved={() => {
          setEditing(null);
          toast.success("Revamping record updated.");
          query.refetch();
        }}
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove &quot;{removing?.style}&quot; for {removing?.clientName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It leaves the register for good. The record is kept for the audit
              trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={event => {
                event.preventDefault();
                if (removing) remove.mutate({ id: removing.id });
              }}
            >
              {remove.isPending ? "Removing..." : "Remove record"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
