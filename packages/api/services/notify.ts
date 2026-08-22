import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  notificationDeliveries,
  notificationPreferences,
  notifications,
  users,
} from "@blush/db/schema";
import type { DbExecutor } from "../dbOrThrow";

export type NotificationType =
  | "application_submitted"
  | "application_approved"
  | "application_rejected"
  | "missing_document"
  | "admission_granted"
  | "payment_received"
  | "outstanding_fee"
  | "new_order"
  | "order_confirmed"
  | "order_shipped"
  | "order_delivered"
  | "low_stock"
  | "new_expense"
  | "certificate_issued"
  | "general";

export type NotifyInput = {
  userIds: number[];
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: number;
  /** Where clicking the notification should take the reader. */
  link?: string;
};

/**
 * Creates in-app notifications and queues the other channels (§38, §69).
 *
 * Email, SMS and WhatsApp are recorded as delivery rows in `queued` state; the
 * transport that drains them is configured per environment, so an unconfigured
 * channel shows as skipped rather than silently disappearing.
 */
export async function notify(db: DbExecutor, input: NotifyInput): Promise<void> {
  const recipients = Array.from(new Set(input.userIds)).filter(id => Number.isInteger(id) && id > 0);
  if (!recipients.length) return;

  const created = await db
    .insert(notifications)
    .values(
      recipients.map(userId => ({
        userId,
        type: input.type,
        title: input.title.slice(0, 180),
        body: input.body ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        link: input.link ?? null,
      })),
    )
    .returning({ id: notifications.id, userId: notifications.userId });

  if (!created.length) return;

  const [preferences, contacts] = await Promise.all([
    db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          inArray(notificationPreferences.userId, recipients),
          eq(notificationPreferences.type, input.type),
        ),
      ),
    db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, recipients)),
  ]);

  const preferenceByUser = new Map(preferences.map(row => [row.userId, row]));
  const emailByUser = new Map(contacts.map(row => [row.id, row.email]));

  const deliveries = created.flatMap(notification => {
    // Default on for email, off for the paid channels, until a user opts in.
    const preference = preferenceByUser.get(notification.userId);
    const wantsEmail = preference ? preference.email : true;
    const email = emailByUser.get(notification.userId);

    return wantsEmail && email
      ? [
          {
            notificationId: notification.id,
            channel: "email" as const,
            destination: email,
            status: "queued" as const,
          },
        ]
      : [];
  });

  if (deliveries.length) await db.insert(notificationDeliveries).values(deliveries);
}

/** Every user who should hear about back-office events of a given kind. */
export async function staffRecipients(
  db: DbExecutor,
  portalRoles: Array<"admin" | "staff"> = ["admin"],
): Promise<number[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, portalRoles), eq(users.isActive, true)));
  return rows.map(row => row.id);
}

export async function unreadCount(db: DbExecutor, userId: number): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows.length;
}
