"use client";

import Link from "next/link";
import { ArrowRight, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { formatPhone, telHref, whatsappHref } from "@blush/shared/contact";
import { Button } from "@blush/ui/components/ui/button";
import PublicShell from "@/components/PublicShell";
import { useSchoolProfile } from "@/hooks/useSchoolProfile";

export default function ContactPage() {
  const { data: school, isLoading } = useSchoolProfile();

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
              Have questions about program schedules, admission requirements, kit supplies, or student clinic bookings? Our friendly admissions team is here to help.
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
          </div>

          <aside className="h-fit rounded-[2.25rem] border border-[#8f0d6b]/15 bg-gradient-to-br from-[#8f0d6b] to-[#450534] p-8 text-white shadow-xl sm:p-10">
            <p className="text-[11px] font-bold uppercase tracking-[.22em] text-[#ffb8ed]">Next Steps</p>
            <h2 className="mt-5 font-serif text-3xl font-bold text-white sm:text-4xl">
              Ready to take the leap into beauty mastery?
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/85">
              Submit your admissions application online today or visit our student clinic to experience our craft first-hand.
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
                  Book a Student Clinic Service
                </Button>
              </Link>
            </div>
          </aside>
        </div>
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
