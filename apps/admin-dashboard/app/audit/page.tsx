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

type AuditRow = {
  id: number;
  userName: string | null;
  action: string;
  entity: string;
  entityId: number | null;
  entityLabel: string | null;
  summary: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  createdAt: Date;
};

export default function AuditPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["audit.read"]}>
        <AuditContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function AuditContent() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState("all");
  const [action, setAction] = useState("all");

  const facets = trpc.platform.auditFacets.useQuery();
  const utils = trpc.useUtils();

  // Shared by the table and by export, so a download covers exactly what the
  // filters describe rather than the page on screen.
  const filters = {
    sortDir: "desc" as const,
    search: search || undefined,
    entity: entity === "all" ? undefined : entity,
    action: action === "all" ? undefined : action,
  };

  const query = trpc.platform.auditLog.useQuery({ ...filters, page, pageSize: 25 });

  const columns: Column<AuditRow>[] = [
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
      key: "userName",
      header: "Who",
      cell: row => row.userName ?? <span className="text-muted-foreground">System</span>,
      value: row => row.userName ?? "System",
    },
    {
      key: "summary",
      header: "What happened",
      cell: row => (
        <span className="text-foreground">
          {row.summary ?? `${row.action} on ${row.entity}`}
        </span>
      ),
      value: row => row.summary ?? `${row.action} on ${row.entity}`,
    },
    {
      key: "entity",
      header: "Record",
      cell: row => (
        <span className="whitespace-nowrap">
          <Badge variant="outline" className="capitalize">
            {row.entity}
          </Badge>
          {row.entityLabel ? (
            <span className="ml-2 text-xs text-muted-foreground">{row.entityLabel}</span>
          ) : null}
        </span>
      ),
      value: row => `${row.entity} ${row.entityLabel ?? row.entityId ?? ""}`.trim(),
    },
    {
      key: "change",
      header: "Change",
      optional: true,
      cell: row => <ChangeCell oldValue={row.oldValue} newValue={row.newValue} />,
      value: row => (row.newValue ? JSON.stringify(row.newValue) : ""),
    },
    { key: "ipAddress", header: "IP", optional: true, cell: row => row.ipAddress ?? "-" },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <DataTable
        title="Audit log"
        description="An immutable record of who changed what, and when."
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
        searchPlaceholder="Search by description, record or person..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        exportFileName="audit-log"
        fetchAllRows={() =>
          collectAllPages((page, pageSize) =>
            utils.platform.auditLog.fetch({ ...filters, page, pageSize }),
          )
        }
        emptyMessage="Nothing has been recorded for these filters."
        filters={
          <>
            <Select
              value={entity}
              onValueChange={value => {
                setEntity(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[11rem]" aria-label="Filter by record type">
                <SelectValue placeholder="All records" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All records</SelectItem>
                {facets.data?.entities.map(item => (
                  <SelectItem key={item} value={item} className="capitalize">
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={action}
              onValueChange={value => {
                setAction(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[12rem]" aria-label="Filter by action">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {facets.data?.actions.map(item => (
                  <SelectItem key={item} value={item}>
                    {item.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />
    </div>
  );
}

/** Compact before/after, only for the fields that actually changed. */
function ChangeCell({ oldValue, newValue }: { oldValue: unknown; newValue: unknown }) {
  const next = (newValue ?? {}) as Record<string, unknown>;
  const previous = (oldValue ?? {}) as Record<string, unknown>;
  const keys = Object.keys(next);

  if (!keys.length) return <span className="text-muted-foreground">-</span>;

  return (
    <span className="space-y-0.5">
      {keys.slice(0, 3).map(key => (
        <span key={key} className="block whitespace-nowrap text-xs">
          <span className="text-muted-foreground">{key}: </span>
          {key in previous ? (
            <>
              <span className="text-muted-foreground line-through">{format(previous[key])}</span>
              <span className="mx-1 text-muted-foreground">to</span>
            </>
          ) : null}
          <span className="font-medium text-foreground">{format(next[key])}</span>
        </span>
      ))}
      {keys.length > 3 ? (
        <span className="block text-xs text-muted-foreground">+{keys.length - 3} more</span>
      ) : null}
    </span>
  );
}

function format(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 40);
  return String(value).slice(0, 40);
}
