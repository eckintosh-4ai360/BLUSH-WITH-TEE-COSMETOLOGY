"use client";

import { useState } from "react";
import { Pencil, Plus, Users } from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { Card } from "@blush/ui/components/ui/card";
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { toast } from "@blush/ui/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@blush/ui/components/ui/table";
import { formatMoney } from "@blush/ui/lib/viz";
import DashboardLayout from "@/components/DashboardLayout";
import { PermissionGate } from "@/components/PermissionGate";
import {
  FeeStructureDialog,
  type FeeStructure,
} from "@/components/finance/FeeStructureDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

export default function FeeStructuresPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["fees.read"]}>
        <FeeStructuresContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

/**
 * The fee catalogue.
 *
 * Deliberately not a DataTable: this is a configuration screen with one row
 * per programme and fee type, not a report. Paging and export would be noise
 * on a list that fits on a screen.
 */
function FeeStructuresContent() {
  const { can } = usePermissions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FeeStructure | null>(null);

  const query = trpc.finance.feeStructures.useQuery();
  const rows = query.data ?? [];
  const writable = can("fees.write");

  /**
   * Adding a fee here does not bill anybody on its own, and should not: a
   * price list is edited, corrected and thought about, and re-billing the
   * school on every keystroke would be indefensible. This is the deliberate
   * step that carries the current list onto the students already enrolled.
   */
  const applyToStudents = trpc.finance.applyFeeStructures.useMutation({
    onSuccess: result => {
      const billed = result.raised + result.repaired;
      if (!billed && !result.reallocated) {
        toast.info("Every student is already billed for this price list.");
        return;
      }
      toast.success(
        `Billed ${billed} charge${billed === 1 ? "" : "s"} to ${result.students} student${result.students === 1 ? "" : "s"}.`,
      );
    },
    onError: error => toast.error(error.message),
  });

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (row: FeeStructure) => {
    setEditing(row);
    setDialogOpen(true);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fee structure</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What each programme costs. Charges raised against a student are copied from
            these, so changing one here never rewrites a bill already issued. Use
            <b> Apply to students</b> to charge a newly added fee to the students
            already enrolled.
          </p>
        </div>
        {writable ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              disabled={applyToStudents.isPending || !rows.length}
              title="Raises any fee on this list that an enrolled student has not been charged yet. Safe to run more than once."
              onClick={() => applyToStudents.mutate()}
            >
              <Users className="h-4 w-4" />
              {applyToStudents.isPending ? "Applying..." : "Apply to students"}
            </Button>
            <Button className="gap-2" onClick={openNew}>
              <Plus className="h-4 w-4" />
              Add fee
            </Button>
          </div>
        ) : null}
      </header>

      <Card className="overflow-hidden p-0">
        {query.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : query.error ? (
          <p role="alert" className="p-6 text-sm text-destructive">
            {query.error.message}
          </p>
        ) : !rows.length ? (
          <div className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No fees are configured yet.
            </p>
            {writable ? (
              <Button variant="outline" className="mt-4 gap-2" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Add the first one
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee</TableHead>
                  <TableHead>Programme</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Due after</TableHead>
                  <TableHead>Status</TableHead>
                  {writable ? <TableHead className="w-0" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id} className={row.isActive ? undefined : "opacity-60"}>
                    <TableCell className="font-medium text-foreground">{row.label}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.courseTitle ?? "All programmes"}
                    </TableCell>
                    <TableCell className="capitalize">{row.feeType}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.dueOffsetDays === 0
                        ? "Immediately"
                        : `${row.dueOffsetDays} day${row.dueOffsetDays === 1 ? "" : "s"}`}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        <Badge variant={row.isActive ? "secondary" : "outline"}>
                          {row.isActive ? "Active" : "Retired"}
                        </Badge>
                        {row.isMandatory ? null : <Badge variant="outline">Optional</Badge>}
                      </span>
                    </TableCell>
                    {writable ? (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <FeeStructureDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => {
          toast.success(editing ? "Fee updated." : "Fee added.");
          query.refetch();
        }}
      />
    </div>
  );
}
