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
import { formatMoney } from "@blush/ui/lib/viz";
import { trpc } from "@/lib/trpc";

type RefundablePayment = {
  id: number;
  reference: string;
  amount: number;
  refundedAmount: number;
};

/**
 * Records a refund against a payment.
 *
 * The original payment is left untouched: the server writes a reversing
 * revenue line, so the history of what was received stays intact (§29).
 */
export function RefundPaymentDialog({
  payment,
  onOpenChange,
  onRefunded,
}: {
  payment: RefundablePayment | null;
  onOpenChange: (open: boolean) => void;
  onRefunded: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refundable = payment ? payment.amount - payment.refundedAmount : 0;

  useEffect(() => {
    if (payment) {
      setAmount(refundable.toFixed(2));
      setReason("");
      setError(null);
    }
  }, [payment, refundable]);

  const refund = trpc.finance.refundPayment.useMutation({
    onSuccess: onRefunded,
    onError: mutationError => setError(mutationError.message),
  });

  const parsed = Number(amount);
  const invalid =
    !Number.isFinite(parsed) || parsed <= 0 || parsed > refundable || reason.trim().length < 2;

  return (
    <Dialog open={Boolean(payment)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refund {payment?.reference}</DialogTitle>
          <DialogDescription>
            This writes a reversing entry. The original payment record is not changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl bg-muted/50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span className="font-medium">{formatMoney(payment?.amount ?? 0)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Already refunded</span>
              <span className="font-medium">{formatMoney(payment?.refundedAmount ?? 0)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border/60 pt-1">
              <span className="text-muted-foreground">Available to refund</span>
              <span className="font-semibold text-foreground">{formatMoney(refundable)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="refund-amount">Refund amount (GHS)</Label>
            <Input
              id="refund-amount"
              inputMode="decimal"
              value={amount}
              onChange={event => setAmount(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="refund-reason">Reason</Label>
            <Input
              id="refund-reason"
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Why is this being refunded?"
            />
          </div>

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
            variant="destructive"
            disabled={invalid || refund.isPending || !payment}
            onClick={() => {
              setError(null);
              refund.mutate({ paymentId: payment!.id, amount: parsed, reason: reason.trim() });
            }}
            className="gap-2"
          >
            {refund.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
