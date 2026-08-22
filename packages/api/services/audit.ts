import { auditLogs } from "@blush/db/schema";
import type { DbExecutor } from "../dbOrThrow";

export type AuditActor = {
  id: number;
  name?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: number | null;
  entityLabel?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  summary?: string;
};

/**
 * Writes one immutable audit row (§44).
 *
 * Pass the transaction handle when auditing something that must not be
 * recorded unless the change itself commits - the log then rolls back with it.
 */
export async function recordAudit(
  db: DbExecutor,
  actor: AuditActor | null,
  entry: AuditEntry,
): Promise<void> {
  await db.insert(auditLogs).values({
    userId: actor?.id ?? null,
    userName: actor?.name ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    entityLabel: entry.entityLabel ?? null,
    oldValue: entry.oldValue === undefined ? null : (entry.oldValue as never),
    newValue: entry.newValue === undefined ? null : (entry.newValue as never),
    summary: entry.summary ?? describe(actor, entry),
    ipAddress: actor?.ipAddress ?? null,
    userAgent: actor?.userAgent?.slice(0, 255) ?? null,
  });
}

/** Human-readable line for the audit table, e.g. what §44 shows as examples. */
function describe(actor: AuditActor | null, entry: AuditEntry): string {
  const who = actor?.name?.trim() || "System";
  const what = entry.entityLabel ? `${entry.entity} ${entry.entityLabel}` : entry.entity;
  return `${who} performed ${entry.action} on ${what}`.slice(0, 400);
}

/**
 * Reduces a row to just the fields being changed, so the audit log stores a
 * readable before/after pair rather than two full records.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T | null | undefined,
  after: Partial<T>,
): { oldValue: Record<string, unknown>; newValue: Record<string, unknown> } {
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};

  for (const key of Object.keys(after)) {
    const nextValue = after[key as keyof T];
    const previousValue = before ? before[key as keyof T] : undefined;
    if (String(previousValue ?? "") === String(nextValue ?? "")) continue;
    oldValue[key] = normalise(previousValue);
    newValue[key] = normalise(nextValue);
  }

  return { oldValue, newValue };
}

function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

/** Pulls the caller address and agent off the request for the audit trail. */
export function requestFingerprint(req: Request | undefined): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  if (!req) return { ipAddress: null, userAgent: null };
  const forwarded = req.headers.get("x-forwarded-for");
  const ipAddress =
    forwarded?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    null;
  return { ipAddress, userAgent: req.headers.get("user-agent") };
}
