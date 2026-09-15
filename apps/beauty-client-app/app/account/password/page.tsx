"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import PublicShell from "@/components/PublicShell";
import { useAuth } from "@/hooks/useAuth";
import { startLogin } from "@/lib/auth";
import { trpc } from "@/lib/trpc";

// Password change for a signed-in student, and where a sign-in lands when the office has
// asked for a new password on first use.
export default function ChangePasswordPage() {
  return (
    <PublicShell>
      <main className="container py-16 sm:py-24">
        <Suspense fallback={null}>
          <ChangePasswordForm />
        </Suspense>
      </main>
    </PublicShell>
  );
}

const inputClass =
  "w-full rounded-2xl border border-[#8f0d6b]/20 bg-white/90 px-4 py-3 text-sm text-[#3d0a2f] outline-none focus:border-[#8f0d6b]/50 focus:ring-2 focus:ring-[#8f0d6b]/20";

function ChangePasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const utils = trpc.useUtils();
  const { user, loading } = useAuth();

  const requested = params.get("next");
  const next = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/portal";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!loading && !user) startLogin();
  }, [loading, user]);

  const change = trpc.auth.changePassword.useMutation({
    onSuccess: async () => {
      setDone(true);
      await utils.auth.me.invalidate();
      router.replace(next);
    },
    onError: mutationError => setError(mutationError.message),
  });

  if (loading || !user) {
    return <p className="text-center text-sm font-semibold text-[#8f0d6b]">Checking your sign-in…</p>;
  }

  const mustChange = user.mustChangePassword;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <div className="mx-auto max-w-md">
      <span
        aria-hidden
        className="grid h-12 w-12 place-items-center rounded-2xl bg-[#faeaf6] text-[#8f0d6b]"
      >
        <KeyRound className="h-5 w-5" />
      </span>
      <h1 className="mt-4 font-serif text-4xl font-bold text-[#8f0d6b]">
        {mustChange ? "Choose your password" : "Change your password"}
      </h1>
      <p className="mt-3 text-sm leading-7 text-[#6a2557]">
        {mustChange
          ? "The school office has asked you to replace the password you were given. Pick your own before carrying on."
          : "Pick something you do not use anywhere else."}
      </p>

      <form
        onSubmit={event => {
          event.preventDefault();
          setError(null);
          if (newPassword !== confirmPassword) {
            setError("The two new passwords do not match.");
            return;
          }
          change.mutate({ currentPassword, newPassword });
        }}
        className="mt-8 space-y-4"
      >
        <div className="space-y-2">
          <label htmlFor="current" className="block text-sm font-medium text-[#3d0a2f]">
            Current password
          </label>
          <input
            id="current"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={event => setCurrentPassword(event.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="new" className="block text-sm font-medium text-[#3d0a2f]">
            New password
          </label>
          <input
            id="new"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={event => setNewPassword(event.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="confirm" className="block text-sm font-medium text-[#3d0a2f]">
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={event => setConfirmPassword(event.target.value)}
            aria-invalid={mismatch}
            className={inputClass}
          />
          {mismatch ? <p className="text-xs text-rose-700">These do not match.</p> : null}
        </div>

        {error ? (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={change.isPending || done || mismatch || !newPassword.length}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#8f0d6b] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#75095a] disabled:opacity-60"
        >
          {change.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Update password
        </button>

        {!mustChange ? (
          <Link
            href={next}
            className="block text-center text-sm font-semibold text-[#8f0d6b] hover:text-[#fe00b6]"
          >
            Back to the portal
          </Link>
        ) : null}
      </form>
    </div>
  );
}
