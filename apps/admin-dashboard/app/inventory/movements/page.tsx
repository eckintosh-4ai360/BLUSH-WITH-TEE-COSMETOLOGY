"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
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
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import { toast } from "@blush/ui/components/ui/sonner";
import { usePermissions } from "@/hooks/usePermissions";
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
  /** This row is itself the undo of another movement. */
  isReversal: boolean;
  /** This row has already been undone by a later one. */
  isReversed: boolean;
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
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [movementType, setMovementType] = useState("all");
  const [reversing, setReversing] = useState<MovementRow | null>(null);

  const utils = trpc.useUtils();

  // Shared by the table and by export, so a download covers exactly what the
  // filters describe rather than the page on screen.
  const filters = {
    sortDir: "desc" as const,
    search: search || undefined,
    movementType: movementType === "all" ? undefined : (movementType as (typeof TYPES)[number]),
  };

  const query = trpc.inventory.movements.useQuery({ ...filters, page, pageSize: 25 });

  const reverseMovement = trpc.inventory.reverseMovement.useMutation({
    onSuccess: result => {
      toast.success(`Reversed. ${result.itemName} is now at ${result.balanceAfter}.`);
      setReversing(null);
      query.refetch();
      // The stock screen and its low-stock count both moved with it.
      utils.inventory.items.invalidate();
      utils.inventory.lowStock.invalidate();
    },
    onError: error => toast.error(error.message),
  });

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
        <span className="inline-flex items-center gap-2">
          {row.isReversed ? (
            <Badge className="bg-muted text-muted-foreground hover:bg-muted">Reversed</Badge>
          ) : null}
          <span
            className={`font-medium tabular-nums ${
              // A row that has been undone no longer describes the balance, so
              // it reads as struck through rather than as stock that moved.
              row.isReversed
                ? "text-muted-foreground line-through"
                : row.quantityDelta > 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-rose-700 dark:text-rose-400"
            }`}
          >
            {row.quantityDelta > 0 ? "+" : ""}
            {row.quantityDelta}
          </span>
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
    ...(can("inventory.write")
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: MovementRow) =>
              // A reversal, and a row already reversed, have nothing left to
              // undo. Saying so on the row beats a server error on the click.
              row.isReversal || row.isReversed ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Reverse ${row.movementType.replaceAll("_", " ")} of ${row.quantityDelta} on ${row.itemName}`}
                  className="text-destructive"
                  onClick={() => setReversing(row)}
                >
                  <Undo2 className="h-3.5 w-3.5" />
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

      <AlertDialog open={reversing !== null} onOpenChange={open => !open && setReversing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse this movement?</AlertDialogTitle>
            <AlertDialogDescription>
              {reversing
                ? `The ledger is append-only, so this entry stays and a matching ${
                    -reversing.quantityDelta > 0 ? "+" : ""
                  }${-reversing.quantityDelta} is posted against ${
                    reversing.itemName
                  } to cancel it. Both rows remain, and stock returns to what it was before.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverseMovement.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={reverseMovement.isPending}
              onClick={event => {
                // Confirming holds the dialog open until the server answers, so
                // a refusal is read where it was asked for.
                event.preventDefault();
                if (reversing) reverseMovement.mutate({ movementId: reversing.id });
              }}
            >
              {reverseMovement.isPending ? "Reversing..." : "Reverse movement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
