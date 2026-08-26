"use client";

import { FormEvent, useEffect, useState } from "react";
import { Minus, Plus, ShoppingBag, X, Sparkles } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import PublicShell from "@/components/PublicShell";
import { trpc } from "@/lib/trpc";

function createSessionToken() {
  const key = "bwt-store-session";
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  const token = crypto.randomUUID();
  localStorage.setItem(key, token);
  return token;
}

const ORDER_STEPS = [
  "new",
  "confirmed",
  "processing",
  "ready",
  "shipped",
  "delivered",
] as const;

function OrderStatusTracker({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <p className="mt-1 text-xs font-bold uppercase tracking-[.1em] text-[#e01a4f]">
        Order cancelled
      </p>
    );
  }
  const stepIndex = ORDER_STEPS.indexOf(status as (typeof ORDER_STEPS)[number]);
  return (
    <div className="mt-3 flex items-center gap-1">
      {ORDER_STEPS.map((step, index) => (
        <div key={step} className="flex flex-1 items-center gap-1">
          <span
            className={`h-2 flex-1 rounded-full transition-all ${
              index <= stepIndex
                ? "bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b]"
                : "bg-[#faeaf6]"
            }`}
            title={step}
          />
        </div>
      ))}
    </div>
  );
}

const STATIC_PRODUCTS = [
  {
    id: 1,
    sku: "BWT-SERUM-01",
    name: "Lumina Renewal Serum",
    category: "Skin & Hair Care",
    description:
      "A lightweight botanical renewal serum infused with argan and rosehip oils for radiant shine, deep hydration, and smooth finish.",
    sellingPrice: 68.0,
    quantityOnHand: 32,
    imageUrl: "/products/lumina-serum.jpg",
  },
  {
    id: 2,
    sku: "BWT-KIT-01",
    name: "Student Artistry Essentials Kit",
    category: "Tools & Kits",
    description:
      "Professional cosmetology starter kit containing precision shears, sectioning clips, tail combs, makeup brushes, and a luxury case.",
    sellingPrice: 210.0,
    quantityOnHand: 22,
    imageUrl: "/products/student-essentials-kit.jpg",
  },
  {
    id: 3,
    sku: "BWT-SHMP-01",
    name: "Hydrating Botanical Shampoo & Mask Duo",
    category: "Hair Care",
    description:
      "Sulfate-free moisture-rich cleanser and restorative hair mask formulated with shea butter and keratin for revitalized curls and waves.",
    sellingPrice: 85.0,
    quantityOnHand: 45,
    imageUrl: "/products/hydrating-shampoo-mask.jpg",
  },
  {
    id: 4,
    sku: "BWT-GEL-01",
    name: "Sculpting Builder Gel & UV Kit",
    category: "Nail Care",
    description:
      "Pro-grade builder gel kit with base, builder gel, top coat, dual-form tips, and fine detailer nail brush for salon-grade manicures.",
    sellingPrice: 120.0,
    quantityOnHand: 18,
    imageUrl: "/products/builder-gel-kit.jpg",
  },
  {
    id: 5,
    sku: "BWT-CLNS-01",
    name: "Gentle Radiance Facial Cleanser",
    category: "Skin Care",
    description:
      "pH-balanced gentle foaming cleanser with chamomile, niacinamide, and rosewater that purifies while preserving the skin moisture barrier.",
    sellingPrice: 48.0,
    quantityOnHand: 28,
    imageUrl: "/products/facial-cleanser.jpg",
  },
  {
    id: 6,
    sku: "BWT-BRUSH-01",
    name: "Master Precision Makeup Brush Set",
    category: "Tools & Kits",
    description:
      "12-piece ultra-soft synthetic vegan makeup brush set with ergonomic handles and a chic travel cylinder case.",
    sellingPrice: 140.0,
    quantityOnHand: 15,
    imageUrl: "/products/makeup-brush-set.jpg",
  },
];

