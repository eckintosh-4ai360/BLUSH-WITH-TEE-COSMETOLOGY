"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Star } from "lucide-react";
import { trpc } from "@/lib/trpc";

// Homepage sections the school publishes from Website content in the back office. Each one
// stays hidden until there is something real to show.

const CACHE = { staleTime: 5 * 60_000, refetchOnWindowFocus: false } as const;

export function HomeBanners() {
  const { data: banners = [] } = trpc.content.banners.useQuery({ placement: "homepage" }, CACHE);
  if (!banners.length) return null;

  return (
    <section className="container pt-16">
      <div className={`grid gap-5 ${banners.length > 1 ? "md:grid-cols-2" : ""}`}>
        {banners.slice(0, 4).map(banner => (
          <article
            key={banner.id}
            className="relative isolate overflow-hidden rounded-[2rem] border border-[#8f0d6b]/15 bg-gradient-to-br from-[#8f0d6b] to-[#3d052d] p-8 text-white shadow-[0_18px_45px_rgba(143,13,107,.18)] sm:p-10"
          >
            {banner.imageUrl ? (
              <>
                <img
                  src={banner.imageUrl}
                  alt=""
                  className="absolute inset-0 -z-20 h-full w-full object-cover"
                />
                <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#25011c]/90 via-[#25011c]/65 to-[#25011c]/25" />
              </>
            ) : null}
            <h2 className="max-w-lg font-serif text-3xl font-bold leading-tight sm:text-4xl">{banner.title}</h2>
            {banner.subtitle ? (
              <p className="mt-3 max-w-lg text-sm leading-7 text-white/85">{banner.subtitle}</p>
            ) : null}
            {banner.ctaLabel && banner.ctaHref ? (
              <Link
                href={banner.ctaHref}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-[#8f0d6b] shadow-lg hover:bg-[#faeaf6]"
              >
                {banner.ctaLabel} <ArrowRight className="h-4 w-4 text-[#fe00b6]" />
              </Link>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

// Ghana time, so a class on the 14th reads as the 14th for everyone.
const DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra", day: "numeric" });
const MONTH = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra", month: "short" });
const WHEN = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Accra",
  weekday: "long",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function UpcomingEvents() {
  const { data: events = [] } = trpc.content.upcomingEvents.useQuery(undefined, CACHE);
  if (!events.length) return null;

  return (
    <section className="container py-24">
      <div className="max-w-2xl">
        <p className="eyebrow">What&apos;s On</p>
        <h2 className="mt-5 font-serif text-4xl font-bold leading-tight text-[#8f0d6b] sm:text-5xl">
          Upcoming events.
        </h2>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {events.map(event => {
          const startsAt = new Date(event.startsAt);
          return (
            <article
              key={event.id}
              className="flex h-full flex-col overflow-hidden rounded-3xl border border-[#8f0d6b]/15 bg-white/90 shadow-[0_12px_36px_rgba(143,13,107,.06)]"
            >
              {event.imageUrl ? (
                <img src={event.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
              ) : null}
              <div className="flex flex-1 gap-4 p-6">
                <div className="grid h-16 w-14 shrink-0 place-items-center rounded-2xl bg-[#faeaf6] text-center text-[#8f0d6b]">
                  <span className="text-2xl font-extrabold leading-none">{DAY.format(startsAt)}</span>
                  <span className="text-[10px] font-bold uppercase tracking-[.14em] text-[#fe00b6]">
                    {MONTH.format(startsAt)}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-serif text-xl font-bold text-[#8f0d6b]">{event.title}</h3>
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#6a2557]">
                    <CalendarDays className="h-3.5 w-3.5 text-[#fe00b6]" /> {WHEN.format(startsAt)}
                  </p>
                  {event.location ? (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-[#6a2557]">
                      <MapPin className="h-3.5 w-3.5 text-[#fe00b6]" /> {event.location}
                    </p>
                  ) : null}
                  {event.summary || event.description ? (
                    <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm leading-6 text-[#692156]">
                      {event.summary ?? event.description}
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function Testimonials() {
  const { data: testimonials = [] } = trpc.content.testimonials.useQuery(undefined, CACHE);
  if (!testimonials.length) return null;

  return (
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
            key={item.id}
            className="flex h-full flex-col rounded-3xl border border-[#8f0d6b]/15 bg-white/80 p-8 shadow-[0_12px_36px_rgba(143,13,107,.06)] hover:border-[#fe00b6]/35 transition-colors"
          >
            {item.rating ? (
              <div className="mb-4 flex gap-0.5" aria-label={`${item.rating} out of 5`}>
                {Array.from({ length: 5 }, (_, index) => (
                  <Star
                    key={index}
                    className={`h-4 w-4 ${index < item.rating! ? "fill-[#fe00b6] text-[#fe00b6]" : "text-[#f0c6e4]"}`}
                  />
                ))}
              </div>
            ) : null}
            <blockquote className="mb-6 text-sm leading-7 text-[#5c1c4b] italic">&ldquo;{item.quote}&rdquo;</blockquote>
            <figcaption className="mt-auto flex items-center gap-3 border-t border-[#8f0d6b]/15 pt-5">
              {item.photoUrl ? (
                <img src={item.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : null}
              <span>
                <span className="block text-sm font-bold text-[#8f0d6b]">{item.authorName}</span>
                {item.authorRole ? (
                  <span className="mt-1 block text-xs font-semibold uppercase tracking-[.12em] text-[#fe00b6]">
                    {item.authorRole}
                  </span>
                ) : null}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
