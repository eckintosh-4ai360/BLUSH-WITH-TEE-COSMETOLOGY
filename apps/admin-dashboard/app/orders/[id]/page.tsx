"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CreditCard,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Printer,
  Undo2,
} from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@blush/ui/components/ui/alert-dialog";
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { toast } from "@blush/ui/components/ui/sonner";
import { formatMoney } from "@blush/ui/lib/viz";
import DashboardLayout from "@/components/DashboardLayout";
import { PermissionGate } from "@/components/PermissionGate";
import { RecordOrderPaymentDialog } from "@/components/orders/RecordOrderPaymentDialog";
import { RefundOrderDialog } from "@/components/orders/RefundOrderDialog";
import {
  FULFILLMENT_TONE,
  NEXT_STATUSES,
  STATUS_ACTION_LABEL,
  type FulfillmentStatus,
} from "@/lib/orderStatus";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <DashboardLayout>
      <PermissionGate anyOf={["orders.read"]}>
        <OrderDetail orderId={Number(id)} />
      </PermissionGate>
    </DashboardLayout>
  );
}

function OrderDetail({ orderId }: { orderId: number }) {
  const { can } = usePermissions();
  const [payOpen, setPayOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<FulfillmentStatus | null>(null);

  const query = trpc.orders.detail.useQuery({ orderId }, { enabled: Number.isFinite(orderId) });

  const updateStatus = trpc.orders.updateStatus.useMutation({
    onSuccess: result => {
      toast.success(`Order moved to ${result.status}.`);
      setPendingStatus(null);
      query.refetch();
    },
    onError: error => {
      toast.error(error.message);
      setPendingStatus(null);
    },
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h1 className="text-xl font-semibold text-foreground">This order could not be loaded</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {query.error?.message ?? "It may have been removed."}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/orders">Back to orders</Link>
        </Button>
      </div>
    );
  }

  const order = query.data;
  const status = order.fulfillmentStatus as FulfillmentStatus;
  const nextStatuses = NEXT_STATUSES[status] ?? [];
  const canWrite = can("orders.write");
  const refundable = order.paymentStatus === "paid";

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/orders"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All orders
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {order.orderNumber}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Placed {new Date(order.createdAt).toLocaleString("en-GB")}</span>
            <Badge
              variant={order.paymentStatus === "paid" ? "secondary" : "outline"}
              className="capitalize"
            >
              {order.paymentStatus}
            </Badge>
            <Badge className={`capitalize ${FULFILLMENT_TONE[status] ?? ""}`}>{status}</Badge>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print invoice
          </Button>

          {canWrite && order.paymentStatus !== "paid" ? (
            <Button className="gap-2" onClick={() => setPayOpen(true)}>
              <CreditCard className="h-4 w-4" />
              Record payment
            </Button>
          ) : null}

          {canWrite && refundable ? (
            <Button variant="outline" className="gap-2" onClick={() => setRefundOpen(true)}>
              <Undo2 className="h-4 w-4" />
              Refund
            </Button>
          ) : null}
        </div>
      </div>

      {canWrite && nextStatuses.length ? (
        <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card p-4">
          <span className="mr-1 text-sm text-muted-foreground">Move this order on:</span>
          {nextStatuses.map(next => (
            <Button
              key={next}
              size="sm"
              variant={next === "cancelled" ? "outline" : "default"}
              className={next === "cancelled" ? "text-destructive" : undefined}
              disabled={updateStatus.isPending}
              onClick={() => setPendingStatus(next)}
            >
              {updateStatus.isPending && pendingStatus === next ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {STATUS_ACTION_LABEL[next]}
            </Button>
          ))}
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Items</h2>
            <ul className="mt-4 divide-y divide-border/50">
              {order.items.map(item => (
                <li key={item.id} className="flex items-center justify-between gap-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{item.itemName}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {item.quantity} x {formatMoney(item.unitPrice)}
                      {item.quantityReturned > 0
                        ? ` - ${item.quantityReturned} returned`
                        : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                    {formatMoney(item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-1.5 border-t border-border/60 pt-4 text-sm">
              <Row label="Subtotal" value={formatMoney(order.subtotal)} />
              {order.discount > 0 ? (
                <Row label="Discount" value={`- ${formatMoney(order.discount)}`} />
              ) : null}
              {order.deliveryFee > 0 ? (
                <Row label="Delivery" value={formatMoney(order.deliveryFee)} />
              ) : null}
              <div className="flex justify-between border-t border-border/60 pt-2">
                <dt className="font-semibold text-foreground">Total</dt>
                <dd className="font-semibold tabular-nums text-foreground">
                  {formatMoney(order.total)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Timeline</h2>
            {!order.timeline.length ? (
              <p className="mt-3 text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <ol className="mt-4 space-y-4">
                {order.timeline.map(event => (
                  <li key={event.id} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-foreground">
                        {event.fromStatus
                          ? `Moved from ${event.fromStatus} to ${event.toStatus}`
                          : `Set to ${event.toStatus}`}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString("en-GB")}
                        {event.actor ? ` by ${event.actor}` : ""}
                      </span>
                      {event.note ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {event.note}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Customer</h2>
            <p className="mt-3 text-sm font-medium text-foreground">{order.customerName}</p>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{order.customerEmail}</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {order.customerPhone}
              </li>
              {order.deliveryAddress ? (
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{order.deliveryAddress}</span>
                </li>
              ) : null}
            </ul>

            {order.customer ? (
              <p className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                {order.customer.totalOrders} paid order
                {order.customer.totalOrders === 1 ? "" : "s"} totalling{" "}
                {formatMoney(order.customer.totalSpent)}
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Payments</h2>
            {!order.payments.length ? (
              <p className="mt-3 text-sm text-muted-foreground">Nothing captured yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {order.payments.map(payment => (
                  <li key={payment.id} className="text-sm">
                    <span className="flex justify-between gap-2">
                      <span className="text-foreground">{payment.reference}</span>
                      <span className="font-medium tabular-nums">
                        {formatMoney(payment.amount)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
                      {payment.paymentMethod.replaceAll("_", " ")} ·{" "}
                      {new Date(payment.paidAt).toLocaleDateString("en-GB")}
                      {payment.refundedAmount > 0
                        ? ` · ${formatMoney(payment.refundedAmount)} refunded`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <AlertDialog
        open={pendingStatus !== null}
        onOpenChange={open => !open && setPendingStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatus === "cancelled"
                ? "Cancel this order?"
                : `Move to ${pendingStatus}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus === "cancelled"
                ? "Any stock reserved for this order is returned to the shelf. This cannot be undone."
                : "The change is recorded on the order timeline, and the customer is notified where appropriate."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as is</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                pendingStatus && updateStatus.mutate({ orderId, status: pendingStatus })
              }
            >
              {pendingStatus === "cancelled" ? "Cancel order" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecordOrderPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        orderId={orderId}
        amountDue={order.total}
        onRecorded={() => {
          toast.success("Payment recorded. Stock has been deducted.");
          query.refetch();
        }}
      />

      <RefundOrderDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        orderId={orderId}
        maxAmount={order.total}
        onRefunded={() => {
          toast.success("Refund recorded.");
          query.refetch();
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
