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
import { Textarea } from "@blush/ui/components/ui/textarea";
import { formatMoney } from "@blush/ui/lib/viz";
import { trpc } from "@/lib/trpc";

const WHOLE_ACCOUNT = "account";

export type AdjustableCharge = {
  id: number;
  description: string;
  balance: number;
};

/**
 * Applies a discount or a surcharge.
 *
 * Recorded as its own row rather than edited into the charge (§29), so the
 * original bill and the reason it changed both survive in the audit trail.
 */
export function AdjustAccountDialog({
  open,
  onOpenChange,
  onSaved,
  studentId,
  studentName,
  charges,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  studentId: number;
  studentName: string;
  charges: AdjustableCharge[];
}) {
  const [adjustmentType, setAdjustmentType] = useState<"discount" | "surcharge">("discount");
  const [chargeId, setChargeId] = useState(WHOLE_ACCOUNT);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAdjustmentType("discount");
    setChargeId(WHOLE_ACCOUNT);
    setAmount("");
    setReason("");
    setError(null);
  }, [open, studentId]);

  const adjust = trpc.finance.adjust.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const parsedAmount = Number(amount);

  const validation = useMemo(() => {
    if (!amount.trim()) return "Enter an amount.";
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return "Amount must be a positive number.";
    }
    if (reason.trim().length < 2) return "Give a reason — this is recorded in the audit log.";
    return null;
  }, [amount, parsedAmount, reason]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust the account</DialogTitle>
          <DialogDescription>
            Records a discount or surcharge against {studentName}. The original charge is
            left as it was.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adjust-type">Adjustment</Label>
              <Select
                value={adjustmentType}
                onValueChange={value => setAdjustmentType(value as typeof adjustmentType)}
              >
                <SelectTrigger id="adjust-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discount">Discount (reduces what is owed)</SelectItem>
                  <SelectItem value="surcharge">Surcharge (adds to what is owed)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adjust-amount">Amount (GHS)</Label>
              <Input
                id="adjust-amount"
                inputMode="decimal"
                value={amount}
                onChange={event => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-charge">Applies to</Label>
            <Select value={chargeId} onValueChange={setChargeId}>
              <SelectTrigger id="adjust-charge">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_ACCOUNT}>The account as a whole</SelectItem>
                {charges.map(charge => (
                  <SelectItem key={charge.id} value={String(charge.id)}>
                    {charge.description} — {formatMoney(charge.balance)} open
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-reason">Reason</Label>
            <Textarea
              id="adjust-reason"
              value={reason}
              onChange={event => setReason(event.target.value)}
              rows={2}
              placeholder="e.g. Sibling discount agreed with the principal"
            />
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
            disabled={Boolean(validation) || adjust.isPending}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              adjust.mutate({
                studentId,
                feeChargeId: chargeId === WHOLE_ACCOUNT ? undefined : Number(chargeId),
                adjustmentType,
                amount: parsedAmount,
                reason: reason.trim(),
              });
            }}
            className="gap-2"
          >
            {adjust.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Apply {adjustmentType}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
