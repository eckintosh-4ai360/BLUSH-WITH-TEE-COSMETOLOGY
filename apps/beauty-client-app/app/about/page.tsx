import PublicShell from "@/components/PublicShell";
import Link from "next/link";
import { ArrowRight, Sparkles, Heart, Award, Users } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";

export default function AboutPage() {
  return (
    <PublicShell>
      <main className="container py-16 sm:py-24">
        <section className="grid items-end gap-10 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <p className="eyebrow">About Blush With Tee</p>
            <h1 className="mt-5 max-w-3xl font-serif text-5xl font-bold leading-[1.05] text-[#8f0d6b] sm:text-6xl">
              Empowering beauty artists to build sustainable, world-class careers.
            </h1>
          </div>
          <p className="text-lg leading-8 text-[#692156]">
            Blush With Tee (BWT) School of Cosmetology is a premier beauty academy rooted in technical mastery, artistic vision, and entrepreneurship. We nurture aspiring cosmetologists into high-earning, confident beauty professionals.
          </p>
        </section>

        <section className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-3xl border border-[#8f0d6b]/15 bg-white/80 p-8 shadow-[0_12px_36px_rgba(143,13,107,.06)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#faeaf6] text-[#fe00b6]">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="eyebrow mt-5">Our Mission</p>
            <h2 className="mt-3 font-serif text-2xl font-bold text-[#8f0d6b]">Artistry with Purpose.</h2>
            <p className="mt-4 text-sm leading-7 text-[#6a2557]">
              We teach modern techniques in hair styling, makeup transformation, precision nail technology, and skincare while fostering professional discipline and client trust.
            </p>
          </div>

          <div className="rounded-3xl border border-[#8f0d6b]/15 bg-white/80 p-8 shadow-[0_12px_36px_rgba(143,13,107,.06)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#faeaf6] text-[#fe00b6]">
              <Award className="h-5 w-5" />
            </div>
            <p className="eyebrow mt-5">Practical Excellence</p>
            <h2 className="mt-3 font-serif text-2xl font-bold text-[#8f0d6b]">Hands-On Studio Hours.</h2>
            <p className="mt-4 text-sm leading-7 text-[#6a2557]">
              Theory meets practice in our fully equipped student salon. Students perform supervised services for real clients, building real confidence before graduation.
            </p>
          </div>

          <div className="rounded-3xl border border-[#8f0d6b]/15 bg-white/80 p-8 shadow-[0_12px_36px_rgba(143,13,107,.06)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#faeaf6] text-[#fe00b6]">
              <Users className="h-5 w-5" />
            </div>
            <p className="eyebrow mt-5">Our Community</p>
            <h2 className="mt-3 font-serif text-2xl font-bold text-[#8f0d6b]">Mentorship & Growth.</h2>
            <p className="mt-4 text-sm leading-7 text-[#6a2557]">
              Join a close-knit network of passionate beauty creators, alumni salon owners, and industry veterans dedicated to lifting each other up.
            </p>
          </div>
        </section>

        <section className="mt-20 rounded-[2.25rem] border border-[#8f0d6b]/15 bg-gradient-to-br from-[#8f0d6b] to-[#3d052d] p-8 text-white shadow-xl sm:p-14">
          <p className="text-[11px] font-bold uppercase tracking-[.22em] text-[#ffb8ed]">The BWT Standard</p>
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <p className="font-serif text-3xl font-bold leading-tight text-white sm:text-4xl">
              An all-in-one digital campus connecting learning, appointments, and credentials.
            </p>
            <div className="space-y-6">
              <p className="text-base leading-8 text-white/85">
                From your initial online application to tracking attendance, receiving exam assessments, booking clinic services, and shopping academy supplies — the Blush With Tee student portal streamlines your entire education.
              </p>
              <Link href="/apply" className="inline-block">
                <Button className="rounded-full bg-white px-7 text-sm font-bold text-[#8f0d6b] shadow-lg hover:bg-[#faeaf6]">
                  Start Your Application <ArrowRight className="ml-2 h-4 w-4 text-[#fe00b6]" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

