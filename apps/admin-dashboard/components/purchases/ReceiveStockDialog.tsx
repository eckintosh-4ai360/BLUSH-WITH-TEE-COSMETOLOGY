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
import { formatMoney } from "@blush/ui/lib/viz";
import { trpc } from "@/lib/trpc";

export type ReceivableLine = {
  id: number;
  itemName: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
};

/**
 * Books goods in against a purchase order.
 *
 * Part deliveries are the normal case, so every line is entered separately and
 * defaults to what is still outstanding. The server refuses more than was
 * ordered; this form just makes that hard to attempt by accident.
 */
export function ReceiveStockDialog({
  open,
  onOpenChange,
  onReceived,
  purchaseOrderId,
  reference,
  lines,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReceived: (fullyReceived: boolean) => void;
  purchaseOrderId: number;
  reference: string;
  lines: ReceivableLine[];
}) {
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const outstanding = lines
    .map(line => ({ ...line, remaining: line.quantityOrdered - line.quantityReceived }))
    .filter(line => line.remaining > 0);

  // Seeded when the dialog opens, keyed on the order rather than on `lines`:
  // depending on the array would re-seed — and wipe what the user typed — on
  // any render that handed down a fresh identity.
  useEffect(() => {
    setQuantities(
      Object.fromEntries(
        lines
          .filter(line => line.quantityOrdered > line.quantityReceived)
          .map(line => [line.id, String(line.quantityOrdered - line.quantityReceived)]),
      ),
    );
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purchaseOrderId]);

  const receive = trpc.inventory.receivePurchaseOrder.useMutation({
    onSuccess: result => {
      onOpenChange(false);
      onReceived(result.fullyReceived);
    },
    onError: mutationError => setError(mutationError.message),
  });

  // A line left at zero is simply not part of this delivery.
  const entered = outstanding
    .map(line => ({ line, quantity: Number(quantities[line.id] ?? "0") }))
    .filter(row => row.quantity > 0);

  const validation = useMemo(() => {
    for (const line of outstanding) {
      const value = Number(quantities[line.id] ?? "0");
      if (!Number.isInteger(value) || value < 0) {
        return "Quantities must be whole numbers, 0 or more.";
      }
      if (value > line.remaining) {
        return `Only ${line.remaining} of ${line.itemName} are still outstanding.`;
      }
    }
    if (!entered.length) return "Enter what arrived on at least one line.";
    return null;
  }, [outstanding, quantities, entered]);

  const valueReceived = entered.reduce(
    (sum, row) => sum + row.quantity * row.line.unitCost,
    0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive stock</DialogTitle>
          <DialogDescription>
            What actually arrived against {reference}. Stock goes up and the supplier
            balance goes up together.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!outstanding.length ? (
            <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
              Every line on this order has already been received.
            </p>
          ) : (
            <div className="space-y-3">
              {outstanding.map(line => (
                <div key={line.id} className="grid grid-cols-[1fr_6rem] items-end gap-3">
                  <div>
                    <Label htmlFor={`receive-${line.id}`}>{line.itemName}</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {line.quantityReceived} of {line.quantityOrdered} received ·{" "}
                      {line.remaining} outstanding · {formatMoney(line.unitCost)} each
                    </p>
                  </div>
                  <Input
                    id={`receive-${line.id}`}
                    inputMode="numeric"
                    value={quantities[line.id] ?? ""}
                    onChange={event =>
                      setQuantities(current => ({
                        ...current,
                        [line.id]: event.target.value,
                      }))
                    }
                  />
                </div>
              ))}

              <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
                <span className="text-sm text-muted-foreground">Value received</span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatMoney(valueReceived)}
                </span>
              </div>
            </div>
          )}

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
            disabled={Boolean(validation) || receive.isPending || !outstanding.length}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              receive.mutate({
                purchaseOrderId,
                lines: entered.map(row => ({
                  purchaseOrderItemId: row.line.id,
                  quantityReceived: row.quantity,
                })),
              });
            }}
            className="gap-2"
          >
            {receive.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Receive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
