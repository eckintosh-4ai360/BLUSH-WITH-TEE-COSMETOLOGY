"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Label } from "@blush/ui/components/ui/label";
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Issues a certificate to a student who has completed a course.
 *
 * Only completed enrolments without a certificate are offered, so the common
 * mistakes - awarding twice, or awarding to someone still studying - are not
 * reachable from the interface. The server enforces both regardless.
 */
export function IssueCertificateDialog({
  open,
  onOpenChange,
  onIssued,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued: (certificateNumber: string) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [completionDate, setCompletionDate] = useState(today());
  const [grade, setGrade] = useState("");
  const [error, setError] = useState<string | null>(null);

  const eligible = trpc.certificates.eligible.useQuery(undefined, { enabled: open });

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setCompletionDate(today());
      setGrade("");
      setError(null);
    }
  }, [open]);

  const issue = trpc.certificates.issue.useMutation({
    onSuccess: result => {
      onOpenChange(false);
      onIssued(result.certificateNumber);
    },
    onError: mutationError => setError(mutationError.message),
  });

  const rows = eligible.data ?? [];
  const chosen = rows.find(row => row.enrollmentId === selected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue a certificate</DialogTitle>
          <DialogDescription>
            Students who have completed a course and do not yet hold a certificate for it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {eligible.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(index => (
                <Skeleton key={index} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : !rows.length ? (
            <p className="rounded-lg bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
              Nobody is waiting on a certificate. A student becomes eligible once their enrolment
              is marked completed.
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-1">
              {rows.map(row => (
                <button
                  key={row.enrollmentId}
                  type="button"
                  onClick={() => setSelected(row.enrollmentId)}
                  className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    selected === row.enrollmentId ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <span className="block font-medium text-foreground">{row.fullName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {row.studentNumber} · {row.courseTitle}
                  </span>
                </button>
              ))}
            </div>
          )}

          {chosen ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="completion">Completion date</Label>
                <Input
                  id="completion"
                  type="date"
                  value={completionDate}
                  max={today()}
                  onChange={event => setCompletionDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grade">Final grade (optional)</Label>
                <Input
                  id="grade"
                  value={grade}
                  onChange={event => setGrade(event.target.value)}
                  placeholder="Calculated from results"
                  maxLength={8}
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="gap-2"
            disabled={!chosen || !completionDate || issue.isPending}
            onClick={() => {
              setError(null);
              if (!chosen) return;
              issue.mutate({
                studentId: chosen.studentId,
                courseId: chosen.courseId,
                enrollmentId: chosen.enrollmentId,
                completionDate: new Date(completionDate),
                finalGrade: grade.trim() || undefined,
              });
            }}
          >
            {issue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Issue certificate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
