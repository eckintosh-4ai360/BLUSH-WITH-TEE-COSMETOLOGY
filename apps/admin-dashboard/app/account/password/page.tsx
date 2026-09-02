"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import { Input } from "@blush/ui/components/ui/input";
import { Label } from "@blush/ui/components/ui/label";
import { toast } from "@blush/ui/components/ui/sonner";
import { trpc } from "@/lib/trpc";

/**
 * Password change, and where a first sign-in on a seeded account lands.
 *
 * Deliberately outside the dashboard shell: somebody still on a default
 * password should be doing this, not browsing.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const session = trpc.auth.session.useQuery(undefined, { retry: false });
  const mustChange = session.data?.user.mustChangePassword ?? false;

  const change = trpc.auth.changePassword.useMutation({
    onSuccess: async () => {
      toast.success("Password updated.");
      await utils.invalidate();
      router.replace("/");
    },
    onError: mutationError => setError(mutationError.message),
  });

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("The two new passwords do not match.");
      return;
    }
    change.mutate({ currentPassword, newPassword });
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span
            aria-hidden
            className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"
          >
            <KeyRound className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            {mustChange ? "Choose your password" : "Change your password"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mustChange
              ? "This account is still on the password it was set up with. Pick your own before carrying on."
              : "Pick something you do not use elsewhere."}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current">Current password</Label>
            <Input
              id="current"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new">New password</Label>
            <Input
              id="new"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              aria-invalid={mismatch}
            />
            {mismatch ? (
              <p className="text-xs text-destructive">These do not match.</p>
            ) : null}
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            className="w-full gap-2"
            disabled={change.isPending || mismatch || !newPassword.length}
          >
            {change.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Update password
          </Button>

          {!mustChange ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => router.push("/")}
            >
              Back to the dashboard
            </Button>
          ) : null}
        </form>
      </div>
    </main>
  );
}
