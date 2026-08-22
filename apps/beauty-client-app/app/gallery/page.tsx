import Image from "next/image";
import PublicShell from "@/components/PublicShell";

const moments = [
  { title: "Hair Artistry & Styling", image: "/hero/hair.jpg", span: "col-span-2 row-span-2" },
  { title: "Glamour Makeup Transformation", image: "/hero/makeup.jpg", span: "col-span-1 row-span-1" },
  { title: "Precision Nail Architecture", image: "/hero/nails.jpg", span: "col-span-1 row-span-1" },
  { title: "Rejuvenating Skin Therapy", image: "/hero/skincare.jpg", span: "col-span-2 row-span-2" },
  { title: "Bridal Editorial Artistry", image: "/hero/makeup.jpg", span: "col-span-1 row-span-1" },
  { title: "Creative Color Masterclass", image: "/hero/hair.jpg", span: "col-span-1 row-span-1" },
];

export default function GalleryPage() {
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

        <section className="mt-16 grid auto-rows-[220px] grid-cols-2 gap-5 md:auto-rows-[280px] md:grid-cols-4">
          {moments.map((moment, index) => (
            <article
              key={`${moment.title}-${index}`}
              className={`group relative overflow-hidden rounded-[2rem] border border-[#8f0d6b]/15 shadow-[0_14px_38px_rgba(143,13,107,.08)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_45px_rgba(254,0,182,.2)] ${moment.span}`}
            >
              <Image
                src={moment.image}
                alt={moment.title}
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#25011c]/90 via-[#25011c]/30 to-transparent" />
              <div className="relative flex h-full flex-col justify-end p-6">
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#ffb8ed]">
                  BWT Studio Work
                </p>
                <h2 className="mt-1.5 font-serif text-xl font-bold text-white sm:text-2xl drop-shadow-sm">
                  {moment.title}
                </h2>
              </div>
            </article>
          ))}
        </section>
      </main>
    </PublicShell>
  );
}
