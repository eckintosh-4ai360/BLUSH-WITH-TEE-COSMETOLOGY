"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, ShoppingBag, Sparkle, WandSparkles } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import PublicShell from "@/components/PublicShell";
import HeroCarousel, { type HeroSlide } from "@/components/HeroCarousel";

const heroStats = [
  { value: "12+", label: "Programmes" },
  { value: "600+", label: "Graduates" },
  { value: "94%", label: "Complete" },
];

// Photographs live in /public/hero (see the README there). Each slide keeps a
// gradient `tone` so the panel still reads as designed before the images land.
const heroSlides: HeroSlide[] = [
  {
    src: "/hero/hair.jpg",
    alt: "A student finishing a client's blow-dry in the teaching salon",
    label: "Hair artistry",
    meta: "24 weeks · Professional Certificate",
    href: "/programs",
    tone: "from-[#6d4f74] via-[#8a6486] to-[#4a3a5c]",
  },
  {
    src: "/hero/makeup.jpg",
    alt: "Close detail of a makeup artist blending colour on a client",
    label: "Makeup artistry",
    meta: "Studio-led practical hours",
    href: "/programs",
    tone: "from-[#8a5f70] via-[#a8788a] to-[#553f5b]",
  },
  {
    src: "/hero/nails.jpg",
    alt: "Nail technician shaping and finishing a manicure",
    label: "Nail craft & design",
    meta: "12 weeks · Weekend studio",
    href: "/programs",
    tone: "from-[#5f6f78] via-[#7f9a91] to-[#3f4f5c]",
  },
  {
    src: "/hero/skincare.jpg",
    alt: "A calm facial treatment in the student clinic",
    label: "Skincare & spa therapy",
    meta: "Student clinic appointments",
    href: "/appointments",
    tone: "from-[#63775f] via-[#8fae94] to-[#3f4f52]",
  },
];

const pathways = [
  { number: "01", title: "Learn with intention", text: "Structured theory, guided practice, and reflective feedback create a calm route from first lesson to professional confidence." },
  { number: "02", title: "Create in community", text: "A studio-minded experience where care, creativity, and technical craft meet in every practical session." },
  { number: "03", title: "Grow your next chapter", text: "Choose a learning path that supports your goals, from a focused craft to a broader beauty career." },
];

const testimonials = [
  { quote: "GlowCraft gave me the technique and the confidence to open my own studio within a year of graduating.", name: "Ama O.", program: "Professional Hair Artistry" },
  { quote: "The instructors treat every student like a future professional from day one. The practical hours made all the difference.", name: "Efua K.", program: "Nail Craft & Design" },
  { quote: "Applying online, tracking my documents, and paying fees all happened in one place. It made starting so much easier.", name: "Linda M.", program: "Foundations of Beauty" },
];

