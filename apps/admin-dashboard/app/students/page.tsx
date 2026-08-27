"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { usePermissions } from "@/hooks/usePermissions";
import { collectAllPages } from "@/lib/exportAll";
import { trpc } from "@/lib/trpc";

const STATUS = [
  "active",
  "suspended",
  "completed",
  "graduated",
  "withdrawn",
] as const;

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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [course, setCourse] = useState("all");
  const [enrolment, setEnrolment] = useState("all");

  const utils = trpc.useUtils();
  const courses = trpc.content.courses.useQuery();

  // Shared by the table and by export, so a download covers exactly what the
  // filters describe rather than the page on screen.
  const filters = {
    sortDir: "desc" as const,
    search: search || undefined,
    status: status === "all" ? undefined : (status as (typeof STATUS)[number]),
    courseId: course === "all" ? undefined : Number(course),
    enrolment:
      enrolment === "all"
        ? undefined
        : (enrolment as "enrolled" | "unenrolled"),
  };

  const query = trpc.students.list.useQuery({ ...filters, page, pageSize: 25 });

  // Narrowing to one programme and asking for the unenrolled at once returns
  // nothing, so the two controls stay mutually exclusive.
  const onCourseChange = (value: string) => {
    setCourse(value);
    if (value !== "all") setEnrolment("all");
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

            <Select value={course} onValueChange={onCourseChange}>
              <SelectTrigger
                className="w-[13rem]"
                aria-label="Filter by programme"
              >
                <SelectValue placeholder="All programmes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All programmes</SelectItem>
                {courses.data?.map(item => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={enrolment}
              onValueChange={value => {
                setEnrolment(value);
                if (value !== "all") setCourse("all");
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
    </div>
  );
}
