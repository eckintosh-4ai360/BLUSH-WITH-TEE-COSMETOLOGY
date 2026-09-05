"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  GraduationCap,
  Layers,
  ListChecks,
  Trash2,
  Users,
} from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@blush/ui/components/ui/card";
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@blush/ui/components/ui/tabs";
import { toast } from "@blush/ui/components/ui/sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { PermissionGate } from "@/components/PermissionGate";
import {
  ScoreAssessmentDialog,
  type ScorableAssessment,
} from "@/components/academics/ScoreAssessmentDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

/** One catalogue row, however it was fetched. */
type CatalogueRow = {
  id: number;
  title: string;
  assessmentType: string;
  totalScore: number;
  dueDate: Date | string | null;
  courseTitle: string | null;
  /** Null when the reader may not see marks, not zero - nothing is claimed. */
  enrolled: number | null;
  marked: number | null;
};

export default function AdminAcademicPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["academics.read"]}>
        <AcademicsContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

/**
 * A count only means something once it has been counted. Rendering `0` while
 * the query is still out reads as a real answer, then contradicts itself.
 */
function StatValue({ value, loading }: { value: number; loading: boolean }) {
  if (loading) return <Skeleton className="mt-1 h-7 w-12" />;
  return <p className="font-serif text-2xl font-bold text-foreground">{value}</p>;
}

