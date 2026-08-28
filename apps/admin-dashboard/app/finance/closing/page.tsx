"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  CircleAlert,
  History,
  Loader2,
  Lock,
  LockOpen,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { Input } from "@blush/ui/components/ui/input";
import { Label } from "@blush/ui/components/ui/label";
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { toast } from "@blush/ui/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@blush/ui/components/ui/table";
import { Textarea } from "@blush/ui/components/ui/textarea";
import { formatMoney } from "@blush/ui/lib/viz";
import DashboardLayout from "@/components/DashboardLayout";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

/** Today in the school's own terms, for the date input. */
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyClosingPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["closing.read"]}>
        <ClosingContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function ClosingContent() {
  const { can } = usePermissions();
  const [date, setDate] = useState(todayIso);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();
  const day = trpc.closing.day.useQuery({ date: new Date(date) });
  const history = trpc.closing.history.useQuery();
  const variance = trpc.closing.variance.useQuery();

  const refreshAll = () => {
    utils.closing.day.invalidate();
    utils.closing.history.invalidate();
    utils.closing.variance.invalidate();
  };

  const close = trpc.closing.close.useMutation({
    onSuccess: result => {
      toast.success(
        result.discrepancy === 0
          ? "Day closed. The till balanced exactly."
          : `Day closed with a ${result.discrepancy < 0 ? "shortfall" : "surplus"} of ${formatMoney(Math.abs(result.discrepancy))}.`,
      );
      setCounted("");
      setNotes("");
      refreshAll();
    },
    onError: error => toast.error(error.message),
  });

  const reopen = trpc.closing.reopen.useMutation({
    onSuccess: () => {
      toast.success("Day reopened for correction.");
      refreshAll();
    },
    onError: error => toast.error(error.message),
  });

  // Shown live as the operator types, so the variance is visible before they
  // commit to it rather than only afterwards.
  const expected = day.data?.isClosed
    ? (day.data.closing?.expectedCash ?? 0)
    : (day.data?.live.expectedCash ?? 0);
  const countedValue = Number(counted);
  const hasCount = counted.trim() !== "" && Number.isFinite(countedValue);
  const variancePreview = useMemo(
    () => (hasCount ? countedValue - expected : null),
    [hasCount, countedValue, expected],
  );

  if (day.isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (day.error) {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        {day.error.message}
      </p>
    );
  }

  const figures = day.data?.isClosed ? day.data.closing! : day.data!.live;
  const isClosed = Boolean(day.data?.isClosed);
  const isFuture = Boolean(day.data?.isFuture);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 pb-10">
      <header className="admin-glass-card rounded-[1.45rem] border p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
              End-of-Day Daily Closing
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Reconcile the cash till, check the day&apos;s takings across every channel, and lock
              the register.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="closing-date" className="text-xs uppercase tracking-wide">
              Closing date
            </Label>
            <Input
              id="closing-date"
              type="date"
              value={date}
              max={todayIso()}
              onChange={event => setDate(event.target.value || todayIso())}
              className="w-[11rem]"
            />
          </div>
        </div>
      </header>

      {day.data?.hasDrifted ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Transactions have been booked into this day since it was closed, so the figures below
            are the ones that were signed off, not what the books now say. Reopen and close it again
            to bring the record up to date.
          </span>
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Summary */}
        <section className="admin-glass-card rounded-[1.45rem] border p-5 sm:p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                {isClosed ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
              </span>
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                  Daily closing summary
                </h2>
                <p className="text-xs text-muted-foreground">{date}</p>
              </div>
            </div>
            {isClosed ? (
              <Badge className="bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-300">
                Register closed
              </Badge>
            ) : (
              <Badge className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300">
                Open register
              </Badge>
            )}
          </div>

          <dl className="mt-6 space-y-3 text-sm">
            <Row label="Customers served" value={String(figures.customersServed)} bold />

            <div className="pt-2">
              <Row label="Cash sales" value={formatMoney(figures.cashSales)} />
              <Row label="Mobile money (MoMo) sales" value={formatMoney(figures.momoSales)} />
              <Row label="Card sales" value={formatMoney(figures.cardSales)} />
              <Row label="Bank transfer" value={formatMoney(figures.bankSales)} />
              <Row label="Online payments" value={formatMoney(figures.onlineSales)} />
            </div>

            <div className="border-t border-border pt-3">
              <Row
                label="Total takings"
                value={formatMoney(figures.totalSales)}
                bold
                tone="positive"
              />
            </div>

            <Row
              label="Less operational expenses"
              value={`- ${formatMoney(figures.totalExpenses)}`}
              tone="negative"
            />
            <Row
              label="of which paid from the till"
              value={`- ${formatMoney(figures.cashExpenses)}`}
              muted
            />
          </dl>

          {/* The till holds cash and nothing else, so this is what the count is
              measured against - not the day's full takings. */}
          <div className="mt-5 rounded-xl bg-foreground px-5 py-4 text-background">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold uppercase tracking-wide">
                Expected in till
              </span>
              <span className="text-xl font-bold tabular-nums">
                {formatMoney(figures.expectedCash)}
              </span>
            </div>
            <p className="mt-1 text-xs opacity-70">
              Cash taken, less cash paid out. MoMo, card and bank money never reaches the drawer.
            </p>
          </div>
        </section>

        {/* Reconciliation */}
        <section className="admin-glass-card rounded-[1.45rem] border p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Till reconciliation</h2>
          </div>

          {isFuture ? (
            <Empty
              icon={CalendarClock}
              text="This day has not happened yet. Pick today or an earlier date."
            />
          ) : isClosed ? (
            <div className="mt-5 space-y-4">
              <Field label="Cash counted">
                {formatMoney(day.data!.closing!.countedCash)}
              </Field>
              <Field label="Discrepancy">
                <VarianceLabel value={day.data!.closing!.discrepancy} />
              </Field>
              {day.data!.closing!.notes ? (
                <Field label="Closing notes">
                  <span className="text-sm font-normal text-muted-foreground">
                    {day.data!.closing!.notes}
                  </span>
                </Field>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Closed by {day.data!.closing!.closedByName ?? "staff"} on{" "}
                {new Date(day.data!.closing!.closedAt).toLocaleString("en-GB")}.
              </p>

              {can("closing.reopen") ? (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  disabled={reopen.isPending}
                  onClick={() => {
                    const reason = window.prompt(
                      "Why is this day being reopened? This is recorded in the audit log.",
                    );
                    if (!reason?.trim()) return;
                    reopen.mutate({ date: new Date(date), reason: reason.trim() });
                  }}
                >
                  {reopen.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <LockOpen className="size-4" />
                  )}
                  Reopen this day
                </Button>
              ) : (
                <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  This day is locked. Ask someone with reopening rights if it needs correcting.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="counted">Actual cash counted in till (GHS)</Label>
                <Input
                  id="counted"
                  inputMode="decimal"
                  value={counted}
                  disabled={!can("closing.write")}
                  onChange={event => setCounted(event.target.value)}
                  placeholder="0.00"
                  className="text-lg font-semibold tabular-nums"
                />
              </div>

              <div className="rounded-xl border border-border/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Discrepancy / variance
                  </span>
                  {variancePreview === null ? (
                    <span className="text-sm text-muted-foreground">Enter the count</span>
                  ) : (
                    <VarianceLabel value={variancePreview} />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Closing notes / discrepancy explanation</Label>
                <Textarea
                  id="notes"
                  rows={4}
                  value={notes}
                  disabled={!can("closing.write")}
                  onChange={event => setNotes(event.target.value)}
                  placeholder="e.g. Till balanced. All MoMo payments confirmed by Abena."
                />
                {variancePreview !== null && variancePreview !== 0 && !notes.trim() ? (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    The till does not balance. Say why before closing.
                  </p>
                ) : null}
              </div>

              {can("closing.write") ? (
                <Button
                  className="w-full gap-2"
                  disabled={
                    close.isPending ||
                    !hasCount ||
                    // An unexplained variance is the one thing worth blocking:
                    // it is the whole reason the note field exists.
                    (variancePreview !== 0 && !notes.trim())
                  }
                  onClick={() =>
                    close.mutate({
                      date: new Date(date),
                      countedCash: countedValue,
                      notes: notes.trim() || undefined,
                    })
                  }
                >
                  {close.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Lock className="size-4" />
                  )}
                  Close day
                </Button>
              ) : (
                <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  You can view the register but not close it.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Variance trend */}
      {variance.data && variance.data.daysClosed > 0 ? (
        <section className="admin-glass-card grid gap-4 rounded-[1.45rem] border p-5 sm:grid-cols-4 sm:p-6">
          <Stat label="Days closed (30d)" value={String(variance.data.daysClosed)} />
          <Stat
            label="Net variance"
            value={formatMoney(variance.data.netVariance)}
            tone={variance.data.netVariance < 0 ? "negative" : undefined}
          />
          <Stat label="Days short" value={String(variance.data.shortDays)} />
          <Stat label="Days over" value={String(variance.data.overDays)} />
        </section>
      ) : null}

      {/* Archive */}
      <section className="admin-glass-card rounded-[1.45rem] border p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <History className="size-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Daily closing archive</h2>
        </div>

        <div className="mt-4 overflow-x-auto">
          {history.isLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : !history.data?.length ? (
            <p className="rounded-xl bg-muted/40 px-4 py-12 text-center text-sm text-muted-foreground">
              No day has been closed yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Closing date</TableHead>
                  <TableHead>Closed by</TableHead>
                  <TableHead className="text-right">Customers</TableHead>
                  <TableHead className="text-right">Total takings</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Expected in till</TableHead>
                  <TableHead className="text-right">Cash counted</TableHead>
                  <TableHead className="text-right">Discrepancy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data.map(row => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() =>
                      setDate(new Date(row.closingDate).toISOString().slice(0, 10))
                    }
                  >
                    <TableCell className="font-medium">
                      {new Date(row.closingDate).toISOString().slice(0, 10)}
                      {row.isReopened ? (
                        <Badge className="ml-2 bg-amber-500/15 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300">
                          Reopened
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.closedByName ?? "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.customersServed}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.totalSales)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.totalExpenses)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.expectedCash)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.countedCash)}
                    </TableCell>
                    <TableCell className="text-right">
                      <VarianceLabel value={row.discrepancy} compact />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  tone?: "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "negative"
        ? "text-rose-700 dark:text-rose-300"
        : "text-foreground";

  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className={muted ? "pl-4 text-xs text-muted-foreground" : "text-muted-foreground"}>
        {label}
      </dt>
      <dd
        className={`tabular-nums ${muted ? "text-xs text-muted-foreground" : toneClass} ${
          bold ? "text-base font-bold" : "font-semibold"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The variance, said in words as well as figures.
 *
 * "-50.00" alone makes somebody work out which way round it is. Short means
 * money is missing from the drawer; over means there is more than the books
 * account for, which is just as much worth explaining.
 */
function VarianceLabel({ value, compact }: { value: number; compact?: boolean }) {
  if (value === 0) {
    return (
      <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
        {compact ? formatMoney(0) : "Balanced exactly"}
      </span>
    );
  }

  const short = value < 0;
  const tone = short
    ? "text-rose-700 dark:text-rose-300"
    : "text-amber-700 dark:text-amber-300";

  return (
    <span className={`text-sm font-semibold tabular-nums ${tone}`}>
      {formatMoney(Math.abs(value))} {short ? "short" : "over"}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{children}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "negative";
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-lg font-bold tabular-nums ${
          tone === "negative" ? "text-rose-700 dark:text-rose-300" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof CalendarClock; text: string }) {
  return (
    <div className="mt-6 rounded-xl bg-muted/40 px-4 py-10 text-center">
      <Icon className="mx-auto size-5 text-muted-foreground" aria-hidden />
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
