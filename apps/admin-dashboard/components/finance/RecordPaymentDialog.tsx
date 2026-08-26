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

const METHODS = ["cash", "mobile_money", "bank", "card", "online"] as const;

/**
 * Records a payment against a student account.
 *
 * The form only gathers input; the server does the allocation, the ledger
 * entry, and the balance update in one transaction. Validation errors from
 * the API are shown inline rather than swallowed (§53).
 */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  onRecorded,
  studentId: fixedStudentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
  studentId?: number;
}) {
  const [studentQuery, setStudentQuery] = useState("");
  const [studentId, setStudentId] = useState<number | null>(fixedStudentId ?? null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash");
  const [transactionReference, setTransactionReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset on every open/close, not just on close: the caller usually supplies
  // `studentId` at the same moment it flips `open`, so seeding the state on
  // mount alone would leave the form stuck on "Choose a student".
  useEffect(() => {
    setStudentQuery("");
    setStudentId(fixedStudentId ?? null);
    setAmount("");
    setMethod("cash");
    setTransactionReference("");
    setNote("");
    setError(null);
  }, [open, fixedStudentId]);

  const search = trpc.dashboard.search.useQuery(
    { term: studentQuery },
    { enabled: !fixedStudentId && studentQuery.trim().length >= 2 },
  );

  const account = trpc.finance.studentAccount.useQuery(
    { studentId: studentId ?? 0 },
    { enabled: Boolean(studentId) },
  );

  const record = trpc.finance.recordStudentPayment.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onRecorded();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const parsedAmount = Number(amount);
  const outstanding = account.data?.summary.outstanding ?? 0;

  const validation = useMemo(() => {
    if (!studentId) return "Choose a student.";
    if (!amount.trim()) return "Enter an amount.";
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return "Amount must be a positive number.";
    }
    if (method !== "cash" && !transactionReference.trim()) {
      return "A transaction reference is required for non-cash payments.";
    }
    return null;
  }, [studentId, amount, parsedAmount, method, transactionReference]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            The amount is allocated to the oldest open charges first.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!fixedStudentId ? (
            <div className="space-y-2">
              <Label htmlFor="student">Student</Label>
              <Input
                id="student"
                value={studentQuery}
                onChange={event => {
                  setStudentQuery(event.target.value);
                  setStudentId(null);
                }}
                placeholder="Search by name or student number"
                autoComplete="off"
              />
              {studentQuery.trim().length >= 2 && !studentId ? (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60">
                  {search.isLoading ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Searching...</p>
                  ) : !search.data?.students.length ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No students found.</p>
                  ) : (
                    search.data.students.map(student => (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => {
                          setStudentId(student.id);
                          setStudentQuery(student.label);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        {student.label}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {studentId && account.data ? (
            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <p className="text-foreground">{account.data.student.fullName}</p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Billed</dt>
                  <dd className="font-medium">{formatMoney(account.data.summary.totalFees)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Paid</dt>
                  <dd className="font-medium">{formatMoney(account.data.summary.amountPaid)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Outstanding</dt>
                  <dd className="font-semibold text-foreground">{formatMoney(outstanding)}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (GHS)</Label>
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={event => setAmount(event.target.value)}
                placeholder="0.00"
              />
              {outstanding > 0 ? (
                <button
                  type="button"
                  onClick={() => setAmount(outstanding.toFixed(2))}
                  className="text-xs text-primary hover:underline"
                >
                  Pay full balance ({formatMoney(outstanding)})
                </button>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="method">Method</Label>
              <Select value={method} onValueChange={value => setMethod(value as typeof method)}>
                <SelectTrigger id="method">
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
            <Label htmlFor="transaction">
              Transaction reference{method === "cash" ? " (optional)" : ""}
            </Label>
            <Input
              id="transaction"
              value={transactionReference}
              onChange={event => setTransactionReference(event.target.value)}
              placeholder="e.g. MoMo transaction ID"
            />
            <p className="text-xs text-muted-foreground">
              References are unique: recording the same one twice is rejected.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={event => setNote(event.target.value)}
              rows={2}
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
            disabled={Boolean(validation) || record.isPending}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              record.mutate({
                studentId: studentId!,
                amount: parsedAmount,
                paymentMethod: method,
                transactionReference: transactionReference.trim() || undefined,
                note: note.trim() || undefined,
              });
            }}
            className="gap-2"
          >
            {record.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