function AcademicsContent() {
  const utils = trpc.useUtils();
  const { can } = usePermissions();

  const [activeTab, setActiveTab] = useState("enrolments");
  const [removing, setRemoving] = useState<{
    id: number;
    studentName: string;
    courseTitle: string | null;
  } | null>(null);
  const [scoring, setScoring] = useState<ScorableAssessment | null>(null);
  const [removingAssessment, setRemovingAssessment] = useState<CatalogueRow | null>(null);

  // Marks sit behind their own permission: a secretary keeps the register and
  // the enrolments but has no business reading what anyone scored. Without it
  // the catalogue still lists the assessments, just without the marking.
  const canReadResults = can("results.read");
  const canWriteAcademics = can("academics.write");

  // Queries. Programmes themselves are created and priced on the Programmes
  // screen; what is needed here is only the count and the list to enrol into.
  const coursesQuery = trpc.admin.courses.useQuery({ status: "all" });

  const studentsQuery = trpc.admin.students.useQuery();
  const activeCourses = trpc.content.courses.useQuery();
  const staffEnrollments = trpc.staff.enrollments.useQuery();

  // The same catalogue from whichever endpoint the reader is allowed to use.
  // `results.catalogue` carries how much of each sheet is marked, which is the
  // whole point of the tab; `staff.assessments` is the titles alone.
  const resultsCatalogue = trpc.results.catalogue.useQuery(undefined, {
    enabled: canReadResults,
  });
  const staffAssessments = trpc.staff.assessments.useQuery(undefined, {
    enabled: !canReadResults,
  });

  // Mutations
  const toggleCourse = trpc.admin.toggleCourseActive.useMutation({
    onSuccess: () => {
      toast.success("Programme status updated.");
      utils.admin.courses.invalidate();
      utils.content.courses.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const createEnrollment = trpc.admin.createEnrollment.useMutation({
    onSuccess: () => {
      toast.success("Student enrolled in programme.");
      utils.admin.students.invalidate();
      utils.staff.enrollments.invalidate();
      utils.admin.courses.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const removeEnrollment = trpc.admin.removeEnrollment.useMutation({
    onSuccess: result => {
      setRemoving(null);
      toast.success(`${result.studentName} taken off ${result.courseTitle}.`);
      utils.staff.enrollments.invalidate();
      utils.admin.students.invalidate();
    },
    // The dialog stays open on failure so the refusal is read where it was
    // asked for, the same way removing a student behaves.
    onError: err => toast.error(err.message),
  });

  const createAssessment = trpc.admin.createAssessment.useMutation({
    onSuccess: () => {
      toast.success("Assessment added successfully.");
      utils.staff.assessments.invalidate();
      utils.results.catalogue.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const removeAssessment = trpc.admin.deleteAssessment.useMutation({
    onSuccess: result => {
      setRemovingAssessment(null);
      toast.success(
        result.marksKept
          ? `"${result.title}" removed. ${result.marksKept} mark${result.marksKept === 1 ? "" : "s"} kept on file.`
          : `"${result.title}" removed.`,
      );
      utils.staff.assessments.invalidate();
      utils.results.catalogue.invalidate();
    },
    // Left open on failure so the refusal is read where it was asked for, the
    // same way removing an enrolment behaves.
    onError: err => toast.error(err.message),
  });

  async function submitEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Held before the await: React clears `currentTarget` once the handler
    // returns, so reading it after the round trip would be reading null.
    const form = event.currentTarget;
    const data = new FormData(form);
    await createEnrollment.mutateAsync({
      studentId: Number(data.get("studentId")),
      courseId: Number(data.get("courseId")),
      expectedCompletionDate: data.get("completion")
        ? new Date(String(data.get("completion")))
        : undefined,
    });
    form.reset();
  }

  async function submitAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await createAssessment.mutateAsync({
      courseId: Number(data.get("courseId")),
      title: String(data.get("title")),
      assessmentType: data.get("type") as "theory" | "practical" | "project" | "exam",
      totalScore: Number(data.get("totalScore")),
      dueDate: data.get("dueDate") ? new Date(String(data.get("dueDate"))) : undefined,
    });
    form.reset();
  }

  const allCourses = coursesQuery.data ?? [];
  const totalProgrammes = allCourses.length;
  const activeCount = allCourses.filter(c => c.isActive).length;
  const totalEnrolments = staffEnrollments.data?.length ?? 0;

  const catalogue: CatalogueRow[] = canReadResults
    ? (resultsCatalogue.data ?? []).map(row => ({
        id: row.id,
        title: row.title,
        assessmentType: row.assessmentType,
        totalScore: row.totalScore,
        dueDate: row.dueDate,
        courseTitle: row.courseTitle,
        enrolled: row.enrolled,
        marked: row.marked,
      }))
    : (staffAssessments.data ?? []).map(row => ({
        id: row.id,
        title: row.title,
        assessmentType: row.assessmentType,
        totalScore: row.totalScore,
        dueDate: row.dueDate,
        courseTitle: null,
        enrolled: null,
        marked: null,
      }));

  const catalogueLoading = canReadResults
    ? resultsCatalogue.isLoading
    : staffAssessments.isLoading;
  const totalAssessments = catalogue.length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <GraduationCap className="h-4 w-4 text-primary" />
            Academic Workspace
          </p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Enrolment &amp; Assessment
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Place students onto a programme and set the assessments they are marked against.
          </p>
        </div>

        <Button
          asChild
          variant="outline"
          className="gap-2 self-start rounded-full sm:self-auto"
        >
          <Link href="/programs">
            <BookOpen className="h-4 w-4" />
            Manage programmes &amp; fees
          </Link>
        </Button>
      </div>

      {/* KPI Stats Tiles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/60 bg-white/70 shadow-sm backdrop-blur dark:bg-white/5">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Total Programmes
              </p>
              <StatValue value={totalProgrammes} loading={coursesQuery.isLoading} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/70 shadow-sm backdrop-blur dark:bg-white/5">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Active Admissions
              </p>
              <StatValue value={activeCount} loading={coursesQuery.isLoading} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/70 shadow-sm backdrop-blur dark:bg-white/5">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-700 dark:text-sky-300">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Active Enrolments
              </p>
              <StatValue value={totalEnrolments} loading={staffEnrollments.isLoading} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/70 shadow-sm backdrop-blur dark:bg-white/5">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-700 dark:text-purple-300">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Assessments Set Up
              </p>
              <StatValue value={totalAssessments} loading={catalogueLoading} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-xs grid-cols-2 rounded-2xl bg-muted/60 p-1">
          <TabsTrigger value="enrolments" className="rounded-xl gap-1.5">
            <Users className="h-4 w-4" />
            Enrolment
          </TabsTrigger>
          <TabsTrigger value="assessments" className="rounded-xl gap-1.5">
            <Layers className="h-4 w-4" />
            Assessments
          </TabsTrigger>
        </TabsList>

        {/* Tab 2: Enrolment */}
        <TabsContent value="enrolments" className="space-y-6">
          <div className={`grid gap-6 ${canWriteAcademics ? "xl:grid-cols-3" : "xl:grid-cols-1"}`}>
            {canWriteAcademics ? (
            <div className="xl:col-span-1">
              <form
                onSubmit={submitEnrollment}
                className="rounded-3xl border border-white bg-white/70 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5"
              >
                <p className="eyebrow">Student enrolment</p>
                <h2 className="mt-1 font-serif text-2xl font-bold text-foreground">
                  Place a student in a programme
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Select an enrolled student and assign them to an active cosmetology programme.
                </p>

                <div className="mt-5 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Select student</label>
                    <select required name="studentId" className="soft-input">
                      <option value="">Choose student record</option>
                      {studentsQuery.data?.map(({ student }) => (
                        <option key={student.id} value={student.id}>
                          {student.fullName} · {student.studentNumber}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Select programme</label>
                    <select required name="courseId" className="soft-input">
                      <option value="">Choose programme</option>
                      {activeCourses.data?.map(course => (
                        <option key={course.id} value={course.id}>
                          {course.title} ({course.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">
                      Expected completion date (optional)
                    </label>
                    <input name="completion" type="date" className="soft-input" />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={createEnrollment.isPending}
                  className="mt-5 w-full rounded-full bg-[#22b8bd] text-white hover:bg-[#1ba3a7] dark:bg-[#3fd0d8] dark:text-[#04252a] dark:hover:bg-[#5adbe2]"
                >
                  Create enrolment
                </Button>
              </form>
            </div>
            ) : null}

            <div className={canWriteAcademics ? "xl:col-span-2 space-y-4" : "space-y-4"}>
              <Card className="border-border/60 bg-white/70 shadow-sm backdrop-blur dark:bg-white/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-bold">Active Enrolment Register</CardTitle>
                  <CardDescription className="text-xs">
                    Students currently enrolled in school programmes.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {staffEnrollments.isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-12 w-full rounded-xl" />
                      ))}
                    </div>
                  ) : staffEnrollments.data && staffEnrollments.data.length > 0 ? (
                    <div className="divide-y divide-border/60">
                      {staffEnrollments.data.map(({ enrollment, studentName, courseTitle }) => (
                        <div
                          key={enrollment.id}
                          className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-foreground">{studentName}</p>
                            <p className="text-xs text-muted-foreground">{courseTitle}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge className="bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 capitalize">
                              {enrollment.status}
                            </Badge>
                            {canWriteAcademics ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                aria-label={`Remove ${studentName} from ${courseTitle ?? "this programme"}`}
                                onClick={() =>
                                  setRemoving({
                                    id: enrollment.id,
                                    studentName,
                                    courseTitle,
                                  })
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No active student enrolments found.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Assessments */}
        <TabsContent value="assessments" className="space-y-6">
          <div className={`grid gap-6 ${canWriteAcademics ? "xl:grid-cols-3" : "xl:grid-cols-1"}`}>
            {canWriteAcademics ? (
            <div className="xl:col-span-1">
              <form
                onSubmit={submitAssessment}
                className="rounded-3xl border border-white bg-white/70 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5"
              >
                <p className="eyebrow">Assessment set-up</p>
                <h2 className="mt-1 font-serif text-2xl font-bold text-foreground">
                  Add course assessment
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Define practicals, theory tests, exams, or projects for a programme.
                </p>

                <div className="mt-5 space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Programme</label>
                    <select required name="courseId" className="soft-input">
                      <option value="">Select programme</option>
                      {activeCourses.data?.map(course => (
                        <option key={course.id} value={course.id}>
                          {course.title} ({course.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Assessment title</label>
                    <input
                      required
                      name="title"
                      placeholder="e.g. Practical Hair Styling Exam"
                      className="soft-input"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Type</label>
                      <select name="type" className="soft-input">
                        <option value="theory">Theory</option>
                        <option value="practical">Practical</option>
                        <option value="project">Project</option>
                        <option value="exam">Exam</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Total score</label>
                      <input
                        required
                        name="totalScore"
                        type="number"
                        min="1"
                        placeholder="100"
                        defaultValue="100"
                        className="soft-input"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">
                      Due date (optional)
                    </label>
                    <input name="dueDate" type="date" className="soft-input" />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={createAssessment.isPending}
                  className="mt-5 w-full rounded-full bg-[#22b8bd] text-white hover:bg-[#1ba3a7] dark:bg-[#3fd0d8] dark:text-[#04252a] dark:hover:bg-[#5adbe2]"
                >
                  Create assessment
                </Button>
              </form>
            </div>
            ) : null}

            <div className={canWriteAcademics ? "xl:col-span-2 space-y-4" : "space-y-4"}>
              <Card className="border-border/60 bg-white/70 shadow-sm backdrop-blur dark:bg-white/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-bold">Assessments Catalogue</CardTitle>
                  <CardDescription className="text-xs">
                    {canReadResults
                      ? "Open one to score the students sitting it. Positions are worked out from the marks."
                      : "Current assessments configured across programmes."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {catalogueLoading ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-28 w-full rounded-2xl" />
                      ))}
                    </div>
                  ) : catalogue.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {catalogue.map(assessment => {
                        const enrolled = assessment.enrolled ?? 0;
                        const marked = assessment.marked ?? 0;
                        const complete = enrolled > 0 && marked >= enrolled;

                        return (
                          <div
                            key={assessment.id}
                            className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-muted/20 p-4"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant="outline" className="capitalize text-xs">
                                {assessment.assessmentType}
                              </Badge>
                              <span className="text-xs font-bold text-primary">
                                Max score: {assessment.totalScore}
                              </span>
                            </div>

                            <p className="font-semibold text-sm text-foreground">
                              {assessment.title}
                            </p>
                            {assessment.courseTitle ? (
                              <p className="text-xs text-muted-foreground">
                                {assessment.courseTitle}
                              </p>
                            ) : null}

                            {assessment.dueDate ? (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Due {new Date(assessment.dueDate).toLocaleDateString()}
                              </p>
                            ) : null}

                            <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                              {/* Says what is left to do, not just that marks exist. */}
                              {canReadResults ? (
                                <span
                                  className={`text-xs ${
                                    complete
                                      ? "text-emerald-700 dark:text-emerald-400"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {!enrolled
                                    ? "Nobody enrolled"
                                    : complete
                                      ? `All ${marked} marked`
                                      : `${marked} of ${enrolled} marked`}
                                </span>
                              ) : (
                                <span />
                              )}

                              <span className="flex items-center gap-1">
                                {canReadResults ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5 text-xs"
                                    disabled={!enrolled}
                                    onClick={() =>
                                      setScoring({
                                        id: assessment.id,
                                        title: assessment.title,
                                        totalScore: assessment.totalScore,
                                        courseTitle: assessment.courseTitle ?? "",
                                      })
                                    }
                                  >
                                    <ListChecks className="h-3.5 w-3.5" />
                                    {marked ? "Marks" : "Score"}
                                  </Button>
                                ) : null}

                                {canWriteAcademics ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                    aria-label={`Remove ${assessment.title}`}
                                    onClick={() => setRemovingAssessment(assessment)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No assessments created yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={removingAssessment !== null}
        onOpenChange={open => !open && setRemovingAssessment(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove &quot;{removingAssessment?.title}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {/*
                The count is the decision. Removing an assessment nobody has
                marked is tidying up; removing one holding a cohort's exam
                results changes what every one of their certificates says.
              */}
              {removingAssessment?.marked
                ? `It leaves the catalogue and stops counting towards final grades, so every student on ${removingAssessment.courseTitle ?? "this programme"} may end up graded differently. The ${removingAssessment.marked} mark${removingAssessment.marked === 1 ? "" : "s"} already recorded on it stay on file for the audit trail rather than being deleted.`
                : "It leaves the catalogue and can no longer be marked. Nothing has been scored on it, so no student's grade changes."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeAssessment.isPending}>
              Keep assessment
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={removeAssessment.isPending}
              onClick={event => {
                event.preventDefault();
                if (removingAssessment) {
                  removeAssessment.mutate({ assessmentId: removingAssessment.id });
                }
              }}
            >
              {removeAssessment.isPending ? "Removing..." : "Remove assessment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ScoreAssessmentDialog
        assessment={scoring}
        onOpenChange={open => !open && setScoring(null)}
        // The card shows how much of the sheet is marked, so it has to be
        // re-read once marks are saved.
        onSaved={() => utils.results.catalogue.invalidate()}
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Take {removing?.studentName} off {removing?.courseTitle}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The enrolment is marked withdrawn and leaves the active register.
              Attendance, results and anything already billed against it are
              kept, so the record of what happened stays intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeEnrollment.isPending}>
              Keep enrolment
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={removeEnrollment.isPending}
              onClick={event => {
                event.preventDefault();
                if (removing) removeEnrollment.mutate({ enrollmentId: removing.id });
              }}
            >
              {removeEnrollment.isPending ? "Removing..." : "Remove enrolment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
