"use client";

import { useState } from "react";
import { CheckCircle2, CreditCard, Loader2, Store } from "lucide-react";
import { formatPhone, telHref } from "@blush/shared/contact";
import { useSchoolProfile } from "@/hooks/useSchoolProfile";
import { trpc } from "@/lib/trpc";

// How to pay for one web order: online where the site can take payment, and always at the
// school. The order number and email stand in for a sign-in, as they do for tracking.
export function OrderPayment({
  orderNumber,
  email,
  total,
  onPaid,
}: {
  orderNumber: string;
  email: string;
  total: number;
  onPaid?: () => void;
}) {
  const { data: school } = useSchoolProfile();
  const options = trpc.store.paymentOptions.useQuery(undefined, { staleTime: 5 * 60_000 });
  const payOrder = trpc.store.payOrder.useMutation();
  const simulate = trpc.store.simulatePayment.useMutation();
  const confirm = trpc.store.confirmPayment.useMutation();

  const [testReference, setTestReference] = useState<string | null>(null);
  const [paidReference, setPaidReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = payOrder.isPending || simulate.isPending || confirm.isPending;
  const mode = options.data?.online;

  const payOnline = async () => {
    setError(null);
    try {
      const opened = await payOrder.mutateAsync({
        orderNumber,
        email,
        idempotencyKey: crypto.randomUUID(),
      });
      if (opened.checkoutUrl) {
        window.location.href = opened.checkoutUrl;
        return;
      }
      if (opened.provider === "manual") {
        setTestReference(opened.reference);
        return;
      }
      setError("The payment could not be opened. Please try again.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The payment could not be opened.");
    }
  };

  const confirmTestPayment = async () => {
    if (!testReference) return;
    setError(null);
    try {
      await simulate.mutateAsync({ reference: testReference });
      const result = await confirm.mutateAsync({ reference: testReference });
      setTestReference(null);
      setPaidReference(result.paymentReference);
      onPaid?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The test payment could not be confirmed.");
    }
  };

  if (paidReference) {
    return (
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="flex items-center gap-2 font-bold">
          <CheckCircle2 className="h-4 w-4" /> Payment received for {orderNumber}
        </p>
        <p className="mt-1">Receipt reference {paidReference}. We will prepare your order.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#fe00b6]/30 bg-[#faeaf6] p-5 text-sm text-[#8f0d6b]">
      <p className="font-bold">
        Order {orderNumber} · GHS {total.toFixed(2)}
      </p>

      {mode && mode !== "off" ? (
        <div className="mt-4">
          {testReference ? (
            <>
              <p className="text-xs leading-5 text-[#6a2557]">
                Test mode: no payment provider is connected, so no money moves.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmTestPayment()}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#8f0d6b]/25 bg-white px-5 py-2.5 text-xs font-bold text-[#8f0d6b] disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Simulate a successful payment
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void payOnline()}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-5 py-2.5 text-xs font-bold text-white shadow-md disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
              {mode === "test" ? "Pay online (test mode)" : "Pay online now"}
            </button>
          )}
        </div>
      ) : null}

      <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#6a2557]">
        <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#fe00b6]" />
        <span>
          {mode && mode !== "off" ? "Or pay" : "Pay"} at the school by cash or mobile money, quoting
          your order number.
          {school?.phone ? (
            <>
              {" "}
              Questions? Call{" "}
              <a href={telHref(school.phone)} className="font-semibold underline underline-offset-2">
                {formatPhone(school.phone)}
              </a>
              .
            </>
          ) : null}
        </span>
      </p>

      {error ? <p className="mt-3 text-xs font-semibold text-[#e01a4f]">{error}</p> : null}
    </div>
  );
}
