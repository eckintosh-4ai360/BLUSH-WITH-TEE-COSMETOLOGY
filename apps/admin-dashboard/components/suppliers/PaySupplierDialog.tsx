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

export type PayableOrder = {
  id: number;
  reference: string;
  total: number;
  amountPaid: number;
};

/**
 * Records money paid to a supplier.
 *
 * A payment can settle one purchase order or sit against the account as a
 * whole. Either way it reduces the outstanding balance in the same
 * transaction, so what the supplier is owed is never a figure somebody has to
 * remember to update.
 */
export function PaySupplierDialog({
  open,
  onOpenChange,
  onPaid,
  supplierId,
  supplierName,
  outstandingBalance,
  orders = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaid: () => void;
  supplierId: number;
  supplierName: string;
  outstandingBalance: number;
  orders?: PayableOrder[];
}) {
  const [amount, setAmount] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState(WHOLE_ACCOUNT);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAmount("");
    setPurchaseOrderId(WHOLE_ACCOUNT);
    setReference("");
    setNote("");
    setError(null);
  }, [open, supplierId]);

  const pay = trpc.inventory.paySupplier.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onPaid();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const parsedAmount = Number(amount);

  const validation = useMemo(() => {
    if (!amount.trim()) return "Enter an amount.";
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return "Amount must be a positive number.";
    }
    return null;
  }, [amount, parsedAmount]);

  // Overpaying is allowed — a deposit against future orders is a real thing —
  // but it is worth saying out loud before it is recorded.
  const overpayment =
    parsedAmount > outstandingBalance && outstandingBalance >= 0
      ? `That is ${formatMoney(parsedAmount - outstandingBalance)} more than the ${formatMoney(outstandingBalance)} owed. The difference becomes a credit.`
      : null;

  const unpaid = orders.filter(order => order.amountPaid < order.total);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pay {supplierName}</DialogTitle>
          <DialogDescription>
            Currently owed: {formatMoney(outstandingBalance)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pay-amount">Amount (GHS)</Label>
            <Input
              id="pay-amount"
              inputMode="decimal"
              value={amount}
              onChange={event => setAmount(event.target.value)}
              placeholder="0.00"
            />
            {outstandingBalance > 0 ? (
              <button
                type="button"
                onClick={() => setAmount(outstandingBalance.toFixed(2))}
                className="text-xs text-primary hover:underline"
              >
                Pay the full balance ({formatMoney(outstandingBalance)})
              </button>
            ) : null}
          </div>

          {unpaid.length ? (
            <div className="space-y-2">
              <Label htmlFor="pay-order">Against</Label>
              <Select value={purchaseOrderId} onValueChange={setPurchaseOrderId}>
                <SelectTrigger id="pay-order">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE_ACCOUNT}>The account as a whole</SelectItem>
                  {unpaid.map(order => (
                    <SelectItem key={order.id} value={String(order.id)}>
                      {order.reference} — {formatMoney(order.total - order.amountPaid)} unpaid
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="pay-reference">Transaction reference (optional)</Label>
            <Input
              id="pay-reference"
              value={reference}
              onChange={event => setReference(event.target.value)}
              placeholder="e.g. MoMo transaction ID"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-note">Note (optional)</Label>
            <Textarea
              id="pay-note"
              value={note}
              onChange={event => setNote(event.target.value)}
              rows={2}
            />
          </div>

          {overpayment ? (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              {overpayment}
            </p>
          ) : null}

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
            disabled={Boolean(validation) || pay.isPending}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              pay.mutate({
                supplierId,
                purchaseOrderId:
                  purchaseOrderId === WHOLE_ACCOUNT ? undefined : Number(purchaseOrderId),
                amount: parsedAmount,
                reference: reference.trim() || undefined,
                note: note.trim() || undefined,
              });
            }}
            className="gap-2"
          >
            {pay.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
