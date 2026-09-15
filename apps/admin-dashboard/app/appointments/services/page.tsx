"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { toast } from "@blush/ui/components/ui/sonner";
import { Switch } from "@blush/ui/components/ui/switch";
import { formatMoney } from "@blush/ui/lib/viz";
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import { BookingHoursCard } from "@/components/appointments/BookingHoursCard";
import {
  SaveMenuItemDialog,
  type MenuItem,
} from "@/components/appointments/SaveMenuItemDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

export default function ServiceMenuPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["services.read", "appointments.read"]}>
        <ServiceMenu />
      </PermissionGate>
    </DashboardLayout>
  );
}

// The salon's service menu: what the website offers for booking, at what price.
function ServiceMenu() {
  const { can } = usePermissions();
  const writable = can("services.write");
  const query = trpc.services.menu.useQuery();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);

  const quickSave = trpc.services.saveMenuItem.useMutation({
    onSuccess: () => void query.refetch(),
    onError: error => toast.error(error.message),
  });

  // The whole menu is small, so it is searched here rather than on the server.
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = query.data ?? [];
    return term
      ? all.filter(
          row =>
            row.name.toLowerCase().includes(term) ||
            (row.description ?? "").toLowerCase().includes(term),
        )
      : all;
  }, [query.data, search]);

  const toggle = (row: MenuItem, change: Partial<Pick<MenuItem, "isBookable" | "isActive">>) =>
    quickSave.mutate({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      durationMinutes: row.durationMinutes,
      price: row.price,
      isBookable: change.isBookable ?? row.isBookable,
      isActive: change.isActive ?? row.isActive,
    });

  const columns: Column<MenuItem>[] = [
    {
      key: "name",
      header: "Service",
      cell: row => (
        <span className={row.isActive ? "" : "opacity-60"}>
          <span className="font-medium text-foreground">{row.name}</span>
          {row.description ? (
            <span className="block max-w-md truncate text-xs text-muted-foreground">
              {row.description}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      cell: row => <span className="tabular-nums">{formatMoney(row.price)}</span>,
      value: row => row.price.toFixed(2),
    },
    {
      key: "durationMinutes",
      header: "Duration",
      cell: row => `${row.durationMinutes} min`,
    },
    {
      key: "isBookable",
      header: "Online booking",
      cell: row =>
        writable ? (
          <Switch
            checked={row.isBookable}
            disabled={quickSave.isPending || !row.isActive}
            onCheckedChange={checked => toggle(row, { isBookable: checked })}
            aria-label={`Offer ${row.name} for online booking`}
          />
        ) : (
          <Badge variant="outline">{row.isBookable ? "Bookable" : "Staff only"}</Badge>
        ),
      value: row => (row.isBookable ? "yes" : "no"),
    },
    {
      key: "isActive",
      header: "Status",
      cell: row =>
        writable ? (
          <span className="flex items-center gap-2">
            <Switch
              checked={row.isActive}
              disabled={quickSave.isPending}
              onCheckedChange={checked => toggle(row, { isActive: checked })}
              aria-label={`Keep ${row.name} on the menu`}
            />
            <span className="text-xs text-muted-foreground">{row.isActive ? "On menu" : "Hidden"}</span>
          </span>
        ) : (
          <Badge variant={row.isActive ? "secondary" : "outline"}>
            {row.isActive ? "On menu" : "Hidden"}
          </Badge>
        ),
      value: row => (row.isActive ? "on menu" : "hidden"),
    },
    ...(writable
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: MenuItem) => (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label={`Edit ${row.name}`}
                onClick={() => setEditing(row)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ),
            value: () => "",
          },
        ]
      : []),
  ];

  const bookable = (query.data ?? []).filter(row => row.isActive && row.isBookable).length;

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <DataTable
        title="Service menu"
        description={`What clients can book, and what it costs. ${bookable} service${bookable === 1 ? " is" : "s are"} bookable on the website.`}
        columns={columns}
        data={
          query.data
            ? { rows, page: 1, pageSize: Math.max(rows.length, 1), total: rows.length, totalPages: 1, hasMore: false }
            : undefined
        }
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        error={query.error ? { message: query.error.message } : null}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search services..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        exportFileName="service-menu"
        emptyMessage="No services on the menu yet."
        actions={
          writable ? (
            <Button className="gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add service
            </Button>
          ) : null
        }
      />

      <BookingHoursCard writable={writable} />

      <SaveMenuItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => {
          toast.success("Service added.");
          void query.refetch();
        }}
      />

      <SaveMenuItemDialog
        open={editing !== null}
        onOpenChange={open => !open && setEditing(null)}
        editing={editing}
        onSaved={() => {
          setEditing(null);
          toast.success("Service updated.");
          void query.refetch();
        }}
      />
    </div>
  );
}
