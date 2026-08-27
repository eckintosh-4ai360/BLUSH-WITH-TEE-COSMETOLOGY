"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { toast } from "@blush/ui/components/ui/sonner";
import { formatMoney } from "@blush/ui/lib/viz";
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import { SaveSupplierDialog } from "@/components/suppliers/SaveSupplierDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { collectAllPages } from "@/lib/exportAll";
import { trpc } from "@/lib/trpc";

type SupplierRow = {
  id: number;
  name: string;
  company: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  productsSupplied: string | null;
  notes: string | null;
  outstandingBalance: number;
  isActive: boolean;
};

export default function SuppliersPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["suppliers.read"]}>
        <SuppliersContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function SuppliersContent() {
  const router = useRouter();
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const utils = trpc.useUtils();

  // Shared by the table and by export, so a download covers exactly what the
  // filters describe rather than the page on screen.
  const filters = { sortDir: "asc" as const, search: search || undefined };

  const query = trpc.inventory.suppliers.useQuery({ ...filters, page, pageSize: 25 });

  const columns: Column<SupplierRow>[] = [
    {
      key: "name",
      header: "Supplier",
      cell: row => (
        <span>
          <span className="font-medium text-foreground">{row.name}</span>
          {row.company ? (
            <span className="block text-xs text-muted-foreground">{row.company}</span>
          ) : null}
        </span>
      ),
    },
    { key: "phone", header: "Phone", cell: row => row.phone ?? "-" },
    { key: "whatsapp", header: "WhatsApp", optional: true, cell: row => row.whatsapp ?? "-" },
    { key: "email", header: "Email", cell: row => row.email ?? "-" },
    {
      key: "productsSupplied",
      header: "Supplies",
      cell: row => (
        <span className="line-clamp-1 text-xs text-muted-foreground">
          {row.productsSupplied ?? "-"}
        </span>
      ),
      value: row => row.productsSupplied ?? "",
    },
    {
      key: "outstandingBalance",
      header: "Owed",
      align: "right",
      cell: row => (
        <span
          className={row.outstandingBalance > 0 ? "font-semibold text-foreground" : undefined}
        >
          {formatMoney(row.outstandingBalance)}
        </span>
      ),
      value: row => row.outstandingBalance,
    },
    {
      key: "isActive",
      header: "Status",
      cell: row => (
        <Badge variant={row.isActive ? "secondary" : "outline"}>
          {row.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
      value: row => (row.isActive ? "Active" : "Inactive"),
    },
    ...(can("suppliers.write")
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: SupplierRow) => (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                // The row itself opens the detail page, so the button must not
                // let that click through as well.
                onClick={event => {
                  event.stopPropagation();
                  setEditing(row);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
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
        title="Suppliers"
        description="Who supplies the school, and what is still owed to them."
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
        searchPlaceholder="Search by name, company or phone..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        onRowClick={row => router.push(`/suppliers/${row.id}`)}
        exportFileName="suppliers"
        fetchAllRows={() =>
          collectAllPages((page, pageSize) =>
            utils.inventory.suppliers.fetch({ ...filters, page, pageSize }),
          )
        }
        emptyMessage="No suppliers recorded yet."
        actions={
          can("suppliers.write") ? (
            <Button
              className="gap-2"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New supplier
            </Button>
          ) : null
        }
      />

      <SaveSupplierDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => {
          toast.success(editing ? "Supplier updated." : "Supplier created.");
          query.refetch();
        }}
      />
    </div>
  );
}
