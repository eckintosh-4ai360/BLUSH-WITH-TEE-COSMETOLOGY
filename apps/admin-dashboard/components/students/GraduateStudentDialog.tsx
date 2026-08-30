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
import { trpc } from "@/lib/trpc";

/** Only the identity and the programmes are needed to ask the question. */
export type GraduatingStudent = {
  id: number;
  fullName: string;
  studentNumber: string;
  programmes: { id: number; courseTitle: string; status: string }[];
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Graduates one student.
 *
 * Graduation is not a status somebody picks off a dropdown: it closes the
 * programmes they were still on and moves them off the student register, so it
 * asks once, says what will happen, and carries the ceremony date - which is
 * often not the day the office got round to recording it.
 */
export function GraduateStudentDialog({
  open,
  onOpenChange,
  student,
  onGraduated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: GraduatingStudent | null;
  onGraduated: (result: { studentNumber: string; fullName: string }) => void;
}) {
  const [graduatedAt, setGraduatedAt] = useState(today());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setGraduatedAt(today());
    setError(null);
  }, [open]);

  const graduate = trpc.students.graduate.useMutation({
    onSuccess: result => {
      onOpenChange(false);
      onGraduated(result);
    },
    // The dialog stays open on failure: the commonest refusals - an unpaid
    // balance, or nobody ever enrolled - are messages about this student that
    // need reading where they were asked for.
    onError: mutationError => setError(mutationError.message),
  });

  const stillOpen = student?.programmes.filter(
    programme => programme.status === "active" || programme.status === "paused",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Graduate {student?.fullName}?</DialogTitle>
          <DialogDescription>
            They move to the graduates register and stop appearing among the students
            being taught. Their fees, results and certificates stay on the same record,
            and an administrator can put them back.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {stillOpen?.length ? (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <p className="text-muted-foreground">
                {stillOpen.length === 1
                  ? "This programme is marked completed:"
                  : "These programmes are marked completed:"}
              </p>
              <ul className="mt-1 list-inside list-disc text-foreground">
                {stillOpen.map(programme => (
                  <li key={programme.id}>{programme.courseTitle}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Completing a programme is what makes a certificate available to issue.
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="graduation-date">Graduation date</Label>
            <Input
              id="graduation-date"
              type="date"
              value={graduatedAt}
              max={today()}
              onChange={event => setGraduatedAt(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Defaults to today. Set the ceremony date if it has already happened.
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={graduate.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="gap-2"
            disabled={graduate.isPending || !graduatedAt || !student}
            onClick={() => {
              setError(null);
              if (student) {
                graduate.mutate({ id: student.id, graduatedAt: new Date(graduatedAt) });
              }
            }}
          >
            {graduate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Graduate student
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
