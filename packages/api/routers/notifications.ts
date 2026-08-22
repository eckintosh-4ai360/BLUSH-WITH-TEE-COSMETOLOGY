import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { notificationPreferences, notifications } from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { authedProcedure, router } from "../trpc";

const NOTIFICATION_TYPES = [
  "application_submitted",
  "application_approved",
  "application_rejected",
  "missing_document",
  "admission_granted",
  "payment_received",
  "outstanding_fee",
  "new_order",
  "order_confirmed",
  "order_shipped",
  "order_delivered",
  "low_stock",
  "new_expense",
  "certificate_issued",
  "general",
] as const;

/**
 * The notification centre behind the dashboard bell (§63). Everything here is
 * scoped to the caller - a notification belongs to one user and cannot be read
 * or dismissed by anybody else.
 */
export const notificationsRouter = router({
  list: authedProcedure
    .input(
      z
        .object({
          unreadOnly: z.boolean().default(false),
          limit: z.number().int().min(1).max(100).default(30),
        })
        .default({ unreadOnly: false, limit: 30 }),
    )
    .query(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const where = input.unreadOnly
        ? and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt))
        : eq(notifications.userId, ctx.user.id);

      const [rows, [unread], grouped] = await Promise.all([
        db
          .select()
          .from(notifications)
          .where(where)
          .orderBy(desc(notifications.createdAt))
          .limit(input.limit),
        db
          .select({ total: sql<number>`count(*)` })
          .from(notifications)
          .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt))),
        db
          .select({ type: notifications.type, total: sql<number>`count(*)` })
          .from(notifications)
          .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt)))
          .groupBy(notifications.type),
      ]);

      return {
        rows,
        unreadCount: Number(unread?.total ?? 0),
        unreadByType: grouped.map(row => ({ type: row.type, total: Number(row.total) })),
      };
    }),

  unreadCount: authedProcedure.query(async ({ ctx }) => {
    const db = await dbOrThrow();
    const [row] = await db
      .select({ total: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt)));
    return Number(row?.total ?? 0);
  }),

  markRead: authedProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.userId, ctx.user.id), inArray(notifications.id, input.ids)));
      return { success: true };
    }),

  markAllRead: authedProcedure.mutation(async ({ ctx }) => {
    const db = await dbOrThrow();
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt)));
    return { success: true };
  }),

  preferences: authedProcedure.query(async ({ ctx }) => {
    const db = await dbOrThrow();
    const rows = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, ctx.user.id));

    const byType = new Map(rows.map(row => [row.type, row]));

    return NOTIFICATION_TYPES.map(type => {
      const stored = byType.get(type);
      return {
        type,
        inApp: stored?.inApp ?? true,
        email: stored?.email ?? true,
        sms: stored?.sms ?? false,
        whatsapp: stored?.whatsapp ?? false,
      };
    });
  }),

  updatePreference: authedProcedure
    .input(
      z.object({
        type: z.enum(NOTIFICATION_TYPES),
        inApp: z.boolean(),
        email: z.boolean(),
        sms: z.boolean(),
        whatsapp: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      await db
        .insert(notificationPreferences)
        .values({ userId: ctx.user.id, ...input })
        .onConflictDoUpdate({
          target: [notificationPreferences.userId, notificationPreferences.type],
          set: {
            inApp: input.inApp,
            email: input.email,
            sms: input.sms,
            whatsapp: input.whatsapp,
          },
        });
      return { success: true };
    }),
});
