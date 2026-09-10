// The arithmetic behind end.
export function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// Midnight UTC.
export function toDayKey(date: Date): Date {
  return dayBounds(date).start;
}

export function isoDay(date: Date): string {
  return toDayKey(date).toISOString().slice(0, 10);
}

// True when date falls after today, which cannot be closed.
export function isFutureDay(date: Date, now = new Date()): boolean {
  return toDayKey(date).getTime() > toDayKey(now).getTime();
}

// What should physically be in the drawer.
export function expectedCashMinor(cashSalesMinor: number, cashExpensesMinor: number): number {
  return cashSalesMinor - cashExpensesMinor;
}

export type Variance = {
  minor: number;
  // "short" means money is missing; "over" means there is more than the books explain.
  direction: "balanced" | "short" | "over";
};

// The count against the expectation.
export function variance(countedMinor: number, expectedMinor: number): Variance {
  const minor = countedMinor - expectedMinor;
  return {
    minor,
    direction: minor === 0 ? "balanced" : minor < 0 ? "short" : "over",
  };
}
