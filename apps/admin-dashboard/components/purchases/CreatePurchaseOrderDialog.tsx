"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

type Line = {
  /** Stable across re-renders so React keys survive a row being removed. */
  key: number;
  inventoryItemId: string;
  quantityOrdered: string;
  unitCost: string;
};

let nextKey = 1;

const emptyLine = (): Line => ({
  key: nextKey++,
  inventoryItemId: "",
  quantityOrdered: "1",
  unitCost: "",
});

/**
 * Raises a purchase order.
 *
 * Nothing here touches stock: an order is a statement of intent, and the
 * balance only moves when the goods are received (§31). The unit cost defaults
 * to what the item last cost, because that is usually right and always
 * checkable.
 */
export function CreatePurchaseOrderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupplierId("");
    setOrderDate(today());
    setExpectedDate("");
    setNotes("");
    setLines([emptyLine()]);
    setError(null);
  }, [open]);

  const suppliers = trpc.inventory.suppliers.useQuery(
    { page: 1, pageSize: 100 },
    { enabled: open },
  );
  const items = trpc.inventory.items.useQuery(
    { page: 1, pageSize: 100, stockFilter: "all" },
    { enabled: open },
  );

  const create = trpc.inventory.createPurchaseOrder.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onCreated();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const catalogue = items.data?.rows ?? [];

  const updateLine = (key: number, patch: Partial<Line>) =>
    setLines(current =>
      current.map(line => (line.key === key ? { ...line, ...patch } : line)),
    );

  const chooseItem = (key: number, inventoryItemId: string) => {
    const item = catalogue.find(row => String(row.id) === inventoryItemId);
    updateLine(key, {
      inventoryItemId,
      // Seeded from the last known cost, and still editable — prices move.
      unitCost: item ? item.unitCost.toFixed(2) : "",
    });
  };

  const parsed = lines.map(line => ({
    key: line.key,
    inventoryItemId: Number(line.inventoryItemId),
    quantityOrdered: Number(line.quantityOrdered),
    unitCost: Number(line.unitCost),
  }));

  const total = parsed.reduce((sum, line) => {
    const lineTotal = line.quantityOrdered * line.unitCost;
    return sum + (Number.isFinite(lineTotal) ? lineTotal : 0);
  }, 0);

  const validation = useMemo(() => {
    if (!supplierId) return "Choose a supplier.";
    if (!orderDate) return "Set the order date.";
    if (!parsed.length) return "Add at least one item.";

    for (const line of parsed) {
      if (!Number.isInteger(line.inventoryItemId) || line.inventoryItemId <= 0) {
        return "Every line needs an item.";
      }
      if (!Number.isInteger(line.quantityOrdered) || line.quantityOrdered < 1) {
        return "Quantities must be whole numbers of 1 or more.";
      }
      if (!Number.isFinite(line.unitCost) || line.unitCost < 0) {
        return "Unit costs cannot be negative.";
      }
    }

    const ids = parsed.map(line => line.inventoryItemId);
    if (new Set(ids).size !== ids.length) {
      return "The same item appears on more than one line. Combine them.";
    }

    return null;
  }, [supplierId, orderDate, parsed]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Raise a purchase order</DialogTitle>
          <DialogDescription>
            Records what has been ordered. Stock and the supplier balance only move when
            the goods are received.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="po-supplier">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger id="po-supplier">
                  <SelectValue placeholder="Choose a supplier" />
                </SelectTrigger>
                <SelectContent>
                  {(suppliers.data?.rows ?? [])
                    .filter(supplier => supplier.isActive)
                    .map(supplier => (
                      <SelectItem key={supplier.id} value={String(supplier.id)}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="po-date">Order date</Label>
              <Input
                id="po-date"
                type="date"
                value={orderDate}
                onChange={event => setOrderDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="po-expected">Expected (optional)</Label>
              <Input
                id="po-expected"
                type="date"
                value={expectedDate}
                onChange={event => setExpectedDate(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => setLines(current => [...current, emptyLine()])}
              >
                <Plus className="h-3.5 w-3.5" />
                Add line
              </Button>
            </div>

            <div className="space-y-2">
              {lines.map(line => {
                const lineTotal = Number(line.quantityOrdered) * Number(line.unitCost);

                return (
                  <div
                    key={line.key}
                    className="grid grid-cols-[1fr_5rem_7rem_auto] items-end gap-2"
                  >
                    <div className="min-w-0">
                      <Select
                        value={line.inventoryItemId}
                        onValueChange={value => chooseItem(line.key, value)}
                      >
                        <SelectTrigger aria-label="Item">
                          <SelectValue placeholder="Choose an item" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalogue.map(item => (
                            <SelectItem key={item.id} value={String(item.id)}>
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Input
                      inputMode="numeric"
                      aria-label="Quantity"
                      value={line.quantityOrdered}
                      onChange={event =>
                        updateLine(line.key, { quantityOrdered: event.target.value })
                      }
                    />

                    <Input
                      inputMode="decimal"
                      aria-label="Unit cost"
                      placeholder="0.00"
                      value={line.unitCost}
                      onChange={event => updateLine(line.key, { unitCost: event.target.value })}
                    />

                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove line"
                      disabled={lines.length === 1}
                      onClick={() =>
                        setLines(current => current.filter(row => row.key !== line.key))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>

                    <p className="col-span-4 -mt-1 text-right text-xs text-muted-foreground">
                      {Number.isFinite(lineTotal) && lineTotal > 0
                        ? formatMoney(lineTotal)
                        : null}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
            <span className="text-sm text-muted-foreground">Order total</span>
            <span className="text-lg font-semibold tabular-nums">{formatMoney(total)}</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="po-notes">Notes (optional)</Label>
            <Textarea
              id="po-notes"
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={2}
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
            disabled={Boolean(validation) || create.isPending}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              create.mutate({
                supplierId: Number(supplierId),
                orderDate: new Date(orderDate),
                expectedDate: expectedDate ? new Date(expectedDate) : undefined,
                notes: notes.trim() || undefined,
                items: parsed.map(line => ({
                  inventoryItemId: line.inventoryItemId,
                  quantityOrdered: line.quantityOrdered,
                  unitCost: line.unitCost,
                })),
              });
            }}
            className="gap-2"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Raise order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