export default function StorePage() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  useEffect(() => {
    setSessionToken(createSessionToken());
  }, []);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [lookupInput, setLookupInput] = useState<{
    orderNumber: string;
    email: string;
  } | null>(null);
  const { data: rawProducts = [], isLoading } = trpc.store.products.useQuery();
  const { data: cart } = trpc.store.cart.useQuery(
    { sessionToken: sessionToken ?? "" },
    { enabled: Boolean(sessionToken) }
  );
  const orderLookup = trpc.store.lookupOrder.useQuery(
    lookupInput ?? {
      orderNumber: "ORD-000000",
      email: "placeholder@example.com",
    },
    { enabled: Boolean(lookupInput) }
  );
  const utils = trpc.useUtils();
  const addItem = trpc.store.addItem.useMutation({
    onSuccess: () =>
      utils.store.cart.invalidate({ sessionToken: sessionToken ?? "" }),
  });
  const updateItem = trpc.store.updateItem.useMutation({
    onSuccess: () =>
      utils.store.cart.invalidate({ sessionToken: sessionToken ?? "" }),
  });
  const checkout = trpc.store.checkout.useMutation({
    onSuccess: () => {
      utils.store.cart.invalidate({ sessionToken: sessionToken ?? "" });
      setCheckoutOpen(false);
    },
  });
  const [notice, setNotice] = useState("");

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await checkout.mutateAsync({
        sessionToken: sessionToken ?? "",
        customerName: String(form.get("customerName")),
        customerEmail: String(form.get("customerEmail")),
        customerPhone: String(form.get("customerPhone")),
        deliveryAddress: String(form.get("deliveryAddress") || "") || undefined,
      });
      setNotice(
        `Order ${result.orderNumber} placed successfully. Our team will verify and prepare your beauty supplies.`
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Checkout could not be completed."
      );
    }
  }

  const items = cart?.items ?? [];
  const products =
    rawProducts.length > 0
      ? rawProducts.map(p => ({
          ...p,
          imageUrl:
            p.imageUrl ||
            STATIC_PRODUCTS.find(
              sp =>
                sp.sku === p.sku ||
                sp.name.toLowerCase() === p.name.toLowerCase()
            )?.imageUrl ||
            null,
        }))
      : STATIC_PRODUCTS;

  return (
    <PublicShell>
      <main className="container py-16 sm:py-24">
        <div className="grid gap-12 xl:grid-cols-[1fr_360px]">
          <section>
            <p className="eyebrow">Academy Beauty Store</p>
            <h1 className="mt-5 font-serif text-5xl font-bold leading-none text-[#8f0d6b] sm:text-6xl">
              Professional essentials & salon kits.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#692156]">
              Equip your craft with top-tier beauty tools, student training
              kits, skincare products, and hair styling formulas curated by
              Blush With Tee.
            </p>

            {notice && (
              <p className="mt-6 rounded-2xl border border-[#fe00b6]/30 bg-[#faeaf6] p-4 text-sm font-semibold text-[#8f0d6b]">
                {notice}
              </p>
            )}

            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {isLoading
                ? [1, 2].map(id => (
                    <div
                      className="h-96 animate-pulse rounded-3xl bg-white/70 border border-[#8f0d6b]/10"
                      key={id}
                    />
                  ))
                : products.map(product => (
                    <article
                      key={product.id}
                      className="group overflow-hidden rounded-3xl border border-[#8f0d6b]/15 bg-white/90 shadow-[0_16px_40px_rgba(143,13,107,.08)] transition-all duration-300 hover:border-[#fe00b6]/40 hover:shadow-[0_20px_45px_rgba(254,0,182,.14)]"
                    >
                      <div className="aspect-square bg-gradient-to-br from-[#faeaf6] to-[#fdf2f9] relative overflow-hidden">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center bg-[radial-gradient(circle_at_50%_30%,#ffffff,#faeaf6,#f4d2ed)]">
                            <Sparkles className="h-12 w-12 text-[#fe00b6]/40" />
                          </div>
                        )}
                      </div>
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#fe00b6]">
                              {product.category}
                            </p>
                            <h2 className="mt-2 font-serif text-2xl font-bold text-[#8f0d6b]">
                              {product.name}
                            </h2>
                          </div>
                          <p className="font-serif text-xl font-bold text-[#8f0d6b]">
                            GHS {product.sellingPrice.toFixed(2)}
                          </p>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[#6a2557]">
                          {product.description}
                        </p>
                        <div className="mt-6 flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#8f0d6b]">
                            {product.quantityOnHand > 0
                              ? `${product.quantityOnHand} available`
                              : "Out of stock"}
                          </span>
                          <Button
                            disabled={
                              product.quantityOnHand === 0 || addItem.isPending
                            }
                            onClick={() =>
                              addItem.mutate({
                                sessionToken: sessionToken ?? "",
                                inventoryItemId: product.id,
                                quantity: 1,
                              })
                            }
                            className="rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] text-white shadow-md hover:scale-105 transition-transform text-xs font-semibold"
                          >
                            Add to Bag <Plus className="ml-1 h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
            </div>
          </section>

          <aside className="h-fit rounded-[2.25rem] border border-[#8f0d6b]/15 bg-white/95 p-7 shadow-[0_16px_40px_rgba(143,13,107,.08)] xl:sticky xl:top-28">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-3xl font-bold text-[#8f0d6b]">
                Your Bag
              </h2>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#faeaf6] text-[#fe00b6]">
                <ShoppingBag className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-6 grid gap-4">
              {items.length === 0 && (
                <p className="rounded-2xl bg-[#fdf2f9] p-5 text-sm leading-6 text-[#8f0d6b]">
                  Your bag is currently empty. Browse our beauty products and
                  training essentials.
                </p>
              )}
              {items.map(item => (
                <div
                  key={item.cartItemId}
                  className="border-b border-[#8f0d6b]/10 pb-4"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#8f0d6b]">
                        {item.name}
                      </p>
                      <p className="mt-1 text-xs font-medium text-[#6a2557]">
                        GHS {item.sellingPrice.toFixed(2)} each
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        updateItem.mutate({
                          sessionToken: sessionToken ?? "",
                          cartItemId: item.cartItemId,
                          quantity: 0,
                        })
                      }
                      aria-label="Remove item"
                      className="text-[#fe00b6] hover:text-[#8f0d6b]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1 rounded-full border border-[#8f0d6b]/20 px-1 bg-white">
                      <button
                        onClick={() =>
                          updateItem.mutate({
                            sessionToken: sessionToken ?? "",
                            cartItemId: item.cartItemId,
                            quantity: Math.max(0, item.quantity - 1),
                          })
                        }
                        className="grid h-7 w-7 place-items-center rounded-full hover:bg-[#faeaf6]"
                      >
                        <Minus className="h-3 w-3 text-[#8f0d6b]" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-[#8f0d6b]">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          updateItem.mutate({
                            sessionToken: sessionToken ?? "",
                            cartItemId: item.cartItemId,
                            quantity: Math.min(
                              item.quantity + 1,
                              item.quantityOnHand
                            ),
                          })
                        }
                        className="grid h-7 w-7 place-items-center rounded-full hover:bg-[#faeaf6]"
                      >
                        <Plus className="h-3 w-3 text-[#8f0d6b]" />
                      </button>
                    </div>
                    <span className="text-sm font-bold text-[#8f0d6b]">
                      GHS {item.lineTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-between border-t border-[#8f0d6b]/15 pt-5 font-serif text-xl font-bold text-[#8f0d6b]">
              <span>Subtotal</span>
              <span>GHS {(cart?.subtotal ?? 0).toFixed(2)}</span>
            </div>

            <Button
              disabled={!items.length}
              onClick={() => setCheckoutOpen(true)}
              className="mt-6 w-full rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] py-6 text-sm font-bold text-white shadow-lg hover:scale-[1.01] transition-transform"
            >
              Proceed to Checkout
            </Button>

            {checkoutOpen && (
              <form
                onSubmit={submitCheckout}
                className="mt-6 grid gap-3 border-t border-[#8f0d6b]/15 pt-5"
              >
                <p className="text-sm font-bold text-[#8f0d6b]">
                  Order Delivery Details
                </p>
                <input
                  required
                  className="soft-input"
                  name="customerName"
                  placeholder="Full Name"
                />
                <input
                  required
                  type="email"
                  className="soft-input"
                  name="customerEmail"
                  placeholder="Email Address"
                />
                <input
                  required
                  className="soft-input"
                  name="customerPhone"
                  placeholder="Phone Number"
                />
                <textarea
                  className="soft-input min-h-20"
                  name="deliveryAddress"
                  placeholder="Campus / Delivery Address"
                />
                <Button
                  disabled={checkout.isPending}
                  type="submit"
                  className="rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] py-5 text-sm font-bold text-white shadow-md"
                >
                  {checkout.isPending
                    ? "Placing Order…"
                    : "Confirm & Place Order"}
                </Button>
              </form>
            )}

            <form
              className="mt-8 grid gap-2.5 border-t border-[#8f0d6b]/15 pt-6"
              onSubmit={event => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                setLookupInput({
                  orderNumber: String(form.get("orderNumber")),
                  email: String(form.get("lookupEmail")),
                });
              }}
            >
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#8f0d6b]">
                Track An Order
              </p>
              <input
                required
                name="orderNumber"
                placeholder="Order Reference (e.g. ORD-1002)"
                className="soft-input"
              />
              <input
                required
                type="email"
                name="lookupEmail"
                placeholder="Customer Email"
                className="soft-input"
              />
              <Button
                type="submit"
                variant="outline"
                className="rounded-full border-[#8f0d6b]/25 bg-white text-[#8f0d6b] hover:bg-[#faeaf6]"
              >
                Find Order
              </Button>
            </form>

            {orderLookup.data && (
              <div className="mt-4 rounded-2xl bg-[#faeaf6] p-4 text-xs leading-6 text-[#8f0d6b] border border-[#fe00b6]/30">
                <b className="text-sm">{orderLookup.data.orderNumber}</b>
                <br />
                Status:{" "}
                <span className="font-bold uppercase">
                  {orderLookup.data.fulfillmentStatus.replaceAll("_", " ")}
                </span>{" "}
                · Payment:{" "}
                <span className="font-semibold">
                  {orderLookup.data.paymentStatus}
                </span>
                <OrderStatusTracker
                  status={orderLookup.data.fulfillmentStatus}
                />
              </div>
            )}
            {orderLookup.error && (
              <p className="mt-3 text-xs font-semibold text-[#e01a4f]">
                {orderLookup.error.message}
              </p>
            )}
          </aside>
        </div>
      </main>
    </PublicShell>
  );
}
