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
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

const CATEGORIES = [
  "rent",
  "utilities",
  "salaries",
  "transport",
  "equipment",
  "beauty_products",
  "maintenance",
  "marketing",
  "stationery",
  "cleaning",
  "other",
] as const;

const METHODS = ["cash", "mobile_money", "bank", "card", "online"] as const;

const today = () => new Date().toISOString().slice(0, 10);

/** The fields an edit fills back in. Everything else is set by the server. */
export type EditableExpense = {
  id: number;
  title: string;
  category: string;
  amount: number;
  expenseDate: Date | string;
  vendor: string | null;
  paymentMethod: string;
  note: string | null;
  approvalStatus: string;
};

const asDateInput = (value: Date | string) =>
  new Date(value).toISOString().slice(0, 10);

/** Falls back rather than throwing: an older row may hold a value since retired. */
const asOption = <T extends readonly string[]>(
  options: T,
  value: string | undefined,
  fallback: T[number],
): T[number] => ((options as readonly string[]).includes(value ?? "") ? (value as T[number]) : fallback);

export function SaveExpenseDialog({
  open,
  onOpenChange,
  onSaved,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Present when correcting an existing expense rather than recording one. */
  editing?: EditableExpense | null;
}) {
  const { can } = usePermissions();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("other");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(today());
  const [vendor, setVendor] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Seeded when it opens rather than when it closes, so reopening on a
  // different row never shows the previous one's figures for a frame.
  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setCategory(asOption(CATEGORIES, editing?.category, "other"));
    setAmount(editing ? String(editing.amount) : "");
    setExpenseDate(editing ? asDateInput(editing.expenseDate) : today());
    setVendor(editing?.vendor ?? "");
    setMethod(asOption(METHODS, editing?.paymentMethod, "cash"));
    setNote(editing?.note ?? "");
    setError(null);
  }, [open, editing]);

  const onDone = () => {
    onOpenChange(false);
    onSaved();
  };

  const create = trpc.finance.addExpense.useMutation({
    onSuccess: onDone,
    onError: mutationError => setError(mutationError.message),
  });

  const update = trpc.finance.updateExpense.useMutation({
    onSuccess: onDone,
    onError: mutationError => setError(mutationError.message),
  });

  const save = editing ? update : create;

  const parsedAmount = Number(amount);

  const validation = useMemo(() => {
    if (title.trim().length < 2) return "Give the expense a title.";
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return "Amount must be a positive number.";
    }
    if (!expenseDate) return "Choose the date of the expense.";
    return null;
  }, [title, parsedAmount, expenseDate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit expense" : "Add an expense"}</DialogTitle>
          <DialogDescription>
            {can("expenses.approve")
              ? editing
                ? "Your changes keep the approval this expense already has."
                : "This will be recorded as approved."
              : editing && editing.approvalStatus === "approved"
                ? "Editing an approved expense sends it back for approval."
                : "This will be held for approval by a finance administrator."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="expense-title">Title</Label>
            <Input
              id="expense-title"
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder="e.g. Studio rent"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expense-category">Category</Label>
              <Select
                value={category}
                onValueChange={value => setCategory(value as typeof category)}
              >
                <SelectTrigger id="expense-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(item => (
                    <SelectItem key={item} value={item} className="capitalize">
                      {item.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-amount">Amount (GHS)</Label>
              <Input
                id="expense-amount"
                inputMode="decimal"
                value={amount}
                onChange={event => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-date">Date</Label>
              <Input
                id="expense-date"
                type="date"
                value={expenseDate}
                max={today()}
                onChange={event => setExpenseDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-method">Paid by</Label>
              <Select value={method} onValueChange={value => setMethod(value as typeof method)}>
                <SelectTrigger id="expense-method">
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-vendor">Vendor (optional)</Label>
            <Input
              id="expense-vendor"
              value={vendor}
              onChange={event => setVendor(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-note">Description (optional)</Label>
            <Textarea
              id="expense-note"
              rows={2}
              value={note}
              onChange={event => setNote(event.target.value)}
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
            disabled={Boolean(validation) || save.isPending}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              const fields = {
                title: title.trim(),
                category,
                amount: parsedAmount,
                expenseDate: new Date(expenseDate),
                vendor: vendor.trim() || undefined,
                paymentMethod: method,
                note: note.trim() || undefined,
              };

              if (editing) update.mutate({ expenseId: editing.id, ...fields });
              else create.mutate({ ...fields, requiresApproval: false });
            }}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Save changes" : "Save expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
