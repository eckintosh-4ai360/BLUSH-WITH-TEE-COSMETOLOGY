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
import { formatMoney } from "@blush/ui/lib/viz";
import { trpc } from "@/lib/trpc";

const FEE_TYPES = [
  "tuition",
  "registration",
  "materials",
  "exam",
  "certification",
  "other",
] as const;

const NONE = "none";

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Bills a student for something.
 *
 * The fee catalogue is offered as a starting point rather than a constraint:
 * picking one copies its name and amount into the form, and both stay
 * editable, because a charge records what this student was actually billed.
 */
export function AddChargeDialog({
  open,
  onOpenChange,
  onSaved,
  studentId,
  studentName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  studentId: number;
  studentName: string;
}) {
  const [structureId, setStructureId] = useState(NONE);
  const [feeType, setFeeType] = useState<(typeof FEE_TYPES)[number]>("tuition");
  const [description, setDescription] = useState("");
  const [amountDue, setAmountDue] = useState("");
  const [dueDate, setDueDate] = useState(today());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStructureId(NONE);
    setFeeType("tuition");
    setDescription("");
    setAmountDue("");
    setDueDate(today());
    setError(null);
  }, [open, studentId]);

  const structures = trpc.finance.feeStructures.useQuery(undefined, { enabled: open });

  const create = trpc.finance.createCharge.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const parsedAmount = Number(amountDue);

  const validation = useMemo(() => {
    if (description.trim().length < 2) return "Describe what this charge is for.";
    if (!amountDue.trim()) return "Enter an amount.";
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return "Amount must be a positive number.";
    }
    return null;
  }, [description, amountDue, parsedAmount]);

  const applyStructure = (value: string) => {
    setStructureId(value);
    if (value === NONE) return;

    const chosen = structures.data?.find(row => String(row.id) === value);
    if (!chosen) return;

    setDescription(chosen.label);
    setAmountDue(chosen.amount.toFixed(2));
    setFeeType(chosen.feeType as (typeof FEE_TYPES)[number]);
    setDueDate(
      new Date(Date.now() + chosen.dueOffsetDays * 86_400_000).toISOString().slice(0, 10),
    );
  };

  const activeStructures = (structures.data ?? []).filter(row => row.isActive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a charge</DialogTitle>
          <DialogDescription>Bills {studentName} for a fee.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {activeStructures.length ? (
            <div className="space-y-2">
              <Label htmlFor="charge-structure">Copy from the fee structure</Label>
              <Select value={structureId} onValueChange={applyStructure}>
                <SelectTrigger id="charge-structure">
                  <SelectValue placeholder="Start from scratch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Start from scratch</SelectItem>
                  {activeStructures.map(row => (
                    <SelectItem key={row.id} value={String(row.id)}>
                      {row.label} — {formatMoney(row.amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="charge-description">Description</Label>
            <Input
              id="charge-description"
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="e.g. Tuition, Term 1"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="charge-amount">Amount (GHS)</Label>
              <Input
                id="charge-amount"
                inputMode="decimal"
                value={amountDue}
                onChange={event => setAmountDue(event.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="charge-type">Type</Label>
              <Select
                value={feeType}
                onValueChange={value => setFeeType(value as typeof feeType)}
              >
                <SelectTrigger id="charge-type">
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

          <div className="space-y-2">
            <Label htmlFor="charge-due">Due date</Label>
            <Input
              id="charge-due"
              type="date"
              value={dueDate}
              onChange={event => setDueDate(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Payments are allocated to the oldest open charge first, so this decides
              what a part payment settles.
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={Boolean(validation) || create.isPending}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              create.mutate({
                studentId,
                feeType,
                description: description.trim(),
                amountDue: parsedAmount,
                dueDate: dueDate ? new Date(dueDate) : undefined,
              });
            }}
            className="gap-2"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add charge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
