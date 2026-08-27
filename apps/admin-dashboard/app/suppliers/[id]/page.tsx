"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Banknote, Pencil } from "lucide-react";
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
import { PaySupplierDialog } from "@/components/suppliers/PaySupplierDialog";
import { SaveSupplierDialog } from "@/components/suppliers/SaveSupplierDialog";
import { PO_STATUS_LABEL } from "@/lib/purchaseStatus";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

export default function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <DashboardLayout>
      <PermissionGate anyOf={["suppliers.read"]}>
        <SupplierDetailContent supplierId={Number(id)} />
      </PermissionGate>
    </DashboardLayout>
  );
}

function formatDate(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("en-GB") : "—";
}

/** One supplier: contact details, what is owed, and the purchase history behind it. */
function SupplierDetailContent({ supplierId }: { supplierId: number }) {
  const { can } = usePermissions();
  const [editOpen, setEditOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const query = trpc.inventory.supplierDetail.useQuery(
    { supplierId },
    { enabled: Number.isInteger(supplierId) && supplierId > 0 },
  );

  if (!Number.isInteger(supplierId) || supplierId <= 0) {
    return <p className="p-6 text-sm text-destructive">That is not a valid supplier.</p>;
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

  const data = query.data;
  if (!data) return null;

  const { supplier, purchaseHistory, itemsSupplied, payments } = data;
  const contact = [supplier.phone, supplier.whatsapp, supplier.email].filter(Boolean);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <Link
          href="/suppliers"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All suppliers
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{supplier.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {supplier.company ? <span>{supplier.company}</span> : null}
            {contact.length ? <span>{contact.join(" · ")}</span> : null}
            <Badge variant={supplier.isActive ? "secondary" : "outline"}>
              {supplier.isActive ? "Active" : "Inactive"}
            </Badge>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {can("suppliers.write") ? (
            <Button variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          ) : null}
          {can("purchases.write") ? (
            <Button className="gap-2" onClick={() => setPayOpen(true)}>
              <Banknote className="h-4 w-4" />
              Record payment
            </Button>
          ) : null}
        </div>
      </header>

      <Card className="p-5">
        <dl className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Owed</dt>
            <dd
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                supplier.outstandingBalance > 0 ? "text-destructive" : "text-foreground"
              }`}
            >
              {formatMoney(supplier.outstandingBalance)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Purchase orders
            </dt>
            <dd className="mt-1 text-lg font-medium tabular-nums">{purchaseHistory.length}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Items supplied
            </dt>
            <dd className="mt-1 text-lg font-medium tabular-nums">{itemsSupplied.length}</dd>
          </div>
          {supplier.productsSupplied ? (
            <div className="min-w-[12rem] flex-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Supplies
              </dt>
              <dd className="mt-1 text-sm">{supplier.productsSupplied}</dd>
            </div>
          ) : null}
        </dl>
        {supplier.notes ? (
          <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {supplier.notes}
          </p>
        ) : null}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border/60 px-5 py-4">
          <h2 className="text-sm font-semibold">Purchase orders</h2>
        </div>
        {!purchaseHistory.length ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Nothing has been ordered from this supplier yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseHistory.map(order => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link
                        href={`/purchases/${order.id}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {order.reference}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(order.orderDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {PO_STATUS_LABEL[order.status] ?? order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(order.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(order.amountPaid)}
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
            <h2 className="text-sm font-semibold">Payments made</h2>
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
                    <TableHead>Paid</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map(payment => (
                    <TableRow key={payment.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDate(payment.paidAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {payment.reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(payment.amount)}
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
            <h2 className="text-sm font-semibold">Items supplied</h2>
          </div>
          {!itemsSupplied.length ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No stock item names this supplier.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {itemsSupplied.map(item => (
                <li key={item.id} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-foreground">{item.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <SaveSupplierDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={supplier}
        onSaved={() => {
          toast.success("Supplier updated.");
          query.refetch();
        }}
      />

      <PaySupplierDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        supplierId={supplierId}
        supplierName={supplier.name}
        outstandingBalance={supplier.outstandingBalance}
        orders={purchaseHistory}
        onPaid={() => {
          toast.success("Payment recorded.");
          query.refetch();
        }}
      />
    </div>
  );
}
