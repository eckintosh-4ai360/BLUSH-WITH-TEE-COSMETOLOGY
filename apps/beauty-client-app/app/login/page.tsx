"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import PublicShell from "@/components/PublicShell";
import { trpc } from "@/lib/trpc";

/**
 * Student and customer sign-in.
 *
 * Accounts are created by the school when an application is approved, so this
 * page does not offer self-registration - it says where an account comes from
 * instead of leaving someone stuck.
 */
export default function LoginPage() {
  return (
    <PublicShell>
      <main className="container py-16 sm:py-24">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </main>
    </PublicShell>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const utils = trpc.useUtils();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = params.get("next");

  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      router.replace(next ?? "/portal");
      router.refresh();
    },
    onError: mutationError => setError(mutationError.message),
  });

  return (
    <div className="mx-auto max-w-md">
      <p className="eyebrow">Blush With Tee</p>
      <h1 className="mt-2 font-serif text-4xl font-bold text-[#8f0d6b]">Sign in</h1>
      <p className="mt-3 text-sm leading-7 text-[#6a2557]">
        Access your programme progress, attendance, results, fee balance and orders.
      </p>

      <form
        onSubmit={event => {
          event.preventDefault();
          setError(null);
          login.mutate({ email: email.trim(), password });
        }}
        className="mt-8 space-y-4"
      >
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-[#3d0a2f]">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={event => setEmail(event.target.value)}
            className="w-full rounded-2xl border border-[#8f0d6b]/20 bg-white/90 px-4 py-3 text-sm text-[#3d0a2f] outline-none focus:border-[#8f0d6b]/50 focus:ring-2 focus:ring-[#8f0d6b]/20"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-medium text-[#3d0a2f]">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-[#8f0d6b]/20 bg-white/90 px-4 py-3 pr-11 text-sm text-[#3d0a2f] outline-none focus:border-[#8f0d6b]/50 focus:ring-2 focus:ring-[#8f0d6b]/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword(value => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8f0d6b]/70 hover:text-[#8f0d6b]"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={login.isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#8f0d6b] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#75095a] disabled:opacity-60"
        >
          {login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Sign in
        </button>
      </form>

      <p className="mt-8 text-xs leading-6 text-[#6a2557]">
        Your account is created once your application is approved. If you have applied and cannot
        sign in, contact the school office.
      </p>
    </div>
  );
}
