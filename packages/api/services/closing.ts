/**
 * The arithmetic behind end-of-day closing, kept apart from the procedures so
 * it can be reasoned about and tested without a database.
 */

/**
 * Day boundaries.
 *
 * Ghana keeps UTC all year with no daylight saving, so a UTC day and a local
 * trading day are the same window. That is what makes plain UTC bounds correct
 * here rather than merely convenient - a school in another zone would have to
 * apply its offset before calling this.
 */
export function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/** Midnight UTC: the value stored in the `date` column, and how days compare. */
export function toDayKey(date: Date): Date {
  return dayBounds(date).start;
}

export function isoDay(date: Date): string {
  return toDayKey(date).toISOString().slice(0, 10);
}

/** True when `date` falls after today, which cannot be closed. */
export function isFutureDay(date: Date, now = new Date()): boolean {
  return toDayKey(date).getTime() > toDayKey(now).getTime();
}

/**
 * What should physically be in the drawer.
 *
 * Cash taken, less cash paid out of it. MoMo, card and bank takings are income
 * but they never pass through the till, so counting them here would report a
 * shortfall every time somebody paid by card.
 *
 * Works in minor units so a day of small payments does not drift.
 */
export function expectedCashMinor(cashSalesMinor: number, cashExpensesMinor: number): number {
  return cashSalesMinor - cashExpensesMinor;
}

export type Variance = {
  minor: number;
  /** "short" means money is missing; "over" means there is more than the books explain. */
  direction: "balanced" | "short" | "over";
};

/**
 * The count against the expectation.
 *
 * Signed from the counter's point of view: negative is short. Both directions
 * matter - a till that is repeatedly over is as much a sign of something wrong
 * as one that is repeatedly short.
 */
export function variance(countedMinor: number, expectedMinor: number): Variance {
  const minor = countedMinor - expectedMinor;
  return {
    minor,
    direction: minor === 0 ? "balanced" : minor < 0 ? "short" : "over",
  };
}
