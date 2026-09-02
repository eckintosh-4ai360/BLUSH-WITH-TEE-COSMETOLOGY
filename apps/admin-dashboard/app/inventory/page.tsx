"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight, BellRing, Pencil, Plus, Upload } from "lucide-react";
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
import { ImportDialog } from "@/components/imports/ImportDialog";
import { PRODUCT_IMPORT_COLUMNS } from "@blush/shared/imports";
import { SaveItemDialog } from "@/components/inventory/SaveItemDialog";
import { StockMovementDialog } from "@/components/inventory/StockMovementDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { collectAllPages } from "@/lib/exportAll";
import { trpc } from "@/lib/trpc";

type ItemRow = {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  categoryId: number | null;
  categoryName: string | null;
  supplierId: number | null;
  supplierName: string | null;
  quantityOnHand: number;
  reorderLevel: number;
  unitCost: number;
  sellingPrice: number;
  isSellable: boolean;
  isActive: boolean;
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
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const importProducts = trpc.imports.products.useMutation();

  // The alert goes out on its own whenever a sale takes an item to its reorder
  // level. This is for the other case: somebody looking at the screen who
  // wants the report in their inbox now.
  const lowStock = trpc.inventory.lowStock.useQuery();
  const notifyLowStock = trpc.inventory.notifyLowStock.useMutation({
    onSuccess: result => {
      if (!result.sent) {
        toast.info(result.reason ?? "Nothing is low enough to report.");
        return;
      }
      toast.success(
        `Reported ${result.lowCount} low item${result.lowCount === 1 ? "" : "s"} to ${result.recipients} recipient${result.recipients === 1 ? "" : "s"}.`,
      );
    },
    onError: error => toast.error(error.message),
  });

  const utils = trpc.useUtils();

  // Shared by the table and by export, so a download covers exactly what the
  // filters describe rather than the page on screen.
  const filters = { sortDir: "asc" as const, search: search || undefined, stockFilter };

  const query = trpc.inventory.items.useQuery({ ...filters, page, pageSize: 25 });

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
              <span className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setEditingItem(row);
                    setItemDialogOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setMovingItem(row)}
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Movement
                </Button>
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
        fetchAllRows={() =>
          collectAllPages((page, pageSize) =>
            utils.inventory.items.fetch({ ...filters, page, pageSize }),
          )
        }
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
            <>
              {lowStock.data && lowStock.data.count > 0 ? (
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={notifyLowStock.isPending}
                  onClick={() => notifyLowStock.mutate()}
                  title="Emails and texts the administrators a PDF of everything at or below its reorder level."
                >
                  <BellRing className="h-4 w-4" />
                  {notifyLowStock.isPending
                    ? "Sending..."
                    : `Alert on ${lowStock.data.count} low`}
                </Button>
              ) : null}
              <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" />
                Import
              </Button>
              <Button
                className="gap-2"
                onClick={() => {
                  setEditingItem(null);
                  setItemDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                New item
              </Button>
            </>
          ) : null
        }
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import stock"
        description="Adds stock items in bulk from a spreadsheet. Opening quantities are booked as movements, so the ledger accounts for every unit."
        columns={PRODUCT_IMPORT_COLUMNS}
        templateName="stock-import-template"
        noun="items"
        isPending={importProducts.isPending}
        runImport={args => importProducts.mutateAsync(args)}
        onImported={() => {
          toast.success("Stock imported.");
          query.refetch();
        }}
      />

      <SaveItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        editing={editingItem}
        onSaved={() => {
          toast.success(editingItem ? "Item updated." : "Item created.");
          query.refetch();
        }}
      />

      <StockMovementDialog
        item={movingItem}
        onOpenChange={open => !open && setMovingItem(null)}
        onSaved={() => {
          toast.success("Stock movement recorded.");
          setMovingItem(null);
          query.refetch();
          // The movement may have taken the item under its reorder level, and
          // the alert button counts what is low.
          lowStock.refetch();
        }}
      />
    </div>
  );
}
