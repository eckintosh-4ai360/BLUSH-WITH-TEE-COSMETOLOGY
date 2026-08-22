"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import { Checkbox } from "@blush/ui/components/ui/checkbox";
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

export function RefundOrderDialog({
  open,
  onOpenChange,
  orderId,
  maxAmount,
  onRefunded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: number;
  maxAmount: number;
  onRefunded: () => void;
}) {
  const [amount, setAmount] = useState(maxAmount.toFixed(2));
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(maxAmount.toFixed(2));
      setReason("");
      setRestock(true);
      setError(null);
    }
  }, [open, maxAmount]);

  const refund = trpc.orders.refund.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onRefunded();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const parsed = Number(amount);
  const invalid = !Number.isFinite(parsed) || parsed <= 0 || reason.trim().length < 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refund this order</DialogTitle>
          <DialogDescription>
            A reversing revenue entry is written; the original sale is left intact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="refund-order-amount">Refund amount (GHS)</Label>
            <Input
              id="refund-order-amount"
              inputMode="decimal"
              value={amount}
              onChange={event => setAmount(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="refund-order-reason">Reason</Label>
            <Input
              id="refund-order-reason"
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Why is this being refunded?"
            />
          </div>

          <label className="flex items-start gap-2.5 rounded-lg bg-muted/50 p-3">
            <Checkbox
              checked={restock}
              onCheckedChange={checked => setRestock(checked === true)}
              aria-label="Return goods to stock"
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="block font-medium text-foreground">Return goods to stock</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Leave this off if the goods were not returned or cannot be resold.
              </span>
            </span>
          </label>

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
            className="gap-2"
            disabled={invalid || refund.isPending}
            onClick={() => {
              setError(null);
              refund.mutate({ orderId, amount: parsed, reason: reason.trim(), restock });
            }}
          >
            {refund.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
