"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sparkles, X, Phone, MapPin, Mail, Instagram } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { startLogin } from "@/lib/auth";

const links = [
  { label: "Home", path: "/" },
  { label: "About", path: "/about" },
  { label: "Programs", path: "/programs" },
  { label: "Gallery", path: "/gallery" },
  { label: "Store", path: "/store" },
  { label: "Student Clinic", path: "/appointments" },
  { label: "Contact", path: "/contact" },
];

export default function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-clip bg-[#fdf8fc] text-[#2d0423]">
      <header className="sticky top-0 z-50 w-full border-b border-[#8f0d6b]/10 bg-white shadow-[0_4px_25px_rgba(143,13,107,0.06)]">
        <div className="container flex h-20 items-center justify-between gap-3 xl:gap-4">
          <Link href="/" className="group flex items-center gap-3">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[#fe00b6]/40 bg-white p-0.5 shadow-[0_6px_18px_rgba(143,13,107,0.14)] transition-all duration-300 group-hover:scale-105">
              <Image
                src="/logo.png"
                alt="BWT School of Cosmetology Logo"
                fill
                className="object-contain p-0.5"
                priority
              />
            </div>
            <div className="flex flex-col">
              {/* The name is a name: wrapping it to "Blush With / Tee" reads as
                  two things. It shrinks a step instead, and the strapline is
                  dropped in the band where the full nav is competing for the
                  same row. */}
              <span className="block whitespace-nowrap font-serif text-base font-bold tracking-tight text-[#8f0d6b] sm:text-lg">
                Blush With Tee
              </span>
              <span className="block whitespace-nowrap text-[8.5px] font-semibold uppercase tracking-[0.24em] text-[#fe00b6] lg:hidden xl:block">
                School of Cosmetology
              </span>
            </div>
          </Link>

          {/* gap and tracking both open up at xl. At 1024-1279 - iPad landscape -
              the seven links, the brand and the call to action have to share
              960px, and the roomy desktop spacing is what pushed "Student
              Clinic" onto a second line. */}
          <nav
            className="hidden items-center gap-4 lg:flex xl:gap-6"
            aria-label="Primary navigation"
          >
            {links.map(link => {
              const active = pathname === link.path;
              return (
                <Link
                  key={link.path}
                  href={link.path}
                  className={`whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.1em] transition-all duration-200 xl:tracking-[0.18em] ${
                    active ? "text-[#fe00b6] font-bold" : "text-[#691152] hover:text-[#fe00b6]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
            {/* Between lg and xl the primary nav is already on this row and
                there is no width left for a second button. "Apply Now" is the
                one that earns the space; the portal link is a tap away in the
                menu and in the footer. */}
            {user ? (
              <Link href="/portal" className="lg:hidden xl:block">
                <Button
                  variant="outline"
                  className="rounded-full border-[#8f0d6b]/25 bg-white px-4 text-xs font-semibold text-[#8f0d6b] transition-all duration-300 hover:bg-[#faeaf6]"
                >
                  Student Portal
                </Button>
              </Link>
            ) : (
              <Button
                variant="ghost"
                className="rounded-full text-xs font-medium text-[#8f0d6b] transition-colors duration-300 hover:bg-[#faeaf6] lg:hidden xl:inline-flex"
                onClick={() => startLogin()}
              >
                Sign in
              </Button>
            )}
            <Link href="/apply">
              <Button
                className="rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-5 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(254,0,182,0.35)] transition-all duration-300 hover:opacity-95 hover:shadow-[0_10px_25px_rgba(254,0,182,0.5)] hover:scale-[1.02]"
              >
                Apply Now
              </Button>
            </Link>
          </div>

          <button
            className="grid h-10 w-10 place-items-center rounded-full border border-[#8f0d6b]/20 bg-white text-[#8f0d6b] transition-colors duration-300 lg:hidden"
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Toggle navigation"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-[#8f0d6b]/15 bg-white px-5 py-6 lg:hidden">
            <nav className="mx-auto flex max-w-xl flex-col gap-3" aria-label="Mobile navigation">
              {links.map(link => (
                <Link
                  key={link.path}
                  href={link.path}
                  onClick={() => setMenuOpen(false)}
                  className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                    pathname === link.path ? "bg-[#faeaf6] font-semibold text-[#8f0d6b]" : "text-[#4a0838] hover:bg-[#fdf0f9]"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-2 flex flex-col gap-2 pt-2 border-t border-[#8f0d6b]/10">
                {user ? (
                  <Link href="/portal" onClick={() => setMenuOpen(false)} className="rounded-xl border border-[#8f0d6b]/25 bg-white px-4 py-2.5 text-center text-sm font-semibold text-[#8f0d6b]">
                    Student Portal
                  </Link>
                ) : (
                  <Button variant="outline" onClick={() => { setMenuOpen(false); startLogin(); }} className="rounded-xl border-[#8f0d6b]/25 bg-white py-2.5 text-sm font-semibold text-[#8f0d6b]">
                    Sign In
                  </Button>
                )}
                <Link
                  href="/apply"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-4 py-3 text-center text-sm font-semibold text-white shadow-[0_8px_20px_rgba(254,0,182,0.3)]"
                >
                  Begin an Application
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      {children}

      <footer className="mt-24 border-t border-[#8f0d6b]/15 bg-gradient-to-b from-white to-[#fbf0f8]">
        <div className="container grid gap-10 py-16 md:grid-cols-[1.2fr_.8fr_.8fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-9 overflow-hidden rounded-full border border-[#fe00b6]/40 bg-white p-0.5 shadow-sm">
                <Image src="/logo.png" alt="BWT Logo" fill className="object-contain" />
              </div>
              <div className="flex flex-col">
                <span className="font-serif text-lg font-bold text-[#8f0d6b]">Blush With Tee</span>
                <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#fe00b6]">School of Cosmetology</span>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#692156]">
              A premier academy dedicated to cultivating future cosmetologists, makeup artists, nail technicians, and beauty entrepreneurs with excellence and intention.
            </p>
            <div className="mt-5 flex items-center gap-3 text-xs text-[#8f0d6b]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#faeaf6] px-3 py-1 font-semibold text-[#8f0d6b]">
                <Sparkles className="h-3.5 w-3.5 text-[#fe00b6]" /> Accredited Practical Programs
              </span>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8f0d6b]">Explore</p>
            <div className="mt-4 grid gap-2.5 text-sm text-[#5a1b49]">
              <Link href="/about" className="hover:text-[#fe00b6] transition-colors">About the Academy</Link>
              <Link href="/programs" className="hover:text-[#fe00b6] transition-colors">Courses & Pathways</Link>
              <Link href="/apply" className="hover:text-[#fe00b6] transition-colors">Admissions Portal</Link>
              <Link href="/gallery" className="hover:text-[#fe00b6] transition-colors">Studio Showcase</Link>
              <Link href="/terms" className="hover:text-[#fe00b6] transition-colors font-semibold">Terms & Conditions</Link>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8f0d6b]">Connect</p>
            <div className="mt-4 grid gap-2.5 text-sm text-[#5a1b49]">
              <Link href="/appointments" className="hover:text-[#fe00b6] transition-colors">Student Clinic Appointments</Link>
              <Link href="/store" className="hover:text-[#fe00b6] transition-colors">Academy Beauty Store</Link>
              <Link href="/contact" className="hover:text-[#fe00b6] transition-colors">Contact & Directions</Link>
              <Link href="/portal" className="hover:text-[#fe00b6] transition-colors">Student Learning Portal</Link>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8f0d6b]">Visit Us</p>
            <div className="mt-4 grid gap-2.5 text-sm text-[#692156]">
              <p className="flex items-start gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-[#fe00b6] mt-0.5" />
                <span>BWT School of Cosmetology Campus Studio</span>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-[#fe00b6]" />
                <span>Direct Admissions Desk</span>
              </p>
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-[#fe00b6]" />
                <span>admissions@blushwithtee.com</span>
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-[#8f0d6b]/10 bg-white/60 py-6">
          <div className="container flex flex-col items-center justify-between gap-3 text-xs text-[#8f0d6b]/80 sm:flex-row">
            <p>© {new Date().getFullYear()} Blush With Tee (BWT) School of Cosmetology. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="underline underline-offset-2 hover:text-[#fe00b6] transition-colors font-semibold">
                Terms & Conditions
              </Link>
              <span className="text-[#8f0d6b]/30">·</span>
              <p className="flex items-center gap-1 font-medium">
                Empowering beauty artists with <span className="text-[#fe00b6]">♥</span> passion & craft
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
