import { TRPCError } from "@trpc/server";

// Per-caller throttling for the endpoints that answer without a session.

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

// Stops the map growing without bound on a long-lived process.
const SWEEP_EVERY = 5000;
let sinceSweep = 0;

function sweep(now: number) {
  if (++sinceSweep < SWEEP_EVERY) return;
  sinceSweep = 0;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export type RateLimitRule = {
  // Distinguishes one endpoint's budget from another's.
  bucket: string;
  limit: number;
  windowMs: number;
};

// Records one hit and throws TOO_MANY_REQUESTS once the budget is spent.
export function enforceRateLimit(
  identity: string | null | undefined,
  rule: RateLimitRule,
): number {
  const now = Date.now();
  sweep(now);

  const key = `${rule.bucket}:${identity ?? "unknown"}`;
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return rule.limit - 1;
  }

  existing.count += 1;

  if (existing.count > rule.limit) {
    const seconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many requests. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`,
    });
  }

  return rule.limit - existing.count;
}

// Clears every window.
export function resetRateLimits() {
  windows.clear();
  sinceSweep = 0;
}
