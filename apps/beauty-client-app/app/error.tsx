"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

// Visitors get an apology, never the stack trace. The details stay in the browser console,
// and a server error's digest matches the entry in the server log.
export default function Error({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center bg-[#fdf8fc] p-6 text-center">
      <div className="max-w-md">
        <AlertTriangle className="mx-auto h-12 w-12 text-[#fe00b6]" aria-hidden />
        <h1 className="mt-6 font-serif text-3xl font-bold text-[#8f0d6b]">Something went wrong.</h1>
        <p className="mt-3 text-sm leading-7 text-[#692156]">
          This page could not be shown just now. Please try again, or go back to the home page.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-[#8f0d6b]/70">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#fe00b6] to-[#8f0d6b] px-6 py-3 text-sm font-bold text-white shadow-md transition-transform hover:scale-105"
          >
            <RotateCcw className="h-4 w-4" />
            Reload page
          </button>
          <Link
            href="/"
            className="rounded-full border border-[#8f0d6b]/25 bg-white px-6 py-3 text-sm font-semibold text-[#8f0d6b] transition-colors hover:bg-[#faeaf6]"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
