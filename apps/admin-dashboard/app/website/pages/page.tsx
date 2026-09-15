"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import { Switch } from "@blush/ui/components/ui/switch";
import { toast } from "@blush/ui/components/ui/sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import { StatusControl } from "@/components/website/ContentStatus";
import { PageDialog, type PageEntry } from "@/components/website/PageDialog";
import { SITE_URL } from "@/components/website/PublishingFields";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

export default function WebsitePagesPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["cms.read"]}>
        <WebsitePages />
      </PermissionGate>
    </DashboardLayout>
  );
}

const UPDATED = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Accra",
  day: "numeric",
  month: "short",
  year: "numeric",
});

type PageRow = PageEntry & { updatedAt: Date | string; updatedByName: string | null };

// Standalone website pages. Nothing is deleted: archiving takes a page off the site.
function WebsitePages() {
  const { can } = usePermissions();
  const writable = can("cms.write");
  const query = trpc.cms.pages.useQuery();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<PageRow | "new" | null>(null);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? []).filter(
      row =>
        (showArchived || row.status !== "archived") &&
        (!term || row.title.toLowerCase().includes(term) || row.slug.includes(term)),
    );
  }, [query.data, search, showArchived]);

  const columns: Column<PageRow>[] = [
    {
      key: "title",
      header: "Page",
      cell: row => (
        <span>
          <span className="font-medium text-foreground">{row.title}</span>
          <span className="block text-xs text-muted-foreground">/pages/{row.slug}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: row => (
        <StatusControl
          kind="page"
          id={row.id}
          status={row.status}
          writable={writable}
          onChanged={() => void query.refetch()}
        />
      ),
      value: row => row.status,
    },
    {
      key: "updatedAt",
      header: "Last edited",
      cell: row => (
        <span className="text-sm">
          {UPDATED.format(new Date(row.updatedAt))}
          {row.updatedByName ? (
            <span className="block text-xs text-muted-foreground">{row.updatedByName}</span>
          ) : null}
        </span>
      ),
      value: row => new Date(row.updatedAt).toISOString(),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: row => (
        <span className="flex justify-end gap-1">
          {row.status === "published" ? (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
              <a
                href={`${SITE_URL}/pages/${row.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${row.title} on the website`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          ) : null}
          {writable ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label={`Edit ${row.title}`}
              onClick={() => setEditing(row)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </span>
      ),
      value: () => "",
    },
  ];

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <DataTable
        title="Website pages"
        description="Pages of their own on the website, such as scholarships or a refund policy. Published pages are listed in the website footer."
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
        searchPlaceholder="Search pages..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        exportFileName="website-pages"
        emptyMessage={writable ? "No pages yet. Create the first one." : "No pages yet."}
        actions={
          <span className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Show archived pages" />
              Show archived
            </label>
            {writable ? (
              <Button className="gap-2" onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" />
                New page
              </Button>
            ) : null}
          </span>
        }
      />

      <PageDialog
        open={editing !== null}
        onOpenChange={open => !open && setEditing(null)}
        editing={editing === "new" ? null : editing}
        onSaved={saved => {
          toast.success(`Page saved at /pages/${saved.slug}.`);
          void query.refetch();
        }}
      />
    </div>
  );
}
