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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import { trpc } from "@/lib/trpc";

const METHODS = ["cash", "mobile_money", "bank", "card", "online"] as const;

/**
 * Captures an offline payment against a store order.
 *
 * Confirming payment is what deducts stock, so the copy says so plainly - the
 * operator should know this is the moment inventory moves.
 */
export function RecordOrderPaymentDialog({
  open,
  onOpenChange,
  orderId,
  amountDue,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: number;
  amountDue: number;
  onRecorded: () => void;
}) {
  const [amount, setAmount] = useState(amountDue.toFixed(2));
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash");
  const [transactionReference, setTransactionReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(amountDue.toFixed(2));
      setMethod("cash");
      setTransactionReference("");
      setError(null);
    }
  }, [open, amountDue]);

  const record = trpc.orders.recordPayment.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onRecorded();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const parsed = Number(amount);
  const invalid = !Number.isFinite(parsed) || parsed <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Marking this order paid deducts the ordered stock and books the sale as revenue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="order-amount">Amount (GHS)</Label>
            <Input
              id="order-amount"
              inputMode="decimal"
              value={amount}
              onChange={event => setAmount(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="order-method">Method</Label>
            <Select value={method} onValueChange={value => setMethod(value as typeof method)}>
              <SelectTrigger id="order-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map(item => (
                  <SelectItem key={item} value={item} className="capitalize">
                    {item.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="order-transaction">Transaction reference (optional)</Label>
            <Input
              id="order-transaction"
              value={transactionReference}
              onChange={event => setTransactionReference(event.target.value)}
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
            className="gap-2"
            disabled={invalid || record.isPending}
            onClick={() => {
              setError(null);
              record.mutate({
                orderId,
                amount: parsed,
                paymentMethod: method,
                transactionReference: transactionReference.trim() || undefined,
              });
            }}
          >
            {record.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
