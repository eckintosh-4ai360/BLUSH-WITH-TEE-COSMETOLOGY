"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flower2, Menu, Sparkles } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { startLogin } from "@/lib/auth";

const links = [
  { label: "About", path: "/about" },
  { label: "Programs", path: "/programs" },
  { label: "Gallery", path: "/gallery" },
  { label: "Store", path: "/store" },
  { label: "Clinic", path: "/appointments" },
];

export default function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The homepage opens on a dark hero, so the header sits transparent over it
  // and only takes on its light surface once the user scrolls past.
  const onDark = pathname === "/" && !scrolled && !menuOpen;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#fdfaff] text-[#403c59]">
      <header className={`sticky top-0 z-50 border-b transition-colors duration-300 ${onDark ? "border-white/10 bg-transparent" : "border-white/55 bg-[#fdfaff]/75 backdrop-blur-xl"}`}>
        <div className="container flex h-20 items-center justify-between gap-5">
          <Link href="/" className="group flex items-center gap-3">
            <span className={`grid h-10 w-10 place-items-center rounded-full border transition-colors duration-300 group-hover:scale-105 ${onDark ? "border-white/25 bg-white/10 text-white" : "border-[#73688d]/20 bg-white/70 text-[#675c80] shadow-[0_8px_22px_rgba(111,90,134,0.12)]"}`}>
              <Flower2 className="h-5 w-5" />
            </span>
            <span>
              <span className={`block font-serif text-xl font-semibold tracking-tight transition-colors duration-300 ${onDark ? "text-white" : "text-[#4b4662]"}`}>GlowCraft</span>
              <span className={`block text-[9px] font-medium uppercase tracking-[0.28em] transition-colors duration-300 ${onDark ? "text-white/60" : "text-[#80768f]"}`}>Beauty Academy</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary navigation">
            {links.map(link => (
              <Link key={link.path} href={link.path} className={`text-[11px] font-medium uppercase tracking-[0.18em] transition-colors duration-300 ${onDark ? "text-white/70 hover:text-white" : pathname === link.path ? "text-[#5f4d77]" : "text-[#726c7f] hover:text-[#5f4d77]"}`}>
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
            {user ? (
              <Link href="/portal"><Button variant="outline" className={`rounded-full px-4 text-xs transition-colors duration-300 ${onDark ? "border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" : "border-[#675c80]/25 bg-white/70 text-[#514a68] hover:bg-white"}`}>My portal</Button></Link>
            ) : (
              <Button variant="ghost" className={`rounded-full text-xs transition-colors duration-300 ${onDark ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-[#514a68] hover:bg-white/70"}`} onClick={() => startLogin()}>Sign in</Button>
            )}
            <Link href="/apply"><Button className={`rounded-full px-5 text-xs transition-colors duration-300 ${onDark ? "bg-white text-[#332a44] hover:bg-white/90" : "bg-[#5f5277] text-white shadow-[0_12px_24px_rgba(95,82,119,0.25)] hover:bg-[#4d4264]"}`}>Apply now</Button></Link>
          </div>

          <button className={`grid h-10 w-10 place-items-center rounded-full border transition-colors duration-300 lg:hidden ${onDark ? "border-white/25 bg-white/10 text-white" : "border-[#73688d]/15 bg-white/70"}`} onClick={() => setMenuOpen(v => !v)} aria-label="Toggle navigation">
            <Menu className="h-5 w-5" />
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-white/70 bg-[#fdfaff]/95 px-5 py-5 lg:hidden">
            <nav className="mx-auto flex max-w-xl flex-col gap-3" aria-label="Mobile navigation">
              {links.map(link => <Link key={link.path} href={link.path} onClick={() => setMenuOpen(false)} className="rounded-xl px-3 py-2 text-sm font-medium hover:bg-white">{link.label}</Link>)}
              <Link href="/apply" onClick={() => setMenuOpen(false)} className="rounded-xl bg-[#5f5277] px-3 py-3 text-center text-sm font-semibold text-white">Begin an application</Link>
            </nav>
          </div>
        )}
      </header>
      {children}
      <footer className="mt-24 border-t border-white/80 bg-white/45">
        <div className="container grid gap-10 py-12 md:grid-cols-[1.1fr_.8fr_.8fr]">
          <div>
            <div className="flex items-center gap-2 text-[#5e5474]"><Sparkles className="h-4 w-4" /><span className="font-serif text-lg">GlowCraft Academy</span></div>
            <p className="mt-4 max-w-sm text-sm leading-7 text-[#716b7d]">A gentle place to explore skill, build confidence, and shape a thoughtful beauty practice.</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#867d94]">Explore</p>
            <div className="mt-4 grid gap-2 text-sm text-[#625b71]">
              <Link href="/programs">Programs</Link><Link href="/apply">Admissions</Link><Link href="/store">Store</Link>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#867d94]">Connect</p>
            <div className="mt-4 grid gap-2 text-sm text-[#625b71]">
              <Link href="/appointments">Student clinic</Link><Link href="/contact">Contact the academy</Link><Link href="/portal">Member portal</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
