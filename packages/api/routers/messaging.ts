import { eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { notificationDeliveries, systemSettings } from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { recordAudit } from "../services/audit";
import {
  MESSAGED_EVENTS,
  keepSecret,
  readMessagingConfig,
  redact,
} from "../services/messaging/config";
import { flush, recentDeliveries, render } from "../services/messaging/dispatch";
import { resetEmailTransport, sendEmail, verifyEmail } from "../services/messaging/email";
import { sendSms } from "../services/messaging/sms";
import { permissionProcedure, router } from "../trpc";

/**
 * Writes one messaging setting.
 *
 * These rows are created by bootstrap, but an installation that predates this
 * feature will not have them yet, so the row is created if it is missing
 * rather than failing the save.
 */
async function saveSetting(
  db: Awaited<ReturnType<typeof dbOrThrow>>,
  key: string,
  value: unknown,
  description: string,
  userId: number,
) {
  await db
    .insert(systemSettings)
    .values({ key, category: "messaging", value: value as never, description, updatedByUserId: userId })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: value as never, updatedByUserId: userId },
    });
}

const channelRule = z.object({ email: z.boolean(), sms: z.boolean() });

export const messagingRouter = router({
  /**
   * The configuration as the settings page sees it.
   *
   * Secrets never leave the server: the API key and app password come back as
   * a fixed mask with a flag saying whether one is stored, which is all the
   * page needs to say "configured" without ever holding the value.
   */
  config: permissionProcedure("settings.read").query(async () => {
    const db = await dbOrThrow();
    return {
      ...redact(await readMessagingConfig(db)),
      events_meta: MESSAGED_EVENTS,
    };
  }),

  saveSms: permissionProcedure("settings.write")
    .input(
      z.object({
        enabled: z.boolean(),
        baseUrl: z.string().trim().url().max(255),
        senderId: z.string().trim().max(11),
        /** Absent or the mask means "leave the stored key alone". */
        apiKey: z.string().trim().max(255).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const current = await readMessagingConfig(db);
      const apiKey = keepSecret(input.apiKey, current.sms.apiKey);

      if (input.enabled && !apiKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add the mNotify API key before switching SMS on.",
        });
      }
      if (input.enabled && !input.senderId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add the sender ID before switching SMS on.",
        });
      }

      await saveSetting(
        db,
        "messaging.sms",
        {
          enabled: input.enabled,
          baseUrl: input.baseUrl,
          senderId: input.senderId,
          apiKey,
        },
        "mNotify credentials used to send text messages.",
        ctx.user.id,
      );

      // The key itself is never written to the audit log; that it changed is
      // the part worth recording.
      await recordAudit(db, ctx.actor, {
        action: "update_setting",
        entity: "systemSetting",
        entityLabel: "messaging.sms",
        newValue: {
          enabled: input.enabled,
          senderId: input.senderId,
          apiKeyChanged: apiKey !== current.sms.apiKey,
        },
        summary: `${ctx.actor.name ?? "Staff"} changed the SMS settings`,
      });

      return { success: true };
    }),

  saveEmail: permissionProcedure("settings.write")
    .input(
      z.object({
        enabled: z.boolean(),
        host: z.string().trim().min(1).max(160),
        port: z.number().int().min(1).max(65535),
        secure: z.boolean(),
        fromName: z.string().trim().max(120),
        fromAddress: z.string().trim().email().max(320).or(z.literal("")),
        user: z.string().trim().max(320),
        appPassword: z.string().trim().max(255).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const current = await readMessagingConfig(db);
      // Google prints app passwords in four blocks of four; people paste them
      // as shown and the spaces are not part of the secret.
      const supplied = input.appPassword?.replace(/\s+/g, "");
      const appPassword = keepSecret(supplied, current.email.appPassword);

      if (input.enabled && (!appPassword || !input.fromAddress)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add the sending address and app password before switching email on.",
        });
      }

      await saveSetting(
        db,
        "messaging.email",
        {
          enabled: input.enabled,
          host: input.host,
          port: input.port,
          secure: input.secure,
          fromName: input.fromName,
          fromAddress: input.fromAddress,
          user: input.user || input.fromAddress,
          appPassword,
        },
        "Mailbox used to send email, over SMTP.",
        ctx.user.id,
      );

      // The credentials changed, so the pooled connection built from the old
      // ones must not be reused.
      resetEmailTransport();

      await recordAudit(db, ctx.actor, {
        action: "update_setting",
        entity: "systemSetting",
        entityLabel: "messaging.email",
        newValue: {
          enabled: input.enabled,
          host: input.host,
          fromAddress: input.fromAddress,
          passwordChanged: appPassword !== current.email.appPassword,
        },
        summary: `${ctx.actor.name ?? "Staff"} changed the email settings`,
      });

      return { success: true };
    }),

  saveEvents: permissionProcedure("settings.write")
    .input(
      z.object({
        masterEnabled: z.boolean(),
        events: z.record(z.string(), channelRule),
        templates: z.record(
          z.string(),
          z.object({
            subject: z.string().trim().max(255),
            email: z.string().trim().max(4000),
            sms: z.string().trim().max(900),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      await saveSetting(
        db,
        "messaging.events",
        input,
        "Which events are announced, over which channels, and in what words.",
        ctx.user.id,
      );

      await recordAudit(db, ctx.actor, {
        action: "update_setting",
        entity: "systemSetting",
        entityLabel: "messaging.events",
        newValue: { masterEnabled: input.masterEnabled },
        summary: `${ctx.actor.name ?? "Staff"} changed which events are announced`,
      });

      return { success: true };
    }),

  /**
   * Sends one message to a chosen address, right now.
   *
   * Deliberately bypasses the outbox and reports the provider's answer
   * verbatim. Setting up SMTP or an SMS sender ID is mostly a matter of
   * finding out exactly why it is refusing you, and a queued row that quietly
   * retries is no help with that.
   */
  test: permissionProcedure("settings.write")
    .input(
      z.object({
        channel: z.enum(["email", "sms"]),
        to: z.string().trim().min(3).max(320),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const config = await readMessagingConfig(db);

      if (input.channel === "sms") {
        const result = await sendSms(
          config.sms,
          input.to,
          "Test message from your school's admin dashboard. If you are reading this, mNotify is set up correctly.",
        );
        return result.ok
          ? { ok: true as const, detail: result.detail ?? "Sent." }
          : { ok: false as const, detail: result.error };
      }

      const result = await sendEmail(
        config.email,
        input.to,
        "Test message from your admin dashboard",
        "This is a test.\n\nIf you are reading this, email is set up correctly and the school can send receipts, admission decisions and reminders from here.",
      );
      return result.ok
        ? { ok: true as const, detail: result.detail ?? "Sent." }
        : { ok: false as const, detail: result.error };
    }),

  /** Proves the SMTP credentials without sending anything to anybody. */
  verifyEmail: permissionProcedure("settings.write").mutation(async () => {
    const db = await dbOrThrow();
    const config = await readMessagingConfig(db);
    const result = await verifyEmail(config.email);
    return result.ok
      ? { ok: true as const, detail: result.detail ?? "Connected." }
      : { ok: false as const, detail: result.error };
  }),

  /** Shows a template with the placeholders filled, so wording can be checked. */
  preview: permissionProcedure("settings.read")
    .input(z.object({ template: z.string().max(4000) }))
    .query(({ input }) =>
      render(input.template, {
        school: "Blush With Tee",
        name: "Ama",
        fullName: "Ama Mensah",
        course: "Professional Cosmetology",
        reference: "APP-4F2K9C",
        amount: "GHS 500.00",
        balance: "Your outstanding balance is GHS 1,200.00.",
        note: "Please send a copy of your certificate.",
        // The low-stock alert is the one event addressed to the school rather
        // than to a student, so its placeholders belong here too.
        count: 3,
        items: "- Shea butter 500g (out of stock, reorder at 6)\n- Cotton pads (2 left)",
        topItem: "Shea butter 500g (out of stock, reorder at 6)",
        url: "https://admin.example.com/api/manus-storage/image/reports/low-stock-2026-09-02",
      }),
    ),

  deliveries: permissionProcedure("settings.read").query(async () => {
    const db = await dbOrThrow();
    return recentDeliveries(db);
  }),

  /** Retries whatever is still waiting, on demand. */
  flushQueue: permissionProcedure("settings.write").mutation(async () => {
    const db = await dbOrThrow();
    return flush(db, 50);
  }),

  /**
   * Puts a message that gave up back in the queue.
   *
   * The attempt counter is reset too, otherwise the row would be past its
   * limit and the next flush would step straight over it.
   */
  retry: permissionProcedure("settings.write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await dbOrThrow();

      const [row] = await db
        .update(notificationDeliveries)
        .set({ status: "queued", attempts: 0, error: null })
        .where(eq(notificationDeliveries.id, input.id))
        .returning({ id: notificationDeliveries.id });

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That message is no longer on file." });
      }

      return flush(db, 5);
    }),
});
