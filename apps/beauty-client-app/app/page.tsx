"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Sparkles, WandSparkles, Award, Users, CheckCircle2, ShoppingBag } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import PublicShell from "@/components/PublicShell";
import HeroCarousel, { type HeroSlide } from "@/components/HeroCarousel";

const heroStats = [
  { value: "12+", label: "Cosmetology Programs" },
  { value: "600+", label: "Certified Alumni" },
  { value: "98%", label: "Employment Rate" },
];

const heroSlides: HeroSlide[] = [
  {
    src: "/hero/hair.jpg",
    alt: "A beauty student styling and finishing luxurious hair in the salon studio",
    label: "Hair Artistry & Design",
    meta: "24 Weeks · Professional Diploma",
    href: "/programs",
    tone: "from-[#8f0d6b] via-[#54063f] to-[#1c0015]",
  },
  {
    src: "/hero/makeup.jpg",
    alt: "Close-up of a student applying vibrant editorial blush and makeup artistry",
    label: "Professional Makeup Artistry",
    meta: "Masterclasses & Studio Practical",
    href: "/programs",
    tone: "from-[#fe00b6] via-[#8f0d6b] to-[#2b0021]",
  },
  {
    src: "/hero/nails.jpg",
    alt: "Precision nail technician crafting intricate gel manicure art",
    label: "Nail Craft & Technology",
    meta: "12 Weeks · Studio Certification",
    href: "/programs",
    tone: "from-[#b80f8b] via-[#6e0852] to-[#1a0114]",
  },
  {
    src: "/hero/skincare.jpg",
    alt: "A soothing aesthetic skincare facial treatment in the clinic",
    label: "Skincare & Spa Aesthetics",
    meta: "Supervised Clinic Practice",
    href: "/appointments",
    tone: "from-[#8f0d6b] via-[#a8107e] to-[#25021c]",
  },
];

const pathways = [
  {
    number: "01",
    title: "Master High-Demand Skills",
    text: "From foundation techniques to contemporary trends in hair, makeup, nails, and esthetics, graduate with industry-ready mastery.",
  },
  {
    number: "02",
    title: "Hands-On Studio Training",
    text: "Experience real-world salon operations, live client clinics, and personalized mentorship from seasoned beauty educators.",
  },
  {
    number: "03",
    title: "Launch Your Beauty Career",
    text: "Develop client consultation expertise, professional portfolio development, business ethics, and entrepreneurial readiness.",
  },
];

const testimonials = [
  {
    quote: "Blush With Tee gave me the craft, technique, and confidence to open my own beauty studio within six months of graduation.",
    name: "Ama Osei",
    program: "Comprehensive Cosmetology & Hair Artistry",
  },
  {
    quote: "The educators treat you like an artist from day one. The real clinic hours with paying clients gave me unbeatable confidence.",
    name: "Efua Mensah",
    program: "Advanced Makeup & Nail Technology",
  },
  {
    quote: "The admissions process was seamless, fees were transparent, and the kit provided was top-tier salon quality.",
    name: "Linda Akoto",
    program: "Professional Esthetics & Skin Therapy",
  },
];