export default function Home() {
  return (
    <PublicShell>
      <main>
        {/* Pulled up under the sticky header so the dark ground runs edge to edge;
            PublicShell renders the header transparent while the hero is in view. */}
        <section className="hero-deep relative isolate -mt-20 overflow-hidden text-white">
          <div className="hero-grain pointer-events-none absolute inset-0 -z-10 opacity-45" />
          <div className="pointer-events-none absolute -left-40 top-[-18%] -z-10 h-[34rem] w-[34rem] rounded-full bg-[#a97fb0]/25 blur-[130px]" />
          <div className="pointer-events-none absolute -right-32 bottom-[-22%] -z-10 h-[30rem] w-[30rem] rounded-full bg-[#7fb39c]/20 blur-[130px]" />

          <div className="container grid items-center gap-16 pb-24 pt-44 lg:grid-cols-[1.08fr_.92fr] lg:pb-32 lg:pt-52">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/80 backdrop-blur">
                <Sparkle className="h-3.5 w-3.5" /> Beauty education, reimagined
              </div>

              <h1 className="mt-8 text-5xl font-semibold leading-[1.02] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
                Craft a life that<br />
                <span className="bg-gradient-to-r from-[#f6cddd] via-[#e9c4e6] to-[#cbb4e8] bg-clip-text text-transparent">feels like you.</span>
              </h1>

              <p className="mt-7 max-w-lg text-base leading-8 text-white/70 sm:text-lg">
                A welcoming cosmetology academy for people ready to discover their hands, shape a point of view, and practise the art of care.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link href="/apply">
                  <Button size="lg" className="h-12 rounded-full bg-white px-7 text-[#332a44] shadow-[0_18px_40px_rgba(0,0,0,.28)] hover:bg-white/90">
                    Start your application <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/programs">
                  <Button size="lg" variant="outline" className="h-12 rounded-full border-white/25 bg-white/5 px-7 text-white backdrop-blur hover:bg-white/15 hover:text-white">
                    Explore programmes
                  </Button>
                </Link>
              </div>

              <div className="hero-rule mt-12 h-px w-full max-w-lg" />

              <dl className="mt-8 grid max-w-lg grid-cols-3 gap-6">
                {heroStats.map(stat => (
                  <div key={stat.label}>
                    <dt className="text-3xl font-semibold tracking-tight text-white">{stat.value}</dt>
                    <dd className="mt-1.5 text-[11px] uppercase tracking-[.14em] text-white/55">{stat.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="relative mx-auto w-full max-w-md lg:max-w-lg">
              <HeroCarousel slides={heroSlides} />

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3.5 backdrop-blur">
                  <BookOpen className="h-4 w-4 shrink-0 text-[#d9bfe0]" />
                  <span className="text-xs leading-snug text-white/70">Flexible study pathways</span>
                </div>
                <div className="flex items-center gap-2.5 rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3.5 backdrop-blur">
                  <WandSparkles className="h-4 w-4 shrink-0 text-[#b3d9c6]" />
                  <span className="text-xs leading-snug text-white/70">Studio-led practical hours</span>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="container py-24"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]"><div><p className="eyebrow">The GlowCraft approach</p><h2 className="mt-5 font-serif text-4xl leading-tight text-[#484159] sm:text-5xl">A softer way to become exceptional.</h2></div><p className="max-w-2xl self-end text-lg leading-8 text-[#716a7d]">We pair clear professional standards with spacious, student-centered learning. You will build technique, a beautiful practice rhythm, and the confidence to show up for every client with care.</p></div><div className="mt-14 grid gap-4 md:grid-cols-3">{pathways.map(path => <article key={path.number} className="rounded-3xl border border-white/80 bg-white/60 p-7 shadow-[0_12px_36px_rgba(90,72,103,.06)] transition-transform duration-200 hover:-translate-y-1"><p className="text-[11px] font-semibold tracking-[.2em] text-[#a17d9f]">{path.number}</p><h3 className="mt-12 font-serif text-2xl text-[#51465c]">{path.title}</h3><p className="mt-4 text-sm leading-7 text-[#766e7f]">{path.text}</p></article>)}</div></section>
        <section className="relative overflow-hidden bg-[#f1ebf4]/75 py-24"><div className="container grid gap-12 lg:grid-cols-[1fr_.82fr]"><div className="rounded-[2rem] bg-[#dac8da]/40 p-8 sm:p-12"><p className="eyebrow">Discover your programme</p><h2 className="mt-5 max-w-lg font-serif text-4xl leading-tight text-[#4d445a] sm:text-5xl">From first practice to professional presence.</h2><Link href="/programs"><Button variant="outline" className="mt-9 rounded-full border-[#6d5b76]/25 bg-white/70 px-6 text-[#584c63] hover:bg-white">View learning pathways <ArrowRight className="ml-2 h-4 w-4" /></Button></Link></div><div className="flex flex-col justify-center"><p className="eyebrow">More than a classroom</p><h3 className="mt-4 font-serif text-3xl text-[#51465c]">The studio is open.</h3><p className="mt-4 max-w-md text-sm leading-7 text-[#716a7c]">Visit the student clinic, find thoughtful beauty essentials, and move at your own pace through the information you need.</p><div className="mt-7 flex flex-wrap gap-3"><Link href="/appointments"><Button className="rounded-full bg-[#7d657e] text-white hover:bg-[#6a526b]">Book a clinic service</Button></Link><Link href="/store"><Button variant="ghost" className="rounded-full text-[#65576f] hover:bg-white/70"><ShoppingBag className="mr-2 h-4 w-4" />Visit the store</Button></Link></div></div></div></section>
        <section className="container py-24"><div className="max-w-2xl"><p className="eyebrow">Student voices</p><h2 className="mt-5 font-serif text-4xl leading-tight text-[#484159] sm:text-5xl">What graduates say.</h2></div><div className="mt-14 grid gap-5 md:grid-cols-3">{testimonials.map(item => <figure key={item.name} className="flex h-full flex-col rounded-3xl border border-white/80 bg-white/65 p-7 shadow-[0_12px_36px_rgba(90,72,103,.06)]"><blockquote className="text-sm leading-7 text-[#5b5266]">“{item.quote}”</blockquote><figcaption className="mt-6 border-t border-[#6d5c78]/10 pt-4"><p className="text-sm font-semibold text-[#51465c]">{item.name}</p><p className="mt-1 text-xs uppercase tracking-[.14em] text-[#8a808f]">{item.program}</p></figcaption></figure>)}</div></section>
      </main>
    </PublicShell>
  );
}
