"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Trophy } from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blush/ui/components/ui/dialog";
import { Input } from "@blush/ui/components/ui/input";
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { toast } from "@blush/ui/components/ui/sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

/**
 * The mark sheet for one assessment.
 *
 * Everyone on the programme is listed whether or not they have been marked,
 * because the sheet's job is to show the gap as much as the marks. Positions
 * are shown next to the marks rather than worked out afterwards: the person
 * typing wants to see the room reorder as they go, and the ordering is the
 * thing they will be asked about.
 *
 * Positions come back from the server on every save rather than being computed
 * here. A sheet that ranked its own rows would be a second implementation of
 * the rule, free to drift from the one the reports and the portal use.
 */

export type ScorableAssessment = {
  id: number;
  title: string;
  totalScore: number;
  courseTitle: string;
};

/** Blank means unmarked, which is different from a zero. */
type Draft = { score: string; comment: string };

const PODIUM: Record<number, string> = {
  1: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  2: "bg-slate-400/20 text-slate-700 dark:text-slate-300",
  3: "bg-orange-600/15 text-orange-800 dark:text-orange-300",
};

export function ScoreAssessmentDialog({
  assessment,
  onOpenChange,
  onSaved,
}: {
  /** The assessment being marked, or null when the sheet is closed. */
  assessment: ScorableAssessment | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { can } = usePermissions();
  const writable = can("results.write");

  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = assessment !== null;

  const sheet = trpc.results.sheet.useQuery(
    { assessmentId: assessment?.id ?? 0 },
    {
      enabled: open,
      // Re-read on open: marks may have been entered on another machine, and
      // saving a stale sheet would quietly undo them.
      staleTime: 0,
      refetchOnMount: "always",
    },
  );

  // Seeded when the sheet arrives, so reopening on a different assessment
  // never shows the previous one's marks for a frame.
  useEffect(() => {
    if (!sheet.data) return;
    const seeded: Record<number, Draft> = {};
    for (const student of sheet.data.students) {
      seeded[student.studentId] = {
        score: student.score === null ? "" : String(student.score),
        comment: student.instructorComment ?? "",
      };
    }
    setDrafts(seeded);
    setDirty(false);
    setError(null);
  }, [sheet.data]);

  const save = trpc.results.record.useMutation({
    onSuccess: result => {
      setDirty(false);
      toast.success(
        result.saved
          ? `Marked ${result.saved} student${result.saved === 1 ? "" : "s"} on "${result.title}".`
          : "Marks cleared.",
      );
      sheet.refetch();
      onSaved();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const students = sheet.data?.students ?? [];
  const totalScore = sheet.data?.assessment.totalScore ?? assessment?.totalScore ?? 0;

  const setDraft = (studentId: number, patch: Partial<Draft>) => {
    setDrafts(current => ({
      ...current,
      [studentId]: {
        score: current[studentId]?.score ?? "",
        comment: current[studentId]?.comment ?? "",
        ...patch,
      },
    }));
    setDirty(true);
  };

  /**
   * Checked here as well as on the server, because the person typing wants to
   * know about a slipped digit on the row it is on, not after a round trip
   * that refuses the whole sheet.
   */
  const validation = useMemo(() => {
    for (const student of students) {
      const raw = drafts[student.studentId]?.score?.trim() ?? "";
      if (!raw) continue;

      const score = Number(raw);
      if (!Number.isFinite(score)) return `${student.fullName}'s mark is not a number.`;
      if (score < 0) return `${student.fullName}'s mark cannot be negative.`;
      if (score > totalScore) {
        return `${student.fullName} has ${score}, which is above the ${totalScore} this is marked out of.`;
      }
    }
    return null;
  }, [students, drafts, totalScore]);

  const entered = students.filter(
    student => (drafts[student.studentId]?.score ?? "").trim() !== "",
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{assessment?.title ?? "Mark sheet"}</DialogTitle>
          <DialogDescription>
            {assessment?.courseTitle} &middot; marked out of {totalScore}. Positions are worked
            out from the marks and update as soon as the sheet is saved.
          </DialogDescription>
        </DialogHeader>

        {sheet.isLoading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : sheet.error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {sheet.error.message}
          </p>
        ) : !students.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nobody is enrolled on {assessment?.courseTitle} yet, so there is no one to mark.
          </p>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm sm:grid-cols-4">
              <Stat label="Sitting" value={String(sheet.data?.totals.sitting ?? 0)} />
              <Stat
                label="Marked"
                value={`${sheet.data?.totals.marked ?? 0} of ${sheet.data?.totals.sitting ?? 0}`}
              />
              <Stat
                label="Class average"
                value={
                  sheet.data?.totals.average === null || sheet.data?.totals.average === undefined
                    ? "--"
                    : `${sheet.data.totals.average} / ${totalScore}`
                }
              />
              <Stat
                label="Passed"
                value={
                  sheet.data?.totals.marked
                    ? `${sheet.data.totals.passed} of ${sheet.data.totals.marked}`
                    : "--"
                }
              />
            </dl>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs text-muted-foreground">
                    <th className="w-14 py-2 text-left font-medium">Pos.</th>
                    <th className="py-2 text-left font-medium">Student</th>
                    <th className="w-24 py-2 text-left font-medium">Mark</th>
                    <th className="w-20 py-2 text-left font-medium">Grade</th>
                    <th className="py-2 text-left font-medium">Comment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {students.map(student => {
                    const draft = drafts[student.studentId];
                    return (
                      <tr key={student.studentId}>
                        <td className="py-2 pr-2">
                          {student.position === null ? (
                            <span className="text-xs text-muted-foreground">--</span>
                          ) : (
                            <span
                              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                                PODIUM[student.position] ?? "text-muted-foreground"
                              }`}
                            >
                              {student.positionLabel}
                            </span>
                          )}
                        </td>

                        <td className="py-2 pr-2">
                          <p className="truncate font-medium text-foreground">
                            {student.fullName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {student.studentNumber}
                            {student.enrolmentStatus === "paused" ? " · paused" : ""}
                          </p>
                        </td>

                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={totalScore}
                            step="0.01"
                            value={draft?.score ?? ""}
                            disabled={!writable}
                            placeholder="--"
                            aria-label={`Mark for ${student.fullName}, out of ${totalScore}`}
                            onChange={event =>
                              setDraft(student.studentId, { score: event.target.value })
                            }
                            className="h-9 w-20"
                          />
                        </td>

                        <td className="py-2 pr-2">
                          {student.grade ? (
                            <Badge
                              variant={student.passed ? "secondary" : "destructive"}
                              className="text-xs"
                            >
                              {student.grade}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </td>

                        <td className="py-2">
                          <Input
                            value={draft?.comment ?? ""}
                            disabled={!writable}
                            placeholder="Optional"
                            aria-label={`Comment for ${student.fullName}`}
                            onChange={event =>
                              setDraft(student.studentId, { comment: event.target.value })
                            }
                            className="h-9"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              A blank mark is not a zero: it means the student has not been marked, and they take
              no position until they are. Clearing a mark that was saved removes it.
            </p>

            {validation ? (
              <p role="alert" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                {validation}
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {dirty ? (
            <span className="mr-auto self-center text-xs text-muted-foreground">
              Unsaved changes
            </span>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Close
          </Button>
          {writable ? (
            <Button
              className="gap-2"
              disabled={!students.length || Boolean(validation) || save.isPending}
              onClick={() => {
                setError(null);
                if (!assessment) return;
                save.mutate({
                  assessmentId: assessment.id,
                  entries: students.map(student => {
                    const raw = (drafts[student.studentId]?.score ?? "").trim();
                    return {
                      studentId: student.studentId,
                      score: raw === "" ? null : Number(raw),
                      instructorComment:
                        (drafts[student.studentId]?.comment ?? "").trim() || undefined,
                    };
                  }),
                });
              }}
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {save.isPending ? "Saving..." : `Save ${entered} mark${entered === 1 ? "" : "s"}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-serif text-lg font-bold text-foreground">{value}</dd>
    </div>
  );
}

/** Shown on the catalogue card, so the winner is visible without opening it. */
export function TopScorer({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
      <Trophy className="h-3 w-3" />
      {name}
    </span>
  );
}
