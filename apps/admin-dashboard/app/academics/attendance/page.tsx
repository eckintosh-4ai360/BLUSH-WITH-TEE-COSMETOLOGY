"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Check, Loader2, Save } from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { Card } from "@blush/ui/components/ui/card";
import { Input } from "@blush/ui/components/ui/input";
import { Label } from "@blush/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { toast } from "@blush/ui/components/ui/sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

const STATUSES = ["present", "late", "absent", "excused"] as const;
type Status = (typeof STATUSES)[number];

/** State colours, matching the tones used elsewhere for status. */
const STATUS_TONE: Record<Status, string> = {
  present: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/25",
  late: "bg-amber-500/15 text-amber-800 dark:text-amber-300 hover:bg-amber-500/25",
  absent: "bg-rose-500/15 text-rose-800 dark:text-rose-300 hover:bg-rose-500/25",
  excused: "bg-sky-500/15 text-sky-800 dark:text-sky-300 hover:bg-sky-500/25",
};

/** Today as YYYY-MM-DD in the marker's own timezone, not UTC. */
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function AttendancePage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["attendance.read"]}>
        <AttendanceContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function AttendanceContent() {
  const { can } = usePermissions();
  const [courseId, setCourseId] = useState<string>("");
  const [classDate, setClassDate] = useState(today());

  /** Marks being edited, keyed by enrolment. Empty until the register loads. */
  const [marks, setMarks] = useState<Record<number, { status: Status; note: string }>>({});
  const [dirty, setDirty] = useState(false);

  const courses = trpc.attendance.markableCourses.useQuery();

  // Pick the first programme once, so the page opens on something useful.
  useEffect(() => {
    if (!courseId && courses.data?.length) setCourseId(String(courses.data[0]?.id));
  }, [courses.data, courseId]);

  const register = trpc.attendance.register.useQuery(
    { courseId: Number(courseId), classDate },
    { enabled: Boolean(courseId) },
  );

  /**
   * Seeds the form whenever the register changes.
   *
   * Anyone already marked keeps their mark; anyone not yet marked starts as
   * present. That default is the whole point — a register is normally "all
   * here except two", so the work is changing two rows rather than thirty.
   */
  useEffect(() => {
    if (!register.data) return;
    const seeded: Record<number, { status: Status; note: string }> = {};
    for (const student of register.data.students) {
      seeded[student.enrollmentId] = {
        status: (student.status as Status | null) ?? "present",
        note: student.note ?? "",
      };
    }
    setMarks(seeded);
    setDirty(false);
  }, [register.data]);

  const save = trpc.attendance.mark.useMutation({
    onSuccess: result => {
      toast.success(`Register saved for ${result.saved} student${result.saved === 1 ? "" : "s"}.`);
      setDirty(false);
      register.refetch();
    },
    onError: error => toast.error(error.message),
  });

  const students = register.data?.students ?? [];
  const writable = can("attendance.write");

  const setStatus = (enrollmentId: number, status: Status) => {
    setMarks(current => ({
      ...current,
      [enrollmentId]: { status, note: current[enrollmentId]?.note ?? "" },
    }));
    setDirty(true);
  };

  const setNote = (enrollmentId: number, note: string) => {
    setMarks(current => ({
      ...current,
      [enrollmentId]: { status: current[enrollmentId]?.status ?? "present", note },
    }));
    setDirty(true);
  };

  const markAll = (status: Status) => {
    setMarks(current => {
      const next = { ...current };
      for (const student of students) {
        next[student.enrollmentId] = {
          status,
          note: current[student.enrollmentId]?.note ?? "",
        };
      }
      return next;
    });
    setDirty(true);
  };

  const tally = useMemo(() => {
    const counts: Record<Status, number> = { present: 0, late: 0, absent: 0, excused: 0 };
    for (const student of students) {
      const status = marks[student.enrollmentId]?.status;
      if (status) counts[status] += 1;
    }
    return counts;
  }, [students, marks]);

  const alreadyMarked = (register.data?.markedCount ?? 0) > 0;

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance register</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone starts marked present. Change the ones who are not, then save.
        </p>
      </header>

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="register-course">Programme</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger id="register-course">
                <SelectValue placeholder="Choose a programme" />
              </SelectTrigger>
              <SelectContent>
                {(courses.data ?? []).map(course => (
                  <SelectItem key={course.id} value={String(course.id)}>
                    {course.title} · {course.enrolled} enrolled
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-date">Date</Label>
            <Input
              id="register-date"
              type="date"
              value={classDate}
              max={today()}
              onChange={event => setClassDate(event.target.value)}
              className="sm:w-48"
            />
          </div>
        </div>

        {courses.data && !courses.data.length ? (
          <p className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            Nobody is enrolled on a programme yet, so there is no register to take.
          </p>
        ) : null}
      </Card>

      {!courseId ? null : register.isLoading ? (
        <Card className="space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </Card>
      ) : register.error ? (
        <p role="alert" className="text-sm text-destructive">
          {register.error.message}
        </p>
      ) : !students.length ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No active enrolments on this programme.
          </p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(status => (
                <Badge key={status} variant="outline" className="capitalize">
                  {tally[status]} {status}
                </Badge>
              ))}
              {alreadyMarked ? (
                <Badge variant="secondary" className="gap-1">
                  <CalendarCheck className="h-3 w-3" />
                  Already marked — saving updates it
                </Badge>
              ) : null}
            </div>

            {writable ? (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => markAll("present")}>
                <Check className="h-3.5 w-3.5" />
                Mark all present
              </Button>
            ) : null}
          </div>

          <Card className="divide-y divide-border/60 p-0">
            {students.map(student => {
              const mark = marks[student.enrollmentId];
              return (
                <div
                  key={student.enrollmentId}
                  className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {student.fullName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {student.studentNumber}
                      {student.enrolmentStatus === "paused" ? " · paused" : ""}
                    </p>
                  </div>

                  <Input
                    value={mark?.note ?? ""}
                    onChange={event => setNote(student.enrollmentId, event.target.value)}
                    placeholder="Note (optional)"
                    disabled={!writable}
                    className="h-9 w-full sm:w-52"
                    aria-label={`Note for ${student.fullName}`}
                  />

                  <div
                    role="radiogroup"
                    aria-label={`Attendance for ${student.fullName}`}
                    className="flex shrink-0 gap-1"
                  >
                    {STATUSES.map(status => {
                      const active = mark?.status === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={!writable}
                          onClick={() => setStatus(student.enrollmentId, status)}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            active
                              ? STATUS_TONE[status]
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {status}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </Card>

          {writable ? (
            <div className="flex items-center justify-end gap-3">
              {dirty ? (
                <span className="text-xs text-muted-foreground">Unsaved changes</span>
              ) : null}
              <Button
                className="gap-2"
                disabled={save.isPending || !students.length}
                onClick={() =>
                  save.mutate({
                    classDate,
                    entries: students.map(student => ({
                      enrollmentId: student.enrollmentId,
                      status: marks[student.enrollmentId]?.status ?? "present",
                      note: marks[student.enrollmentId]?.note || undefined,
                    })),
                  })
                }
              >
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save register
              </Button>
            </div>
          ) : null}

          <RecentDays courseId={Number(courseId)} onPick={setClassDate} />
        </>
      )}
    </div>
  );
}

/** The last fortnight, so a missed day is obvious rather than remembered. */
function RecentDays({
  courseId,
  onPick,
}: {
  courseId: number;
  onPick: (date: string) => void;
}) {
  const query = trpc.attendance.recentDays.useQuery({ courseId, days: 14 });
  const rows = query.data ?? [];

  if (!rows.length) return null;

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">Recently marked</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {rows.map(row => {
          const date = new Date(row.classDate).toISOString().slice(0, 10);
          return (
            <button
              key={date}
              type="button"
              onClick={() => onPick(date)}
              className="rounded-lg border border-border/60 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted"
            >
              <span className="block font-medium text-foreground">
                {new Date(row.classDate).toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </span>
              <span className="text-muted-foreground">
                {row.present + row.late}/{row.marked} in
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
