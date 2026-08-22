"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, Ban, Search, ShieldQuestion } from "lucide-react";
import PublicShell from "@/components/PublicShell";
import { trpc } from "@/lib/trpc";

/**
 * Public certificate verification (§37).
 *
 * Anyone with a certificate number or a QR link can confirm an award here. The
 * page shows only what an employer needs to trust the certificate; nothing
 * else about the student is exposed.
 */
export default function VerifyPage() {
  return (
    <PublicShell>
      <main className="container py-16 sm:py-24">
        <Suspense fallback={<p className="text-sm text-[#6a2557]">Loading…</p>}>
          <VerifyContent />
        </Suspense>
      </main>
    </PublicShell>
  );
}

function VerifyContent() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("c") ?? "";

  const [value, setValue] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);

  useEffect(() => {
    setValue(initial);
    setSubmitted(initial);
  }, [initial]);

  const result = trpc.certificates.verify.useQuery(
    { value: submitted },
    { enabled: submitted.trim().length >= 4, retry: false },
  );

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const next = value.trim();
    setSubmitted(next);
    router.replace(next ? `/verify?c=${encodeURIComponent(next)}` : "/verify");
  };

  return (
    <div className="mx-auto max-w-2xl">
      <p className="eyebrow">Blush With Tee</p>
      <h1 className="mt-2 font-serif text-4xl font-bold text-[#8f0d6b]">
        Certificate verification
      </h1>
      <p className="mt-3 text-sm leading-7 text-[#6a2557]">
        Enter a certificate number, or scan the QR code printed on the certificate, to confirm
        that it was issued by Blush With Tee.
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3 sm:flex-row">
        <label htmlFor="certificate" className="sr-only">
          Certificate number
        </label>
        <input
          id="certificate"
          value={value}
          onChange={event => setValue(event.target.value)}
          placeholder="COS-2026-00124"
          autoComplete="off"
          className="w-full rounded-2xl border border-[#8f0d6b]/20 bg-white/90 px-4 py-3 text-sm text-[#3d0a2f] outline-none placeholder:text-[#b284a6] focus:border-[#8f0d6b]/50 focus:ring-2 focus:ring-[#8f0d6b]/20"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#8f0d6b] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#75095a] disabled:opacity-60"
          disabled={value.trim().length < 4}
        >
          <Search className="h-4 w-4" />
          Verify
        </button>
      </form>

      <div className="mt-8">
        {submitted.trim().length < 4 ? null : result.isLoading ? (
          <StatusCard tone="pending" title="Checking our records…" />
        ) : result.error ? (
          <StatusCard
            tone="unknown"
            title="We could not complete that check"
            detail="Please try again in a moment."
          />
        ) : result.data?.status === "not_found" ? (
          <StatusCard
            tone="unknown"
            title="No certificate matches that number"
            detail="Check the number and try again. If it was issued recently, contact the school office."
          />
        ) : result.data?.certificate ? (
          <CertificateResult
            status={result.data.status}
            certificate={result.data.certificate}
          />
        ) : null}
      </div>
    </div>
  );
}

type Certificate = {
  certificateNumber: string;
  studentName: string;
  studentNumber: string;
  courseTitle: string;
  completionDate: Date | string;
  issuedAt: Date | string;
  revokedAt: Date | string | null;
};

function CertificateResult({
  status,
  certificate,
}: {
  status: "verified" | "revoked";
  certificate: Certificate;
}) {
  const revoked = status === "revoked";

  return (
    <article
      className={`rounded-[2rem] border p-8 shadow-[0_16px_40px_rgba(143,13,107,.08)] ${
        revoked ? "border-rose-300 bg-rose-50/80" : "border-emerald-300 bg-emerald-50/70"
      }`}
    >
      <div className="flex items-center gap-3">
        {revoked ? (
          <Ban className="h-6 w-6 shrink-0 text-rose-700" aria-hidden />
        ) : (
          <BadgeCheck className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden />
        )}
        <p
          className={`text-sm font-bold uppercase tracking-[0.18em] ${
            revoked ? "text-rose-800" : "text-emerald-800"
          }`}
        >
          {revoked ? "Revoked" : "Verified"}
        </p>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Certificate number" value={certificate.certificateNumber} />
        <Field label="Student" value={certificate.studentName} />
        <Field label="Student ID" value={certificate.studentNumber} />
        <Field label="Course" value={certificate.courseTitle} />
        <Field label="Completed" value={formatDate(certificate.completionDate)} />
        <Field label="Issued" value={formatDate(certificate.issuedAt)} />
      </dl>

      <p className={`mt-6 text-sm leading-6 ${revoked ? "text-rose-900" : "text-emerald-900"}`}>
        {revoked
          ? `This certificate was withdrawn by Blush With Tee${
              certificate.revokedAt ? ` on ${formatDate(certificate.revokedAt)}` : ""
            } and should not be relied on.`
          : "This certificate was issued by Blush With Tee and remains valid."}
      </p>
    </article>
  );
}

function StatusCard({
  tone,
  title,
  detail,
}: {
  tone: "pending" | "unknown";
  title: string;
  detail?: string;
}) {
  return (
    <article className="rounded-[2rem] border border-[#8f0d6b]/15 bg-white/90 p-8">
      <div className="flex items-center gap-3">
        <ShieldQuestion className="h-6 w-6 shrink-0 text-[#8f0d6b]" aria-hidden />
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#8f0d6b]">
          {tone === "pending" ? "Checking" : "Not found"}
        </p>
      </div>
      <h2 className="mt-4 font-serif text-2xl text-[#3d0a2f]">{title}</h2>
      {detail ? <p className="mt-2 text-sm leading-6 text-[#6a2557]">{detail}</p> : null}
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-[0.12em] text-[#8a6178]">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-[#3d0a2f]">{value}</dd>
    </div>
  );
}

function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
