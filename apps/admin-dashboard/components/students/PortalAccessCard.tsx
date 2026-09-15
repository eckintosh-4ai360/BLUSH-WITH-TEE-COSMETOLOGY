"use client";

import { useEffect, useState } from "react";
import { Copy, Globe, KeyRound, Loader2, RefreshCw, UserPlus } from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { Card } from "@blush/ui/components/ui/card";
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
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { toast } from "@blush/ui/components/ui/sonner";
import { suggestPassword } from "@/components/access/CreateUserDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

// The student's sign-in to the website portal, where they see attendance, results and fees
// and pay online. Created here, with a password the office hands to them.
export function PortalAccessCard({ studentId, fullName }: { studentId: number; fullName: string }) {
  const { can } = usePermissions();
  const [mode, setMode] = useState<"create" | "reset" | null>(null);
  const access = trpc.students.portalAccess.useQuery({ studentId });

  const writable = can("students.write");
  const data = access.data;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Globe className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Website portal sign-in</h2>
            {access.isLoading ? (
              <Skeleton className="mt-2 h-4 w-64" />
            ) : access.error ? (
              <p className="mt-1 text-xs text-destructive">{access.error.message}</p>
            ) : data?.account ? (
              <div className="mt-1 space-y-1.5">
                <p className="text-sm text-muted-foreground">
                  Signs in with{" "}
                  <span className="font-mono text-foreground">
                    {data.account.email ?? data.studentNumber}
                  </span>
                  {data.account.email ? (
                    <>
                      {" "}
                      or <span className="font-mono text-foreground">{data.studentNumber}</span>
                    </>
                  ) : null}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={data.account.isActive ? "secondary" : "destructive"}>
                    {data.account.isActive ? "Active" : "Switched off"}
                  </Badge>
                  {data.account.mustChangePassword ? (
                    <Badge variant="outline">New password asked for</Badge>
                  ) : null}
                  <span>
                    {data.account.lastSignedIn
                      ? `Last signed in ${new Date(data.account.lastSignedIn).toLocaleDateString("en-GB")}`
                      : "Has not signed in yet"}
                  </span>
                </p>
              </div>
            ) : (
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {fullName} cannot sign in yet. Create a sign-in so they can see their attendance,
                results and fees, and pay online.
              </p>
            )}
          </div>
        </div>

        {writable && data ? (
          data.account ? (
            data.account.resettable ? (
              <Button variant="outline" className="gap-2" onClick={() => setMode("reset")}>
                <KeyRound className="h-4 w-4" />
                Reset password
              </Button>
            ) : (
              <p className="max-w-xs text-xs text-muted-foreground">
                This sign-in is a staff account; reset it from Access.
              </p>
            )
          ) : (
            <Button className="gap-2" onClick={() => setMode("create")}>
              <UserPlus className="h-4 w-4" />
              Create sign-in
            </Button>
          )
        ) : null}
      </div>

      {data ? (
        <PortalPasswordDialog
          mode={mode}
          onOpenChange={open => !open && setMode(null)}
          studentId={studentId}
          fullName={fullName}
          studentNumber={data.studentNumber}
          defaultEmail={data.email}
          onSaved={() => void access.refetch()}
        />
      ) : null}
    </Card>
  );
}

