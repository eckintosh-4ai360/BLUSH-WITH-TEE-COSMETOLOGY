import Link from "next/link";
import { Mail, MapPin, Phone, MessageSquare, ArrowRight } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import PublicShell from "@/components/PublicShell";

export default function ContactPage() {
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

            <div className="mt-10 grid gap-4 text-sm text-[#6a2557]">
              <div className="rounded-3xl border border-[#8f0d6b]/15 bg-white/90 p-6 shadow-[0_12px_36px_rgba(143,13,107,.06)]">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#faeaf6] text-[#fe00b6]">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-[.18em] text-[#8f0d6b]">
                      Admissions & Inquiries
                    </span>
                    <span className="mt-0.5 block font-semibold text-base text-[#8f0d6b]">
                      admissions@blushwithtee.com
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-[#8f0d6b]/15 bg-white/90 p-6 shadow-[0_12px_36px_rgba(143,13,107,.06)]">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#faeaf6] text-[#fe00b6]">
                    <Phone className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-[.18em] text-[#8f0d6b]">
                      Direct Telephone / WhatsApp
                    </span>
                    <span className="mt-0.5 block font-semibold text-base text-[#8f0d6b]">
                      +233 (0) 50 000 0000
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-[#8f0d6b]/15 bg-white/90 p-6 shadow-[0_12px_36px_rgba(143,13,107,.06)]">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#faeaf6] text-[#fe00b6]">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-[.18em] text-[#8f0d6b]">
                      Academy Campus Studio
                    </span>
                    <span className="mt-0.5 block font-medium text-sm text-[#6a2557]">
                      BWT School of Cosmetology Campus, Accra, Ghana
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-[2.25rem] border border-[#8f0d6b]/15 bg-gradient-to-br from-[#8f0d6b] to-[#450534] p-8 text-white shadow-xl sm:p-10">
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
