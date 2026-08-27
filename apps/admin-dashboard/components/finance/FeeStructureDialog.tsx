"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import { Switch } from "@blush/ui/components/ui/switch";
import { trpc } from "@/lib/trpc";

const FEE_TYPES = [
  "tuition",
  "registration",
  "materials",
  "exam",
  "certification",
  "other",
] as const;

/** A structure with no course is the school-wide default. */
const SCHOOL_WIDE = "school-wide";

export type FeeStructure = {
  id: number;
  courseId: number | null;
  feeType: string;
  label: string;
  amount: number;
  isMandatory: boolean;
  dueOffsetDays: number;
  isActive: boolean;
};

/**
 * Creates or edits one line of the fee catalogue.
 *
 * Editing a structure does not touch charges already raised from it (§24):
 * those record what a student was actually billed, and rewriting them would
 * quietly change what people already owe.
 */
export function FeeStructureDialog({
  open,
  onOpenChange,
  onSaved,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: FeeStructure | null;
}) {
  const [courseId, setCourseId] = useState<string>(SCHOOL_WIDE);
  const [feeType, setFeeType] = useState<(typeof FEE_TYPES)[number]>("tuition");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [dueOffsetDays, setDueOffsetDays] = useState("0");
  const [isMandatory, setIsMandatory] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Seeded on every open, because the caller sets `editing` and `open` in the
  // same render and a state initialiser only runs once.
  useEffect(() => {
    setCourseId(editing?.courseId ? String(editing.courseId) : SCHOOL_WIDE);
    setFeeType((editing?.feeType as (typeof FEE_TYPES)[number]) ?? "tuition");
    setLabel(editing?.label ?? "");
    setAmount(editing ? editing.amount.toFixed(2) : "");
    setDueOffsetDays(String(editing?.dueOffsetDays ?? 0));
    setIsMandatory(editing?.isMandatory ?? true);
    setIsActive(editing?.isActive ?? true);
    setError(null);
  }, [open, editing]);

  const courses = trpc.content.courses.useQuery(undefined, { enabled: open });

  const save = trpc.finance.upsertFeeStructure.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const parsedAmount = Number(amount);
  const parsedOffset = Number(dueOffsetDays);

  const validation = useMemo(() => {
    if (label.trim().length < 2) return "Give the fee a name.";
    if (!amount.trim()) return "Enter an amount.";
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      return "Amount cannot be negative.";
    }
    if (!Number.isInteger(parsedOffset) || parsedOffset < 0 || parsedOffset > 3650) {
      return "Days until due must be a whole number between 0 and 3650.";
    }
    return null;
  }, [label, amount, parsedAmount, parsedOffset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit fee" : "Add a fee"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes apply from now on. Bills already issued keep the amount they were issued at."
              : "Sets what a programme costs. Charges are raised against a student from these."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fee-label">Name</Label>
            <Input
              id="fee-label"
              value={label}
              onChange={event => setLabel(event.target.value)}
              placeholder="e.g. Full tuition, Term 1"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fee-course">Programme</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger id="fee-course">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SCHOOL_WIDE}>All programmes</SelectItem>
                  {(courses.data ?? []).map(course => (
                    <SelectItem key={course.id} value={String(course.id)}>
                      {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fee-type">Type</Label>
              <Select
                value={feeType}
                onValueChange={value => setFeeType(value as typeof feeType)}
              >
                <SelectTrigger id="fee-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEE_TYPES.map(item => (
                    <SelectItem key={item} value={item} className="capitalize">
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fee-amount">Amount (GHS)</Label>
              <Input
                id="fee-amount"
                inputMode="decimal"
                value={amount}
                onChange={event => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fee-offset">Due after (days)</Label>
              <Input
                id="fee-offset"
                inputMode="numeric"
                value={dueOffsetDays}
                onChange={event => setDueOffsetDays(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Counted from the day the student enrols. 0 means due immediately.
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl bg-muted/50 p-3">
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                <span className="block font-medium text-foreground">Mandatory</span>
                <span className="text-xs text-muted-foreground">
                  Billed to every student on the programme.
                </span>
              </span>
              <Switch checked={isMandatory} onCheckedChange={setIsMandatory} />
            </label>

            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                <span className="block font-medium text-foreground">Active</span>
                <span className="text-xs text-muted-foreground">
                  Turn off to retire a fee without deleting its history.
                </span>
              </span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </label>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={Boolean(validation) || save.isPending}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              save.mutate({
                id: editing?.id,
                courseId: courseId === SCHOOL_WIDE ? null : Number(courseId),
                intakeId: null,
                feeType,
                label: label.trim(),
                amount: parsedAmount,
                isMandatory,
                dueOffsetDays: parsedOffset,
                isActive,
              });
            }}
            className="gap-2"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Save changes" : "Add fee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
