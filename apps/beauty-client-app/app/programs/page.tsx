"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Clock3,
  GraduationCap,
  Info,
  MapPin,
  Package,
  Phone,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { sortCourseCategories } from "@blush/shared/const";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import PublicShell from "@/components/PublicShell";
import { trpc } from "@/lib/trpc";

export default function ProgramsPage() {
  const { data: courses = [], isLoading } = trpc.content.courses.useQuery();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const categories = useMemo(() => {
    const cats = new Set<string>();
    courses.forEach(c => {
      if (c.category) cats.add(c.category);
    });
    return sortCourseCategories([...cats]);
  }, [courses]);

  const filteredCourses = useMemo(() => {
    if (selectedCategory === "all") return courses;
    return courses.filter(c => c.category === selectedCategory);
  }, [courses, selectedCategory]);

  return (
    <PublicShell>
      <main className="container py-16 sm:py-24">
        {/* Header section */}
        <div className="max-w-3xl">
          <Badge className="bg-[#faeaf6] text-[#8f0d6b] px-4 py-1.5 text-xs font-bold uppercase tracking-widest hover:bg-[#faeaf6]">
            Academic Curriculum & Prospectus
          </Badge>
          <h1 className="mt-4 font-serif text-4xl font-bold leading-none text-[#8f0d6b] sm:text-6xl">
            Find the craft that sparks your passion.
          </h1>
          <p className="mt-4 text-base font-semibold text-[#fe00b6] flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" />
            Blush With Tee Beauty School · Allied Filling Station, A&apos;koon - Tarkwa
          </p>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-[#692156]">
            Master full professional cosmetology or specialized individual beauty crafts under expert hands-on mentorship, comprehensive practical studio hours, and business readiness coaching.
          </p>
        </div>

        {/* Categories Tab Filter */}
        <div className="mt-10 flex items-center gap-2 overflow-x-auto pb-2">
          <Button
            size="sm"
            variant={selectedCategory === "all" ? "default" : "outline"}
            onClick={() => setSelectedCategory("all")}
            className={`rounded-full px-5 font-bold transition-all ${
              selectedCategory === "all"
                ? "bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] text-white shadow-md"
                : "border-[#8f0d6b]/20 bg-white/80 text-[#8f0d6b] hover:bg-[#faeaf6]"
            }`}
          >
            All Courses ({courses.length})
          </Button>

          {categories.map(category => {
            const count = courses.filter(c => c.category === category).length;
            return (
              <Button
                key={category}
                size="sm"
                variant={selectedCategory === category ? "default" : "outline"}
                onClick={() => setSelectedCategory(category)}
                className={`rounded-full px-5 font-bold transition-all ${
                  selectedCategory === category
                    ? "bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] text-white shadow-md"
                    : "border-[#8f0d6b]/20 bg-white/80 text-[#8f0d6b] hover:bg-[#faeaf6]"
                }`}
              >
                {category} ({count})
              </Button>
            );
          })}
        </div>

        {/* Courses Grid */}
        <section className="mt-8 grid gap-8 lg:grid-cols-3">
          {isLoading ? (
            [1, 2, 3, 4, 5, 6].map(x => (
              <div
                key={x}
                className="h-[460px] animate-pulse rounded-3xl bg-white/70 border border-[#8f0d6b]/10"
              />
            ))
          ) : filteredCourses.length === 0 ? (
            <div className="col-span-full py-16 text-center text-sm text-[#692156]">
              No courses found in this category.
            </div>
          ) : (
            filteredCourses.map(course => (
              <article
                key={course.id}
                className="relative flex min-h-[460px] flex-col rounded-3xl border border-[#8f0d6b]/15 bg-white/90 p-7 shadow-[0_16px_40px_rgba(143,13,107,.07)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[#fe00b6]/50 hover:shadow-[0_22px_48px_rgba(254,0,182,.14)]"
              >
                {/* Header Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="rounded-full bg-[#faeaf6] px-3.5 py-1 text-[11px] font-mono font-bold uppercase text-[#8f0d6b] hover:bg-[#faeaf6]">
                      {course.code}
                    </Badge>
                    {course.category && (
                      <span className="rounded-full bg-secondary/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8f0d6b]">
                        {course.category}
                      </span>
                    )}
                  </div>
                  {course.isFeatured && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[.18em] text-amber-700">
                      <Sparkles className="h-3 w-3" /> Featured
                    </span>
                  )}
                </div>

                {/* Title and Summary */}
                <h2 className="mt-6 font-serif text-2xl font-bold leading-snug text-[#8f0d6b]">
                  {course.title}
                </h2>
                <p className="mt-3 text-xs leading-relaxed text-[#6a2557]">
                  {course.summary}
                </p>

                {/* What the programme actually teaches, as the school lists it */}
                <div className="mt-4 space-y-2 rounded-2xl bg-[#faeaf6]/40 p-3.5 text-xs text-[#692156]">
                  <p className="font-semibold text-[#8f0d6b] flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5 text-[#fe00b6]" />
                    What You Will Learn
                  </p>
                  {course.outline.length ? (
                    <ul className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
                      {course.outline.map(item => (
                        <li key={item} className="flex items-start gap-1.5 text-[11px] leading-relaxed">
                          <CheckCircle2 className="mt-[1px] h-3 w-3 shrink-0 text-[#fe00b6]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="line-clamp-3 text-[11px] leading-relaxed">
                      {course.description}
                    </p>
                  )}
                </div>

                {/* Toiletries requirement if any */}
                {course.toiletries && (
                  <div className="mt-3 rounded-xl bg-muted/40 p-2.5 text-[11px] text-[#692156]">
                    <span className="font-bold text-[#8f0d6b]">Toiletries (Day 1):</span>{" "}
                    {course.toiletries}
                  </div>
                )}

                {/* Bottom Pricing & Apply Link */}
                <div className="mt-auto border-t border-[#8f0d6b]/15 pt-5">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#8f0d6b]">
                    <span className="flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5 text-[#fe00b6]" />
                      {course.durationWeeks} weeks
                    </span>
                    <span className="flex items-center gap-1.5">
                      <GraduationCap className="h-3.5 w-3.5 text-[#fe00b6]" />
                      {course.certification || "Certificate"}
                    </span>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between">
                    <div>
                      <span className="text-[10px] text-[#8f0d6b]/70 font-semibold block uppercase">
                        Tuition Fee
                      </span>
                      <p className="font-serif text-2xl font-bold text-[#8f0d6b]">
                        GH₵ {Number(course.tuition).toLocaleString()}
                      </p>
                    </div>

                    {course.productFee ? (
                      <div className="text-right">
                        <span className="text-[10px] text-amber-800 font-semibold block uppercase">
                          Product Fee
                        </span>
                        <p className="text-sm font-bold text-amber-900">
                          GH₵ {Number(course.productFee).toLocaleString()}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <Link href={`/apply?courseId=${course.id}`} className="block mt-4">
                    <Button
                      className="w-full rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] py-5 text-xs font-bold text-white shadow-md hover:scale-[1.02] transition-transform"
                    >
                      Apply for this Programme <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </article>
            ))
          )}
        </section>

        {/* School Policy Banner & Call to Action */}
        <section className="mt-16 rounded-[2.5rem] border border-[#8f0d6b]/15 bg-gradient-to-br from-white/95 to-[#faeaf6]/80 p-8 shadow-[0_20px_50px_rgba(143,13,107,.08)] sm:p-12">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <Badge className="bg-[#8f0d6b] text-white font-bold text-[11px] uppercase tracking-wider">
                School Policies & Guidelines
              </Badge>
              <h3 className="mt-3 font-serif text-3xl font-bold text-[#8f0d6b]">
                Training Standards & Requirements
              </h3>
              <ul className="mt-4 space-y-2.5 text-xs leading-relaxed text-[#692156]">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#fe00b6] shrink-0 mt-0.5" />
                  <span><b>Training Hours:</b> Monday to Saturday (8:00 AM – 5:00 PM) · Weekday beginners (9:00 AM – 2:00 PM) · Advanced (9:00 AM – 5:00 PM).</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#fe00b6] shrink-0 mt-0.5" />
                  <span><b>Authentic Products:</b> All specialized tools & cosmetic products are purchased at the school store for standard quality and uniformity.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#fe00b6] shrink-0 mt-0.5" />
                  <span><b>Graduation Criteria:</b> Students must pass all project assessments and settle tuition fully before receiving graduation certificate. Free re-sits are provided if needed.</span>
                </li>
                <li className="flex items-start gap-2 text-[#e01a4f] font-bold">
                  <ShieldAlert className="h-4 w-4 text-[#e01a4f] shrink-0 mt-0.5" />
                  <span>FEES PAID ARE STRICTLY NON-REFUNDABLE.</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col justify-center rounded-3xl bg-white/80 p-6 border border-[#8f0d6b]/10 text-center sm:p-8">
              <Sparkles className="mx-auto h-10 w-10 text-[#fe00b6]" />
              <h4 className="mt-3 font-serif text-2xl font-bold text-[#8f0d6b]">
                Ready to transform your beauty career?
              </h4>
              <p className="mt-2 text-xs leading-relaxed text-[#692156]">
                Fill out the official online admission form in minutes or visit our Tarkwa campus inside the Allied Filling Station, A&apos;koon.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link href="/apply" className="w-full sm:w-auto">
                  <Button className="w-full rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-8 py-5 text-sm font-bold text-white shadow-md">
                    Start Admission Form
                  </Button>
                </Link>
                <a href="tel:0597706250" className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full rounded-full border-[#8f0d6b]/25 text-[#8f0d6b] gap-2">
                    <Phone className="h-4 w-4" /> Call 059 770 6250
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
