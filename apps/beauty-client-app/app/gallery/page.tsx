"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import PublicShell from "@/components/PublicShell";
import { trpc } from "@/lib/trpc";

// Shown until the school publishes its own photos from Website content.
const STUDIO_PHOTOS = [
  { title: "Hair Artistry & Styling", image: "/hero/hair.jpg" },
  { title: "Glamour Makeup Transformation", image: "/hero/makeup.jpg" },
  { title: "Face Beat & Foundation Work", image: "/hero/nails.jpg" },
  { title: "Editorial Makeup Looks", image: "/hero/skincare.jpg" },
];

const CATEGORY_LABELS: Record<string, string> = {
  student_work: "Student work",
  graduation: "Graduation",
  training: "Training",
  facilities: "Facilities",
  hair: "Hair",
  makeup: "Makeup",
  nails: "Nails",
  events: "Events",
};

// Every few tiles runs double-size, so the wall reads as a showcase rather than a grid.
const tileSpan = (index: number) =>
  index % 6 === 0 || index % 6 === 3 ? "col-span-2 row-span-2" : "col-span-1 row-span-1";

export default function GalleryPage() {
  const { data: photos = [], isLoading } = trpc.content.gallery.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });
  const [category, setCategory] = useState("all");

  const categories = useMemo(
    () => Array.from(new Set(photos.map(photo => photo.category))),
    [photos]
  );
  const shown = category === "all" ? photos : photos.filter(photo => photo.category === category);

  return (
    <PublicShell>
      <main className="container py-16 sm:py-24">
        <div className="max-w-2xl">
          <p className="eyebrow">Studio Showcase</p>
          <h1 className="mt-5 font-serif text-5xl font-bold leading-none text-[#8f0d6b] sm:text-6xl">
            Created in our studios.
          </h1>
          <p className="mt-6 text-lg leading-8 text-[#692156]">
            A showcase of the craftsmanship, transformations, and client moments created by Blush With Tee students and master educators.
          </p>
        </div>

        {categories.length > 1 ? (
          <div className="mt-10 flex flex-wrap gap-2" role="group" aria-label="Filter photos">
            {["all", ...categories].map(value => (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
                className={`rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
                  category === value
                    ? "border-transparent bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] text-white"
                    : "border-[#8f0d6b]/20 bg-white/80 text-[#8f0d6b] hover:bg-[#faeaf6]"
                }`}
              >
                {value === "all" ? "All photos" : (CATEGORY_LABELS[value] ?? value)}
              </button>
            ))}
          </div>
        ) : null}

        <section className="mt-10 grid auto-rows-[220px] grid-cols-2 gap-5 md:auto-rows-[260px] lg:auto-rows-[280px] lg:grid-cols-4">
          {isLoading
            ? [0, 1, 2, 3].map(index => (
                <div
                  key={index}
                  className={`animate-pulse rounded-[2rem] border border-[#8f0d6b]/10 bg-white/70 ${tileSpan(index)}`}
                />
              ))
            : photos.length
              ? shown.map((photo, index) => (
                  <GalleryTile
                    key={photo.id}
                    title={photo.title ?? CATEGORY_LABELS[photo.category] ?? "BWT Studio Work"}
                    caption={photo.caption}
                    label={CATEGORY_LABELS[photo.category] ?? "BWT Studio Work"}
                    span={tileSpan(index)}
                  >
                    <img
                      src={photo.imageUrl}
                      alt={photo.altText ?? photo.title ?? "Work from the Blush With Tee studio"}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                  </GalleryTile>
                ))
              : STUDIO_PHOTOS.map((moment, index) => (
                  <GalleryTile
                    key={moment.image}
                    title={moment.title}
                    label="BWT Studio Work"
                    span={tileSpan(index)}
                  >
                    <Image
                      src={moment.image}
                      alt={moment.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                  </GalleryTile>
                ))}
        </section>
      </main>
    </PublicShell>
  );
}

function GalleryTile({
  title,
  caption,
  label,
  span,
  children,
}: {
  title: string;
  caption?: string | null;
  label: string;
  span: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={`group relative overflow-hidden rounded-[2rem] border border-[#8f0d6b]/15 shadow-[0_14px_38px_rgba(143,13,107,.08)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_45px_rgba(254,0,182,.2)] ${span}`}
    >
      {children}
      <div className="absolute inset-0 bg-gradient-to-t from-[#25011c]/90 via-[#25011c]/30 to-transparent" />
      <div className="relative flex h-full flex-col justify-end p-6">
        <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#ffb8ed]">{label}</p>
        <h2 className="mt-1.5 font-serif text-lg font-bold text-white drop-shadow-sm sm:text-xl xl:text-2xl">
          {title}
        </h2>
        {caption ? <p className="mt-1 line-clamp-2 text-xs text-white/85">{caption}</p> : null}
      </div>
    </article>
  );
}
