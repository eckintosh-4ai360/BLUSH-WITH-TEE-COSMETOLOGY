import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-[#8f0d6b] via-[#54063f] to-[#1c0015] px-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-[2.25rem] border border-[#fe00b6]/30 bg-white/95 p-10 text-center shadow-[0_30px_90px_rgba(0,0,0,.5)] backdrop-blur">
        <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-[#fe00b6]/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-[#8f0d6b]/20 blur-3xl" />

        <div className="relative">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#faeaf6]">
            <Sparkles className="h-8 w-8 text-[#fe00b6]" />
          </div>
          <h1 className="mt-6 font-serif text-6xl font-bold leading-none text-[#8f0d6b]">404</h1>
          <h2 className="mt-3 font-serif text-2xl font-bold text-[#8f0d6b]">This page has left the salon.</h2>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-[#692156]">
            Sorry, the page you are looking for doesn&apos;t exist.
            <br />
            It may have been moved or deleted.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-7 py-3 text-sm font-bold text-white shadow-[0_10px_28px_rgba(254,0,182,.35)] transition-transform hover:scale-[1.02]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-full border border-[#8f0d6b]/25 bg-white px-7 py-3 text-sm font-semibold text-[#8f0d6b] transition-colors hover:bg-[#faeaf6]"
            >
              Contact the School
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
