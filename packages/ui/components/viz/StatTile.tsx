"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";

export type StatTone = "default" | "good" | "warning" | "critical";

/**
 * Status tones are reserved for state, never reused as a fifth series colour.
 * Each ships with a label and an icon so meaning never rests on colour alone.
 */
const TONE_CLASS: Record<StatTone, string> = {
  default: "text-foreground",
  good: "text-emerald-700 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-400",
  critical: "text-rose-700 dark:text-rose-400",
};

const TONE_BADGE: Record<StatTone, string> = {
  default: "bg-muted text-muted-foreground",
  good: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  critical: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
};

export type StatTileProps = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  href?: string;
  isLoading?: boolean;
  /** Renders the figure at hero scale for the number a view leads with. */
  emphasis?: boolean;
  onClick?: () => void;
};

/**
 * A single headline number. This is the right form for one current value -
 * a one-bar bar chart says the same thing with more ink.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
  isLoading,
  emphasis,
  onClick,
}: StatTileProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </p>
        {Icon ? (
          <span
            aria-hidden
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-xl",
              TONE_BADGE[tone],
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton className="mt-4 h-8 w-24" />
      ) : (
        <p
          className={cn(
            "mt-3 font-semibold tabular-nums tracking-tight",
            emphasis ? "text-4xl" : "text-2xl",
            TONE_CLASS[tone],
          )}
        >
          {value}
        </p>
      )}

      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );

  const className = cn(
    "block rounded-2xl border border-border/60 bg-card p-4 text-left shadow-sm transition-colors",
    (href || onClick) && "hover:border-border hover:bg-muted/40",
  );

  if (href) {
    return (
      <a href={href} className={className}>
        {body}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(className, "w-full")}>
        {body}
      </button>
    );
  }

  return <article className={className}>{body}</article>;
}

/** A titled group of stat tiles, the shape the dashboard reads in (§20). */
export function StatGroup({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{children}</div>
    </section>
  );
}
