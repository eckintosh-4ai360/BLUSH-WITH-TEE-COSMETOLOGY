"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Clock3, Sparkles } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import PublicShell from "@/components/PublicShell";
import { trpc } from "@/lib/trpc";

export default function AppointmentsPage() {
  const { data: services = [] } = trpc.content.clinicServices.useQuery();
  const book = trpc.appointments.book.useMutation();
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await book.mutateAsync({
        serviceId: Number(data.get("serviceId")),
        customerName: String(data.get("customerName")),
        customerEmail: String(data.get("customerEmail")),
        customerPhone: String(data.get("customerPhone")),
        startsAt: new Date(String(data.get("startsAt"))),
        note: String(data.get("note") || "") || undefined,
      });
      setNotice(`Your clinic request ${result.reference} has been received. The academy will confirm your appointment shortly.`);
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The appointment request could not be sent.");
    }
  }

  return (
    <PublicShell>
      <main className="container py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[.85fr_1.15fr]">
          <div>
            <p className="eyebrow">Student Beauty Clinic</p>
            <h1 className="mt-5 font-serif text-5xl font-bold leading-none text-[#8f0d6b] sm:text-6xl">
              Supervised luxury salon care.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-[#692156]">
              Book an appointment in our student clinic. All services are performed by advanced cosmetology students under direct educator supervision.
            </p>

            <div className="mt-10 grid gap-4">
              {services.map(service => (
                <article
                  key={service.id}
                  className="rounded-3xl border border-[#8f0d6b]/15 bg-white/85 p-6 shadow-[0_12px_36px_rgba(143,13,107,.06)] hover:border-[#fe00b6]/35 transition-colors"
                >
                  <div className="flex justify-between gap-4">
                    <div>
                      <h2 className="font-serif text-2xl font-bold text-[#8f0d6b]">{service.name}</h2>
                      <p className="mt-2 text-sm leading-6 text-[#6a2557]">{service.description}</p>
                    </div>
                    <p className="whitespace-nowrap font-serif text-xl font-bold text-[#fe00b6]">
                      GHS {Number(service.price).toFixed(2)}
                    </p>
                  </div>
                  <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-[#8f0d6b]">
                    <Clock3 className="h-4 w-4 text-[#fe00b6]" /> {service.durationMinutes} minutes duration
                  </p>
                </article>
              ))}
            </div>
          </div>

          <section className="rounded-[2.25rem] border border-[#8f0d6b]/15 bg-white/90 p-7 shadow-[0_18px_48px_rgba(143,13,107,.08)] sm:p-10">
            <p className="eyebrow">Book a Clinic Session</p>
            <h2 className="mt-3 font-serif text-3xl font-bold text-[#8f0d6b]">Select Your Service & Time</h2>

            {notice && (
              <p
                className={`mt-5 rounded-2xl p-4 text-sm font-semibold border ${
                  notice.startsWith("Your")
                    ? "bg-[#faeaf6] text-[#8f0d6b] border-[#fe00b6]/30"
                    : "bg-[#fff0f4] text-[#e01a4f] border-[#e01a4f]/20"
                }`}
              >
                {notice.startsWith("Your") && <CheckCircle2 className="mr-2 inline h-5 w-5 text-[#fe00b6]" />}
                {notice}
              </p>
            )}

            <form className="mt-8 grid gap-5" onSubmit={submit}>
              <label className="field-label">
                Service
                <select required name="serviceId" className="soft-input">
                  <option value="">Select a clinic service</option>
                  {services.map(service => (
                    <option key={service.id} value={service.id}>
                      {service.name} — GHS {Number(service.price).toFixed(2)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">
                  Full Name
                  <input required name="customerName" placeholder="e.g. Ama Darko" className="soft-input" />
                </label>
                <label className="field-label">
                  Phone Number
                  <input required name="customerPhone" placeholder="+233..." className="soft-input" />
                </label>
              </div>

              <label className="field-label">
                Email Address
                <input required type="email" name="customerEmail" placeholder="ama@example.com" className="soft-input" />
              </label>

              <label className="field-label">
                Preferred Date and Time
                <input required type="datetime-local" name="startsAt" className="soft-input" />
              </label>

              <label className="field-label">
                Special Requests or Notes for the Clinic
                <textarea name="note" placeholder="Skin sensitivities, preferred stylist, hair length..." className="soft-input min-h-24" />
              </label>

              <Button
                type="submit"
                disabled={book.isPending}
                className="rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] py-6 text-sm font-bold text-white shadow-[0_10px_28px_rgba(254,0,182,0.35)] hover:scale-[1.01] transition-transform"
              >
                {book.isPending ? "Sending Request…" : "Request Clinic Appointment"}
              </Button>
            </form>
          </section>
        </div>
      </main>
    </PublicShell>
  );
}

