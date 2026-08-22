"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
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
import { trpc } from "@/lib/trpc";

type RevokableCertificate = { id: number; certificateNumber: string; studentName: string };

export function RevokeCertificateDialog({
  certificate,
  onOpenChange,
  onRevoked,
}: {
  certificate: RevokableCertificate | null;
  onOpenChange: (open: boolean) => void;
  onRevoked: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (certificate) {
      setReason("");
      setError(null);
    }
  }, [certificate]);

  const revoke = trpc.certificates.revoke.useMutation({
    onSuccess: onRevoked,
    onError: mutationError => setError(mutationError.message),
  });

  return (
    <Dialog open={Boolean(certificate)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke {certificate?.certificateNumber}</DialogTitle>
          <DialogDescription>
            The public verification page will show this award as withdrawn. The record is kept.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground">
            {certificate?.studentName}
          </p>

          <div className="space-y-2">
            <Label htmlFor="revoke-reason">Reason</Label>
            <Input
              id="revoke-reason"
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Why is this being withdrawn?"
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="gap-2"
            disabled={reason.trim().length < 2 || revoke.isPending || !certificate}
            onClick={() => {
              setError(null);
              revoke.mutate({ certificateId: certificate!.id, reason: reason.trim() });
            }}
          >
            {revoke.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
