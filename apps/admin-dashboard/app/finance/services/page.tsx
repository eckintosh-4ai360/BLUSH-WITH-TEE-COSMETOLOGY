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
  SaveServiceDialog,
  type EditableService,
} from "@/components/finance/SaveServiceDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { collectAllPages } from "@/lib/exportAll";
import { trpc } from "@/lib/trpc";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank", label: "Bank" },
  { value: "card", label: "Card" },
  { value: "online", label: "Online" },
] as const;

type ServiceRow = {
  id: number;
  serviceDate: Date | string;
  serviceId: number | null;
  serviceName: string;
  clientName: string;
  amount: number;
  paymentMethod: string;
  workerUserId: number | null;
  workerName: string;
  note: string | null;
};

const readableDate = (value: Date | string) =>
  new Date(value).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const methodLabel = (value: string) =>
  METHODS.find(item => item.value === value)?.label ?? value.replaceAll("_", " ");

export default function DailyServicesPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["services.read"]}>
        <DailyServicesContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function DailyServicesContent() {
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("all");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<EditableService | null>(null);
  const [removing, setRemoving] = useState<ServiceRow | null>(null);

  const utils = trpc.useUtils();
  const writable = can("services.write");

  const filters = {
    sortDir: "desc" as const,
    search: search || undefined,
    paymentMethod: method === "all" ? undefined : (method as (typeof METHODS)[number]["value"]),
  };

  const query = trpc.services.list.useQuery({ ...filters, page, pageSize: 25 });

  const remove = trpc.services.remove.useMutation({
    onSuccess: result => {
      setRemoving(null);
      toast.success(`"${result.title}" removed from the log.`);
      query.refetch();
    },
    onError: error => toast.error(error.message),
  });

  const columns: Column<ServiceRow>[] = [
    {
      key: "serviceDate",
      header: "Date",
      cell: row => <span className="whitespace-nowrap">{readableDate(row.serviceDate)}</span>,
      value: row => new Date(row.serviceDate).toISOString().slice(0, 10),
    },
    {
      key: "serviceName",
      header: "Service",
      cell: row => <span className="font-medium text-foreground">{row.serviceName}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: row => <span className="tabular-nums">{formatMoney(row.amount)}</span>,
      value: row => row.amount,
    },
    {
      key: "paymentMethod",
      header: "Payment type",
      cell: row => (
        <Badge variant="outline" className="whitespace-nowrap">
          {methodLabel(row.paymentMethod)}
        </Badge>
      ),
      value: row => methodLabel(row.paymentMethod),
    },
    { key: "clientName", header: "Client name" },
    {
      key: "workerName",
      header: "Worker in charge",
      cell: row => (
        <span>
          {row.workerName}
          {/* Says the name is a note rather than a linked staff account. */}
          {row.workerUserId === null ? (
            <span className="block text-xs text-muted-foreground">not on staff list</span>
          ) : null}
        </span>
      ),
    },
    ...(writable
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: ServiceRow) => (
              <span className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label={`Correct ${row.serviceName} for ${row.clientName}`}
                  onClick={() => setEditing(row)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${row.serviceName} for ${row.clientName}`}
                  onClick={() => setRemoving(row)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </span>
            ),
            value: () => "",
          },
        ]
      : []),
  ];

  const totals = query.data?.byPaymentMethod ?? [];

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <DataTable
        title="Daily services"
        description="What was done, for whom, by whom, and what was taken."
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
        searchPlaceholder="Search by client, service or worker..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        exportFileName="daily-services"
        fetchAllRows={() =>
          collectAllPages((page, pageSize) =>
            utils.services.list.fetch({ ...filters, page, pageSize }),
          )
        }
        emptyMessage="No services recorded yet."
        filters={
          <Select
            value={method}
            onValueChange={value => {
              setMethod(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[11rem]" aria-label="Filter by payment type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payment types</SelectItem>
              {METHODS.map(item => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        actions={
          writable ? (
            <Button className="gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Record service
            </Button>
          ) : null
        }
      />

      {/*
        Totals for the filter, not for the page. "What did we take today" is the
        question this screen exists to answer, and a total over the twenty-five
        rows on screen would answer a different one.
      */}
      {query.data && query.data.total > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm">
          <span className="font-medium text-foreground">
            {formatMoney(query.data.filteredTotal)}
          </span>
          <span className="text-xs text-muted-foreground">
            across {query.data.total} service{query.data.total === 1 ? "" : "s"}
          </span>
          <span className="ml-auto flex flex-wrap gap-2">
            {totals.map(row => (
              <Badge key={row.paymentMethod} variant="outline" className="gap-1 text-xs">
                {methodLabel(row.paymentMethod)}
                <span className="font-semibold">{formatMoney(row.total)}</span>
              </Badge>
            ))}
          </span>
        </div>
      ) : null}

      <SaveServiceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => {
          toast.success("Service recorded.");
          query.refetch();
        }}
      />

      <SaveServiceDialog
        open={editing !== null}
        onOpenChange={open => !open && setEditing(null)}
        editing={editing}
        onSaved={() => {
          setEditing(null);
          toast.success("Service updated.");
          query.refetch();
        }}
      />

      <AlertDialog open={removing !== null} onOpenChange={open => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove &quot;{removing?.serviceName}&quot; for {removing?.clientName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It leaves the log and its {formatMoney(removing?.amount ?? 0)} is taken back out
              of income as a counter-entry, so a day that has already been closed still adds
              up. The record is kept for the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={event => {
                event.preventDefault();
                if (removing) remove.mutate({ id: removing.id });
              }}
            >
              {remove.isPending ? "Removing..." : "Remove service"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
