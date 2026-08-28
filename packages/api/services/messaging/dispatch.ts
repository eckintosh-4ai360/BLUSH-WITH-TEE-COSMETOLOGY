import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { notificationDeliveries } from "@blush/db/schema";
import type { DbExecutor } from "../../dbOrThrow";
import type { NotificationType } from "../notify";
import { readMessagingConfig, type MessagingConfig } from "./config";
import { sendEmail } from "./email";
import { sendSms, normaliseMsisdn } from "./sms";

/** Gives up after this many tries, so a dead address is not retried forever. */
const MAX_ATTEMPTS = 3;

/** One flush handles at most this many, so a backlog cannot stall a request. */
const BATCH_SIZE = 25;

export type MessageRecipient = {
  name: string;
  email?: string | null;
  phone?: string | null;
};

export type QueueInput = {
  type: NotificationType;
  recipient: MessageRecipient;
  /** Values for the `{{placeholders}}` in the template. */
  facts: Record<string, string | number | null | undefined>;
  /** Ties the row to an in-app notification when the recipient has an account. */
  notificationId?: number;
};

/**
 * Fills a template.
 *
 * A placeholder with no matching fact renders empty rather than leaving
 * `{{balance}}` in a message a student reads - most events carry only some of
 * the facts, and a template is shared across all of them. The tidy-up
 * afterwards collapses the blank lines and doubled spaces that leaves behind,
 * so an absent optional sentence does not show as a gap.
 */
