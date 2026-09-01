"use client";

import { Loader2, MessageSquare, TriangleAlert } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blush/ui/components/ui/dialog";
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { formatMoney } from "@blush/ui/lib/viz";
import { trpc } from "@/lib/trpc";

export type ArrearsRunResult = {
  sent: number;
  failed: number;
  queued: number;
  skippedNoPhone: number;
  skippedAlreadySentToday: number;
  firstError: string | null;
};

/**
 * Confirms an arrears run before a few hundred text messages leave.
 *
 * Everything shown comes from the server, from the same code that does the
 * sending: the number of students, the total they owe between them, and one
 * real message rendered for a real student. A count typed out on the client
 * could disagree with what actually goes, and this is the screen whose whole
 * job is that it does not.
 */
export function FeeArrearsRunDialog({
  open,
  onOpenChange,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: (result: ArrearsRunResult) => void;
}) {
  const preview = trpc.finance.arrearsRunPreview.useQuery(undefined, {
    enabled: open,
    // Always re-read on open: this decides how many messages go out, and a
    // cached count from ten minutes ago is not good enough for that.
    staleTime: 0,
    refetchOnMount: "always",
  });

  const send = trpc.finance.sendArrearsRun.useMutation({
    onSuccess: result => {
      onOpenChange(false);
      onSent(result);
    },
  });

  const data = preview.data;
  const totals = data?.totals;
  const blocked = Boolean(data?.blocker) || Boolean(data?.capped);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Text everyone in arrears</DialogTitle>
          <DialogDescription>
            Each student is texted the amount they personally owe. The messages go
            out straight away and cannot be recalled.
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : preview.error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {preview.error.message}
          </p>
        ) : data && totals ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Will be texted</dt>
                <dd className="font-serif text-2xl font-bold text-foreground">
                  {totals.sendable}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total arrears</dt>
                <dd className="font-serif text-2xl font-bold text-foreground">
                  {formatMoney(totals.arrears)}
                </dd>
              </div>
            </dl>

            {totals.noPhone || totals.alreadySentToday ? (
              <div className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                {totals.alreadySentToday ? (
                  <p>
                    <b>{totals.alreadySentToday}</b> already had an arrears text today and will be
                    skipped, so nobody is told twice.
                  </p>
                ) : null}
                {totals.noPhone ? (
                  <p>
                    <b>{totals.noPhone}</b> of the {totals.owing} in arrears have no usable phone
                    number and cannot be reached
                    {data.unreachable.length
                      ? `: ${data.unreachable.map(row => row.fullName).join(", ")}`
                      : ""}
                    {totals.noPhone > data.unreachable.length ? " and others" : ""}.
                  </p>
                ) : null}
              </div>
            ) : null}

            {data.sample ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Example, as {data.sample.fullName} will receive it
                </p>
                <p className="whitespace-pre-wrap rounded-xl border border-border/60 p-3 text-sm text-foreground">
                  {data.sample.message}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.sample.segments === 1
                    ? "1 message"
                    : `${data.sample.segments} messages`}{" "}
                  each &middot; roughly {data.sample.segments * totals.sendable} in total
                </p>
              </div>
            ) : null}

            {data.capped ? (
              <p
                role="alert"
                className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {totals.sendable} students is past the {data.limit} a single run will send.
              </p>
            ) : null}

            {data.blocker ? (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {data.blocker}
              </p>
            ) : null}

            {send.error ? (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {send.error.message}
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={send.isPending}>
            Cancel
          </Button>
          <Button
            className="gap-2"
            disabled={!data || blocked || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="h-4 w-4" />
            )}
            {send.isPending
              ? "Sending..."
              : `Text ${totals?.sendable ?? 0} student${totals?.sendable === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
