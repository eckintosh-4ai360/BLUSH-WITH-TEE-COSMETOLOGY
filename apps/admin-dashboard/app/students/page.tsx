"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { STUDENT_IMPORT_COLUMNS } from "@blush/shared/imports";
import { Button } from "@blush/ui/components/ui/button";
import { toast } from "@blush/ui/components/ui/sonner";
import { Badge } from "@blush/ui/components/ui/badge";
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
import { ImportDialog } from "@/components/imports/ImportDialog";
import {
  GraduateStudentDialog,
  type GraduatingStudent,
} from "@/components/students/GraduateStudentDialog";
import { SaveStudentDialog } from "@/components/students/SaveStudentDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { collectAllPages } from "@/lib/exportAll";
import { describeDuration, durationFilterOptions } from "@/lib/describeDuration";
import { trpc } from "@/lib/trpc";

/**
 * The statuses a student on this register can hold. Graduated is deliberately
 * absent: graduates are read from their own page, and this filter would only
 * ever return an empty table.
 */
const STATUS = ["active", "suspended", "completed", "withdrawn"] as const;

/** Status tones: state, never reused as a chart series colour. */
const STATUS_TONE: Record<string, string> = {
  active:
    "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/15",
  suspended:
    "bg-amber-500/15 text-amber-800 dark:text-amber-300 hover:bg-amber-500/15",
  completed: "bg-sky-500/15 text-sky-800 dark:text-sky-300 hover:bg-sky-500/15",
  graduated:
    "bg-violet-500/15 text-violet-800 dark:text-violet-300 hover:bg-violet-500/15",
  withdrawn:
    "bg-rose-500/15 text-rose-800 dark:text-rose-300 hover:bg-rose-500/15",
};

type Programme = {
  id: number;
  courseId: number;
  courseTitle: string;
  status: string;
  progressPercent: number;
};

type StudentRow = {
  id: number;
  studentNumber: string;
  fullName: string;
  email: string;
  phone: string;
  status: string;
  createdAt: Date;
  programmes: Programme[];
};

