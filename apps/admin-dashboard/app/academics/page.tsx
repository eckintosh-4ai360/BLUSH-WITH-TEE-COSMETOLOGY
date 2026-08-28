"use client";

import { FormEvent, useState } from "react";
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  GraduationCap,
  Layers,
  Pencil,
  Plus,
  Power,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@blush/ui/components/ui/card";
import { Input } from "@blush/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@blush/ui/components/ui/tabs";
import { toast } from "@blush/ui/components/ui/sonner";
import { formatMoney } from "@blush/ui/lib/viz";
import DashboardLayout from "@/components/DashboardLayout";
import { PermissionGate } from "@/components/PermissionGate";
import { SaveCourseDialog, type SaveableCourse } from "@/components/academics/SaveCourseDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

export default function AdminAcademicPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["academics.read"]}>
        <AcademicsContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function AcademicsContent() {
  const { can } = usePermissions();
  const utils = trpc.useUtils();

  const [activeTab, setActiveTab] = useState("programmes");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [courseDialogOpen, setCourseDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<SaveableCourse | null>(null);

  // Queries
  const coursesQuery = trpc.admin.courses.useQuery({
    search: search.trim() || undefined,
    status: statusFilter,
  });

  const studentsQuery = trpc.admin.students.useQuery();
  const activeCourses = trpc.content.courses.useQuery();
  const staffAssessments = trpc.staff.assessments.useQuery();
  const staffEnrollments = trpc.staff.enrollments.useQuery();

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

  const createAssessment = trpc.admin.createAssessment.useMutation({
    onSuccess: () => {
      toast.success("Assessment added successfully.");
      utils.staff.assessments.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  async function submitEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await createEnrollment.mutateAsync({
      studentId: Number(data.get("studentId")),
      courseId: Number(data.get("courseId")),
      expectedCompletionDate: data.get("completion")
        ? new Date(String(data.get("completion")))
        : undefined,
    });
    event.currentTarget.reset();
  }

  async function submitAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await createAssessment.mutateAsync({
      courseId: Number(data.get("courseId")),
      title: String(data.get("title")),
      assessmentType: data.get("type") as "theory" | "practical" | "project" | "exam",
      totalScore: Number(data.get("totalScore")),
      dueDate: data.get("dueDate") ? new Date(String(data.get("dueDate"))) : undefined,
    });
    event.currentTarget.reset();
  }

  const allCourses = coursesQuery.data ?? [];
  const totalProgrammes = allCourses.length;
  const activeCount = allCourses.filter(c => c.isActive).length;
  const totalEnrolments = staffEnrollments.data?.length ?? 0;
  const totalAssessments = staffAssessments.data?.length ?? 0;

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
            Programmes & Curriculum
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage academic programmes called during admission, assign student cohorts, and configure course assessments.
          </p>
        </div>

        {can("academics.write") ? (
          <Button
            onClick={() => {
              setEditingCourse(null);
              setCourseDialogOpen(true);
            }}
            className="gap-2 self-start rounded-full bg-[#22b8bd] text-white shadow-md hover:bg-[#1ba3a7] dark:bg-[#3fd0d8] dark:text-[#04252a] dark:hover:bg-[#5adbe2] sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            Add Programme
          </Button>
        ) : null}
      </div>

      {/* KPI Stats Tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/60 bg-white/70 shadow-sm backdrop-blur dark:bg-white/5">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Total Programmes
              </p>
              <p className="font-serif text-2xl font-bold text-foreground">{totalProgrammes}</p>
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
              <p className="font-serif text-2xl font-bold text-foreground">{activeCount}</p>
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
              <p className="font-serif text-2xl font-bold text-foreground">{totalEnrolments}</p>
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
              <p className="font-serif text-2xl font-bold text-foreground">{totalAssessments}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-md rounded-2xl bg-muted/60 p-1">
          <TabsTrigger value="programmes" className="rounded-xl gap-1.5">
            <BookOpen className="h-4 w-4" />
            Programmes
          </TabsTrigger>
          <TabsTrigger value="enrolments" className="rounded-xl gap-1.5">
            <Users className="h-4 w-4" />
            Enrolment
          </TabsTrigger>
          <TabsTrigger value="assessments" className="rounded-xl gap-1.5">
            <Layers className="h-4 w-4" />
            Assessments
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Programmes Directory */}
        <TabsContent value="programmes" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by code, title, certification..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-white/80 dark:bg-white/5"
              />
            </div>

            <div className="flex items-center gap-3">
              <Select
                value={statusFilter}
                onValueChange={(val: "all" | "active" | "inactive") => setStatusFilter(val)}
              >
                <SelectTrigger className="w-[140px] bg-white/80 dark:bg-white/5">
                  <SelectValue placeholder="Status filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                </SelectContent>
              </Select>

              {can("academics.write") ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingCourse(null);
                    setCourseDialogOpen(true);
                  }}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  New programme
                </Button>
              ) : null}
            </div>
          </div>

          {coursesQuery.isLoading ? (
            <div className="rounded-3xl border border-border/50 bg-white/60 p-12 dark:bg-white/4 text-center text-sm text-muted-foreground">
              Loading programmes...
            </div>
          ) : allCourses.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-white/40 p-12 dark:bg-white/4 text-center">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/60" />
              <h3 className="mt-3 font-serif text-lg font-semibold text-foreground">
                No programmes found
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {search || statusFilter !== "all"
                  ? "No programmes match your filter criteria."
                  : "No academic programmes have been created yet."}
              </p>
              {can("academics.write") ? (
                <Button
                  onClick={() => {
                    setEditingCourse(null);
                    setCourseDialogOpen(true);
                  }}
                  className="mt-4 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Create First Programme
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {allCourses.map(course => (
                <Card
                  key={course.id}
                  className={`flex flex-col justify-between border-border/70 bg-white/80 shadow-sm transition-all hover:shadow-md dark:bg-white/5 ${
                    !course.isActive ? "opacity-70 bg-slate-50/70" : ""
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="font-mono text-xs font-bold uppercase text-primary border-primary/20 bg-primary/5">
                          {course.code}
                        </Badge>
                        {course.category ? (
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-semibold">
                            {course.category}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {course.isFeatured ? (
                          <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] gap-1">
                            <Sparkles className="h-3 w-3" />
                            Featured
                          </Badge>
                        ) : null}
                        <Badge
                          className={
                            course.isActive
                              ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/15"
                              : "bg-slate-500/15 text-slate-700 dark:text-slate-300 hover:bg-slate-500/15"
                          }
                        >
                          {course.isActive ? "Active in Admissions" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                    <CardTitle className="mt-2 text-lg font-bold text-foreground">
                      {course.title}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 text-xs">
                      {course.summary}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-0">
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Tuition Fee</span>
                        <span className="font-semibold text-foreground">
                          {formatMoney(course.tuition)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Duration</span>
                        <span className="font-semibold text-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {course.durationWeeks} Weeks
                        </span>
                      </div>
                    </div>

                    {course.productFee ? (
                      <div className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
                        <span>Tools / Product Fee:</span>
                        <span className="font-bold">{formatMoney(course.productFee)}</span>
                      </div>
                    ) : null}

                    {course.schedule ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                        <Calendar className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                        <span className="truncate">{course.schedule}</span>
                      </p>
                    ) : null}

                    {course.certification ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                        <Award className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                        <span className="truncate">{course.certification}</span>
                      </p>
                    ) : null}

                    {course.toiletries ? (
                      <p className="text-[11px] text-muted-foreground bg-muted/30 rounded-md p-2 line-clamp-2">
                        <b className="text-foreground/80">Toiletries:</b> {course.toiletries}
                      </p>
                    ) : null}

                    <div className="flex items-center justify-between border-t border-border/50 pt-3">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        <b>{course.activeEnrollments}</b> active students
                      </span>

                      {can("academics.write") ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 px-2.5 text-xs"
                            onClick={() => {
                              setEditingCourse(course);
                              setCourseDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-8 gap-1 px-2.5 text-xs ${
                              course.isActive ? "text-destructive hover:text-destructive" : "text-emerald-700"
                            }`}
                            disabled={toggleCourse.isPending}
                            onClick={() =>
                              toggleCourse.mutate({
                                id: course.id,
                                isActive: !course.isActive,
                              })
                            }
                          >
                            <Power className="h-3.5 w-3.5" />
                            {course.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Enrolment */}
        <TabsContent value="enrolments" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-3">
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

            <div className="xl:col-span-2 space-y-4">
              <Card className="border-border/60 bg-white/70 shadow-sm backdrop-blur dark:bg-white/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-bold">Active Enrolment Register</CardTitle>
                  <CardDescription className="text-xs">
                    Students currently enrolled in school programmes.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {staffEnrollments.data && staffEnrollments.data.length > 0 ? (
                    <div className="divide-y divide-border/60">
                      {staffEnrollments.data.map(({ enrollment, studentName, courseTitle }) => (
                        <div
                          key={enrollment.id}
                          className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                        >
                          <div>
                            <p className="font-semibold text-sm text-foreground">{studentName}</p>
                            <p className="text-xs text-muted-foreground">{courseTitle}</p>
                          </div>
                          <Badge className="bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 capitalize">
                            {enrollment.status}
                          </Badge>
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
          <div className="grid gap-6 xl:grid-cols-3">
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

            <div className="xl:col-span-2 space-y-4">
              <Card className="border-border/60 bg-white/70 shadow-sm backdrop-blur dark:bg-white/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-bold">Assessments Catalogue</CardTitle>
                  <CardDescription className="text-xs">
                    Current assessments configured across programmes.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {staffAssessments.data && staffAssessments.data.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {staffAssessments.data.map(assessment => (
                        <div
                          key={assessment.id}
                          className="rounded-2xl border border-border/60 bg-muted/20 p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="outline" className="capitalize text-xs">
                              {assessment.assessmentType}
                            </Badge>
                            <span className="text-xs font-bold text-primary">
                              Max score: {assessment.totalScore}
                            </span>
                          </div>
                          <p className="font-semibold text-sm text-foreground">{assessment.title}</p>
                          {assessment.dueDate ? (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Due {new Date(assessment.dueDate).toLocaleDateString()}
                            </p>
                          ) : null}
                        </div>
                      ))}
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

      {/* Save / Edit Course Modal */}
      <SaveCourseDialog
        open={courseDialogOpen}
        onOpenChange={setCourseDialogOpen}
        editing={editingCourse}
        onSaved={() => {
          coursesQuery.refetch();
          activeCourses.refetch();
        }}
      />
    </div>
  );
}
