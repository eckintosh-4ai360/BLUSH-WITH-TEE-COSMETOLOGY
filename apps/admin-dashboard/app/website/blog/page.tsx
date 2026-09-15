"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Pencil, Plus, Tags } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import { Switch } from "@blush/ui/components/ui/switch";
import { toast } from "@blush/ui/components/ui/sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import { BlogCategoriesDialog } from "@/components/website/BlogCategoriesDialog";
import { BlogPostDialog, type BlogPostEntry } from "@/components/website/BlogPostDialog";
import { StatusControl } from "@/components/website/ContentStatus";
import { SITE_URL } from "@/components/website/PublishingFields";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

export default function WebsiteBlogPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["cms.read"]}>
        <WebsiteBlog />
      </PermissionGate>
    </DashboardLayout>
  );
}

const DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

type PostRow = BlogPostEntry & { categoryName: string | null; updatedAt: Date | string };

// Today as YYYY-MM-DD; Ghana keeps GMT.
const todayIso = () => new Date().toISOString().slice(0, 10);

// The website blog. Nothing is deleted: archiving takes a post off the site.
function WebsiteBlog() {
  const { can } = usePermissions();
  const { user } = useAuth();
  const writable = can("cms.write");
  const query = trpc.cms.blogPosts.useQuery();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<PostRow | "new" | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? []).filter(
      row =>
        (showArchived || row.status !== "archived") &&
        (!term ||
          row.title.toLowerCase().includes(term) ||
          (row.categoryName ?? "").toLowerCase().includes(term) ||
          (row.tags ?? "").toLowerCase().includes(term)),
    );
  }, [query.data, search, showArchived]);

  const columns: Column<PostRow>[] = [
    {
      key: "title",
      header: "Post",
      cell: row => (
        <span className="flex items-center gap-3">
          {row.featuredImageUrl ? (
            <img
              src={row.featuredImageUrl}
              alt=""
              className="h-10 w-14 shrink-0 rounded-md border border-border/60 object-cover"
            />
          ) : null}
          <span>
            <span className="font-medium text-foreground">{row.title}</span>
            <span className="block text-xs text-muted-foreground">/blog/{row.slug}</span>
          </span>
        </span>
      ),
    },
    {
      key: "categoryName",
      header: "Category",
      cell: row => row.categoryName ?? <span className="text-muted-foreground">None</span>,
      value: row => row.categoryName ?? "",
    },
    {
      key: "status",
      header: "Status",
      cell: row => (
        <StatusControl
          kind="blogPost"
          id={row.id}
          status={row.status}
          writable={writable}
          onChanged={() => void query.refetch()}
        />
      ),
      value: row => row.status,
    },
    {
      key: "publishedAt",
      header: "Publish date",
      cell: row => {
        if (!row.publishedAt) return <span className="text-muted-foreground">Not set</span>;
        const iso = new Date(row.publishedAt).toISOString().slice(0, 10);
        return (
          <span className="text-sm">
            {DATE.format(new Date(row.publishedAt))}
            {row.status === "published" && iso > todayIso() ? (
              <span className="block text-xs text-muted-foreground">Scheduled</span>
            ) : null}
          </span>
        );
      },
      value: row => (row.publishedAt ? new Date(row.publishedAt).toISOString().slice(0, 10) : ""),
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
                href={`${SITE_URL}/blog/${row.slug}`}
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
        title="Blog"
        description="Posts for the website blog. A published post shows from its publish date, newest first."
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
        searchPlaceholder="Search posts, categories or tags..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        exportFileName="blog-posts"
        emptyMessage={writable ? "No posts yet. Write the first one." : "No posts yet."}
        actions={
          <span className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Show archived posts" />
              Show archived
            </label>
            <Button variant="outline" className="gap-2" onClick={() => setCategoriesOpen(true)}>
              <Tags className="h-4 w-4" />
              Categories
            </Button>
            {writable ? (
              <Button className="gap-2" onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" />
                New post
              </Button>
            ) : null}
          </span>
        }
      />

      <BlogPostDialog
        open={editing !== null}
        onOpenChange={open => !open && setEditing(null)}
        editing={editing === "new" ? null : editing}
        defaultAuthor={user?.name}
        onSaved={saved => {
          toast.success(`Post saved at /blog/${saved.slug}.`);
          void query.refetch();
        }}
      />

      <BlogCategoriesDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        writable={writable}
        onChanged={() => void query.refetch()}
      />
    </div>
  );
}
