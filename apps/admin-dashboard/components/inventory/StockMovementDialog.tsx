"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import { Textarea } from "@blush/ui/components/ui/textarea";
import { trpc } from "@/lib/trpc";

/** Movement types a person records by hand; sales come from checkout. */
const TYPES = [
  { key: "received", label: "Received from supplier", direction: 1 },
  { key: "classroom_use", label: "Used in class", direction: -1 },
  { key: "damaged", label: "Damaged or expired", direction: -1 },
  { key: "return", label: "Returned to stock", direction: 1 },
  { key: "adjustment", label: "Stock count adjustment", direction: 0 },
] as const;

type StockItem = { id: number; name: string; sku: string; quantityOnHand: number };

/**
 * Records a stock movement.
 *
 * The quantity is entered as a plain positive number and the movement type
 * decides the direction, so an operator cannot accidentally add stock when
 * they meant to remove it. A count adjustment is the one case that may go
 * either way, and the only one allowed to drive a balance negative.
 */
export function StockMovementDialog({
  item,
  onOpenChange,
  onSaved,
}: {
  item: StockItem | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<(typeof TYPES)[number]["key"]>("received");
  const [quantity, setQuantity] = useState("");
  const [countedTotal, setCountedTotal] = useState("");
  const [note, setNote] = useState("");
  const [allowNegative, setAllowNegative] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setType("received");
      setQuantity("");
      setCountedTotal(String(item.quantityOnHand));
      setNote("");
      setAllowNegative(false);
      setError(null);
    }
  }, [item]);

  const record = trpc.inventory.recordMovement.useMutation({
    onSuccess: onSaved,
    onError: mutationError => setError(mutationError.message),
  });

  const config = TYPES.find(entry => entry.key === type)!;
  const isAdjustment = type === "adjustment";

  /** For an adjustment the operator types the counted total, not a delta. */
  const delta = useMemo(() => {
    if (!item) return 0;
    if (isAdjustment) {
      const counted = Number(countedTotal);
      if (!Number.isFinite(counted)) return 0;
      return Math.trunc(counted) - item.quantityOnHand;
    }
    const entered = Number(quantity);
    if (!Number.isFinite(entered)) return 0;
    return Math.trunc(Math.abs(entered)) * config.direction;
  }, [item, isAdjustment, countedTotal, quantity, config.direction]);

  const balanceAfter = (item?.quantityOnHand ?? 0) + delta;

  const validation = useMemo(() => {
    if (!item) return "No item selected.";
    if (delta === 0) {
      return isAdjustment ? "The counted total matches the current balance." : "Enter a quantity.";
    }
    if (balanceAfter < 0 && !(isAdjustment && allowNegative)) {
      return `This would take stock to ${balanceAfter}. Only an authorised count adjustment may go below zero.`;
    }
    return null;
  }, [item, delta, isAdjustment, balanceAfter, allowNegative]);

  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stock movement</DialogTitle>
          <DialogDescription>
            {item ? `${item.name} · ${item.quantityOnHand} on hand` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="movement-type">Type</Label>
            <Select value={type} onValueChange={value => setType(value as typeof type)}>
              <SelectTrigger id="movement-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map(entry => (
                  <SelectItem key={entry.key} value={entry.key}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isAdjustment ? (
            <div className="space-y-2">
              <Label htmlFor="counted">Counted total</Label>
              <Input
                id="counted"
                inputMode="numeric"
                value={countedTotal}
                onChange={event => setCountedTotal(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter what you actually counted. The difference is recorded as the adjustment.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                inputMode="numeric"
                value={quantity}
                onChange={event => setQuantity(event.target.value)}
                placeholder="0"
              />
            </div>
          )}

          {delta !== 0 ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Balance after: </span>
              <span className="font-semibold tabular-nums text-foreground">{balanceAfter}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                ({delta > 0 ? "+" : ""}
                {delta})
              </span>
            </p>
          ) : null}

          {isAdjustment && balanceAfter < 0 ? (
            <label className="flex items-start gap-2.5 rounded-lg bg-destructive/10 p-3">
              <Checkbox
                checked={allowNegative}
                onCheckedChange={checked => setAllowNegative(checked === true)}
                aria-label="Allow a negative balance"
                className="mt-0.5"
              />
              <span className="text-xs text-destructive">
                I am authorising a negative stock balance for this item.
              </span>
            </label>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="movement-note">Note</Label>
            <Textarea
              id="movement-note"
              rows={2}
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder="Why is stock moving?"
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
            disabled={Boolean(validation) || record.isPending}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              record.mutate({
                inventoryItemId: item!.id,
                movementType: type,
                quantity: delta,
                note: note.trim() || undefined,
                allowNegative: isAdjustment && allowNegative,
              });
            }}
          >
            {record.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Record movement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
