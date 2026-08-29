"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Award,
  BookOpen,
  Clock,
  GraduationCap,
  ListChecks,
  Pencil,
  Plus,
  Power,
  Search,
  Sparkles,
  Trash2,
  Users,
  Wallet,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@blush/ui/components/ui/card";
import { Input } from "@blush/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import { sortCourseCategories } from "@blush/shared/const";
import { toast } from "@blush/ui/components/ui/sonner";
import { formatMoney } from "@blush/ui/lib/viz";
import DashboardLayout from "@/components/DashboardLayout";
import { PermissionGate } from "@/components/PermissionGate";
import { SaveCourseDialog, type SaveableCourse } from "@/components/academics/SaveCourseDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { describeDuration } from "@/lib/describeDuration";
import { trpc } from "@/lib/trpc";

/**
 * The prospectus, and the one place it is edited.
 *
 * What is set here is what the public site advertises, what the application
 * form quotes, and what the admissions desk picks from when recording a
 * walk-in. All three read the same `courses` rows, so a price corrected here is
 * the price the next applicant signs for.
 */
export default function AdminProgrammesPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["academics.read"]}>
        <ProgrammesContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function ProgrammesContent() {
  const { can } = usePermissions();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SaveableCourse | null>(null);
  const [removing, setRemoving] = useState<{
    id: number;
    title: string;
    activeEnrollments: number;
  } | null>(null);

  const query = trpc.admin.courses.useQuery({
    search: search.trim() || undefined,
    status: statusFilter,
  });

  const toggleActive = trpc.admin.toggleCourseActive.useMutation({
    onSuccess: (_result, variables) => {
      toast.success(
        variables.isActive
          ? "Programme is open for admissions."
          : "Programme is closed to new admissions.",
      );
      utils.admin.courses.invalidate();
      utils.content.courses.invalidate();
      utils.attendance.markableCourses.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const removeProgramme = trpc.admin.deleteCourse.useMutation({
    onSuccess: result => {
      toast.success(`"${result.title}" removed from the prospectus.`);
      utils.admin.courses.invalidate();
      utils.content.courses.invalidate();
      utils.attendance.markableCourses.invalidate();
      setRemoving(null);
    },
    onError: error => toast.error(error.message),
  });

  const programmes = useMemo(() => query.data ?? [], [query.data]);

  const categories = useMemo(() => {
    const found = new Set<string>();
    for (const programme of programmes) {
      if (programme.category) found.add(programme.category);
    }
    return sortCourseCategories([...found]);
  }, [programmes]);

  const visible = useMemo(
    () =>
      categoryFilter === "all"
        ? programmes
        : programmes.filter(programme => programme.category === categoryFilter),
    [programmes, categoryFilter],
  );

  const openCount = programmes.filter(programme => programme.isActive).length;
  const enrolled = programmes.reduce(
    (total, programme) => total + programme.activeEnrollments,
    0,
  );

  function openEditor(programme: SaveableCourse | null) {
    setEditing(programme);
    setDialogOpen(true);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <GraduationCap className="h-4 w-4 text-primary" />
            Prospectus
          </p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Programmes &amp; Fees
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The courses the school offers, what each one costs, and what it teaches. Changes here
            appear on the public website, on the application form, and in the list the admissions
            desk picks from.
          </p>
        </div>

        {can("academics.write") ? (
          <Button
            className="gap-2 self-start rounded-full sm:self-auto"
            onClick={() => openEditor(null)}
          >
            <Plus className="h-4 w-4" />
            Add programme
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          icon={<BookOpen className="h-6 w-6" />}
          tone="bg-primary/10 text-primary"
          label="Programmes offered"
          value={String(programmes.length)}
        />
        <StatTile
          icon={<Wallet className="h-6 w-6" />}
          tone="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          label="Open for admissions"
          value={String(openCount)}
        />
        <StatTile
          icon={<Users className="h-6 w-6" />}
          tone="bg-sky-500/15 text-sky-700 dark:text-sky-300"
          label="Students enrolled"
          value={String(enrolled)}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by code, title or certificate..."
            value={search}
            onChange={event => setSearch(event.target.value)}
            className="bg-white/80 pl-9 dark:bg-white/5"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {categories.length > 1 ? (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger
                className="w-[11rem] bg-white/80 dark:bg-white/5"
                aria-label="Filter by category"
              >
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Select
            value={statusFilter}
            onValueChange={(value: "all" | "active" | "inactive") => setStatusFilter(value)}
          >
            <SelectTrigger
              className="w-[10rem] bg-white/80 dark:bg-white/5"
              aria-label="Filter by status"
            >
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Open only</SelectItem>
              <SelectItem value="inactive">Closed only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map(index => (
            <div key={index} className="h-80 animate-pulse rounded-3xl bg-muted/50" />
          ))}
        </div>
      ) : query.error ? (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-12 text-center text-sm text-destructive">
          {query.error.message}
        </div>
      ) : !visible.length ? (
        <div className="rounded-3xl border border-dashed border-border bg-white/40 p-12 text-center dark:bg-white/4">
          <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <h2 className="mt-3 font-serif text-lg font-semibold text-foreground">
            No programmes to show
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {search || statusFilter !== "all" || categoryFilter !== "all"
              ? "Nothing matches these filters."
              : "Add the courses the school offers and they will appear on the website."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(programme => (
            <Card
              key={programme.id}
              className={`flex flex-col border-border/70 bg-white/80 shadow-sm transition-shadow hover:shadow-md dark:bg-white/5 ${
                programme.isActive ? "" : "bg-slate-50/70 opacity-75"
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="border-primary/20 bg-primary/5 font-mono text-xs font-bold uppercase text-primary"
                    >
                      {programme.code}
                    </Badge>
                    {programme.category ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-semibold uppercase tracking-wider"
                      >
                        {programme.category}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {programme.isFeatured ? (
                      <Badge className="gap-1 bg-amber-500/15 text-[10px] text-amber-800 hover:bg-amber-500/15 dark:text-amber-300">
                        <Sparkles className="h-3 w-3" />
                        Featured
                      </Badge>
                    ) : null}
                    <Badge
                      className={
                        programme.isActive
                          ? "bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-300"
                          : "bg-slate-500/15 text-slate-700 hover:bg-slate-500/15 dark:text-slate-300"
                      }
                    >
                      {programme.isActive ? "Open" : "Closed"}
                    </Badge>
                  </div>
                </div>

                <CardTitle className="mt-2 text-lg font-bold text-foreground">
                  {programme.title}
                </CardTitle>
                <CardDescription className="line-clamp-2 text-xs">
                  {programme.summary}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col gap-3 pt-0">
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3 text-xs">
                  <div>
                    <span className="block text-[11px] text-muted-foreground">Tuition</span>
                    <span className="font-serif text-lg font-bold text-foreground">
                      {formatMoney(programme.tuition)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-muted-foreground">Duration</span>
                    <span className="flex items-center gap-1 font-semibold text-foreground">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {describeDuration(programme.durationWeeks)}
                    </span>
                  </div>
                </div>

                {programme.productFee ? (
                  <div className="flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-200">
                    <span>Tools &amp; product kit</span>
                    <span className="font-bold">{formatMoney(programme.productFee)}</span>
                  </div>
                ) : null}

                <div className="rounded-xl border border-border/50 p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <ListChecks className="h-3.5 w-3.5 text-primary/70" />
                    Course outline
                  </p>
                  {programme.outline.length ? (
                    <ul className="mt-2 grid gap-1 text-xs text-foreground/90 sm:grid-cols-2">
                      {programme.outline.map(item => (
                        <li key={item} className="flex items-start gap-1.5">
                          <span
                            aria-hidden
                            className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary"
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Nothing listed yet, so applicants see the summary instead.
                    </p>
                  )}
                </div>

                {programme.certification ? (
                  <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <Award className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                    <span className="truncate">{programme.certification}</span>
                  </p>
                ) : null}

                <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-3">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <b>{programme.activeEnrollments}</b> enrolled
                  </span>

                  {can("academics.write") ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 px-2.5 text-xs"
                        onClick={() => openEditor(programme)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-8 gap-1 px-2.5 text-xs ${
                          programme.isActive ? "text-amber-700" : "text-emerald-700"
                        }`}
                        disabled={toggleActive.isPending}
                        onClick={() =>
                          toggleActive.mutate({
                            id: programme.id,
                            isActive: !programme.isActive,
                          })
                        }
                      >
                        <Power className="h-3.5 w-3.5" />
                        {programme.isActive ? "Close" : "Open"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${programme.title}`}
                        className="h-8 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() =>
                          setRemoving({
                            id: programme.id,
                            title: programme.title,
                            activeEnrollments: programme.activeEnrollments,
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SaveCourseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => setEditing(null)}
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {removing?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.activeEnrollments
                ? `${removing.activeEnrollments} student${
                    removing.activeEnrollments === 1 ? " is" : "s are"
                  } still enrolled on it, so this will be refused. Close it to new admissions instead, or move them to another programme first.`
                : "It comes off the website, the application form and the admissions list. Past applications, results and certificates that name it are kept, so an administrator can restore it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeProgramme.isPending}>
              Keep programme
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={removeProgramme.isPending}
              onClick={event => {
                // Confirming holds the dialog open until the server answers, so
                // a refusal is read where it was asked for.
                event.preventDefault();
                if (removing) removeProgramme.mutate({ id: removing.id });
              }}
            >
              {removeProgramme.isPending ? "Deleting..." : "Delete programme"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatTile({
  icon,
  tone,
  label,
  value,
}: {
  icon: ReactNode;
  tone: string;
  label: string;
  value: string;
}) {
  return (
    <Card className="border-border/60 bg-white/70 shadow-sm backdrop-blur dark:bg-white/5">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="font-serif text-2xl font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
