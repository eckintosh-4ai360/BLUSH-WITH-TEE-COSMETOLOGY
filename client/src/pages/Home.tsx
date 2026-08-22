import PublicShell from "@/components/PublicShell";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, CalendarDays, ShoppingBag, Sparkle, WandSparkles } from "lucide-react";
import { Link } from "wouter";

const pathways = [
  { number: "01", title: "Learn with intention", text: "Structured theory, guided practice, and reflective feedback create a calm route from first lesson to professional confidence." },
  { number: "02", title: "Create in community", text: "A studio-minded experience where care, creativity, and technical craft meet in every practical session." },
  { number: "03", title: "Grow your next chapter", text: "Choose a learning path that supports your goals, from a focused craft to a broader beauty career." },
];

export default function Home() {
  return (
    <PublicShell>
      <main>
        <section className="relative isolate overflow-hidden">
          <div className="hero-mist absolute inset-0 -z-10" />
          <div className="vertical-lines absolute inset-0 -z-10 opacity-60" />
          <div className="container grid min-h-[680px] items-center gap-14 py-20 lg:grid-cols-[1.15fr_.85fr] lg:py-28">
            <div className="max-w-3xl">
              <div className="mb-7 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#766b85]"><Sparkle className="h-3.5 w-3.5" /> Beauty education, reimagined</div>
              <h1 className="font-serif text-5xl leading-[.96] tracking-[-0.045em] text-[#423b57] sm:text-6xl lg:text-8xl">Craft a life that<br /><span className="text-[#7f657d]">feels like you.</span></h1>
              <p className="mt-8 max-w-xl text-base leading-8 text-[#686175] sm:text-lg">GlowCraft is a welcoming beauty academy for people ready to discover their hands, shape their point of view, and practice the art of care.</p>
              <div className="mt-10 flex flex-wrap gap-3"><Link href="/apply"><Button size="lg" className="rounded-full bg-[#5f5277] px-7 text-white shadow-[0_16px_32px_rgba(95,82,119,0.24)] hover:bg-[#4d4264]">Start your application <ArrowRight className="ml-2 h-4 w-4" /></Button></Link><Link href="/programs"><Button size="lg" variant="outline" className="rounded-full border-[#5f5277]/20 bg-white/55 px-7 text-[#554b69] hover:bg-white">Explore programs</Button></Link></div>
              <div className="mt-14 flex flex-wrap gap-x-10 gap-y-4 text-sm text-[#635c70]"><span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-[#8d748f]" /> Flexible study pathways</span><span className="flex items-center gap-2"><WandSparkles className="h-4 w-4 text-[#8d748f]" /> Studio-led practical learning</span></div>
            </div>
            <div className="relative mx-auto w-full max-w-md"><div className="relative aspect-[.88] overflow-hidden rounded-[2.5rem] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,.78),rgba(234,222,241,.6),rgba(217,237,229,.7))] p-6 shadow-[0_30px_80px_rgba(84,65,102,0.17)]"><div className="corner-accent left-6 top-6" /><div className="corner-accent corner-accent--flip right-6 top-6" /><div className="absolute inset-x-10 bottom-10 top-20 rounded-[1.8rem] bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,.9),rgba(237,217,230,.68)_40%,rgba(194,221,210,.5)_75%)]" /><div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-white/25 shadow-[inset_0_0_0_18px_rgba(255,255,255,.22)]" /><div className="absolute inset-x-10 bottom-12 rounded-2xl border border-white/70 bg-white/65 p-5 backdrop-blur-sm"><p className="text-[10px] font-semibold uppercase tracking-[.24em] text-[#85748b]">Your next learning season</p><p className="mt-2 font-serif text-2xl text-[#554861]">Begin beautifully.</p></div></div><div className="absolute -bottom-6 -left-9 hidden rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[0_14px_32px_rgba(84,65,102,0.13)] backdrop-blur md:block"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#eee3ed] text-[#7d6380]"><CalendarDays className="h-4 w-4" /></span><div><p className="text-[10px] uppercase tracking-[.16em] text-[#8a8291]">New pathways</p><p className="text-sm font-semibold text-[#554e63]">Applications open</p></div></div></div></div>
          </div>
        </section>
        <section className="container py-24"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]"><div><p className="eyebrow">The GlowCraft approach</p><h2 className="mt-5 font-serif text-4xl leading-tight text-[#484159] sm:text-5xl">A softer way to become exceptional.</h2></div><p className="max-w-2xl self-end text-lg leading-8 text-[#716a7d]">We pair clear professional standards with spacious, student-centered learning. You will build technique, a beautiful practice rhythm, and the confidence to show up for every client with care.</p></div><div className="mt-14 grid gap-4 md:grid-cols-3">{pathways.map(path => <article key={path.number} className="rounded-3xl border border-white/80 bg-white/60 p-7 shadow-[0_12px_36px_rgba(90,72,103,.06)] transition-transform duration-200 hover:-translate-y-1"><p className="text-[11px] font-semibold tracking-[.2em] text-[#a17d9f]">{path.number}</p><h3 className="mt-12 font-serif text-2xl text-[#51465c]">{path.title}</h3><p className="mt-4 text-sm leading-7 text-[#766e7f]">{path.text}</p></article>)}</div></section>
        <section className="relative overflow-hidden bg-[#f1ebf4]/75 py-24"><div className="container grid gap-12 lg:grid-cols-[1fr_.82fr]"><div className="rounded-[2rem] bg-[#dac8da]/40 p-8 sm:p-12"><p className="eyebrow">Discover your programme</p><h2 className="mt-5 max-w-lg font-serif text-4xl leading-tight text-[#4d445a] sm:text-5xl">From first practice to professional presence.</h2><Link href="/programs"><Button variant="outline" className="mt-9 rounded-full border-[#6d5b76]/25 bg-white/70 px-6 text-[#584c63] hover:bg-white">View learning pathways <ArrowRight className="ml-2 h-4 w-4" /></Button></Link></div><div className="flex flex-col justify-center"><p className="eyebrow">More than a classroom</p><h3 className="mt-4 font-serif text-3xl text-[#51465c]">The studio is open.</h3><p className="mt-4 max-w-md text-sm leading-7 text-[#716a7c]">Visit the student clinic, find thoughtful beauty essentials, and move at your own pace through the information you need.</p><div className="mt-7 flex flex-wrap gap-3"><Link href="/appointments"><Button className="rounded-full bg-[#7d657e] text-white hover:bg-[#6a526b]">Book a clinic service</Button></Link><Link href="/store"><Button variant="ghost" className="rounded-full text-[#65576f] hover:bg-white/70"><ShoppingBag className="mr-2 h-4 w-4" />Visit the store</Button></Link></div></div></div></section>
      </main>
    </PublicShell>
  );
}
