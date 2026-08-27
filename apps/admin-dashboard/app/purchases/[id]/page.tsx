"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Banknote, PackageCheck } from "lucide-react";
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
import { ReceiveStockDialog } from "@/components/purchases/ReceiveStockDialog";
import { PaySupplierDialog } from "@/components/suppliers/PaySupplierDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { PO_STATUS_LABEL, PO_STATUS_TONE, canReceive } from "@/lib/purchaseStatus";
import { trpc } from "@/lib/trpc";

export default function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <DashboardLayout>
      <PermissionGate anyOf={["purchases.read"]}>
        <PurchaseOrderDetailContent purchaseOrderId={Number(id)} />
      </PermissionGate>
    </DashboardLayout>
  );
}

function formatDate(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("en-GB") : "—";
}

/** One purchase order: what was ordered, what has arrived, and what is still to pay. */
function PurchaseOrderDetailContent({ purchaseOrderId }: { purchaseOrderId: number }) {
  const { can } = usePermissions();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const query = trpc.inventory.purchaseOrderDetail.useQuery(
    { purchaseOrderId },
    { enabled: Number.isInteger(purchaseOrderId) && purchaseOrderId > 0 },
  );

  if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
    return <p className="p-6 text-sm text-destructive">That is not a valid order.</p>;
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

  const order = query.data;
  if (!order) return null;

  const unpaid = order.total - order.amountPaid;
  const stillOutstanding = order.items.some(
    item => item.quantityReceived < item.quantityOrdered,
  );
  const receivable = canReceive(order.status) && stillOutstanding;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <Link
          href="/purchases"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All purchase orders
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {order.reference}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link
              href={`/suppliers/${order.supplierId}`}
              className="text-primary hover:underline"
            >
              {order.supplierName}
            </Link>
            <span aria-hidden>·</span>
            <span>Ordered {formatDate(order.orderDate)}</span>
            {order.expectedDate ? (
              <>
                <span aria-hidden>·</span>
                <span>Expected {formatDate(order.expectedDate)}</span>
              </>
            ) : null}
            <Badge variant="secondary" className={PO_STATUS_TONE[order.status]}>
              {PO_STATUS_LABEL[order.status] ?? order.status}
            </Badge>
          </p>
        </div>

        {can("purchases.write") ? (
          <div className="flex flex-wrap gap-2">
            {unpaid > 0 ? (
              <Button variant="outline" className="gap-2" onClick={() => setPayOpen(true)}>
                <Banknote className="h-4 w-4" />
                Pay supplier
              </Button>
            ) : null}
            {receivable ? (
              <Button className="gap-2" onClick={() => setReceiveOpen(true)}>
                <PackageCheck className="h-4 w-4" />
                Receive stock
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <Card className="p-5">
        <dl className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Total</dt>
            <dd className="mt-1 text-lg font-medium tabular-nums">
              {formatMoney(order.total)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Paid</dt>
            <dd className="mt-1 text-lg font-medium tabular-nums">
              {formatMoney(order.amountPaid)}
            </dd>
          </div>
          <div className="ml-auto text-right">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Still to pay
            </dt>
            <dd
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                unpaid > 0 ? "text-destructive" : "text-foreground"
              }`}
            >
              {formatMoney(unpaid)}
            </dd>
          </div>
        </dl>
        {order.notes ? (
          <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {order.notes}
          </p>
        ) : null}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border/60 px-5 py-4">
          <h2 className="text-sm font-semibold">Lines</h2>
          <p className="text-xs text-muted-foreground">
            Received counts come from stock movements, so they always match the ledger.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                <TableHead className="text-right">Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map(item => {
                const remaining = item.quantityOrdered - item.quantityReceived;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-foreground">
                      {item.itemName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.quantityOrdered}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.quantityReceived}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {remaining > 0 ? (
                        <span className="font-semibold text-foreground">{remaining}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(item.unitCost)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(item.lineTotal)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ReceiveStockDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        purchaseOrderId={purchaseOrderId}
        reference={order.reference}
        lines={order.items}
        onReceived={fullyReceived => {
          toast.success(
            fullyReceived
              ? "Stock received. This order is now complete."
              : "Stock received against this order.",
          );
          query.refetch();
        }}
      />

      <PaySupplierDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        supplierId={order.supplierId}
        supplierName={order.supplierName}
        outstandingBalance={unpaid}
        orders={[order]}
        onPaid={() => {
          toast.success("Payment recorded.");
          query.refetch();
        }}
      />
    </div>
  );
}
