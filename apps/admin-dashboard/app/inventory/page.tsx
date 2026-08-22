"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight, Plus } from "lucide-react";
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
import { StockMovementDialog } from "@/components/inventory/StockMovementDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

type ItemRow = {
  id: number;
  sku: string;
  name: string;
  category: string;
  categoryName: string | null;
  supplierName: string | null;
  quantityOnHand: number;
  reorderLevel: number;
  unitCost: number;
  sellingPrice: number;
  isSellable: boolean;
  isLowStock: boolean;
};

export default function InventoryPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["inventory.read"]}>
        <Suspense fallback={null}>
          <InventoryContent />
        </Suspense>
      </PermissionGate>
    </DashboardLayout>
  );
}

function InventoryContent() {
  const params = useSearchParams();
  const { can } = usePermissions();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out" | "sellable">(
    (params.get("filter") as "low" | "out" | null) ?? "all",
  );
  const [movingItem, setMovingItem] = useState<ItemRow | null>(null);

  const query = trpc.inventory.items.useQuery({
    page,
    pageSize: 25,
    sortDir: "asc",
    search: search || undefined,
    stockFilter,
  });

  const columns: Column<ItemRow>[] = [
    {
      key: "name",
      header: "Item",
      cell: row => (
        <span>
          <span className="font-medium text-foreground">{row.name}</span>
          <span className="block text-xs text-muted-foreground">{row.sku}</span>
        </span>
      ),
    },
    {
      key: "categoryName",
      header: "Category",
      cell: row => row.categoryName ?? row.category,
      value: row => row.categoryName ?? row.category,
    },
    { key: "supplierName", header: "Supplier", optional: true, cell: row => row.supplierName ?? "-" },
    {
      key: "quantityOnHand",
      header: "On hand",
      align: "right",
      cell: row => (
        <span className="inline-flex items-center gap-2">
          <span className="tabular-nums">{row.quantityOnHand}</span>
          {row.quantityOnHand === 0 ? (
            <Badge className="bg-rose-500/15 text-rose-800 hover:bg-rose-500/15 dark:text-rose-300">
              Out
            </Badge>
          ) : row.isLowStock ? (
            <Badge className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300">
              Low
            </Badge>
          ) : null}
        </span>
      ),
      value: row => row.quantityOnHand,
    },
    {
      key: "reorderLevel",
      header: "Reorder at",
      align: "right",
      optional: true,
      value: row => row.reorderLevel,
    },
    {
      key: "unitCost",
      header: "Unit cost",
      align: "right",
      cell: row => formatMoney(row.unitCost),
      value: row => row.unitCost,
    },
    {
      key: "sellingPrice",
      header: "Price",
      align: "right",
      cell: row => (row.isSellable ? formatMoney(row.sellingPrice) : "-"),
      value: row => row.sellingPrice,
    },
    {
      key: "value",
      header: "Stock value",
      align: "right",
      cell: row => formatMoney(row.quantityOnHand * row.unitCost),
      value: row => row.quantityOnHand * row.unitCost,
    },
    ...(can("inventory.write")
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: ItemRow) => (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => setMovingItem(row)}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Movement
              </Button>
            ),
            value: () => "",
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <DataTable
        title="Stock"
        description="One shared pool used by the storefront, the classroom and the salon."
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
        searchPlaceholder="Search by name or SKU..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        exportFileName="stock"
        emptyMessage="No items match these filters."
        footer={
          query.data ? (
            <span className="mr-2 text-xs text-muted-foreground">
              Stock value:{" "}
              <span className="font-semibold text-foreground">
                {formatMoney(query.data.valuation)}
              </span>
            </span>
          ) : null
        }
        filters={
          <Select
            value={stockFilter}
            onValueChange={value => {
              setStockFilter(value as typeof stockFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[11rem]" aria-label="Filter stock">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All items</SelectItem>
              <SelectItem value="low">Low stock</SelectItem>
              <SelectItem value="out">Out of stock</SelectItem>
              <SelectItem value="sellable">Sold online</SelectItem>
            </SelectContent>
          </Select>
        }
        actions={
          can("inventory.write") ? (
            <Button className="gap-2" disabled title="Item editing arrives with the catalogue screen">
              <Plus className="h-4 w-4" />
              New item
            </Button>
          ) : null
        }
      />

      <StockMovementDialog
        item={movingItem}
        onOpenChange={open => !open && setMovingItem(null)}
        onSaved={() => {
          toast.success("Stock movement recorded.");
          setMovingItem(null);
          query.refetch();
        }}
      />
    </div>
  );
}
