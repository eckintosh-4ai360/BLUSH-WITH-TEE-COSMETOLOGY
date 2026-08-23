"use client";

import * as React from "react";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
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
  default: "bg-primary/10 text-primary",
  good: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  critical: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
};

/**
 * A tone that means something is wrong tints the whole card, not just the
 * figure - a reader scanning twenty tiles should spot trouble without
 * reading a single number.
 */
const TONE_SURFACE: Record<StatTone, string> = {
  default: "border-border/60 bg-card",
  good: "border-border/60 bg-card",
  warning: "border-amber-500/30 bg-amber-500/[0.04] dark:bg-amber-500/[0.07]",
  critical: "border-rose-500/35 bg-rose-500/[0.05] dark:bg-rose-500/[0.09]",
};

/** Headline tiles are painted from the brand ramp, in a fixed order. */
export type StatAccent = "magenta" | "plum" | "rose" | "berry";

const ACCENT_GRADIENT: Record<StatAccent, string> = {
  magenta: "from-[#fe00b6] via-[#e0009f] to-[#8f0d6b]",
  plum: "from-[#a8107e] via-[#8f0d6b] to-[#54063f]",
  rose: "from-[#ff66d4] via-[#f22cbb] to-[#c20f92]",
  berry: "from-[#c20f92] via-[#8f0d6b] to-[#2d0423]",
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
  /** Paints the tile from the brand ramp. Reserved for a headline row. */
  accent?: StatAccent;
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
  accent,
  onClick,
}: StatTileProps) {
  const interactive = Boolean(href || onClick);
  const painted = Boolean(accent);

  const body = (
    <>
      {/* A soft light behind the figure, so a painted tile still has depth. */}
      {painted ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl"
        />
      ) : null}

      <div className="relative flex items-start justify-between gap-3">
        <p
          className={cn(
            "text-xs font-medium uppercase tracking-[0.12em]",
            painted ? "text-white/80" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        {Icon ? (
          <span
            aria-hidden
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl transition-transform duration-200",
              interactive && "group-hover/tile:scale-110",
              painted ? "bg-white/20 text-white backdrop-blur-sm" : TONE_BADGE[tone],
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton className={cn("mt-4 h-9 w-24", painted && "bg-white/25")} />
      ) : (
        <p
          className={cn(
            "relative mt-3 font-semibold tabular-nums tracking-tight",
            emphasis ? "text-[2rem] leading-none sm:text-4xl" : "text-2xl leading-none",
            painted ? "text-white" : TONE_CLASS[tone],
          )}
        >
          {value}
        </p>
      )}

      <div className="relative mt-3 flex min-h-5 items-center justify-between gap-2">
        {hint ? (
          <span
            className={cn(
              "truncate rounded-full px-2 py-0.5 text-[11px] font-medium",
              painted ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
            )}
          >
            {hint}
          </span>
        ) : (
          <span />
        )}
        {interactive ? (
          <ArrowUpRight
            aria-hidden
            className={cn(
              "size-4 shrink-0 opacity-0 transition-all duration-200 group-hover/tile:translate-x-0.5 group-hover/tile:opacity-100",
              painted ? "text-white" : "text-muted-foreground",
            )}
          />
        ) : null}
      </div>
    </>
  );

  const className = cn(
    "group/tile relative block overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200",
    painted
      ? cn("border-transparent bg-gradient-to-br text-white shadow-md", ACCENT_GRADIENT[accent!])
      : cn("shadow-sm", TONE_SURFACE[tone]),
    interactive &&
      (painted
        ? "hover:-translate-y-0.5 hover:shadow-lg"
        : "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"),
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
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-4 w-1 rounded-full bg-primary" />
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>
    </section>
  );
}
