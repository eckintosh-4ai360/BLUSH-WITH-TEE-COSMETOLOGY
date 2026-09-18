"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  Facebook,
  Instagram,
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
import { AnimatePresence, motion } from "framer-motion";
import { AskAssistant } from "@/components/AskAssistant";
import { EASE, Reveal } from "@/components/motion";
import { useSchoolProfile } from "@/hooks/useSchoolProfile";
import { trpc } from "@/lib/trpc";

const links = [
  { label: "Home", path: "/" },
  { label: "About", path: "/about" },
  { label: "Programs", path: "/programs" },
  { label: "Gallery", path: "/gallery" },
  { label: "Store", path: "/store" },
  { label: "Salon", path: "/appointments" },
  { label: "Contact", path: "/contact" },
];

export default function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: school } = useSchoolProfile();
  // Pages written in the dashboard are listed here, so a new one is reachable without a menu change.
  const pageLinks = trpc.content.pageLinks.useQuery(undefined, { staleTime: 5 * 60_000 });

  return (
    <div className="min-h-screen overflow-x-clip bg-[#fdf8fc] text-[#2d0423]">
      <AnnouncementStrip />
      <motion.header
        initial={{ y: -18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.55, ease: EASE }}
        className="sticky top-0 z-50 w-full border-b border-[#8f0d6b]/10 bg-white shadow-[0_4px_25px_rgba(143,13,107,0.06)]"
      >
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
                School · Salon · Store
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
            <Link href="/appointments" className="lg:hidden xl:block">
              <Button
                variant="outline"
                className="rounded-full border-[#8f0d6b]/25 bg-white px-4 text-xs font-semibold text-[#8f0d6b] transition-all duration-300 hover:bg-[#faeaf6]"
              >
                Book Appointment
              </Button>
            </Link>
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

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              key="mobile-menu"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: EASE }}
              className="overflow-hidden lg:hidden"
            >
              <div className="border-t border-[#8f0d6b]/15 bg-white px-5 py-6">
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
                <Link
                  href="/appointments"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl border border-[#8f0d6b]/25 bg-white px-4 py-2.5 text-center text-sm font-semibold text-[#8f0d6b]"
                >
                  Book an Appointment
                </Link>
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
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        {children}
      </motion.div>

      <footer className="mt-24 border-t border-[#8f0d6b]/15 bg-gradient-to-b from-white to-[#fbf0f8]">
        <Reveal className="container grid gap-10 py-16 md:grid-cols-[1.2fr_.8fr_.8fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-9 overflow-hidden rounded-full border border-[#fe00b6]/40 bg-white p-0.5 shadow-sm">
                <Image src="/logo.png" alt="BWT Logo" fill className="object-contain" />
              </div>
              <div className="flex flex-col">
                <span className="font-serif text-lg font-bold text-[#8f0d6b]">Blush With Tee</span>
                <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#fe00b6]">School · Salon · Store</span>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#692156]">
              A school of cosmetology, a beauty salon and a beauty store: training future beauty professionals, caring for clients and supplying the products both rely on.
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
              <Link href="/about" className="hover:text-[#fe00b6] transition-colors">About Blush With Tee</Link>
              <Link href="/programs" className="hover:text-[#fe00b6] transition-colors">Courses & Pathways</Link>
              <Link href="/apply" className="hover:text-[#fe00b6] transition-colors">Admissions Portal</Link>
              <Link href="/gallery" className="hover:text-[#fe00b6] transition-colors">Studio Showcase</Link>
              <Link href="/blog" className="hover:text-[#fe00b6] transition-colors">Blog</Link>
              {(pageLinks.data ?? []).map(page => (
                <Link key={page.slug} href={`/pages/${page.slug}`} className="hover:text-[#fe00b6] transition-colors">
                  {page.title}
                </Link>
              ))}
              {/* Terms sits in the bar at the very bottom, so it is not repeated here. */}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8f0d6b]">Connect</p>
            <div className="mt-4 grid gap-2.5 text-sm text-[#5a1b49]">
              <Link href="/appointments" className="hover:text-[#fe00b6] transition-colors">Salon Appointments</Link>
              <Link href="/store" className="hover:text-[#fe00b6] transition-colors">Beauty Store</Link>
              <Link href="/contact" className="hover:text-[#fe00b6] transition-colors">Contact & Directions</Link>
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
        </Reveal>

        <div className="border-t border-[#8f0d6b]/10 bg-white/60 py-6">
          {/* Three columns, so the credit sits in the middle of the page rather than between its neighbours. */}
          <div className="container grid gap-3 text-center text-xs text-[#8f0d6b]/80 sm:grid-cols-3 sm:items-center sm:text-left">
            <p>© {new Date().getFullYear()} Blush With Tee Artistry. All rights reserved.</p>

            <p className="font-semibold sm:text-center">Designed by Eckintosh</p>

            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:justify-end">
              <Link href="/terms" className="font-semibold underline underline-offset-2 transition-colors hover:text-[#fe00b6]">
                Terms & Conditions
              </Link>
              <span className="text-[#8f0d6b]/30" aria-hidden>
                ·
              </span>
              <span className="flex items-center gap-1 font-medium">
                Empowering beauty artists with <span className="text-[#fe00b6]">♥</span> passion & craft
              </span>
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