export default function Home() {
  return (
    <PublicShell>
      <main>
        {/* Deep Glamour Hero with Magenta & Plum accents */}
        <section className="hero-deep relative isolate overflow-hidden text-white">
          <div className="hero-grain pointer-events-none absolute inset-0 -z-10 opacity-40" />
          <div className="pointer-events-none absolute -left-40 top-[-15%] -z-10 h-[36rem] w-[36rem] rounded-full bg-[#fe00b6]/25 blur-[140px]" />
          <div className="pointer-events-none absolute -right-32 bottom-[-20%] -z-10 h-[32rem] w-[32rem] rounded-full bg-[#8f0d6b]/40 blur-[140px]" />

          <div className="container grid items-center gap-14 pb-24 pt-24 lg:grid-cols-[1.08fr_.92fr] lg:pb-32 lg:pt-32">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#fe00b6]/35 bg-white/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#ffb8ed] backdrop-blur-md shadow-[0_0_20px_rgba(254,0,182,0.25)]">
                <Sparkles className="h-3.5 w-3.5 text-[#fe00b6]" /> BWT School of Cosmetology
              </div>

              <h1 className="mt-8 text-5xl font-bold leading-[1.02] tracking-[-0.03em] sm:text-6xl lg:text-7xl">
                Master the Art of Beauty. <br />
                <span className="bg-gradient-to-r from-[#ffffff] via-[#ff94e4] to-[#fe00b6] bg-clip-text text-transparent drop-shadow-[0_4px_12px_rgba(254,0,182,0.3)]">
                  Shape Your Future.
                </span>
              </h1>

              <p className="mt-7 max-w-lg text-base leading-8 text-white/80 sm:text-lg">
                Ghana&apos;s premier cosmetology academy empowering aspiring beauty artists with hands-on training, industry certifications, and entrepreneurial excellence.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link href="/apply">
                  <Button
                    size="lg"
                    className="h-12 rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-8 text-sm font-bold text-white shadow-[0_12px_32px_rgba(254,0,182,0.4)] transition-all duration-300 hover:scale-105 hover:shadow-[0_16px_40px_rgba(254,0,182,0.6)]"
                  >
                    Start Your Application <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/programs">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 rounded-full border-white/30 bg-white/10 px-7 text-sm font-semibold text-white backdrop-blur hover:bg-white/20 hover:text-white"
                  >
                    Explore Programs
                  </Button>
                </Link>
              </div>

              <div className="hero-rule mt-12 h-px w-full max-w-lg" />

              <dl className="mt-8 grid max-w-lg grid-cols-3 gap-6">
                {heroStats.map(stat => (
                  <div key={stat.label}>
                    <dt className="text-3xl font-extrabold tracking-tight text-white">{stat.value}</dt>
                    <dd className="mt-1.5 text-[11px] font-semibold uppercase tracking-[.14em] text-[#ffc2ee]">{stat.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="relative mx-auto w-full max-w-md lg:max-w-lg">
              <HeroCarousel slides={heroSlides} />

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-3.5 backdrop-blur">
                  <BookOpen className="h-4 w-4 shrink-0 text-[#fe00b6]" />
                  <span className="text-xs font-medium leading-snug text-white/90">Accredited Curricula</span>
                </div>
                <div className="flex items-center gap-2.5 rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-3.5 backdrop-blur">
                  <WandSparkles className="h-4 w-4 shrink-0 text-[#fe00b6]" />
                  <span className="text-xs font-medium leading-snug text-white/90">Studio-Led Practice</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Philosophy / Approach */}
        <section className="container py-24">
          <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <p className="eyebrow">The BWT Academy Experience</p>
              <h2 className="mt-5 font-serif text-4xl font-bold leading-tight text-[#8f0d6b] sm:text-5xl">
                Where passion meets precision and craft.
              </h2>
            </div>
            <p className="max-w-2xl self-end text-lg leading-8 text-[#5c1c4b]">
              At BWT School of Cosmetology, we blend technical mastery, creative innovation, and professional client etiquette. You will graduate with the portfolio, confidence, and skill set to excel in the competitive global beauty market.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {pathways.map(path => (
              <article
                key={path.number}
                className="group relative rounded-3xl border border-[#8f0d6b]/15 bg-white/80 p-8 shadow-[0_12px_36px_rgba(143,13,107,.07)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[#fe00b6]/40 hover:shadow-[0_20px_45px_rgba(254,0,182,.14)]"
              >
                <span className="inline-block rounded-full bg-[#faeaf6] px-3.5 py-1 text-xs font-bold tracking-[.18em] text-[#8f0d6b] group-hover:bg-[#fe00b6] group-hover:text-white transition-colors">
                  {path.number}
                </span>
                <h3 className="mt-8 font-serif text-2xl font-bold text-[#8f0d6b]">{path.title}</h3>
                <p className="mt-4 text-sm leading-7 text-[#6a2557]">{path.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Programme Discovery & Studio Banner */}
        <section className="relative overflow-hidden bg-gradient-to-r from-[#faeaf6] via-[#fdf2f9] to-[#ffffff] py-24">
          <div className="container grid gap-12 lg:grid-cols-[1fr_.85fr]">
            <div className="rounded-[2.25rem] bg-gradient-to-br from-[#8f0d6b] to-[#4d0639] p-8 text-white shadow-xl sm:p-12">
              <p className="text-[11px] font-bold uppercase tracking-[.22em] text-[#ffb8ed]">Discover Your Pathway</p>
              <h2 className="mt-5 max-w-lg font-serif text-4xl font-bold leading-tight sm:text-5xl text-white">
                From beginner enthusiast to certified beauty master.
              </h2>
              <p className="mt-5 text-sm leading-7 text-white/85">
                Explore full-time diplomas, weekend certifications, and masterclasses in hair, makeup, nails, and skincare tailored to your schedule.
              </p>
              <Link href="/programs">
                <Button className="mt-9 rounded-full bg-white px-7 text-sm font-bold text-[#8f0d6b] shadow-lg hover:bg-[#faeaf6]">
                  View All Programmes <ArrowRight className="ml-2 h-4 w-4 text-[#fe00b6]" />
                </Button>
              </Link>
            </div>

            <div className="flex flex-col justify-center">
              <p className="eyebrow">Student Clinic & Academy Store</p>
              <h3 className="mt-4 font-serif text-3xl font-bold text-[#8f0d6b]">
                Real beauty salon experience.
              </h3>
              <p className="mt-4 max-w-md text-sm leading-7 text-[#692156]">
                Experience luxury beauty services in our supervised student clinic or stock up on professional academy-grade makeup, hair tools, and beauty kits.
              </p>
              <div className="mt-8 flex flex-wrap gap-3.5">
                <Link href="/appointments">
                  <Button className="rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-6 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(254,0,182,0.3)] hover:scale-105 transition-transform">
                    Book Student Clinic Service
                  </Button>
                </Link>
                <Link href="/store">
                  <Button
                    variant="outline"
                    className="rounded-full border-[#8f0d6b]/25 bg-white px-6 text-xs font-semibold text-[#8f0d6b] hover:bg-[#faeaf6]"
                  >
                    <ShoppingBag className="mr-2 h-4 w-4 text-[#fe00b6]" />
                    Academy Store
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="container py-24">
          <div className="max-w-2xl">
            <p className="eyebrow">Student Stories</p>
            <h2 className="mt-5 font-serif text-4xl font-bold leading-tight text-[#8f0d6b] sm:text-5xl">
              What our graduates say.
            </h2>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map(item => (
              <figure
                key={item.name}
                className="flex h-full flex-col rounded-3xl border border-[#8f0d6b]/15 bg-white/80 p-8 shadow-[0_12px_36px_rgba(143,13,107,.06)] hover:border-[#fe00b6]/35 transition-colors"
              >
                <blockquote className="text-sm leading-7 text-[#5c1c4b] italic">
                  &ldquo;{item.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-6 border-t border-[#8f0d6b]/15 pt-5">
                  <p className="text-sm font-bold text-[#8f0d6b]">{item.name}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[.12em] text-[#fe00b6]">
                    {item.program}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

