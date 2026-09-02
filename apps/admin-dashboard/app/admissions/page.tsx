"use client";

import { useState } from "react";
import { Check, FileText, Pencil, Plus, Trash2, X } from "lucide-react";
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
import { toast } from "@blush/ui/components/ui/sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { DataTable, type Column } from "@/components/DataTable";
import { PermissionGate } from "@/components/PermissionGate";
import {
  RecordApplicationDialog,
  type EditableApplication,
} from "@/components/admissions/RecordApplicationDialog";
import {
  ViewAdmissionFormDialog,
  type AdmissionApplicationData,
} from "@/components/admissions/ViewAdmissionFormDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { collectAllPages } from "@/lib/exportAll";
import { durationFilterOptions } from "@/lib/describeDuration";
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
    courseId: number;
    fullName: string;
    email: string;
    phone: string;
    whatsapp?: string | null;
    birthDate?: Date | string | null;
    hometown?: string | null;
    age?: number | null;
    gender?: string | null;
    maritalStatus?: string | null;
    address?: string | null;
    emergencyContact?: string | null;
    emergencyRelationship?: string | null;
    instagram?: string | null;
    tiktok?: string | null;
    otherSocialMedia?: string | null;
    educationalLevel?: string | null;
    education?: string | null;
    paymentPlan?: string | null;
    duration?: string | null;
    startDate?: Date | string | null;
    guardianName?: string | null;
    guardianAddress?: string | null;
    guardianPhone?: string | null;
    signatureData?: string | null;
    agreedToTerms?: boolean | null;
    ceoEndorsed?: boolean | null;
    ceoEndorsementDate?: Date | string | null;
    ceoEndorsementSignature?: string | null;
    statement?: string | null;
    status: (typeof STATUS)[number];
    decisionNote: string | null;
    createdAt: Date;
  };
  courseTitle: string;
  /** Fees as quoted to this applicant; today's price stands in for old rows. */
  courseTuition: string | null;
  courseProductFee: string | null;
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
  const [duration, setDuration] = useState("all");
  const [recordOpen, setRecordOpen] = useState(false);
  const [editing, setEditing] = useState<EditableApplication | null>(null);
  const [removing, setRemoving] = useState<ApplicationRow["application"] | null>(null);
  const [viewFormApp, setViewFormApp] = useState<AdmissionApplicationData | null>(null);

  // Shared by the table and by export, so a download covers exactly what the
  // filters describe rather than the page on screen.
  const filters = {
    search: search || undefined,
    status: status === "all" ? undefined : (status as (typeof STATUS)[number]),
    durationWeeks: duration === "all" ? undefined : Number(duration),
  };

  const query = trpc.admin.applications.useQuery({ ...filters, page, pageSize: 25 });
  const courses = trpc.content.courses.useQuery();

  const remove = trpc.admin.deleteApplication.useMutation({
    onSuccess: result => {
      toast.success(`Application ${result.reference} removed.`);
      utils.admin.applications.invalidate();
      utils.admin.dashboard.invalidate();
      setRemoving(null);
    },
    onError: error => toast.error(error.message),
  });

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
      cell: row => (
        <div>
          <span className="font-semibold text-foreground">{row.courseTitle}</span>
          {row.application.duration && (
            <span className="block text-xs text-muted-foreground">
              {row.application.duration}
            </span>
          )}
        </div>
      ),
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
        <div className="flex items-center gap-1.5">
          <Badge className={`capitalize ${STATUS_TONE[row.application.status] ?? ""}`}>
            {row.application.status.replaceAll("_", " ")}
          </Badge>
          {row.application.ceoEndorsed && (
            <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-400 bg-emerald-50">
              CEO Endorsed
            </Badge>
          )}
        </div>
      ),
      value: row => row.application.status.replaceAll("_", " "),
    },
    {
      key: "createdAt",
      header: "Submitted",
      cell: row => (
        <span className="whitespace-nowrap">
          {new Date(row.application.createdAt).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
      value: row => new Date(row.application.createdAt).toISOString(),
    },
    {
      key: "actions",
      header: "",
      align: "right" as const,
      cell: (row: ApplicationRow) => {
        const applicationId = row.application.id;
        const currentStatus = row.application.status;
        return (
          <span className="flex justify-end gap-1 items-center">
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => setViewFormApp(row as unknown as AdmissionApplicationData)}
            >
              <FileText className="h-3.5 w-3.5 text-primary" />
              View Form
            </Button>
            {can("admissions.review") && (
              <>
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
              </>
            )}
            {can("admissions.write") && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Edit application ${row.application.reference}`}
                  title="Edit form"
                  onClick={() => setEditing(row.application)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  aria-label={`Delete application ${row.application.reference}`}
                  title="Delete form"
                  onClick={() => setRemoving(row.application)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </span>
        );
      },
      value: () => "",
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <DataTable
        title="Admissions"
        description="Official student applications awaiting review, endorsement, and class placement."
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
          <>
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

            <Select
              value={duration}
              onValueChange={value => {
                setDuration(value);
                setPage(1);
              }}
            >
              <SelectTrigger
                className="w-[11rem]"
                aria-label="Filter by programme length"
              >
                <SelectValue placeholder="Any length" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any length</SelectItem>
                {durationFilterOptions(courses.data).map(option => (
                  <SelectItem key={option.weeks} value={String(option.weeks)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        actions={
          can("admissions.write") ? (
            <Button className="gap-2" onClick={() => setRecordOpen(true)}>
              <Plus className="h-4 w-4" />
              Record application
            </Button>
          ) : null
        }
      />

      <RecordApplicationDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        onRecorded={reference => {
          toast.success(`Application ${reference} recorded.`);
          query.refetch();
        }}
      />

      <RecordApplicationDialog
        open={editing !== null}
        onOpenChange={open => {
          if (!open) setEditing(null);
        }}
        editing={editing}
        onRecorded={() => setEditing(null)}
        onSaved={reference => {
          toast.success(`Application ${reference} updated.`);
          setEditing(null);
          utils.admin.applications.invalidate();
        }}
      />

      <AlertDialog open={removing !== null} onOpenChange={open => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {removing?.reference}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.status === "approved"
                ? `${removing.fullName} was approved on this form. If they are already on the register this will be refused, and their student record has to go first.`
                : `${removing?.fullName ?? "This applicant"}'s admission form comes off the admissions list and out of exports. It is kept on file with its reference, so an administrator can restore it.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep form</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={event => {
                // Held open until the server answers, so a refusal is read
                // where it was asked for.
                event.preventDefault();
                if (removing) remove.mutate({ applicationId: removing.id });
              }}
            >
              {remove.isPending ? "Deleting..." : "Delete form"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ViewAdmissionFormDialog
        open={Boolean(viewFormApp)}
        onOpenChange={open => {
          if (!open) setViewFormApp(null);
        }}
        data={viewFormApp}
        onStatusChanged={() => {
          query.refetch();
          setViewFormApp(null);
        }}
      />
    </div>
  );
}

