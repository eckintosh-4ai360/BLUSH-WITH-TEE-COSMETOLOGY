"use client";

import { Badge } from "@blush/ui/components/ui/badge";
import PortalGuard from "@/components/PortalGuard";
import { trpc } from "@/lib/trpc";

function StudentPortalContent() {
  const portal = trpc.portal.mine.useQuery();
  const data = portal.data;
  if (portal.isLoading) return <p className="text-sm font-semibold text-[#8f0d6b]">Loading your learning record…</p>;
  if (!data?.profile)
    return (
      <div className="mx-auto max-w-4xl">
        <p className="eyebrow">Student Learning Portal</p>
        <div className="mt-6 rounded-[2rem] border border-[#8f0d6b]/15 bg-white/90 p-8 shadow-[0_16px_40px_rgba(143,13,107,.08)]">
          <h1 className="font-serif text-4xl font-bold text-[#8f0d6b]">Your student record is being prepared.</h1>
          <p className="mt-3 max-w-lg text-sm leading-7 text-[#6a2557]">
            Once your admission is approved by Blush With Tee administrators, this portal will display your program progress, attendance records, exam scores, tuition balances, uploaded documents, and store orders.
          </p>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl">
      <p className="eyebrow">Student Learning Portal</p>
      <h1 className="mt-2 font-serif text-4xl font-bold text-[#8f0d6b]">Your Blush With Tee Journey</h1>

      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-[#8f0d6b]/15 bg-white/90 p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#8f0d6b]">Student Number</p>
          <p className="mt-3 font-serif text-2xl font-bold text-[#8f0d6b]">{data.profile.studentNumber}</p>
        </div>
        <div className="rounded-3xl border border-[#8f0d6b]/15 bg-[#faeaf6] p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#8f0d6b]">Programme Progress</p>
          <p className="mt-3 font-serif text-2xl font-bold text-[#fe00b6]">
            {data.enrollment[0]?.enrollment.progressPercent ?? 0}%
          </p>
        </div>
        <div className="rounded-3xl border border-[#8f0d6b]/15 bg-white/90 p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#8f0d6b]">Open Balances</p>
          <p className="mt-3 font-serif text-2xl font-bold text-[#8f0d6b]">
            {data.balances.filter(b => b.status !== "paid").length}
          </p>
        </div>
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-[#8f0d6b]/15 bg-white/90 p-7 shadow-[0_12px_36px_rgba(143,13,107,.06)]">
          <h2 className="font-serif text-2xl font-bold text-[#8f0d6b]">Attendance Records</h2>
          <div className="mt-5 grid gap-3">
            {data.attendance.map(({ attendance, courseTitle }) => (
              <div key={attendance.id} className="flex items-center justify-between rounded-2xl bg-[#fdf2f9] p-4 border border-[#8f0d6b]/10">
                <div>
                  <p className="text-sm font-bold text-[#8f0d6b]">{courseTitle}</p>
                  <p className="mt-1 text-xs text-[#6a2557]">{new Date(attendance.classDate).toLocaleDateString()}</p>
                </div>
                <Badge className="bg-[#faeaf6] font-bold text-[#fe00b6] hover:bg-[#faeaf6]">{attendance.status}</Badge>
              </div>
            )) || <p className="text-sm text-[#8f0d6b]">Attendance will appear as classes are recorded.</p>}
          </div>
        </section>

        <section className="rounded-3xl border border-[#8f0d6b]/15 bg-white/90 p-7 shadow-[0_12px_36px_rgba(143,13,107,.06)]">
          <h2 className="font-serif text-2xl font-bold text-[#8f0d6b]">Assessment Results</h2>
          <div className="mt-5 grid gap-3">
            {data.results.map(({ result, title, assessmentType, totalScore }) => (
              <div key={result.id} className="flex items-center justify-between rounded-2xl bg-[#fdf2f9] p-4 border border-[#8f0d6b]/10">
                <div>
                  <p className="text-sm font-bold text-[#8f0d6b]">{title}</p>
                  <p className="mt-1 text-xs text-[#6a2557]">{assessmentType}</p>
                </div>
                <p className="font-serif text-xl font-bold text-[#fe00b6]">
                  {Number(result.score)}/{totalScore} {result.grade ? `· ${result.grade}` : ""}
                </p>
              </div>
            )) || <p className="text-sm text-[#8f0d6b]">Results will appear when instructors submit them.</p>}
          </div>
        </section>
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-3">
        <section className="rounded-3xl border border-[#8f0d6b]/15 bg-white/90 p-7 shadow-[0_12px_36px_rgba(143,13,107,.06)]">
          <h2 className="font-serif text-2xl font-bold text-[#8f0d6b]">Fees & Balances</h2>
          <div className="mt-5 grid gap-3">
            {data.balances.map(balance => (
              <div key={balance.id} className="rounded-2xl bg-[#fdf2f9] p-4 border border-[#8f0d6b]/10">
                <p className="text-sm font-bold text-[#8f0d6b]">{balance.description}</p>
                <p className="mt-1 text-xs font-semibold text-[#fe00b6]">
                  {balance.status.replaceAll("_", " ")} · GHS {Number(balance.amountDue).toFixed(2)}
                </p>
              </div>
            )) || <p className="text-sm text-[#8f0d6b]">No fee charges have been added.</p>}
          </div>
        </section>

        <section className="rounded-3xl border border-[#8f0d6b]/15 bg-white/90 p-7 shadow-[0_12px_36px_rgba(143,13,107,.06)]">
          <h2 className="font-serif text-2xl font-bold text-[#8f0d6b]">Payment History</h2>
          <div className="mt-5 grid gap-3">
            {data.payments.map(payment => (
              <div key={payment.id} className="rounded-2xl bg-[#fdf2f9] p-4 border border-[#8f0d6b]/10">
                <p className="text-sm font-bold text-[#8f0d6b]">{payment.reference}</p>
                <p className="mt-1 text-xs text-[#6a2557]">
                  {new Date(payment.paidAt).toLocaleDateString()} · {payment.paymentMethod.replaceAll("_", " ")} · GHS{" "}
                  {payment.amount.toFixed(2)}
                </p>
              </div>
            )) || <p className="text-sm text-[#8f0d6b]">Completed payments will appear here.</p>}
          </div>
        </section>

        <section className="rounded-3xl border border-[#8f0d6b]/15 bg-white/90 p-7 shadow-[0_12px_36px_rgba(143,13,107,.06)]">
          <h2 className="font-serif text-2xl font-bold text-[#8f0d6b]">Store Orders</h2>
          <div className="mt-5 grid gap-3">
            {data.orders.map(order => (
              <div key={order.id} className="rounded-2xl bg-[#fdf2f9] p-4 border border-[#8f0d6b]/10">
                <p className="text-sm font-bold text-[#8f0d6b]">{order.orderNumber}</p>
                <p className="mt-1 text-xs text-[#6a2557]">
                  {order.fulfillmentStatus} · {order.paymentStatus} · GHS {order.total.toFixed(2)}
                </p>
              </div>
            )) || <p className="text-sm text-[#8f0d6b]">Your completed store orders will appear here.</p>}
          </div>
        </section>
      </div>

      <section className="mt-7 rounded-3xl border border-[#8f0d6b]/15 bg-white/90 p-7 shadow-[0_12px_36px_rgba(143,13,107,.06)]">
        <h2 className="font-serif text-2xl font-bold text-[#8f0d6b]">Admissions Record</h2>
        {data.application ? (
          <div className="mt-5 rounded-2xl bg-[#fdf2f9] p-5 border border-[#8f0d6b]/10">
            <p className="font-bold text-[#8f0d6b]">
              {data.application.reference} · <span className="text-[#fe00b6]">{data.application.status.replaceAll("_", " ")}</span>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {data.documents.map(document => (
                <a
                  key={document.id}
                  href={document.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-white border border-[#8f0d6b]/20 px-4 py-1.5 text-xs font-semibold text-[#8f0d6b] hover:bg-[#faeaf6]"
                >
                  {document.documentType.replaceAll("_", " ")}
                </a>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[#8f0d6b]">Your admissions details will appear after your student record is connected.</p>
        )}
      </section>
    </div>
  );
}

export default function StudentPortalPage() {
  return (
    <PortalGuard allowedRoles={["student", "admin"]}>
      <PublicShell>
        <main className="container py-16 sm:py-24">
          <StudentPortalContent />
        </main>
      </PublicShell>
    </PortalGuard>
  );
}


