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
  default: "text-[#263746] dark:text-foreground",
  good: "text-emerald-700 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-400",
  critical: "text-rose-700 dark:text-rose-400",
};

const TONE_BADGE: Record<StatTone, string> = {
  default: "bg-[#22b8bd] text-white shadow-[0_14px_28px_rgba(34,184,189,0.26)]",
  good: "bg-[#12ad73] text-white shadow-[0_14px_28px_rgba(18,173,115,0.24)]",
  warning: "bg-[#ee9f45] text-white shadow-[0_14px_28px_rgba(238,159,69,0.25)]",
  critical:
    "bg-[#ef5c7b] text-white shadow-[0_14px_28px_rgba(239,92,123,0.24)]",
};

/**
 * A tone that means something is wrong tints the whole card, not just the
 * figure - a reader scanning twenty tiles should spot trouble without
 * reading a single number.
 */
const TONE_SURFACE: Record<StatTone, string> = {
  default: "admin-glass-card",
  good: "admin-glass-card",
  warning: "admin-glass-card admin-glass-card-warning",
  critical: "admin-glass-card admin-glass-card-critical",
};

/** Headline tiles keep a fixed icon-badge order inspired by the dashboard mockup. */
export type StatAccent = "magenta" | "plum" | "rose" | "berry";

const ACCENT_BADGE: Record<StatAccent, string> = {
  magenta: "bg-[#22b8bd] text-white shadow-[0_16px_30px_rgba(34,184,189,0.28)]",
  plum: "bg-[#7567d8] text-white shadow-[0_16px_30px_rgba(117,103,216,0.28)]",
  rose: "bg-[#ee9f45] text-white shadow-[0_16px_30px_rgba(238,159,69,0.27)]",
  berry: "bg-[#b44ac8] text-white shadow-[0_16px_30px_rgba(180,74,200,0.27)]",
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
  /** Uses the headline icon-badge palette. Reserved for a headline row. */
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
  const accented = Boolean(accent);

  const body = (
    <>
      <div className="relative flex items-start justify-between gap-3">
        {Icon ? (
          <span
            aria-hidden
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl transition-transform duration-200",
              interactive && "group-hover/tile:scale-110",
              accented ? ACCENT_BADGE[accent!] : TONE_BADGE[tone]
            )}
          >
            <Icon className="size-5" />
          </span>
        ) : null}
        {hint ? (
          <span className="max-w-[60%] truncate text-right text-[10px] font-semibold uppercase text-slate-500 dark:text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton className="mt-7 h-9 w-28 rounded-xl bg-white/60" />
      ) : (
        <p
          className={cn(
            "relative mt-7 font-semibold tabular-nums",
            emphasis
              ? "text-[2rem] leading-none sm:text-[2.35rem]"
              : "text-[1.55rem] leading-none",
            TONE_CLASS[tone]
          )}
        >
          {value}
        </p>
      )}

      <div className="relative mt-3 flex min-h-5 items-center justify-between gap-2">
        <span className="truncate text-[11px] font-semibold uppercase text-muted-foreground">
          {label}
        </span>
        {interactive ? (
          <ArrowUpRight
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-200 group-hover/tile:translate-x-0.5 group-hover/tile:opacity-100"
          />
        ) : null}
      </div>
    </>
  );

  const className = cn(
    "group/tile relative block min-h-[136px] overflow-hidden rounded-[1.35rem] border p-4 text-left transition-all duration-200",
    emphasis && "min-h-[164px] p-5 sm:p-6",
    TONE_SURFACE[tone],
    interactive &&
      "hover:-translate-y-0.5 hover:border-[#8bdde5] hover:shadow-[0_22px_48px_rgba(71,124,138,0.18)]"
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
      <button
        type="button"
        onClick={onClick}
        className={cn(className, "w-full")}
      >
        {body}
      </button>
    );
  }

  return <article className={className}>{body}</article>;
}

/** A titled group of stat tiles, the shape the dashboard reads in. */
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
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-4 w-1 rounded-full bg-[#22b8bd]" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {description ? (
              <p className="text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {action}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}
