"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  Facebook,
  Instagram,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Sparkles,
  X,
  Youtube,
} from "lucide-react";
import { formatPhone, telHref, whatsappHref } from "@blush/shared/contact";
import { Button } from "@blush/ui/components/ui/button";
import { AskAssistant } from "@/components/AskAssistant";
import { useAuth } from "@/hooks/useAuth";
import { useSchoolProfile } from "@/hooks/useSchoolProfile";
import { staffLoginUrl } from "@/lib/staffDashboard";
import { trpc } from "@/lib/trpc";

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
  const router = useRouter();
  const { user, logout, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: school } = useSchoolProfile();
  // Pages written in the dashboard are listed here, so a new one is reachable without a menu change.
  const pageLinks = trpc.content.pageLinks.useQuery(undefined, { staleTime: 5 * 60_000 });

  const signOut = async () => {
    setMenuOpen(false);
    await logout();
    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-[#fdf8fc] text-[#2d0423]">
      <AnnouncementStrip />
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
              {/* Brand logo and academy title. */}
              <span className="block whitespace-nowrap font-serif text-base font-bold tracking-tight text-[#8f0d6b] sm:text-lg">
                Blush With Tee Artistry
              </span>
              <span className="block whitespace-nowrap text-[8.5px] font-semibold uppercase tracking-[0.24em] text-[#fe00b6] lg:hidden xl:block">
                School of Cosmetology
              </span>
            </div>
          </Link>

          {/* Primary navigation bar. */}
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
            {/* Action buttons and quick booking links. */}
            {user ? (
              <>
                <Link href="/portal" className="lg:hidden xl:block">
                  <Button
                    variant="outline"
                    className="rounded-full border-[#8f0d6b]/25 bg-white px-4 text-xs font-semibold text-[#8f0d6b] transition-all duration-300 hover:bg-[#faeaf6]"
                  >
                    Student Portal
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={loading}
                  onClick={signOut}
                  aria-label="Sign out"
                  title="Sign out"
                  className="rounded-full text-[#8f0d6b] hover:bg-[#faeaf6] lg:hidden xl:inline-flex"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button
                asChild
                variant="ghost"
                className="rounded-full text-xs font-medium text-[#8f0d6b] transition-colors duration-300 hover:bg-[#faeaf6] lg:hidden xl:inline-flex"
              >
                <a href={staffLoginUrl()}>Sign in</a>
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
                  <>
                    <Link href="/portal" onClick={() => setMenuOpen(false)} className="rounded-xl border border-[#8f0d6b]/25 bg-white px-4 py-2.5 text-center text-sm font-semibold text-[#8f0d6b]">
                      Student Portal
                    </Link>
                    <Button
                      variant="ghost"
                      disabled={loading}
                      onClick={signOut}
                      className="rounded-xl py-2.5 text-sm font-semibold text-[#8f0d6b] hover:bg-[#fdf0f9]"
                    >
                      <LogOut className="mr-2 h-4 w-4" /> Sign out
                    </Button>
                  </>
                ) : (
                  <Button asChild variant="outline" className="rounded-xl border-[#8f0d6b]/25 bg-white py-2.5 text-sm font-semibold text-[#8f0d6b]">
                    <a href={staffLoginUrl()} onClick={() => setMenuOpen(false)}>
                      Sign In
                    </a>
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
              <Link href="/blog" className="hover:text-[#fe00b6] transition-colors">Blog</Link>
              {(pageLinks.data ?? []).map(page => (
                <Link key={page.slug} href={`/pages/${page.slug}`} className="hover:text-[#fe00b6] transition-colors">
                  {page.title}
                </Link>
              ))}
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
            {/* Read from Settings, so the office changes a number in one place. */}
            <div className="mt-4 grid gap-2.5 text-sm text-[#692156]">
              <p className="flex items-start gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-[#fe00b6] mt-0.5" />
                <span>{school?.address ?? "BWT School of Cosmetology"}</span>
              </p>
              {school?.phone ? (
                <a href={telHref(school.phone)} className="flex items-center gap-2 hover:text-[#fe00b6] transition-colors">
                  <Phone className="h-4 w-4 shrink-0 text-[#fe00b6]" />
                  <span>{formatPhone(school.phone)}</span>
                </a>
              ) : null}
              {school?.whatsapp && whatsappHref(school.whatsapp) ? (
                <a
                  href={whatsappHref(school.whatsapp)!}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 hover:text-[#fe00b6] transition-colors"
                >
                  <MessageCircle className="h-4 w-4 shrink-0 text-[#fe00b6]" />
                  <span>WhatsApp {formatPhone(school.whatsapp)}</span>
                </a>
              ) : null}
              {school?.email ? (
                <a href={`mailto:${school.email}`} className="flex items-center gap-2 break-all hover:text-[#fe00b6] transition-colors">
                  <Mail className="h-4 w-4 shrink-0 text-[#fe00b6]" />
                  <span>{school.email}</span>
                </a>
              ) : null}
            </div>
            <SocialLinks social={school?.social} />
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

      <AskAssistant />
    </div>
  );
}

// The site-wide strip above the header, published from Website content in the back office.
function AnnouncementStrip() {
  const { data } = trpc.content.banners.useQuery(
    { placement: "announcement" },
    { staleTime: 5 * 60_000, refetchOnWindowFocus: false }
  );
  const banner = data?.[0];
  if (!banner) return null;

  return (
    <div className="bg-gradient-to-r from-[#8f0d6b] via-[#b0107f] to-[#fe00b6] text-white">
      <div className="container flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center text-xs sm:text-sm">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#ffd1f1]" aria-hidden />
        <span className="font-semibold">{banner.title}</span>
        {banner.subtitle ? <span className="text-white/85">{banner.subtitle}</span> : null}
        {banner.ctaLabel && banner.ctaHref ? (
          <Link
            href={banner.ctaHref}
            className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-0.5 font-semibold underline-offset-2 hover:bg-white/25"
          >
            {banner.ctaLabel} <ArrowRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

type Social = {
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  youtube: string | null;
};

function SocialLinks({ social }: { social?: Social }) {
  if (!social) return null;
  const links = [
    { href: social.instagram, label: "Instagram", icon: <Instagram className="h-4 w-4" /> },
    { href: social.tiktok, label: "TikTok", icon: <span className="text-[10px] font-bold">TikTok</span> },
    { href: social.facebook, label: "Facebook", icon: <Facebook className="h-4 w-4" /> },
    { href: social.youtube, label: "YouTube", icon: <Youtube className="h-4 w-4" /> },
  ].filter((link): link is { href: string; label: string; icon: React.ReactElement } => Boolean(link.href));
  if (!links.length) return null;

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      {links.map(link => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Blush With Tee on ${link.label}`}
          className="grid h-9 min-w-9 place-items-center rounded-full border border-[#8f0d6b]/20 bg-white px-2 text-[#8f0d6b] transition-colors hover:border-[#fe00b6]/50 hover:text-[#fe00b6]"
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}