// The same card from the students list, for staff who manage students but not their fees.
export function PortalAccessDialog({
  student,
  onOpenChange,
}: {
  student: { id: number; fullName: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={student !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{student?.fullName}</DialogTitle>
          <DialogDescription>Their sign-in to the student portal on the website.</DialogDescription>
        </DialogHeader>
        {student ? <PortalAccessCard studentId={student.id} fullName={student.fullName} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PortalPasswordDialog({
  mode,
  onOpenChange,
  studentId,
  fullName,
  studentNumber,
  defaultEmail,
  onSaved,
}: {
  mode: "create" | "reset" | null;
  onOpenChange: (open: boolean) => void;
  studentId: number;
  fullName: string;
  studentNumber: string;
  defaultEmail: string | null;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mustChange, setMustChange] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown once after saving, so the office can hand the details over.
  const [issued, setIssued] = useState<{ signIn: string; password: string } | null>(null);
  const header = trpc.platform.documentHeader.useQuery(undefined, {
    enabled: mode !== null,
    staleTime: 10 * 60_000,
  });
  const signInPage = portalAddress(header.data?.school.website);

  useEffect(() => {
    if (!mode) return;
    setEmail(mode === "create" ? (defaultEmail ?? "") : "");
    setPassword(suggestPassword());
    setMustChange(false);
    setError(null);
    setIssued(null);
  }, [mode, defaultEmail]);

  const handle = {
    onError: (mutationError: { message: string }) => setError(mutationError.message),
  };
  const create = trpc.students.createPortalAccess.useMutation(handle);
  const reset = trpc.students.resetPortalPassword.useMutation(handle);
  const busy = create.isPending || reset.isPending;

  const save = async () => {
    setError(null);
    if (!password.trim()) {
      setError("Enter a password, or generate one.");
      return;
    }
    try {
      const result =
        mode === "create"
          ? await create.mutateAsync({
              studentId,
              email: email.trim(),
              password,
              mustChangePassword: mustChange,
            })
          : await reset.mutateAsync({ studentId, password, mustChangePassword: mustChange });
      setIssued({ signIn: result.signIn, password });
      toast.success(mode === "create" ? "Portal sign-in created." : "Password reset.");
      onSaved();
    } catch {
      // Shown in the dialog by the mutation's error handler.
    }
  };

  const copyDetails = async () => {
    if (!issued) return;
    const text = `Blush With Tee student portal\nSign in at: ${signInPage}\nSign in with: ${issued.signIn}\nPassword: ${issued.password}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Sign-in details copied.");
    } catch {
      toast.error("Copy failed. Select the details and copy them by hand.");
    }
  };

  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {issued
              ? "Give these details to the student"
              : mode === "create"
                ? `Create a portal sign-in for ${fullName}`
                : `Reset ${fullName}'s portal password`}
          </DialogTitle>
          <DialogDescription>
            {issued
              ? "The password is not shown again. Hand it over in person or by a private message."
              : mode === "create"
                ? `They sign in on the website with their student number ${studentNumber}, or with the email below if you give one.`
                : "The old password stops working straight away, and any lockout from wrong guesses is lifted."}
          </DialogDescription>
        </DialogHeader>

        {issued ? (
          <dl className="space-y-3 rounded-lg bg-muted/50 p-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Sign in at</dt>
              <dd className="font-medium">{signInPage}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Sign in with</dt>
              <dd className="font-mono">{issued.signIn}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Password</dt>
              <dd className="font-mono">{issued.password}</dd>
            </div>
          </dl>
        ) : (
          <div className="space-y-4">
            {mode === "create" ? (
              <div className="space-y-2">
                <Label htmlFor="portal-email">Email (optional)</Label>
                <Input
                  id="portal-email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="Leave blank to use the student number only"
                  autoComplete="off"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="portal-password">Password</Label>
              <div className="flex gap-2">
                <Input
                  id="portal-password"
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

            <label className="flex items-start gap-2.5 rounded-lg bg-muted/50 p-3">
              <Checkbox
                checked={mustChange}
                onCheckedChange={checked => setMustChange(checked === true)}
                aria-label="Ask for a new password on first sign-in"
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="block font-medium text-foreground">
                  Ask for a new password on first sign-in
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Optional. Left off, the student keeps using the password you set here.
                </span>
              </span>
            </label>

            {error ? (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {issued ? (
            <>
              <Button variant="outline" className="gap-2" onClick={() => void copyDetails()}>
                <Copy className="h-4 w-4" />
                Copy details
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button className="gap-2" disabled={busy} onClick={() => void save()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {mode === "create" ? "Create sign-in" : "Reset password"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// The website's sign-in page, as the office should read it out: the website saved in Settings,
// then the configured site address.
function portalAddress(website?: string | null): string {
  const site = website?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!site) return "the school website's Sign in page";
  const withScheme = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  return `${withScheme.replace(/\/+$/, "")}/login`;
}
