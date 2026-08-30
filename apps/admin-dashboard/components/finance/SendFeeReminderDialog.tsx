"use client";

import { Loader2, MessageSquare } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blush/ui/components/ui/dialog";
import { formatMoney } from "@blush/ui/lib/viz";
import { trpc } from "@/lib/trpc";

/**
 * Confirms an arrears text before it goes out.
 *
 * A text message cannot be recalled and quotes a figure the student will hold
 * the school to, so the exact wording, the number it is addressed to and the
 * balance it names are all shown first — and all come from the server, from
 * the same code that does the sending.
 */
export function SendFeeReminderDialog({
  studentId,
  onOpenChange,
  onSent,
}: {
  /** Null closes the dialog; a student id opens it for that account. */
  studentId: number | null;
  onOpenChange: (open: boolean) => void;
  onSent: (result: { status: string; error: string | null }) => void;
}) {
  const open = studentId !== null;

  const preview = trpc.finance.feeReminderPreview.useQuery(
    { studentId: studentId ?? 0 },
    { enabled: open },
  );

  const send = trpc.finance.sendFeeReminder.useMutation({
    onSuccess: result => {
      onOpenChange(false);
      onSent(result);
    },
  });

  const data = preview.data;
  const blocked = Boolean(data?.blocker);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a fee reminder</DialogTitle>
          <DialogDescription>
            This goes out as a text message straight away and cannot be recalled.
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Preparing the message...</p>
        ) : preview.error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {preview.error.message}
          </p>
        ) : data ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <p className="text-foreground">{data.student.fullName}</p>
              <p className="text-xs text-muted-foreground">{data.student.studentNumber}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">To</dt>
                  <dd className="font-medium text-foreground">
                    {data.destination ? `+${data.destination}` : "No usable number"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Outstanding</dt>
                  <dd className="font-semibold text-foreground">{formatMoney(data.outstanding)}</dd>
                </div>
              </dl>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Message</p>
              <p className="whitespace-pre-wrap rounded-xl border border-border/60 p-3 text-sm text-foreground">
                {data.message || "The fee reminder template is empty."}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.message.length} characters &middot;{" "}
                {data.segments === 1 ? "1 message" : `${data.segments} messages`}
              </p>
            </div>

            {data.blocker ? (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {data.blocker}
              </p>
            ) : null}

            {send.error ? (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {send.error.message}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="gap-2"
            disabled={!data || blocked || send.isPending}
            onClick={() => studentId !== null && send.mutate({ studentId })}
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="h-4 w-4" />
            )}
            Send text
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
