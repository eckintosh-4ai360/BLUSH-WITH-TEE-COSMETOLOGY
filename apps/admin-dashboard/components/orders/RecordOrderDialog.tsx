"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { Switch } from "@blush/ui/components/ui/switch";
import { Textarea } from "@blush/ui/components/ui/textarea";
import { formatMoney } from "@blush/ui/lib/viz";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank transfer" },
] as const;

const HANDOVER = [
  { value: "collected", label: "Handed over now", hint: "The customer has the goods. The order is marked delivered." },
  { value: "pickup", label: "Customer will collect", hint: "Stock is set aside and the order waits as confirmed." },
  { value: "delivery", label: "Deliver to the customer", hint: "Stock is set aside and the order waits as confirmed." },
] as const;

type Handover = (typeof HANDOVER)[number]["value"];
type Method = (typeof METHODS)[number]["value"];
type Line = { inventoryItemId: number; quantity: string };

// A whole number of pesewas, so the preview adds up the way the server does.
const minor = (value: number) => Math.round(value * 100);

// Records an order taken at the counter, by phone or in person.
export function RecordOrderDialog({
  open,
  onOpenChange,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: (order: { id: number; orderNumber: string }) => void;
}) {
  const { can } = usePermissions();
  const canTakePayment = can("payments.write");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState("");
  const [discount, setDiscount] = useState("");
  const [handover, setHandover] = useState<Handover>("collected");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [paid, setPaid] = useState(true);
  const [method, setMethod] = useState<Method>("cash");
  const [transactionReference, setTransactionReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setLines([]);
    setPicking("");
    setDiscount("");
    setHandover("collected");
    setDeliveryAddress("");
    setDeliveryFee("");
    setPaid(canTakePayment);
    setMethod("cash");
    setTransactionReference("");
    setNotes("");
    setError(null);
  }, [open, canTakePayment]);

  const products = trpc.orders.sellableItems.useQuery(undefined, { enabled: open });
  const byId = useMemo(() => new Map((products.data ?? []).map(item => [item.id, item])), [products.data]);

  const record = trpc.orders.record.useMutation({
    onSuccess: order => {
      onOpenChange(false);
      onRecorded(order);
    },
    onError: mutationError => setError(mutationError.message),
  });

  const addProduct = (value: string) => {
    const id = Number(value);
    if (!id) return;
    setLines(current =>
      current.some(line => line.inventoryItemId === id)
        ? current.map(line =>
            line.inventoryItemId === id ? { ...line, quantity: String((Number(line.quantity) || 0) + 1) } : line,
          )
        : [...current, { inventoryItemId: id, quantity: "1" }],
    );
    setPicking("");
  };

  const summary = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => {
      const product = byId.get(line.inventoryItemId);
      return sum + (product ? minor(product.sellingPrice) * (Number(line.quantity) || 0) : 0);
    }, 0);
    const discountMinor = minor(Number(discount) || 0);
    const deliveryMinor = handover === "delivery" ? minor(Number(deliveryFee) || 0) : 0;
    return {
      subtotal: subtotal / 100,
      discount: discountMinor / 100,
      delivery: deliveryMinor / 100,
      total: (subtotal - discountMinor + deliveryMinor) / 100,
      discountTooLarge: discountMinor > subtotal,
    };
  }, [lines, byId, discount, handover, deliveryFee]);

  const submit = () => {
    setError(null);
    if (!lines.length) return setError("Add at least one product.");
    for (const line of lines) {
      const quantity = Number(line.quantity);
      const product = byId.get(line.inventoryItemId);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return setError(`Enter a whole-number quantity for ${product?.name ?? "each product"}.`);
      }
      if (product && quantity > product.quantityOnHand) {
        return setError(`Only ${product.quantityOnHand} of ${product.name} ${product.quantityOnHand === 1 ? "is" : "are"} in stock.`);
      }
    }
    if (!(Number(discount) >= 0)) return setError("The discount cannot be negative.");
    if (summary.discountTooLarge) return setError("The discount cannot be more than the items cost.");
    if (handover === "delivery" && !deliveryAddress.trim()) return setError("Add the delivery address.");
    if (handover === "delivery" && !(Number(deliveryFee || 0) >= 0)) return setError("The delivery fee cannot be negative.");

    record.mutate({
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
      items: lines.map(line => ({ inventoryItemId: line.inventoryItemId, quantity: Number(line.quantity) })),
      discount: Number(discount) || 0,
      handover,
      deliveryAddress: handover === "delivery" ? deliveryAddress.trim() : undefined,
      deliveryFee: handover === "delivery" ? Number(deliveryFee) || 0 : 0,
      paid,
      paymentMethod: paid ? method : undefined,
      transactionReference: paid ? transactionReference.trim() || undefined : undefined,
      notes: notes.trim() || undefined,
    });
  };

  const available = (products.data ?? []).filter(item => item.quantityOnHand > 0);
  const handoverHint = HANDOVER.find(option => option.value === handover)?.hint;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record an order</DialogTitle>
          <DialogDescription>
            For a sale at the counter, a phone order or one taken in person. Stock comes off the shelf when you save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Customer</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="order-customer-name">Name</Label>
                <Input
                  id="order-customer-name"
                  value={customerName}
                  onChange={event => setCustomerName(event.target.value)}
                  placeholder="Walk-in customer"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order-customer-phone">Phone</Label>
                <Input
                  id="order-customer-phone"
                  value={customerPhone}
                  onChange={event => setCustomerPhone(event.target.value)}
                  inputMode="tel"
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order-customer-email">Email</Label>
                <Input
                  id="order-customer-email"
                  type="email"
                  value={customerEmail}
                  onChange={event => setCustomerEmail(event.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              With a phone number or email, the order is added to the customer&apos;s history.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Products</h3>
            <Select value={picking} onValueChange={addProduct} disabled={products.isLoading}>
              <SelectTrigger aria-label="Add a product">
                <SelectValue
                  placeholder={
                    products.isLoading
                      ? "Loading products…"
                      : available.length
                        ? "Add a product"
                        : "No products in stock are marked for sale"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {available.map(item => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name} · {formatMoney(item.sellingPrice)} · {item.quantityOnHand} in stock
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {products.error ? <p className="text-xs text-destructive">{products.error.message}</p> : null}

            {lines.length ? (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                {lines.map(line => {
                  const product = byId.get(line.inventoryItemId);
                  const quantity = Number(line.quantity) || 0;
                  const short = product ? quantity > product.quantityOnHand : false;
                  return (
                    <li key={line.inventoryItemId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{product?.name ?? "Unknown product"}</span>
                        <span className={`block text-xs ${short ? "text-destructive" : "text-muted-foreground"}`}>
                          {product ? `${formatMoney(product.sellingPrice)} each · ${product.quantityOnHand} in stock` : ""}
                        </span>
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={product?.quantityOnHand}
                        value={line.quantity}
                        onChange={event =>
                          setLines(current =>
                            current.map(entry =>
                              entry.inventoryItemId === line.inventoryItemId
                                ? { ...entry, quantity: event.target.value }
                                : entry,
                            ),
                          )
                        }
                        className="h-8 w-20"
                        aria-label={`Quantity of ${product?.name ?? "product"}`}
                      />
                      <span className="w-24 text-right text-sm tabular-nums">
                        {product ? formatMoney(product.sellingPrice * quantity) : "-"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Remove ${product?.name ?? "product"}`}
                        onClick={() =>
                          setLines(current => current.filter(entry => entry.inventoryItemId !== line.inventoryItemId))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                <Plus className="h-4 w-4" /> Pick products above to add them to the order.
              </p>
            )}
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="order-handover">Handover</Label>
              <Select value={handover} onValueChange={value => setHandover(value as Handover)}>
                <SelectTrigger id="order-handover">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HANDOVER.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{handoverHint}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order-discount">Discount (GHS)</Label>
              <Input
                id="order-discount"
                inputMode="decimal"
                value={discount}
                onChange={event => setDiscount(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </section>

          {handover === "delivery" ? (
            <section className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="order-address">Delivery address</Label>
                <Textarea
                  id="order-address"
                  rows={2}
                  value={deliveryAddress}
                  onChange={event => setDeliveryAddress(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order-delivery-fee">Delivery fee (GHS)</Label>
                <Input
                  id="order-delivery-fee"
                  inputMode="decimal"
                  value={deliveryFee}
                  onChange={event => setDeliveryFee(event.target.value)}
                  placeholder="0.00"
                />
              </div>
            </section>
          ) : null}

          <section className="space-y-3 rounded-xl bg-muted/50 p-3">
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                <span className="block font-medium text-foreground">Paid now</span>
                <span className="text-xs text-muted-foreground">
                  {canTakePayment
                    ? "Books the payment and the sale's income. Leave off to take payment later from the order page."
                    : "Your role cannot record payments, so the order is saved as not paid yet."}
                </span>
              </span>
              <Switch checked={paid} onCheckedChange={setPaid} disabled={!canTakePayment} />
            </label>
            {paid ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="order-method">Payment method</Label>
                  <Select value={method} onValueChange={value => setMethod(value as Method)}>
                    <SelectTrigger id="order-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METHODS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="order-reference">Transaction reference</Label>
                  <Input
                    id="order-reference"
                    value={transactionReference}
                    onChange={event => setTransactionReference(event.target.value)}
                    placeholder={method === "cash" ? "Not needed for cash" : "e.g. MoMo transaction ID"}
                  />
                </div>
              </div>
            ) : null}
          </section>

          <div className="space-y-1.5">
            <Label htmlFor="order-notes">Notes (optional)</Label>
            <Textarea id="order-notes" rows={2} value={notes} onChange={event => setNotes(event.target.value)} />
          </div>

          <dl className="space-y-1 rounded-xl border border-border/60 px-4 py-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(summary.subtotal)}</dd>
            </div>
            {summary.discount > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className={`tabular-nums ${summary.discountTooLarge ? "text-destructive" : ""}`}>
                  - {formatMoney(summary.discount)}
                </dd>
              </div>
            ) : null}
            {summary.delivery > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className="tabular-nums">{formatMoney(summary.delivery)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border/60 pt-1.5 font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(Math.max(summary.total, 0))}</dd>
            </div>
          </dl>

          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={record.isPending}>
            Cancel
          </Button>
          <Button className="gap-2" onClick={submit} disabled={record.isPending || !lines.length}>
            {record.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {paid ? `Record paid order · ${formatMoney(Math.max(summary.total, 0))}` : "Record order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
