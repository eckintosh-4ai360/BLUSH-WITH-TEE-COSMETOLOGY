"use client";

import { Suspense, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, Clock3, Loader2, ShieldAlert } from "lucide-react";
import PortalGuard from "@/components/PortalGuard";
import PublicShell from "@/components/PublicShell";
import { trpc } from "@/lib/trpc";

// Where the payment provider sends a student back after paying fees. Nothing is trusted from
// the address bar: the server asks the provider what happened before the balance moves.
export default function FeePaymentReturnPage() {
  return (
    <PortalGuard allowedRoles={["student", "admin"]}>
      <PublicShell>
        <main className="container py-16 sm:py-24">
          <Suspense fallback={null}>
            <PaymentResult />
          </Suspense>
        </main>
      </PublicShell>
    </PortalGuard>
  );
}

function PaymentResult() {
  const params = useSearchParams();
  // Paystack appends both; they carry the reference we opened the charge with.
  const reference = params.get("reference") ?? params.get("trxref") ?? "";
  const utils = trpc.useUtils();
  const verify = trpc.payments.verify.useMutation({
    onSuccess: () => {
      void utils.portal.mine.invalidate();
      void utils.payments.balance.invalidate();
    },
  });
  const started = useRef(false);

  const check = useCallback(() => {
    if (reference) verify.mutate({ reference });
  }, [reference, verify]);

  useEffect(() => {
    if (started.current || !reference) return;
    started.current = true;
    check();
  }, [check, reference]);

  const pending = verify.error?.message.toLowerCase().includes("not completed");

  return (
    <div className="mx-auto max-w-xl rounded-[2rem] border border-[#8f0d6b]/15 bg-white/90 p-8 text-center shadow-[0_16px_40px_rgba(143,13,107,.08)]">
      {!reference ? (
        <Outcome
          icon={<ShieldAlert className="h-10 w-10 text-[#8f0d6b]" />}
          title="No payment to check"
          text="This page is opened by the payment provider after you pay. Your fees and payments are on your portal."
        />
      ) : verify.isPending || verify.isIdle ? (
        <Outcome
          icon={<Loader2 className="h-10 w-10 animate-spin text-[#8f0d6b]" />}
          title="Confirming your payment…"
          text="We are checking with the payment provider. This takes a moment."
        />
      ) : verify.data ? (
        <Outcome
          icon={<BadgeCheck className="h-10 w-10 text-emerald-600" />}
          title="Payment received"
          text={`GHS ${verify.data.amount.toFixed(2)} has been added to your account. Receipt reference ${verify.data.paymentReference}.`}
        />
      ) : pending ? (
        <Outcome
          icon={<Clock3 className="h-10 w-10 text-amber-600" />}
          title="Still being processed"
          text="The provider has not finished this payment yet. Mobile money can take a minute to come through."
          action={
            <button
              type="button"
              onClick={check}
              className="mt-6 rounded-full border border-[#8f0d6b]/25 bg-white px-6 py-3 text-sm font-bold text-[#8f0d6b] hover:bg-[#faeaf6]"
            >
              Check again
            </button>
          }
        />
      ) : (
        <Outcome
          icon={<ShieldAlert className="h-10 w-10 text-rose-600" />}
          title="We could not confirm this payment"
          text={`${verify.error?.message ?? "Something went wrong."} If money left your account, contact the school office with reference ${reference}.`}
        />
      )}

      <Link
        href="/portal"
        className="mt-8 inline-block rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-7 py-3 text-sm font-bold text-white shadow-md"
      >
        Back to your portal
      </Link>
    </div>
  );
}

function Outcome({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex justify-center">{icon}</div>
      <h1 className="mt-5 font-serif text-3xl font-bold text-[#8f0d6b]">{title}</h1>
      <p className="mt-3 text-sm leading-7 text-[#6a2557]">{text}</p>
      {action}
    </div>
  );
}