export default function AdminStudentsPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["students.read"]}>
        <StudentsContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function StudentsContent() {
  const router = useRouter();
  const { can } = usePermissions();
  const [importOpen, setImportOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [removing, setRemoving] = useState<StudentRow | null>(null);
  const [graduating, setGraduating] = useState<GraduatingStudent | null>(null);
  const importStudents = trpc.imports.students.useMutation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [course, setCourse] = useState("all");
  const [enrolment, setEnrolment] = useState("all");
  const [duration, setDuration] = useState("all");

  const utils = trpc.useUtils();
  const courses = trpc.content.courses.useQuery();

  // Shared by the table and by export, so a download covers exactly what the
  // filters describe rather than the page on screen.
  const filters = {
    sortDir: "desc" as const,
    search: search || undefined,
    status: status === "all" ? undefined : (status as (typeof STATUS)[number]),
    courseId: course === "all" ? undefined : Number(course),
    durationWeeks: duration === "all" ? undefined : Number(duration),
    enrolment:
      enrolment === "all"
        ? undefined
        : (enrolment as "enrolled" | "unenrolled"),
  };

  const query = trpc.students.list.useQuery({ ...filters, page, pageSize: 25 });

  const archive = trpc.students.archive.useMutation({
    onSuccess: result => {
      setRemoving(null);
      toast.success(`${result.studentNumber} removed from the register.`);
      query.refetch();
    },
    // The dialog stays open on failure: the commonest refusal is an unpaid
    // balance, and that is a message about this student, not a general error.
    onError: error => toast.error(error.message),
  });

  // Narrowing to one programme and asking for the unenrolled at once returns
  // nothing, so the two controls stay mutually exclusive. Length belongs to
  // the same group: a named programme already fixes its length, and a student
  // with no enrolment has no length at all, so any pairing of the three is
  // either a repeat or a guaranteed empty table.
  const onCourseChange = (value: string) => {
    setCourse(value);
    if (value !== "all") {
      setEnrolment("all");
      setDuration("all");
    }
    setPage(1);
  };

  const onDurationChange = (value: string) => {
    setDuration(value);
    if (value !== "all") {
      setCourse("all");
      setEnrolment("all");
    }
    setPage(1);
  };

  const columns: Column<StudentRow>[] = [
    {
      key: "fullName",
      header: "Student",
      cell: row => (
        <span>
          <span className="font-medium text-foreground">{row.fullName}</span>
          <span className="block text-xs text-muted-foreground">
            {row.email}
          </span>
        </span>
      ),
    },
    {
      key: "studentNumber",
      header: "Student number",
      cell: row => (
        <span className="whitespace-nowrap">{row.studentNumber}</span>
      ),
    },
    { key: "phone", header: "Phone", optional: true },
    {
      key: "programmes",
      header: "Programme",
      cell: row =>
        row.programmes.length ? (
          <span className="space-y-1.5">
            {row.programmes.map(programme => (
              <span key={programme.id} className="block">
                <span className="text-foreground">{programme.courseTitle}</span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.min(Math.max(programme.progressPercent, 0), 100)}%`,
                      }}
                    />
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {programme.progressPercent}%
                  </span>
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">Not yet enrolled</span>
        ),
      value: row =>
        row.programmes.map(programme => programme.courseTitle).join("; "),
    },
    {
      key: "status",
      header: "Status",
      cell: row => (
        <Badge className={`capitalize ${STATUS_TONE[row.status] ?? ""}`}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      header: "Registered",
      optional: true,
      cell: row => new Date(row.createdAt).toLocaleDateString("en-GB"),
      value: row => new Date(row.createdAt).toISOString().slice(0, 10),
    },
    ...(can("students.write")
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (row: StudentRow) => (
              <span className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  // The row itself opens the fee account, so neither button
                  // may let its click through as well.
                  onClick={event => {
                    event.stopPropagation();
                    setEditing(row);
                    setSaveOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={event => {
                    event.stopPropagation();
                    setGraduating(row);
                  }}
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  Graduate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={event => {
                    event.stopPropagation();
                    setRemoving(row);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </Button>
              </span>
            ),
            value: () => "",
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <DataTable
        title="Students"
        description="Every learning journey, visible."
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
        searchPlaceholder="Search by name, student number, email or phone..."
        page={page}
        onPageChange={setPage}
        rowKey={row => row.id}
        // Only offered to someone who can actually read the account behind it,
        // so the row does not lead to a page that refuses them.
        onRowClick={can("fees.read") ? row => router.push(`/students/${row.id}`) : undefined}
        exportFileName="students"
        fetchAllRows={() =>
          collectAllPages((page, pageSize) =>
            utils.students.list.fetch({ ...filters, page, pageSize }),
          )
        }
        emptyMessage="No students match these filters."
        actions={
          can("students.write") ? (
            <>
              <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" />
                Import
              </Button>
              <Button
                className="gap-2"
                onClick={() => {
                  setEditing(null);
                  setSaveOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add student
              </Button>
            </>
          ) : null
        }
        filters={
          <>
            <Select
              value={status}
              onValueChange={value => {
                setStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger
                className="w-[10rem]"
                aria-label="Filter by student status"
              >
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS.map(item => (
                  <SelectItem key={item} value={item} className="capitalize">
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={duration} onValueChange={onDurationChange}>
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

            <Select value={course} onValueChange={onCourseChange}>
              <SelectTrigger
                className="w-[15rem]"
                aria-label="Filter by programme"
              >
                <SelectValue placeholder="All programmes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All programmes</SelectItem>
                {courses.data?.map(item => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.title} · {describeDuration(item.durationWeeks)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={enrolment}
              onValueChange={value => {
                setEnrolment(value);
                if (value !== "all") {
                  setCourse("all");
                  setDuration("all");
                }
                setPage(1);
              }}
            >
              <SelectTrigger
                className="w-[11rem]"
                aria-label="Filter by enrolment"
              >
                <SelectValue placeholder="All students" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All students</SelectItem>
                <SelectItem value="enrolled">Enrolled</SelectItem>
                <SelectItem value="unenrolled">Not yet enrolled</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      <SaveStudentDialog
        open={saveOpen}
        onOpenChange={open => {
          setSaveOpen(open);
          // Cleared on close so the next "Add student" does not reopen the
          // last edited row.
          if (!open) setEditing(null);
        }}
        editing={editing}
        onSaved={({ studentNumber, edited }) => {
          toast.success(
            edited ? `${studentNumber} updated.` : `Student added as ${studentNumber}.`,
          );
          query.refetch();
        }}
      />

      <GraduateStudentDialog
        open={graduating !== null}
        onOpenChange={open => !open && setGraduating(null)}
        student={graduating}
        onGraduated={({ fullName }) => {
          toast.success(`${fullName} has graduated.`);
          query.refetch();
        }}
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing?.fullName} from the register?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They stop appearing in student lists, counts and exports. Their fee
              history, payments and results are kept, so this can be undone by an
              administrator. A student who still owes money cannot be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archive.isPending}>Keep student</AlertDialogCancel>
            <AlertDialogAction
              disabled={archive.isPending}
              onClick={event => {
                // Confirming keeps the dialog up until the server answers, so a
                // refusal is read where it was asked for.
                event.preventDefault();
                if (removing) archive.mutate({ id: removing.id });
              }}
            >
              {archive.isPending ? "Removing..." : "Remove student"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import students"
        description="Adds students in bulk from a spreadsheet. Nothing is saved until you have seen what will happen."
        columns={STUDENT_IMPORT_COLUMNS}
        templateName="student-import-template"
        noun="students"
        isPending={importStudents.isPending}
        runImport={args => importStudents.mutateAsync(args)}
        onImported={() => {
          toast.success("Students imported.");
          query.refetch();
        }}
      />
    </div>
  );
}
