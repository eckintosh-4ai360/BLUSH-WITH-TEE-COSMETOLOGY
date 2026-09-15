import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  GraduationCap,
  Home,
  Scissors,
  ShoppingBag,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import PublicShell from "@/components/PublicShell";

export const metadata: Metadata = {
  title: "About",
  description:
    "Blush With Tee brings together a school of cosmetology, a beauty salon and a beauty store: training beauty professionals, caring for clients and supplying the products both rely on.",
  alternates: { canonical: "/about" },
};

const schoolPoints = [
  {
    icon: Sparkles,
    title: "Artistry with purpose",
    text: "Modern techniques in hair styling, makeup, nail technology and skincare, taught alongside professional discipline and client care.",
  },
  {
    icon: Scissors,
    title: "Hands-on practice",
    text: "Theory is matched with practical studio hours, so students build real skill and confidence before they graduate.",
  },
  {
    icon: Users,
    title: "Mentorship and growth",
    text: "A close community of students, graduates and beauty professionals who support one another's careers.",
  },
];

export default function AboutPage() {
  return (
    <PublicShell>
      <main className="container py-16 sm:py-24">
        <section className="grid items-end gap-10 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <p className="eyebrow">About Blush With Tee</p>
            <h1 className="mt-5 max-w-3xl font-serif text-5xl font-bold leading-[1.05] text-[#8f0d6b] sm:text-6xl">
              One beauty house: a school, a salon and a store.
            </h1>
          </div>
          <p className="text-lg leading-8 text-[#692156]">
            Blush With Tee brings together three parts that share one standard of beauty. Our School of
            Cosmetology trains the next generation of beauty professionals, our salon cares for clients, and our
            store supplies the products and tools that both rely on.
          </p>
        </section>

        {/* The school leads, with the salon and store beside it. */}
        <section className="mt-16 rounded-[2.25rem] border border-[#8f0d6b]/15 bg-white/85 p-8 shadow-[0_12px_36px_rgba(143,13,107,.06)] sm:p-12">
          <div className="grid gap-10 lg:grid-cols-[.9fr_1.1fr]">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#faeaf6] text-[#fe00b6]">
                <GraduationCap className="h-6 w-6" />
              </div>
              <p className="eyebrow mt-6">The School</p>
              <h2 className="mt-3 font-serif text-3xl font-bold leading-tight text-[#8f0d6b] sm:text-4xl">
                BWT School of Cosmetology.
              </h2>
              <p className="mt-5 text-base leading-8 text-[#692156]">
                The heart of Blush With Tee. We nurture aspiring cosmetologists, makeup artists, nail technicians and
                beauty entrepreneurs into confident, skilled professionals ready to build lasting careers.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/programs">
                  <Button className="rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(254,0,182,0.3)]">
                    Explore Programmes <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/apply">
                  <Button
                    variant="outline"
                    className="rounded-full border-[#8f0d6b]/25 bg-white px-6 text-sm font-semibold text-[#8f0d6b] hover:bg-[#faeaf6]"
                  >
                    Apply Now
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid gap-4">
              {schoolPoints.map(point => (
                <div key={point.title} className="flex gap-4 rounded-2xl border border-[#8f0d6b]/10 bg-[#fdf8fc] p-5">
                  <point.icon className="mt-1 h-5 w-5 shrink-0 text-[#fe00b6]" />
                  <div>
                    <h3 className="font-serif text-lg font-bold text-[#8f0d6b]">{point.title}</h3>
                    <p className="mt-1.5 text-sm leading-7 text-[#6a2557]">{point.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 md:grid-cols-2">
          <article className="flex flex-col rounded-[2.25rem] border border-[#8f0d6b]/15 bg-white/85 p-8 shadow-[0_12px_36px_rgba(143,13,107,.06)] sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#faeaf6] text-[#fe00b6]">
              <Scissors className="h-6 w-6" />
            </div>
            <p className="eyebrow mt-6">The Salon</p>
            <h2 className="mt-3 font-serif text-3xl font-bold leading-tight text-[#8f0d6b]">
              Beauty services, at the salon or at home.
            </h2>
            <p className="mt-5 text-base leading-8 text-[#692156]">
              Hair, makeup, nail and skincare services for every occasion. Choose a service from our menu, pick a
              time that suits you, and we will confirm your booking.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-[#6a2557]">
              <li className="flex items-center gap-2.5">
                <CalendarCheck className="h-4 w-4 shrink-0 text-[#fe00b6]" /> Book online in a few minutes
              </li>
              <li className="flex items-center gap-2.5">
                <Home className="h-4 w-4 shrink-0 text-[#fe00b6]" /> Home service available on request
              </li>
            </ul>
            <div className="mt-auto pt-8">
              <Link href="/appointments">
                <Button className="rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(254,0,182,0.3)]">
                  Book an Appointment <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </article>

          <article className="flex flex-col rounded-[2.25rem] border border-[#8f0d6b]/15 bg-white/85 p-8 shadow-[0_12px_36px_rgba(143,13,107,.06)] sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#faeaf6] text-[#fe00b6]">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <p className="eyebrow mt-6">The Store</p>
            <h2 className="mt-3 font-serif text-3xl font-bold leading-tight text-[#8f0d6b]">
              Professional products and beauty kits.
            </h2>
            <p className="mt-5 text-base leading-8 text-[#692156]">
              The beauty tools, skincare, hair products and kits we trust in our own classrooms and salon, available
              to students, beauty professionals and everyone who loves beauty.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-[#6a2557]">
              <li className="flex items-center gap-2.5">
                <ShoppingBag className="h-4 w-4 shrink-0 text-[#fe00b6]" /> Order and pay online
              </li>
              <li className="flex items-center gap-2.5">
                <Truck className="h-4 w-4 shrink-0 text-[#fe00b6]" /> Delivery details taken at checkout
              </li>
            </ul>
            <div className="mt-auto pt-8">
              <Link href="/store">
                <Button className="rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-6 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(254,0,182,0.3)]">
                  Shop the Store <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </article>
        </section>

        <section className="mt-20 rounded-[2.25rem] border border-[#8f0d6b]/15 bg-gradient-to-br from-[#8f0d6b] to-[#3d052d] p-8 text-white shadow-xl sm:p-14">
          <p className="text-[11px] font-bold uppercase tracking-[.22em] text-[#ffb8ed]">The BWT Standard</p>
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <p className="font-serif text-3xl font-bold leading-tight text-white sm:text-4xl">
              Learning, beauty services and professional supplies under one name.
            </p>
            <div className="space-y-6">
              <p className="text-base leading-8 text-white/85">
                What our students learn in the classroom is the same care our clients receive in the salon, and the
                store stocks the products that professionals and students work with every day. Whether you come to
                study, to be pampered or to shop, you get the Blush With Tee standard.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/apply">
                  <Button className="rounded-full bg-white px-6 text-sm font-bold text-[#8f0d6b] shadow-lg hover:bg-[#faeaf6]">
                    Start Your Application <ArrowRight className="ml-2 h-4 w-4 text-[#fe00b6]" />
                  </Button>
                </Link>
                <Link href="/appointments">
                  <Button
                    variant="outline"
                    className="rounded-full border-white/30 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur hover:bg-white/20 hover:text-white"
                  >
                    Book the Salon
                  </Button>
                </Link>
                <Link href="/store">
                  <Button
                    variant="outline"
                    className="rounded-full border-white/30 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur hover:bg-white/20 hover:text-white"
                  >
                    Visit the Store
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
