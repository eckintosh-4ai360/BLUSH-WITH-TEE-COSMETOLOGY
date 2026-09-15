"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2, Mail, MapPin, MessageCircle, Phone, Send } from "lucide-react";
import { formatPhone, telHref, whatsappHref } from "@blush/shared/contact";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@blush/ui/components/ui/accordion";
import { Button } from "@blush/ui/components/ui/button";
import PublicShell from "@/components/PublicShell";
import { useSchoolProfile } from "@/hooks/useSchoolProfile";
import { trpc } from "@/lib/trpc";

export default function ContactPage() {
  const { data: school, isLoading } = useSchoolProfile();
  const { data: faqs = [] } = trpc.content.faqs.useQuery(undefined, { staleTime: 5 * 60_000 });
  const sendEnquiry = trpc.content.sendEnquiry.useMutation();

  const [enquiry, setEnquiry] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const [enquiryNotice, setEnquiryNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function submitEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnquiryNotice(null);
    try {
      const result = await sendEnquiry.mutateAsync({
        name: enquiry.name.trim(),
        email: enquiry.email.trim(),
        phone: enquiry.phone.trim(),
        subject: enquiry.subject.trim(),
        message: enquiry.message.trim(),
      });
      setEnquiryNotice({
        ok: true,
        text: result.emailed
          ? "Thank you! Your message has been sent to the school."
          : "Thank you! Your message has been received and the school will get back to you shortly.",
      });
      setEnquiry({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (error) {
      setEnquiryNotice({
        ok: false,
        text:
          error instanceof Error
            ? error.message
            : "Your message could not be sent. Please try again or call the school.",
      });
    }
  }

  const whatsapp = school?.whatsapp ? whatsappHref(school.whatsapp) : null;

  return (
    <PublicShell>
      <main className="container py-16 sm:py-24">
        <div className="grid gap-14 lg:grid-cols-[1fr_.85fr]">
          <div>
            <p className="eyebrow">Connect With Us</p>
            <h1 className="mt-5 font-serif text-5xl font-bold leading-none text-[#8f0d6b] sm:text-6xl">
              Begin your conversation with Blush With Tee.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#692156]">
              Have a question about admissions and programmes, a salon booking, or an order from our store? Our friendly team is here to help.
            </p>

            {/* Every detail here comes from Settings in the back office. */}
            <div className="mt-10 grid gap-4 text-sm text-[#6a2557]">
              {isLoading ? (
                [0, 1, 2].map(item => (
                  <div key={item} className="h-24 animate-pulse rounded-3xl border border-[#8f0d6b]/10 bg-white/70" />
                ))
              ) : (
                <>
                  {school?.phone ? (
                    <ContactCard
                      icon={<Phone className="h-5 w-5" />}
                      label="Call the school"
                      value={formatPhone(school.phone)}
                      href={telHref(school.phone)}
                    />
                  ) : null}
                  {school?.whatsapp ? (
                    <ContactCard
                      icon={<MessageCircle className="h-5 w-5" />}
                      label="WhatsApp"
                      value={formatPhone(school.whatsapp)}
                      href={whatsapp ?? telHref(school.whatsapp)}
                      external={Boolean(whatsapp)}
                    />
                  ) : null}
                  {school?.email ? (
                    <ContactCard
                      icon={<Mail className="h-5 w-5" />}
                      label="Admissions & inquiries"
                      value={school.email}
                      href={`mailto:${school.email}`}
                    />
                  ) : null}
                  <ContactCard
                    icon={<MapPin className="h-5 w-5" />}
                    label="Visit us"
                    value={school?.address ?? "Tarkwa, Ghana"}
                  />
                </>
              )}
            </div>

            {/* Enquiry form */}
            <div className="mt-12">
              <p className="eyebrow">Send us a message</p>
              <h2 className="mt-4 font-serif text-3xl font-bold text-[#8f0d6b]">
                How can we help you?
              </h2>

              <form
                onSubmit={submitEnquiry}
                className="mt-6 grid gap-4 rounded-[2rem] border border-[#8f0d6b]/15 bg-white/85 p-6 shadow-[0_12px_36px_rgba(143,13,107,.06)]"
              >
                {enquiryNotice ? (
                  <p
                    className={`rounded-2xl p-3 text-sm font-semibold border ${
                      enquiryNotice.ok
                        ? "bg-[#faeaf6] text-[#8f0d6b] border-[#fe00b6]/30"
                        : "bg-[#fff0f4] text-[#e01a4f] border-[#e01a4f]/20"
                    }`}
                  >
                    {enquiryNotice.ok && (
                      <CheckCircle2 className="mr-2 inline h-4 w-4 text-[#fe00b6]" />
                    )}
                    {enquiryNotice.text}
                  </p>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="field-label">
                    Your name
                    <input
                      required
                      value={enquiry.name}
                      onChange={e => setEnquiry({ ...enquiry, name: e.target.value })}
                      placeholder="e.g. Ama Darko"
                      className="soft-input"
                    />
                  </label>
                  <label className="field-label">
                    Email address
                    <input
                      required
                      type="email"
                      value={enquiry.email}
                      onChange={e => setEnquiry({ ...enquiry, email: e.target.value })}
                      placeholder="you@example.com"
                      className="soft-input"
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="field-label">
                    Phone (optional)
                    <input
                      value={enquiry.phone}
                      onChange={e => setEnquiry({ ...enquiry, phone: e.target.value })}
                      placeholder="+233…"
                      className="soft-input"
                    />
                  </label>
                  <label className="field-label">
                    Subject (optional)
                    <input
                      value={enquiry.subject}
                      onChange={e => setEnquiry({ ...enquiry, subject: e.target.value })}
                      placeholder="Admissions, salon, store…"
                      className="soft-input"
                    />
                  </label>
                </div>

                <label className="field-label">
                  Message
                  <textarea
                    required
                    rows={4}
                    value={enquiry.message}
                    onChange={e => setEnquiry({ ...enquiry, message: e.target.value })}
                    placeholder="Tell us how we can help."
                    className="soft-input resize-none"
                  />
                </label>

                <Button
                  type="submit"
                  disabled={sendEnquiry.isPending}
                  className="justify-center rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] py-5 font-bold text-white shadow-[0_10px_28px_rgba(254,0,182,.3)] hover:scale-[1.01] transition-transform disabled:opacity-60"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {sendEnquiry.isPending ? "Sending…" : "Send message"}
                </Button>
              </form>
            </div>
          </div>

          <aside className="h-fit rounded-[2.25rem] border border-[#8f0d6b]/15 bg-gradient-to-br from-[#8f0d6b] to-[#450534] p-8 text-white shadow-xl sm:p-10">
            <p className="text-[11px] font-bold uppercase tracking-[.22em] text-[#ffb8ed]">Next Steps</p>
            <h2 className="mt-5 font-serif text-3xl font-bold text-white sm:text-4xl">
              Ready to take the leap into beauty mastery?
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/85">
              Submit your admissions application online today, or book a salon service to experience our craft first-hand.
            </p>

            <div className="mt-10 grid gap-4">
              <Link href="/apply">
                <Button className="w-full rounded-full bg-white py-6 font-bold text-[#8f0d6b] shadow-lg hover:scale-105 hover:text-white transition-transform">
                  Apply to Blush With Tee <ArrowRight className="ml-2 h-4 w-4 text-[#8f0d6b]" />
                </Button>
              </Link>
              <Link href="/appointments">
                <Button
                  variant="outline"
                  className="w-full rounded-full border-white/30 bg-white/10 py-6 font-semibold text-white backdrop-blur hover:bg-white/20 hover:text-white"
                >
                  Book a Salon Service
                </Button>
              </Link>
            </div>
          </aside>
        </div>

        {faqs.length ? (
          <section className="mt-20 max-w-3xl">
            <p className="eyebrow">Good to know</p>
            <h2 className="mt-4 font-serif text-4xl font-bold text-[#8f0d6b]">Frequently asked questions</h2>
            <Accordion type="single" collapsible className="mt-8 rounded-3xl border border-[#8f0d6b]/15 bg-white/90 px-6 shadow-[0_12px_36px_rgba(143,13,107,.06)]">
              {faqs.map(faq => (
                <AccordionItem key={faq.id} value={String(faq.id)} className="border-[#8f0d6b]/10">
                  <AccordionTrigger className="text-left font-semibold text-[#8f0d6b] hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="whitespace-pre-line text-sm leading-7 text-[#692156]">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ) : null}
      </main>
    </PublicShell>
  );
}

function ContactCard({
  icon,
  label,
  value,
  href,
  external,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  external?: boolean;
}) {
  const body = (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#faeaf6] text-[#fe00b6]">{icon}</div>
      <div className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-[.18em] text-[#8f0d6b]">{label}</span>
        <span className="mt-0.5 block break-words text-base font-semibold text-[#8f0d6b]">{value}</span>
      </div>
    </div>
  );

  const card =
    "block rounded-3xl border border-[#8f0d6b]/15 bg-white/90 p-6 shadow-[0_12px_36px_rgba(143,13,107,.06)]";

  return href ? (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={`${card} transition-colors hover:border-[#fe00b6]/40`}
    >
      {body}
    </a>
  ) : (
    <div className={card}>{body}</div>
  );
}
