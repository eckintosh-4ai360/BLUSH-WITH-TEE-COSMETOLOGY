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

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank", label: "Bank" },
  { value: "card", label: "Card" },
  { value: "memo", label: "Memo (credit)" },
] as const;

type Method = (typeof METHODS)[number]["value"];

// The fields an edit fills back in.
export type EditableRevamping = {
  id: number;
  revampDate: Date | string;
  clientName: string;
  quantity: number;
  style: string;
  totalAmount: number;
  amountPaid: number;
  amountLeft: number;
  paymentMethod: string;
};

// Today as YYYY-MM-DD in the recorder's own timezone, not UTC.
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const asDateInput = (value: Date | string) => {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// Records one revamping job in the salon register.
export function SaveRevampingDialog({
  open,
  onOpenChange,
  onSaved,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editing?: EditableRevamping | null;
}) {
  const [revampDate, setRevampDate] = useState(today());
  const [clientName, setClientName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [style, setStyle] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [error, setError] = useState<string | null>(null);

  // Seeded when it opens rather than when it closes.
  useEffect(() => {
    if (!open) return;
    setRevampDate(editing ? asDateInput(editing.revampDate) : today());
    setClientName(editing?.clientName ?? "");
    setQuantity(editing ? String(editing.quantity) : "1");
    setStyle(editing?.style ?? "");
    setTotalAmount(editing ? String(editing.totalAmount) : "");
    setAmountPaid(editing ? String(editing.amountPaid) : "");
    setMethod((editing?.paymentMethod as Method | undefined) ?? "cash");
    setError(null);
  }, [open, editing]);

  const save = trpc.revamping.save.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const parsedTotal = Number(totalAmount);
  const parsedPaid = Number(amountPaid);
  const parsedQuantity = Number(quantity);
  // Amount left follows the book: total minus what was paid.
  const amountLeft =
    Number.isFinite(parsedTotal) && Number.isFinite(parsedPaid)
      ? Math.max(round2(parsedTotal - parsedPaid), 0)
      : 0;

  const validation = useMemo(() => {
    if (clientName.trim().length < 2) return "Name the client.";
    if (style.trim().length < 2) return "Say what style was done.";
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      return "Quantity must be a whole number of at least 1.";
    }
    if (!totalAmount.trim()) return "Enter the total amount.";
    if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
      return "The total amount must be a number, and not a negative one.";
    }
    if (!amountPaid.trim()) return "Enter the amount paid.";
    if (!Number.isFinite(parsedPaid) || parsedPaid < 0) {
      return "The amount paid must be a number, and not a negative one.";
    }
    if (parsedPaid > parsedTotal) {
      return "Amount paid cannot be more than the total amount.";
    }
    if (!revampDate) return "Choose the date.";
    return null;
  }, [clientName, style, parsedQuantity, totalAmount, parsedTotal, amountPaid, parsedPaid, revampDate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Correct this record" : "Record a revamping"}</DialogTitle>
          <DialogDescription>
            Date, name, quantity, style, total, paid, and what is left — the way the
            paper register keeps it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="revamp-date">Date</Label>
              <Input
                id="revamp-date"
                type="date"
                value={revampDate}
                max={today()}
                onChange={event => setRevampDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="revamp-name">Name</Label>
              <Input
                id="revamp-name"
                value={clientName}
                onChange={event => setClientName(event.target.value)}
                placeholder="Who it was done for"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="revamp-quantity">Quantity</Label>
              <Input
                id="revamp-quantity"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={quantity}
                onChange={event => setQuantity(event.target.value)}
                placeholder="1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="revamp-style">Style</Label>
              <Input
                id="revamp-style"
                value={style}
                onChange={event => setStyle(event.target.value)}
                placeholder="e.g. Braids, wig install"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="revamp-total">Total amount (GHS)</Label>
              <Input
                id="revamp-total"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={totalAmount}
                onChange={event => setTotalAmount(event.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="revamp-paid">Amount paid (GHS)</Label>
              <Input
                id="revamp-paid"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amountPaid}
                onChange={event => setAmountPaid(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="revamp-method">Paid type</Label>
              <Select value={method} onValueChange={value => setMethod(value as Method)}>
                <SelectTrigger id="revamp-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map(item => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="revamp-left">Amount left</Label>
              <div
                id="revamp-left"
                aria-live="polite"
                className="flex h-9 items-center rounded-md border border-input bg-muted/50 px-3 text-sm tabular-nums"
              >
                {formatMoney(amountLeft)}
              </div>
            </div>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            className="gap-2"
            disabled={Boolean(validation) || save.isPending}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              save.mutate({
                id: editing?.id,
                revampDate,
                clientName: clientName.trim(),
                quantity: parsedQuantity,
                style: style.trim(),
                totalAmount: parsedTotal,
                amountPaid: parsedPaid,
                paymentMethod: method,
              });
            }}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Save changes" : "Record revamping"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
