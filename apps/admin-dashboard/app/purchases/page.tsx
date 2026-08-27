"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { CreatePurchaseOrderDialog } from "@/components/purchases/CreatePurchaseOrderDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { collectAllPages } from "@/lib/exportAll";
import {
  PO_STATUSES,
  PO_STATUS_LABEL,
  PO_STATUS_TONE,
  type PurchaseOrderStatus,
} from "@/lib/purchaseStatus";
import { trpc } from "@/lib/trpc";

type OrderRow = {
  id: number;
  reference: string;
  supplierName: string;
  status: string;
  orderDate: Date;
  expectedDate: Date | null;
  total: number;
  amountPaid: number;
};

export default function PurchaseOrdersPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["purchases.read"]}>
        <PurchaseOrdersContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function PurchaseOrdersContent() {
  const router = useRouter();
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const utils = trpc.useUtils();

  // Shared by the table and by export, so a download covers exactly what the
  // filters describe rather than the page on screen.
  const filters = {
    sortDir: "desc" as const,
    search: search || undefined,
    status: status === "all" ? undefined : (status as PurchaseOrderStatus),
  };

  const query = trpc.inventory.purchaseOrders.useQuery({ ...filters, page, pageSize: 25 });

  const columns: Column<OrderRow>[] = [
    {
      key: "reference",
      header: "Reference",
      cell: row => <span className="font-mono text-xs">{row.reference}</span>,
    },
    {
      key: "supplierName",
      header: "Supplier",
      cell: row => <span className="font-medium text-foreground">{row.supplierName}</span>,
    },
    {
      key: "orderDate",
      header: "Ordered",
      cell: row => new Date(row.orderDate).toLocaleDateString("en-GB"),
      value: row => new Date(row.orderDate).toISOString().slice(0, 10),
    },
    {
      key: "expectedDate",
      header: "Expected",
      optional: true,
      cell: row =>
        row.expectedDate ? new Date(row.expectedDate).toLocaleDateString("en-GB") : "—",
      value: row =>
        row.expectedDate ? new Date(row.expectedDate).toISOString().slice(0, 10) : "",
    },
    {
      key: "status",
      header: "Status",
      cell: row => (
        <Badge variant="secondary" className={PO_STATUS_TONE[row.status]}>
          {PO_STATUS_LABEL[row.status] ?? row.status}
        </Badge>
      ),
      value: row => PO_STATUS_LABEL[row.status] ?? row.status,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: row => formatMoney(row.total),
      value: row => row.total,
    },
    {
      key: "outstanding",
      header: "Unpaid",
      align: "right",
      cell: row => {
        const unpaid = row.total - row.amountPaid;
        return (
          <span className={unpaid > 0 ? "font-semibold text-foreground" : undefined}>
            {formatMoney(unpaid)}
          </span>
        );
      },
      value: row => row.total - row.amountPaid,
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <DataTable
        title="Purchase orders"
        description="What has been ordered in, what has arrived, and what is still to pay."
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
        searchPlaceholder="Search by reference..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        onRowClick={row => router.push(`/purchases/${row.id}`)}
        exportFileName="purchase-orders"
        fetchAllRows={() =>
          collectAllPages((page, pageSize) =>
            utils.inventory.purchaseOrders.fetch({ ...filters, page, pageSize }),
          )
        }
        emptyMessage="No purchase orders match these filters."
        filters={
          <Select
            value={status}
            onValueChange={value => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[11rem]" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PO_STATUSES.map(item => (
                <SelectItem key={item} value={item}>
                  {PO_STATUS_LABEL[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        actions={
          can("purchases.write") ? (
            <Button className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Raise order
            </Button>
          ) : null
        }
      />

      <CreatePurchaseOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          toast.success("Purchase order raised.");
          query.refetch();
        }}
      />
    </div>
  );
}
