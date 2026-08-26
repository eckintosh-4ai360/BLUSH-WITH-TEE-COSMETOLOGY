"use client";

import { useState } from "react";
import { Check, Eye, X } from "lucide-react";
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
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { collectAllPages } from "@/lib/exportAll";
import { trpc } from "@/lib/trpc";

const STATUS = [
  "draft",
  "submitted",
  "under_review",
  "more_information",
  "approved",
  "rejected",
] as const;

/** Status tones: state, never reused as a chart series colour. */
const STATUS_TONE: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-700 dark:text-slate-300 hover:bg-slate-500/15",
  submitted: "bg-sky-500/15 text-sky-800 dark:text-sky-300 hover:bg-sky-500/15",
  under_review: "bg-amber-500/15 text-amber-800 dark:text-amber-300 hover:bg-amber-500/15",
  more_information: "bg-orange-500/15 text-orange-800 dark:text-orange-300 hover:bg-orange-500/15",
  approved: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/15",
  rejected: "bg-rose-500/15 text-rose-800 dark:text-rose-300 hover:bg-rose-500/15",
};

type ApplicationRow = {
  application: {
    id: number;
    reference: string;
    fullName: string;
    email: string;
    phone: string;
    status: (typeof STATUS)[number];
    decisionNote: string | null;
    createdAt: Date;
  };
  courseTitle: string;
};

export default function AdminAdmissionsPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["admissions.read"]}>
        <AdmissionsContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function AdmissionsContent() {
  const { can } = usePermissions();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");

  // Shared by the table and by export, so a download covers exactly what the
  // filters describe rather than the page on screen.
  const filters = {
    search: search || undefined,
    status: status === "all" ? undefined : (status as (typeof STATUS)[number]),
  };

  const query = trpc.admin.applications.useQuery({ ...filters, page, pageSize: 25 });

  const review = trpc.admin.reviewApplication.useMutation({
    onSuccess: () => {
      toast.success("Application updated.");
      utils.admin.applications.invalidate();
      utils.admin.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const columns: Column<ApplicationRow>[] = [
    {
      key: "fullName",
      header: "Applicant",
      cell: row => (
        <span>
          <span className="font-medium text-foreground">{row.application.fullName}</span>
          <span className="block text-xs text-muted-foreground">
            {row.application.reference} · {row.application.email}
          </span>
        </span>
      ),
      value: row => row.application.fullName,
    },
    {
      key: "courseTitle",
      header: "Programme",
      cell: row => row.courseTitle,
    },
    {
      key: "phone",
      header: "Phone",
      optional: true,
      cell: row => row.application.phone,
    },
    {
      key: "status",
      header: "Status",
      cell: row => (
        <Badge className={`capitalize ${STATUS_TONE[row.application.status] ?? ""}`}>
          {row.application.status.replaceAll("_", " ")}
        </Badge>
      ),
      value: row => row.application.status.replaceAll("_", " "),
    },
    {
      key: "createdAt",
      header: "Submitted",
      optional: true,
      cell: row => new Date(row.application.createdAt).toLocaleDateString("en-GB"),
      value: row => new Date(row.application.createdAt).toISOString().slice(0, 10),
    },
    {
      key: "decisionNote",
      header: "Decision note",
      optional: true,
      cell: row => row.application.decisionNote || <span className="text-muted-foreground">—</span>,
      value: row => row.application.decisionNote ?? "",
    },
    ...(can("admissions.review")
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: ApplicationRow) => {
              const applicationId = row.application.id;
              const currentStatus = row.application.status;
              return (
                <span className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    disabled={review.isPending || currentStatus === "under_review"}
                    onClick={() => review.mutate({ applicationId, status: "under_review" })}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Review
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-emerald-700 hover:text-emerald-800"
                    disabled={review.isPending || currentStatus === "approved"}
                    onClick={() => review.mutate({ applicationId, status: "approved" })}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-destructive"
                    disabled={review.isPending || currentStatus === "rejected"}
                    onClick={() => review.mutate({ applicationId, status: "rejected" })}
                  >
                    <X className="h-3.5 w-3.5" />
                    Decline
                  </Button>
                </span>
              );
            },
            value: () => "",
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <DataTable
        title="Admissions"
        description="Applications awaiting their next step."
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
        searchPlaceholder="Search by name, email or reference..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.application.id}
        exportFileName="admissions"
        pdfTitle="Admissions"
        fetchAllRows={() =>
          collectAllPages((page, pageSize) =>
            utils.admin.applications.fetch({ ...filters, page, pageSize }),
          )
        }
        emptyMessage="No applications match these filters."
        filters={
          <Select
            value={status}
            onValueChange={value => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[11rem]" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS.map(item => (
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
