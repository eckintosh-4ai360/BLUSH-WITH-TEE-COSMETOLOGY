"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import { Checkbox } from "@blush/ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blush/ui/components/ui/dialog";
import { Input } from "@blush/ui/components/ui/input";
import { Label } from "@blush/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import { trpc } from "@/lib/trpc";

/** Unambiguous characters only, so a password read aloud is transcribed right. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function suggestPassword(length = 14): string {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, value => ALPHABET[value % ALPHABET.length]).join("");
}

/**
 * Creates a sign-in account and grants it a role in one step.
 *
 * An account with no role can sign in and see nothing, which reads as a broken
 * system, so the role is part of the form rather than a second task.
 */
export function CreateUserDialog({
  open,
  onOpenChange,
  roles,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Array<{ key: string; name: string; description: string | null }>;
  onCreated: (email: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => suggestPassword());
  const [role, setRole] = useState("administrator");
  const [mustChange, setMustChange] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setPassword(suggestPassword());
      setRole("administrator");
      setMustChange(true);
      setError(null);
    }
  }, [open]);

  const create = trpc.platform.createUser.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onCreated(email.trim().toLowerCase());
    },
    onError: mutationError => setError(mutationError.message),
  });

  // The password is checked for nothing but being there. Whoever is filling
  // this in is handing someone a temporary password in person and knows what
  // they want it to be; the name and the email still matter, because the
  // account is addressed by them.
  const validation = useMemo(() => {
    if (name.trim().length < 2) return "Enter the person's name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return "Enter a valid email address.";
    if (!password.length) return "Enter a password.";
    return null;
  }, [name, email, password]);

  const selectedRole = roles.find(entry => entry.key === role);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create an account</DialogTitle>
          <DialogDescription>
            The password is hashed before it is stored. Share it with the person directly, not by
            email if you can avoid it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="user-name">Full name</Label>
              <Input
                id="user-name"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Ama Mensah"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="ama@bwtee.com"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map(entry => (
                  <SelectItem key={entry.key} value={entry.key}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRole?.description ? (
              <p className="text-xs text-muted-foreground">{selectedRole.description}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-password">Temporary password</Label>
            <div className="flex gap-2">
              <Input
                id="user-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="font-mono"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Generate a new password"
                onClick={() => setPassword(suggestPassword())}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Anything you like. The suggested one is a strong starting point if you would rather
              not think about it.
            </p>
          </div>

          <label className="flex items-start gap-2.5 rounded-lg bg-muted/50 p-3">
            <Checkbox
              checked={mustChange}
              onCheckedChange={checked => setMustChange(checked === true)}
              aria-label="Require a password change on first sign-in"
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="block font-medium text-foreground">
                Require a new password on first sign-in
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Recommended, so the password you set here is never the one in use.
              </span>
            </span>
          </label>

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="gap-2"
            disabled={Boolean(validation) || create.isPending}
            onClick={() => {
              setError(null);
              if (validation) {
                setError(validation);
                return;
              }
              create.mutate({
                name: name.trim(),
                email: email.trim(),
                password,
                role,
                mustChangePassword: mustChange,
              });
            }}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Sets a new password on an existing account. */
export function ResetPasswordDialog({
  account,
  onOpenChange,
  onReset,
}: {
  account: { id: number; name: string | null; email: string | null } | null;
  onOpenChange: (open: boolean) => void;
  onReset: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account) {
      setPassword(suggestPassword());
      setError(null);
    }
  }, [account]);

  const reset = trpc.platform.resetUserPassword.useMutation({
    onSuccess: onReset,
    onError: mutationError => setError(mutationError.message),
  });

  return (
    <Dialog open={Boolean(account)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            {account?.name ?? account?.email} will be asked to choose their own password on the
            next sign-in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-password">New temporary password</Label>
            <div className="flex gap-2">
              <Input
                id="reset-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="font-mono"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Generate a new password"
                onClick={() => setPassword(suggestPassword())}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="gap-2"
            disabled={!password.length || reset.isPending || !account}
            onClick={() => {
              setError(null);
              reset.mutate({ userId: account!.id, password });
            }}
          >
            {reset.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