export function render(template: string, facts: QueueInput["facts"]): string {
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
      const value = facts[key];
      return value === null || value === undefined ? "" : String(value);
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Writes the outbox rows for one event.
 *
 * Call this inside the transaction that caused the event. Nothing is sent
 * here: a message must not go out for a change that then rolls back, and an
 * SMTP round trip has no business inside a database transaction. `flush`
 * does the sending afterwards.
 *
 * A channel that is switched off, or has no address to send to, is recorded as
 * `skipped` with the reason rather than dropped, so "why did they not get a
 * text" has an answer in the log.
 */
export async function queueMessages(
  db: DbExecutor,
  config: MessagingConfig,
  input: QueueInput,
): Promise<void> {
  const rule = config.events.events[input.type];
  const template = config.events.templates[input.type];
  if (!rule || !template) return;

  const subject = render(template.subject, input.facts);
  const rows: Array<typeof notificationDeliveries.$inferInsert> = [];

  const base = {
    notificationId: input.notificationId ?? null,
    type: input.type,
    recipientName: input.recipient.name.slice(0, 160),
  };

  if (rule.email) {
    const address = input.recipient.email?.trim() || null;
    const body = render(template.email, input.facts);
    rows.push({
      ...base,
      channel: "email",
      destination: address,
      subject: subject.slice(0, 255),
      body,
      ...(config.events.masterEnabled && config.email.enabled && address
        ? { status: "queued" as const }
        : {
            status: "skipped" as const,
            error: !address
              ? "No email address on file."
              : !config.events.masterEnabled
                ? "Automated messages are switched off."
                : "Email is switched off.",
          }),
    });
  }

  if (rule.sms) {
    const number = normaliseMsisdn(input.recipient.phone);
    const body = render(template.sms, input.facts);
    rows.push({
      ...base,
      channel: "sms",
      destination: number ?? input.recipient.phone ?? null,
      subject: subject.slice(0, 255),
      body,
      ...(config.events.masterEnabled && config.sms.enabled && number
        ? { status: "queued" as const }
        : {
            status: "skipped" as const,
            error: !number
              ? "No usable phone number on file."
              : !config.events.masterEnabled
                ? "Automated messages are switched off."
                : "SMS is switched off.",
          }),
    });
  }

  if (rows.length) await db.insert(notificationDeliveries).values(rows);
}

/**
 * Sends whatever is waiting.
 *
 * Safe to call from anywhere and at any time: rows are claimed by moving them
 * out of `queued` before the network call, so two overlapping flushes cannot
 * send the same message twice. Anything that fails goes back to `queued` until
 * it has been tried `MAX_ATTEMPTS` times, after which it stays `failed` and is
 * left in the log to be looked at.
 *
 * Returns a tally rather than throwing, because the caller is usually a
 * request that has already succeeded - a student's payment is recorded whether
 * or not the receipt text got through.
 */
export async function flush(
  db: DbExecutor,
  limit = BATCH_SIZE,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const config = await readMessagingConfig(db);
  const tally = { sent: 0, failed: 0, skipped: 0 };

  const pending = await db
    .select()
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.status, "queued"),
        inArray(notificationDeliveries.channel, ["email", "sms"]),
        lt(notificationDeliveries.attempts, MAX_ATTEMPTS),
      ),
    )
    .orderBy(asc(notificationDeliveries.createdAt))
    .limit(limit);

  for (const row of pending) {
    // Claiming the row first is what makes overlapping flushes safe: the
    // update only matches while the row is still queued, so whichever caller
    // gets there first owns it.
    const claimed = await db
      .update(notificationDeliveries)
      .set({
        status: "failed",
        attempts: row.attempts + 1,
        lastAttemptAt: new Date(),
        error: "Sending...",
      })
      .where(
        and(
          eq(notificationDeliveries.id, row.id),
          eq(notificationDeliveries.status, "queued"),
        ),
      )
      .returning({ id: notificationDeliveries.id });

    if (!claimed.length) continue;

    const destination = row.destination ?? "";
    const result =
      row.channel === "sms"
        ? await sendSms(config.sms, destination, row.body ?? "")
        : await sendEmail(config.email, destination, row.subject ?? "", row.body ?? "");

    if (result.ok) {
      tally.sent += 1;
      await db
        .update(notificationDeliveries)
        .set({ status: "sent", sentAt: new Date(), error: result.detail?.slice(0, 300) ?? null })
        .where(eq(notificationDeliveries.id, row.id));
      continue;
    }

    const attempts = row.attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    if (exhausted) tally.failed += 1;

    await db
      .update(notificationDeliveries)
      .set({
        // Anything with tries left goes back in the queue for the next flush.
        status: exhausted ? "failed" : "queued",
        error: result.error.slice(0, 300),
      })
      .where(eq(notificationDeliveries.id, row.id));
  }

  return tally;
}

/**
 * Sends in the background, without making the caller wait or fail.
 *
 * The events this hangs off - an application submitted, a payment recorded -
 * have already been committed by the time this runs. Making the student wait
 * on an SMTP handshake to see their receipt would be the wrong trade, and an
 * unreachable provider must not turn a successful payment into an error.
 */
export function flushInBackground(db: DbExecutor): void {
  void flush(db).catch(() => {
    // Deliberately swallowed. Every failure is already written to the row it
    // belongs to, which is where anyone looking would look.
  });
}

/** Recent sends, newest first, for the settings page's delivery log. */
export async function recentDeliveries(db: DbExecutor, limit = 30) {
  return db
    .select({
      id: notificationDeliveries.id,
      type: notificationDeliveries.type,
      channel: notificationDeliveries.channel,
      destination: notificationDeliveries.destination,
      recipientName: notificationDeliveries.recipientName,
      subject: notificationDeliveries.subject,
      status: notificationDeliveries.status,
      error: notificationDeliveries.error,
      attempts: notificationDeliveries.attempts,
      sentAt: notificationDeliveries.sentAt,
      createdAt: notificationDeliveries.createdAt,
    })
    .from(notificationDeliveries)
    .where(or(eq(notificationDeliveries.channel, "email"), eq(notificationDeliveries.channel, "sms")))
    .orderBy(sql`${notificationDeliveries.createdAt} desc`)
    .limit(limit);
}
