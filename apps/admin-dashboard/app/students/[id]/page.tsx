"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Percent, Plus, Printer, Receipt } from "lucide-react";
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
import { AddChargeDialog } from "@/components/finance/AddChargeDialog";
import { AdjustAccountDialog } from "@/components/finance/AdjustAccountDialog";
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog";
import { useDocuments } from "@/hooks/useDocuments";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

export default function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <DashboardLayout>
      <PermissionGate anyOf={["fees.read"]}>
        <StudentDetailContent studentId={Number(id)} />
      </PermissionGate>
    </DashboardLayout>
  );
}

function formatDate(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("en-GB") : "—";
}

/**
 * One student's fee account: the equation from §24, the charges behind it, and
 * every payment and adjustment that moved it.
 */
function StudentDetailContent({ studentId }: { studentId: number }) {
  const { can } = usePermissions();
  const documents = useDocuments();
  const [chargeOpen, setChargeOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const query = trpc.finance.studentAccount.useQuery(
    { studentId },
    { enabled: Number.isInteger(studentId) && studentId > 0 },
  );

  if (!Number.isInteger(studentId) || studentId <= 0) {
    return <p className="p-6 text-sm text-destructive">That is not a valid student.</p>;
  }

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.error) {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        {query.error.message}
      </p>
    );
  }

  const account = query.data;
  if (!account) return null;

  const { student, summary, charges, adjustments, payments } = account;
  const openCharges = charges.filter(charge => charge.balance > 0);

  const refresh = () => query.refetch();

  const figures = [
    { label: "Billed", value: summary.totalFees },
    { label: "Discounts", value: summary.discounts },
    { label: "Surcharges", value: summary.additionalCharges },
    { label: "Paid", value: summary.amountPaid },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <Link
          href="/students"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All students
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{student.fullName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{student.studentNumber}</span>
            <span aria-hidden>·</span>
            <span>{student.email}</span>
            <span aria-hidden>·</span>
            <span>{student.phone}</span>
            <Badge variant="outline" className="capitalize">
              {student.status}
            </Badge>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            disabled={!documents.ready}
            onClick={() =>
              documents.feeStatement({
                studentName: student.fullName,
                studentNumber: student.studentNumber,
                summary,
                charges,
                payments,
              })
            }
          >
            <FileText className="h-4 w-4" />
            Statement
          </Button>
          {can("fees.write") ? (
            <>
              <Button variant="outline" className="gap-2" onClick={() => setChargeOpen(true)}>
                <Plus className="h-4 w-4" />
                Add charge
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setAdjustOpen(true)}>
                <Percent className="h-4 w-4" />
                Adjust
              </Button>
            </>
          ) : null}
          {can("payments.write") ? (
            <Button className="gap-2" onClick={() => setPayOpen(true)}>
              <Receipt className="h-4 w-4" />
              Record payment
            </Button>
          ) : null}
        </div>
      </header>

      {/* Billed - discounts + surcharges - paid = outstanding. Laid out in that
          order so the figure at the end is arrived at rather than asserted. */}
      <Card className="p-5">
        <dl className="flex flex-wrap items-end gap-x-8 gap-y-4">
          {figures.map(figure => (
            <div key={figure.label}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {figure.label}
              </dt>
              <dd className="mt-1 text-lg font-medium tabular-nums">
                {formatMoney(figure.value)}
              </dd>
            </div>
          ))}
          <div className="ml-auto text-right">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Outstanding
            </dt>
            <dd
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                summary.outstanding > 0 ? "text-destructive" : "text-foreground"
              }`}
            >
              {formatMoney(summary.outstanding)}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border/60 px-5 py-4">
          <h2 className="text-sm font-semibold">Charges</h2>
          <p className="text-xs text-muted-foreground">
            What the student has been billed, oldest due date first.
          </p>
        </div>
        {!charges.length ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Nothing has been billed to this student yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charges.map(charge => (
                  <TableRow key={charge.id}>
                    <TableCell className="font-medium text-foreground">
                      {charge.description}
                    </TableCell>
                    <TableCell className="capitalize">{charge.feeType}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(charge.dueDate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(charge.amountDue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(charge.amountPaid)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border/60 px-5 py-4">
            <h2 className="text-sm font-semibold">Payments</h2>
          </div>
          {!payments.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No payments recorded.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map(payment => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-mono text-xs">{payment.reference}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(payment.paidAt)}
                      </TableCell>
                      <TableCell className="capitalize">
                        {payment.paymentMethod.replaceAll("_", " ")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(payment.amount)}
                        {payment.refundedAmount > 0 ? (
                          <span className="block text-xs text-destructive">
                            {formatMoney(payment.refundedAmount)} refunded
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Print receipt ${payment.reference}`}
                          disabled={!documents.ready}
                          onClick={() =>
                            documents.paymentReceipt({
                              reference: payment.reference,
                              amount: payment.amount,
                              refundedAmount: payment.refundedAmount,
                              paymentMethod: payment.paymentMethod,
                              paidAt: payment.paidAt,
                              transactionReference: payment.transactionReference,
                              note: payment.note,
                              studentName: student.fullName,
                              studentNumber: student.studentNumber,
                            })
                          }
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-border/60 px-5 py-4">
            <h2 className="text-sm font-semibold">Adjustments</h2>
            <p className="text-xs text-muted-foreground">
              Discounts and surcharges, with the reason each was given.
            </p>
          </div>
          {!adjustments.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No adjustments applied.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Applied</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.map(adjustment => (
                    <TableRow key={adjustment.id}>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {adjustment.adjustmentType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {adjustment.reason}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(adjustment.createdAt)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(adjustment.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <AddChargeDialog
        open={chargeOpen}
        onOpenChange={setChargeOpen}
        studentId={studentId}
        studentName={student.fullName}
        onSaved={() => {
          toast.success("Charge added.");
          refresh();
        }}
      />

      <AdjustAccountDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        studentId={studentId}
        studentName={student.fullName}
        charges={openCharges.map(charge => ({
          id: charge.id,
          description: charge.description,
          balance: charge.balance,
        }))}
        onSaved={() => {
          toast.success("Adjustment recorded.");
          refresh();
        }}
      />

      <RecordPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        studentId={studentId}
        onRecorded={() => {
          toast.success("Payment recorded and the balance updated.");
          setPayOpen(false);
          refresh();
        }}
      />
    </div>
  );
}
