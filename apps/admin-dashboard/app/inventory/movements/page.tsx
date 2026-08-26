"use client";

import { useState } from "react";
import { Badge } from "@blush/ui/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import { collectAllPages } from "@/lib/exportAll";
import { trpc } from "@/lib/trpc";

const TYPES = [
  "received",
  "retail_sale",
  "classroom_use",
  "adjustment",
  "damaged",
  "return",
] as const;

type MovementRow = {
  id: number;
  itemName: string;
  sku: string;
  movementType: string;
  quantityDelta: number;
  balanceAfter: number | null;
  referenceType: string | null;
  referenceId: number | null;
  note: string | null;
  performedBy: string | null;
  createdAt: Date;
};

export default function StockMovementsPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["inventory.read"]}>
        <MovementsContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function MovementsContent() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [movementType, setMovementType] = useState("all");

  const utils = trpc.useUtils();

  // Shared by the table and by export, so a download covers exactly what the
  // filters describe rather than the page on screen.
  const filters = {
    sortDir: "desc" as const,
    search: search || undefined,
    movementType: movementType === "all" ? undefined : (movementType as (typeof TYPES)[number]),
  };

  const query = trpc.inventory.movements.useQuery({ ...filters, page, pageSize: 25 });

  const columns: Column<MovementRow>[] = [
    {
      key: "createdAt",
      header: "When",
      cell: row => (
        <span className="whitespace-nowrap">
          {new Date(row.createdAt).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
      value: row => new Date(row.createdAt).toISOString(),
    },
    {
      key: "itemName",
      header: "Item",
      cell: row => (
        <span>
          <span className="text-foreground">{row.itemName}</span>
          <span className="block text-xs text-muted-foreground">{row.sku}</span>
        </span>
      ),
    },
    {
      key: "movementType",
      header: "Type",
      cell: row => (
        <Badge variant="outline" className="capitalize">
          {row.movementType.replaceAll("_", " ")}
        </Badge>
      ),
    },
    {
      key: "quantityDelta",
      header: "Change",
      align: "right",
      cell: row => (
        <span
          className={`font-medium tabular-nums ${
            row.quantityDelta > 0
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-rose-700 dark:text-rose-400"
          }`}
        >
          {row.quantityDelta > 0 ? "+" : ""}
          {row.quantityDelta}
        </span>
      ),
      value: row => row.quantityDelta,
    },
    {
      key: "balanceAfter",
      header: "Balance",
      align: "right",
      cell: row => (row.balanceAfter === null ? "-" : row.balanceAfter),
      value: row => row.balanceAfter ?? "",
    },
    {
      key: "referenceType",
      header: "Source",
      cell: row =>
        row.referenceType ? (
          <span className="text-xs capitalize text-muted-foreground">
            {row.referenceType.replaceAll("_", " ")}
            {row.referenceId ? ` #${row.referenceId}` : ""}
          </span>
        ) : (
          "-"
        ),
      value: row => row.referenceType ?? "",
    },
    { key: "performedBy", header: "By", optional: true, cell: row => row.performedBy ?? "System" },
    { key: "note", header: "Note", optional: true, cell: row => row.note ?? "-" },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <DataTable
        title="Stock movements"
        description="Every unit in and out, and what caused it."
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
        searchPlaceholder="Search by item name..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        exportFileName="stock-movements"
        fetchAllRows={() =>
          collectAllPages((page, pageSize) =>
            utils.inventory.movements.fetch({ ...filters, page, pageSize }),
          )
        }
        emptyMessage="No movements match these filters."
        filters={
          <Select
            value={movementType}
            onValueChange={value => {
              setMovementType(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[12rem]" aria-label="Filter by movement type">
              <SelectValue placeholder="All movements" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All movements</SelectItem>
              {TYPES.map(item => (
                <SelectItem key={item} value={item} className="capitalize">
                  {item.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
    </div>
  );
}
