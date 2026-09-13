"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { toast } from "@blush/ui/components/ui/sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import {
  SaveWorkerDialog,
  type EditableWorker,
} from "@/components/staff/SaveWorkerDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@blush/ui/lib/viz";

const DEPARTMENTS: Record<EditableWorker["department"], string> = {
  school: "School",
  salon: "Salon",
  shop: "Shop",
};

const STATUS_LABELS: Record<EditableWorker["status"], string> = {
  active: "Active",
  inactive: "Inactive",
  on_leave: "On leave",
};

type WorkerRow = EditableWorker;

export default function WorkersPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["staff.read"]}>
        <WorkersContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function WorkersContent() {
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WorkerRow | null>(null);
  const query = trpc.staff.records.useQuery({
    search: search || undefined,
    page,
    pageSize: 25,
  });

  const columns: Column<WorkerRow>[] = [
    {
      key: "name",
      header: "Worker",
      cell: row => (
        <span>
          <span className="font-medium text-foreground">{row.name}</span>
          <span className="block text-xs text-muted-foreground">
            {row.staffNumber ??
              row.email ??
              row.accountEmail ??
              "No contact details"}
          </span>
        </span>
      ),
      value: row => row.name,
    },
    {
      key: "department",
      header: "Work area",
      cell: row => (
        <Badge variant="outline">{DEPARTMENTS[row.department]}</Badge>
      ),
      value: row => DEPARTMENTS[row.department],
    },
    { key: "position", header: "Position" },
    {
      key: "phone",
      header: "Phone",
      optional: true,
      cell: row => row.phone ?? "-",
    },
    ...(can("staff.salary.read")
      ? [
          {
            key: "salary",
            header: "Salary",
            align: "right" as const,
            optional: true,
            cell: (row: WorkerRow) =>
              row.salary == null ? "-" : formatMoney(row.salary),
            value: (row: WorkerRow) => row.salary ?? "",
          },
        ]
      : []),
    {
      key: "status",
      header: "Status",
      cell: row => (
        <Badge variant={row.status === "active" ? "default" : "secondary"}>
          {STATUS_LABELS[row.status]}
        </Badge>
      ),
      value: row => STATUS_LABELS[row.status],
    },
    ...(can("staff.write")
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: WorkerRow) => (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => {
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
        title="Workers"
        description="One team register for the school, salon and shop. These records also supply the worker list on daily services."
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
        searchPlaceholder="Search by name, position or work area..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No worker records match this search."
        actions={
          can("staff.write") ? (
            <Button
              className="gap-2"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add worker
            </Button>
          ) : null
        }
      />

      <SaveWorkerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => {
          toast.success(editing ? "Worker record updated." : "Worker added.");
          setEditing(null);
          query.refetch();
        }}
      />
    </div>
  );
}
