import { and, eq, inArray, isNull } from "drizzle-orm";
import type { PermissionKey } from "@blush/shared/permissions";
import {
  notificationDeliveries,
  notificationPreferences,
  notifications,
  users,
} from "@blush/db/schema";
import type { Database, DbExecutor } from "../dbOrThrow";
import { resolveAccess } from "./access";

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
  | "general"
  | "appointment_requested"
  | "appointment_confirmed"
  | "appointment_cancelled"
  | "order_placed";

export type NotifyInput = {
  userIds: number[];
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: number;
  // Where clicking the notification should take the reader.
  link?: string;
  // The bell only. The queued email rows carry no subject or body of their own, so busy
  // events such as bookings and web orders should not add to them.
  inAppOnly?: boolean;
};

// Creates in-app notifications and queues the other channels,.
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

  if (!created.length || input.inAppOnly) return;

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

// Every user who should hear about back-office events of a given kind.
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

// Active back-office accounts that hold a permission, so an alert reaches whoever acts on it
// (the front desk handles bookings) rather than only the owners.
export async function recipientsWithPermission(
  db: Database,
  permission: PermissionKey,
): Promise<number[]> {
  const rows = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(inArray(users.role, ["admin", "staff"]), eq(users.isActive, true)));

  const holders: number[] = [];
  for (const row of rows) {
    const access = await resolveAccess(db, row);
    if (access.can(permission)) holders.push(row.id);
  }
  return holders;
}

// Runs an alert after the thing it describes has been saved. A message that cannot be sent
// must never undo the booking, order or payment it is about.
export async function bestEffort(label: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error(`[notify] ${label} failed:`, error);
  }
}

export async function unreadCount(db: DbExecutor, userId: number): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows.length;
}
