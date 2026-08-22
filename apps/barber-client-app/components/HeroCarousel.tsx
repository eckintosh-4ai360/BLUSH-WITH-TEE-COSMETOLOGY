"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export type HeroSlide = {
  /** Photograph under /public/hero. Falls back to `tone` until one is added. */
  src: string;
  alt: string;
  label: string;
  meta: string;
  href: string;
  /** Gradient wash shown while the photograph is missing or still loading. */
  tone: string;
};

const SLIDE_MS = 5000;

export default function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [missing, setMissing] = useState<Record<string, true>>({});

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduced || paused || slides.length < 2) return;
    const id = window.setInterval(() => setIndex(i => (i + 1) % slides.length), SLIDE_MS);
    return () => window.clearInterval(id);
  }, [reduced, paused, slides.length]);

  const markMissing = useCallback((src: string) => {
    setMissing(current => (current[src] ? current : { ...current, [src]: true }));
  }, []);

  const active = slides[index];

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] border border-white/15 shadow-[0_40px_90px_rgba(0,0,0,.4)]">
        {slides.map((slide, i) => {
          const isActive = i === index;
          return (
            <div
              key={slide.src}
              aria-hidden={!isActive}
              className={`absolute inset-0 transition-opacity duration-[900ms] ease-out ${isActive ? "opacity-100" : "opacity-0"}`}
            >
              {/* The wash sits underneath so a missing or slow photograph still
                  reads as a designed panel rather than a blank hole. */}
              <div className={`absolute inset-0 bg-gradient-to-br ${slide.tone}`} />
              {!missing[slide.src] && (
                <Image
                  src={slide.src}
                  alt={slide.alt}
                  fill
                  sizes="(max-width: 1024px) 90vw, 42vw"
                  priority={i === 0}
                  onError={() => markMissing(slide.src)}
                  className={`object-cover ${isActive && !reduced ? "hero-zoom" : ""}`}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#241d30]/85 via-[#241d30]/20 to-transparent" />
            </div>
          );
        })}

        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-7">
          <Link href={active.href} className="group inline-flex max-w-full items-end gap-3">
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-[.22em] text-white/60">
                {active.meta}
              </span>
              <span className="mt-1.5 block truncate text-2xl font-semibold text-white">
                {active.label}
              </span>
            </span>
            <ArrowUpRight className="mb-1 h-5 w-5 shrink-0 text-white/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
          </Link>

          <div className="mt-5 flex items-center gap-2">
            {slides.map((slide, i) => (
              <button
                key={slide.src}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show ${slide.label}`}
                aria-current={i === index}
                className="h-1 flex-1 overflow-hidden rounded-full bg-white/25 transition-colors hover:bg-white/40"
              >
                {i === index && (
                  <span
                    // Re-keying on index restarts the fill for the new slide.
                    key={`${index}-${paused}-${reduced}`}
                    className="hero-progress block h-full w-full rounded-full bg-white"
                    style={{
                      animationDuration: `${SLIDE_MS}ms`,
                      animationPlayState: paused ? "paused" : "running",
                    }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
