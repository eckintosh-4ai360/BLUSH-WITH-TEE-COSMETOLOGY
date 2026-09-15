"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Notice = { tone: "ok" | "error" | "info"; text: string };

const NOTICE_STYLE: Record<Notice["tone"], string> = {
  ok: "border-emerald-300 bg-emerald-50 text-emerald-900",
  error: "border-rose-300 bg-rose-50 text-rose-800",
  info: "border-[#fe00b6]/30 bg-[#faeaf6] text-[#8f0d6b]",
};

// Paying school fees online. The server caps the amount at what is owed and re-checks every
// payment with the provider before the balance moves.
export function FeePaymentCard() {
  const utils = trpc.useUtils();
  const options = trpc.payments.options.useQuery(undefined, { staleTime: 5 * 60_000 });
  const balance = trpc.payments.balance.useQuery();

  const [amount, setAmount] = useState("");
  const [testReference, setTestReference] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const initiate = trpc.payments.initiate.useMutation();
  const simulate = trpc.payments.simulateProviderSuccess.useMutation();
  const verify = trpc.payments.verify.useMutation();

  const outstanding = balance.data?.outstanding ?? 0;

  useEffect(() => {
    if (outstanding > 0) setAmount(current => current || outstanding.toFixed(2));
  }, [outstanding]);

  if (balance.isLoading || !balance.data?.student) return null;

  const busy = initiate.isPending || simulate.isPending || verify.isPending;
  const mode = options.data?.online;

  const refresh = () =>
    Promise.all([utils.payments.balance.invalidate(), utils.portal.mine.invalidate()]);

  const pay = async () => {
    setNotice(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setNotice({ tone: "error", text: "Enter the amount you would like to pay." });
      return;
    }
    if (value > outstanding) {
      setNotice({ tone: "error", text: `You can pay up to GHS ${outstanding.toFixed(2)}.` });
      return;
    }

    try {
      // A fresh key per click; the button stays disabled while one is in flight.
      const opened = await initiate.mutateAsync({
        amount: Math.round(value * 100) / 100,
        idempotencyKey: crypto.randomUUID(),
      });
      if (opened.checkoutUrl) {
        window.location.href = opened.checkoutUrl;
        return;
      }
      if (opened.provider === "manual") {
        setTestReference(opened.reference);
        setNotice({
          tone: "info",
          text: "Test mode: no payment provider is connected, so no money moves. Simulate the provider confirming this payment below.",
        });
        return;
      }
      setNotice({ tone: "error", text: "The payment could not be opened. Please try again." });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "The payment could not be opened.",
      });
    }
  };

  const confirmTestPayment = async () => {
    if (!testReference) return;
    try {
      await simulate.mutateAsync({ reference: testReference });
      const verified = await verify.mutateAsync({ reference: testReference });
      setTestReference(null);
      setAmount("");
      setNotice({
        tone: "ok",
        text: `Payment of GHS ${verified.amount.toFixed(2)} recorded. Receipt reference ${verified.paymentReference}.`,
      });
      await refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "The test payment could not be confirmed.",
      });
    }
  };

  return (
    <section className="mt-7 rounded-3xl border border-[#8f0d6b]/15 bg-white/90 p-7 shadow-[0_12px_36px_rgba(143,13,107,.06)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-[#8f0d6b]">Pay your fees</h2>
          <p className="mt-1 text-sm text-[#6a2557]">
            {outstanding > 0
              ? `You have GHS ${outstanding.toFixed(2)} outstanding.`
              : "Nothing is outstanding on your account."}
          </p>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#faeaf6] text-[#fe00b6]">
          <CreditCard className="h-5 w-5" />
        </span>
      </div>

      {notice ? (
        <p className={`mt-5 flex items-start gap-2 rounded-2xl border p-4 text-sm font-medium ${NOTICE_STYLE[notice.tone]}`}>
          {notice.tone === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : null}
          {notice.text}
        </p>
      ) : null}

      {outstanding > 0 && mode === "off" ? (
        <p className="mt-5 text-sm leading-6 text-[#6a2557]">
          Online payment is not available yet. Please pay at the school office by cash or mobile
          money; your balance here updates as soon as the payment is recorded.
        </p>
      ) : null}

      {outstanding > 0 && mode && mode !== "off" && !testReference ? (
        <form
          className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={event => {
            event.preventDefault();
            void pay();
          }}
        >
          <label className="field-label flex-1">
            Amount to pay (GHS)
            <input
              type="number"
              inputMode="decimal"
              min="1"
              step="0.01"
              max={outstanding}
              value={amount}
              onChange={event => setAmount(event.target.value)}
              className="soft-input"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-7 py-3 text-sm font-bold text-white shadow-md disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "test" ? "Pay (test mode)" : "Pay online"}
          </button>
        </form>
      ) : null}

      {testReference ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirmTestPayment()}
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#8f0d6b]/25 bg-white px-6 py-3 text-sm font-bold text-[#8f0d6b] hover:bg-[#faeaf6] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Simulate a successful payment
        </button>
      ) : null}
    </section>
  );
}
