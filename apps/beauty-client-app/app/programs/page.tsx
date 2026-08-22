"use client";

import Link from "next/link";
import { ArrowRight, Clock3, GraduationCap, Sparkles } from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import PublicShell from "@/components/PublicShell";
import { trpc } from "@/lib/trpc";

export default function ProgramsPage() {
  const { data: courses = [], isLoading } = trpc.content.courses.useQuery();

  return (
    <PublicShell>
      <main className="container py-16 sm:py-24">
        <div className="max-w-3xl">
          <p className="eyebrow">Cosmetology Pathways</p>
          <h1 className="mt-5 font-serif text-5xl font-bold leading-none text-[#8f0d6b] sm:text-6xl">
            Find the craft that sparks your passion.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#692156]">
            Every curriculum at Blush With Tee integrates core theory, masterclass demonstration, supervised salon clinic hours, and entrepreneurial coaching.
          </p>
        </div>

        <section className="mt-16 grid gap-6 lg:grid-cols-3">
          {isLoading ? (
            [1, 2, 3].map(x => (
              <div key={x} className="h-96 animate-pulse rounded-3xl bg-white/70 border border-[#8f0d6b]/10" />
            ))
          ) : (
            courses.map(course => (
              <article
                key={course.id}
                className="relative flex min-h-[400px] flex-col rounded-3xl border border-[#8f0d6b]/15 bg-white/85 p-8 shadow-[0_16px_40px_rgba(143,13,107,.08)] transition-all duration-300 hover:-translate-y-1 hover:border-[#fe00b6]/40 hover:shadow-[0_20px_45px_rgba(254,0,182,.14)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <Badge className="rounded-full bg-[#faeaf6] px-3.5 py-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#8f0d6b] hover:bg-[#faeaf6]">
                    {course.code}
                  </Badge>
                  {course.isFeatured && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[.18em] text-[#fe00b6]">
                      <Sparkles className="h-3 w-3" /> Featured
                    </span>
                  )}
                </div>

                <h2 className="mt-8 font-serif text-3xl font-bold leading-tight text-[#8f0d6b]">
                  {course.title}
                </h2>
                <p className="mt-4 text-sm leading-7 text-[#6a2557]">
                  {course.summary}
                </p>

                <div className="mt-auto border-t border-[#8f0d6b]/15 pt-6">
                  <div className="flex items-center gap-5 text-xs font-semibold text-[#8f0d6b]">
                    <span className="flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5 text-[#fe00b6]" />
                      {course.durationWeeks} weeks
                    </span>
                    <span className="flex items-center gap-1.5">
                      <GraduationCap className="h-3.5 w-3.5 text-[#fe00b6]" />
                      {course.certification}
                    </span>
                  </div>

                  <p className="mt-4 font-serif text-2xl font-bold text-[#8f0d6b]">
                    GHS {Number(course.tuition).toLocaleString()}
                  </p>

                  <Link href="/apply" className="block mt-4">
                    <Button
                      variant="ghost"
                      className="h-auto p-0 text-sm font-bold text-[#fe00b6] hover:bg-transparent hover:text-[#8f0d6b] transition-colors"
                    >
                      Apply for this programme <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </article>
            ))
          )}
        </section>
      </main>
    </PublicShell>
  );
}

