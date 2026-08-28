"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  ChevronRight,
  ScrollText,
} from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import PublicShell from "@/components/PublicShell";
import { trpc } from "@/lib/trpc";

export default function TermsPage() {
  const { data, isLoading } = trpc.content.terms.useQuery();

  return (
    <PublicShell>
      <main className="relative min-h-screen">
        {/* Background gradient blobs */}
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden="true"
        >
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-[#fe00b6]/5 blur-3xl" />
          <div className="absolute top-1/2 -left-32 h-80 w-80 rounded-full bg-[#8f0d6b]/5 blur-3xl" />
        </div>

        <div className="container relative py-14 sm:py-20 max-w-5xl">
          {/* Breadcrumb */}
          <nav className="mb-8 flex items-center gap-1.5 text-xs text-[#8f0d6b]/60">
            <Link href="/" className="hover:text-[#fe00b6] transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="font-semibold text-[#8f0d6b]">Terms &amp; Conditions</span>
          </nav>

          {/* Header */}
          <div className="mb-12 text-center">
            <Badge className="bg-[#faeaf6] text-[#8f0d6b] px-4 py-1.5 text-xs font-bold uppercase tracking-widest hover:bg-[#faeaf6] mb-4">
              School Policy
            </Badge>
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#faeaf6] to-white border border-[#8f0d6b]/20 shadow-md">
              <ScrollText className="h-8 w-8 text-[#8f0d6b]" />
            </div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-[#8f0d6b] sm:text-4xl lg:text-5xl">
              Terms &amp; Conditions
            </h1>
            <p className="mt-3 text-base font-semibold text-[#fe00b6] uppercase tracking-wider">
              Governing the School
            </p>
            <p className="mt-2 text-sm text-[#692156] max-w-xl mx-auto">
              All students and applicants of Blush With Tee Beauty School are required to read, understand, and agree to the following terms before enrolling.
            </p>
          </div>

          {/* School Identity Banner */}
          <div className="mb-10 rounded-2xl border border-[#8f0d6b]/20 bg-gradient-to-r from-[#fdf2fa] via-white to-[#fdf2fa] p-5 text-center shadow-sm">
            <p className="font-serif text-xl font-bold text-[#8f0d6b]">BLUSH WITH TEE</p>
            <p className="text-sm text-[#692156] mt-0.5">Akoon inside Allied filling station, TARKWA</p>
            <p className="text-sm text-[#692156]">+233 545563536 | +233597706250</p>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-24 rounded-2xl bg-[#fdf2fa] animate-pulse" />
              ))}
            </div>
          )}

          {/* Terms Sections */}
          {data && (
            <div className="space-y-5">
              {data.sections.map((section, index) => (
                <div
                  key={index}
                  className="group rounded-2xl border border-[#8f0d6b]/12 bg-white p-6 shadow-[0_4px_18px_rgba(143,13,107,.05)] hover:shadow-[0_8px_30px_rgba(143,13,107,.10)] hover:border-[#8f0d6b]/25 transition-all duration-300"
                >
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#8f0d6b] to-[#fe00b6] text-white text-xs font-bold shadow-sm group-hover:scale-105 transition-transform">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <h2 className="font-serif font-bold text-[#8f0d6b] text-base sm:text-lg">
                        {section.title}
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-[#3d1030]">
                        {section.body}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {/* Footer / Non-refundable notice */}
              {data.footer && (
                <div className="mt-8 rounded-2xl border-2 border-[#e01a4f]/30 bg-gradient-to-r from-rose-50 via-white to-rose-50 p-6 flex items-center gap-4 shadow-sm">
                  <AlertTriangle className="h-8 w-8 shrink-0 text-[#e01a4f]" />
                  <p className="text-sm font-bold uppercase tracking-wider text-[#e01a4f]">
                    {data.footer}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Footer CTA */}
          <div className="mt-14 rounded-3xl bg-gradient-to-r from-[#fdf2fa] to-white border border-[#8f0d6b]/15 p-8 text-center shadow-sm">
            <BookOpen className="mx-auto h-8 w-8 text-[#fe00b6] mb-3" />
            <h3 className="font-serif text-lg font-bold text-[#8f0d6b]">Ready to Join the Academy?</h3>
            <p className="mt-1 text-sm text-[#692156] max-w-sm mx-auto">
              By submitting an application you confirm that you have read and accept all the above terms and conditions.
            </p>
            <Link
              href="/apply"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#8f0d6b] to-[#fe00b6] px-7 py-3 text-sm font-bold text-white shadow-md hover:shadow-[0_8px_24px_rgba(143,13,107,.35)] transition-all duration-300"
            >
              Apply Now <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </main>
    </PublicShell>
  );
}
