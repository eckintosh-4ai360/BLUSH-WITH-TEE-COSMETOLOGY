"use client";

import { useState } from "react";
import { Loader2, Pencil, Trash2, X, Check } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@blush/ui/components/ui/dialog";
import { Input } from "@blush/ui/components/ui/input";
import { Badge } from "@blush/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@blush/ui/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@blush/ui/components/ui/tabs";
import { toast } from "@blush/ui/components/ui/sonner";
import { formatMoney } from "@blush/ui/lib/viz";
import { trpc } from "@/lib/trpc";

// Types.

export type EditableAdjustment = {
  id: number;
  adjustmentType: "discount" | "surcharge";
  amount: number;
  reason: string;
  createdAt: Date | string | null;
};

export type EditableCharge = {
  id: number;
  description: string;
  feeType: string;
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: string;
};

// Helpers.

function formatDate(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("en-GB") : "—";
}

// Inline row editors.

function AdjustmentRow({
  adjustment,
  onSaved,
}: {
  adjustment: EditableAdjustment;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(adjustment.amount));
  const [reason, setReason] = useState(adjustment.reason);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = trpc.finance.updateAdjustment.useMutation({
    onSuccess: () => {
      toast.success("Adjustment updated.");
      setEditing(false);
      onSaved();
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = trpc.finance.deleteAdjustment.useMutation({
    onSuccess: () => {
      toast.success("Adjustment removed.");
      onSaved();
    },
    onError: (err) => toast.error(err.message),
  });

  const parsedAmount = Number(amount);
  const canSave =
    amount.trim() !== "" &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    reason.trim().length >= 2;

  if (editing) {
    return (
      <TableRow className="bg-muted/30">
        <TableCell>
          <Badge variant="outline" className="capitalize">
            {adjustment.adjustmentType}
          </Badge>
        </TableCell>
        <TableCell>
          <Input
            id={`adj-reason-${adjustment.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-7 text-sm"
            placeholder="Reason (required)"
          />
        </TableCell>
        <TableCell className="text-muted-foreground">
          {formatDate(adjustment.createdAt)}
        </TableCell>
        <TableCell className="text-right">
          <Input
            id={`adj-amount-${adjustment.id}`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-7 w-28 text-right text-sm ml-auto"
            placeholder="0.00"
          />
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setEditing(false)}
              aria-label="Cancel edit"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-green-600 hover:text-green-700"
              disabled={!canSave || update.isPending}
              onClick={() =>
                update.mutate({
                  id: adjustment.id,
                  amount: parsedAmount,
                  reason: reason.trim(),
                })
              }
              aria-label="Save adjustment"
            >
              {update.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <Badge variant="outline" className="capitalize">
          {adjustment.adjustmentType}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">{adjustment.reason}</TableCell>
      <TableCell className="text-muted-foreground">
        {formatDate(adjustment.createdAt)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatMoney(adjustment.amount)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {/* Edit button. */}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setAmount(String(adjustment.amount));
              setReason(adjustment.reason);
              setConfirmDelete(false);
              setEditing(true);
            }}
            aria-label={`Edit adjustment ${adjustment.id}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>

          {/* Delete — requires a second click to confirm. */}
          {confirmDelete ? (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => setConfirmDelete(false)}
                aria-label="Cancel delete"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive hover:text-destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: adjustment.id })}
                aria-label="Confirm remove adjustment"
              >
                {remove.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              aria-label={`Remove adjustment ${adjustment.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function ChargeRow({
  charge,
  onSaved,
}: {
  charge: EditableCharge;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amountDue, setAmountDue] = useState(String(charge.amountDue));
  const [description, setDescription] = useState(charge.description);

  const update = trpc.finance.updateCharge.useMutation({
    onSuccess: () => {
      toast.success("Charge updated.");
      setEditing(false);
      onSaved();
    },
    onError: (err) => toast.error(err.message),
  });

  const parsedAmount = Number(amountDue);
  const canSave =
    amountDue.trim() !== "" &&
    Number.isFinite(parsedAmount) &&
    parsedAmount >= 0 &&
    description.trim().length >= 2;

  if (editing) {
    return (
      <TableRow className="bg-muted/30">
        <TableCell>
          <Input
            id={`charge-desc-${charge.id}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-7 text-sm"
            placeholder="Description"
          />
        </TableCell>
        <TableCell className="capitalize text-muted-foreground">
          {charge.feeType}
        </TableCell>
        <TableCell className="text-right">
          <Input
            id={`charge-amount-${charge.id}`}
            inputMode="decimal"
            value={amountDue}
            onChange={(e) => setAmountDue(e.target.value)}
            className="h-7 w-28 text-right text-sm ml-auto"
            placeholder="0.00"
          />
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          {formatMoney(charge.amountPaid)}
        </TableCell>
        <TableCell className="text-right tabular-nums font-medium">
          {formatMoney(charge.balance)}
        </TableCell>
        <TableCell>
          <Badge
            variant={charge.balance > 0 ? "outline" : "secondary"}
            className="capitalize"
          >
            {charge.status}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setEditing(false)}
              aria-label="Cancel edit charge"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-green-600 hover:text-green-700"
              disabled={!canSave || update.isPending}
              onClick={() =>
                update.mutate({
                  id: charge.id,
                  amountDue: parsedAmount,
                  description: description.trim(),
                })
              }
              aria-label="Save charge"
            >
              {update.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">
        {charge.description}
      </TableCell>
      <TableCell className="capitalize text-muted-foreground">
        {charge.feeType}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatMoney(charge.amountDue)}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {formatMoney(charge.amountPaid)}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {formatMoney(charge.balance)}
      </TableCell>
      <TableCell>
        <Badge
          variant={charge.balance > 0 ? "outline" : "secondary"}
          className="capitalize"
        >
          {charge.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setAmountDue(String(charge.amountDue));
            setDescription(charge.description);
            setEditing(true);
          }}
          aria-label={`Edit charge ${charge.id}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

// Main dialog Admin-only dialog that lets an administrator correct billing records.
export function EditAccountDialog({
  open,
  onOpenChange,
  onSaved,
  studentName,
  adjustments,
  charges,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  studentName: string;
  adjustments: EditableAdjustment[];
  charges: EditableCharge[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit account
            <Badge variant="secondary" className="text-xs font-normal">
              Admin only
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Correct billing records for {studentName}. Every change is saved to
            the audit log with the original value.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="adjustments" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="adjustments" className="flex-1">
              Adjustments ({adjustments.length})
            </TabsTrigger>
            <TabsTrigger value="charges" className="flex-1">
              Charges ({charges.length})
            </TabsTrigger>
          </TabsList>

          {}
          {/* Adjustments tab. */}
          {}
          <TabsContent value="adjustments" className="mt-4">
            {!adjustments.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No discounts or surcharges on this account yet.
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs text-muted-foreground">
                  Click <Pencil className="inline h-3 w-3" /> to edit an amount
                  or reason. Click <Trash2 className="inline h-3 w-3" /> (then
                  confirm) to permanently remove a mistaken row.
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Applied</TableHead>
                        <TableHead className="text-right">Amount (GHS)</TableHead>
                        <TableHead className="w-24" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adjustments.map((adj) => (
                        <AdjustmentRow
                          key={adj.id}
                          adjustment={adj}
                          onSaved={onSaved}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </TabsContent>

          {}
          {/* Charges tab. */}
          {}
          <TabsContent value="charges" className="mt-4">
            {!charges.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No charges have been billed to this student yet.
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs text-muted-foreground">
                  Click <Pencil className="inline h-3 w-3" /> to correct the
                  billed amount or description on a charge. The outstanding
                  balance updates automatically.
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Billed (GHS)</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {charges.map((charge) => (
                        <ChargeRow
                          key={charge.id}
                          charge={charge}
                          onSaved={onSaved}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
