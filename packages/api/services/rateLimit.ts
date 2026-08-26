import { TRPCError } from "@trpc/server";

/**
 * Per-caller throttling for the endpoints that answer without a session.
 *
 * This is a fixed window held in process memory. That is honest about what it
 * is: it protects one instance, and it resets on deploy. The durable answer is
 * a limiter at the edge (docs/security.md), but "at the edge, later" left
 * `certificates.verify` open in the meantime — and certificate numbers are
 * sequential by design, so an unthrottled lookup is a way to walk every
 * graduate's name and student number out of the system.
 *
 * Callers that cannot be identified (no forwarded address) share one bucket,
 * which is deliberately strict rather than deliberately generous.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Stops the map growing without bound on a long-lived process. */
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
  /** Distinguishes one endpoint's budget from another's. */
  bucket: string;
  limit: number;
  windowMs: number;
};

/**
 * Records one hit and throws `TOO_MANY_REQUESTS` once the budget is spent.
 * Returns the number of attempts left, for callers that want to surface it.
 */
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

/** Clears every window. Test helper — nothing in the app should call it. */
export function resetRateLimits() {
  windows.clear();
  sinceSweep = 0;
}
