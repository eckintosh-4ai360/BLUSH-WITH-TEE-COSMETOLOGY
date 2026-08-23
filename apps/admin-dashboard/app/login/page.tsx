"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import { Input } from "@blush/ui/components/ui/input";
import { Label } from "@blush/ui/components/ui/label";
import { trpc } from "@/lib/trpc";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
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
    onSuccess: async result => {
      // Drop any cached signed-out state before navigating.
      await utils.invalidate();
      router.replace(result.mustChangePassword ? "/account/password" : (next ?? "/"));
      router.refresh();
    },
    onError: mutationError => setError(mutationError.message),
  });

  useEffect(() => {
    if (params.get("expired")) setError("Your session expired. Please sign in again.");
  }, [params]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    login.mutate({ email: email.trim(), password });
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <span
          aria-hidden
          className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"
        >
          <LockKeyhole className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
          Blush With Tee
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to the management system.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={event => setEmail(event.target.value)}
            placeholder="you@bwtee.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(value => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full gap-2" disabled={login.isPending}>
          {login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Sign in
        </Button>
      </form>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Accounts are created by an administrator under Operations, Access.
      </p>
    </div>
  );
}
