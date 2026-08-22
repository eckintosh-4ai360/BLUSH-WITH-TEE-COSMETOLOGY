import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { paymentIntents, studentProfiles, webhookEvents } from "@blush/db/schema";
import { ENV } from "@blush/env";
import { dbOrThrow } from "../dbOrThrow";
import { buildReference } from "../platform.utils";
import { captureVerifiedPayment, outstandingBalanceMinor } from "../services/capture";
import { studentAccountSummary } from "../services/fees";
import { confirmManualPayment, getGateway } from "../services/gateway";
import { fromMinor, money, toAmountString, toMinor } from "../services/money";
import { router, studentProcedure } from "../trpc";

/**
 * The online fee payment workflow from §26:
 *
 *   login -> outstanding balance -> amount -> gateway -> SERVER VERIFICATION
 *   -> payment record -> balance updated -> receipt
 *
 * The balance is never touched by `initiate`. Only `verify`, after the server
 * has asked the provider what happened, can move money.
 */
export const paymentsRouter = router({
  /** What the student owes, and therefore the most they may pay. */
  balance: studentProcedure.query(async ({ ctx }) => {
    const db = await dbOrThrow();

    const [student] = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, ctx.user.id))
      .limit(1);

    if (!student) {
      return { student: null, summary: null, outstanding: 0, currency: "GHS" };
    }

    const summary = await studentAccountSummary(db, student.id);

    return {
      student: { id: student.id, studentNumber: student.studentNumber, fullName: student.fullName },
      summary,
      outstanding: summary.outstanding,
      currency: "GHS",
    };
  }),

  /**
   * Opens a charge with the provider. This writes an intent only - no payment,
   * no revenue, and no change to any balance.
   */
  initiate: studentProcedure
    .input(
      z.object({
        amount: z.number().positive().max(1_000_000),
        /**
         * Client-supplied key that makes a retried submit reuse the same
         * intent instead of opening a second charge.
         */
        idempotencyKey: z.string().min(8).max(96),
        callbackUrl: z.string().url().max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [student] = await db
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.userId, ctx.user.id))
        .limit(1);

      if (!student) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only enrolled students can pay fees online.",
        });
      }

      // Reuse an intent for the same key rather than opening another charge.
      const [existing] = await db
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.idempotencyKey, input.idempotencyKey))
        .limit(1);

      if (existing) {
        return {
          reference: existing.reference,
          amount: money(existing.amount),
          status: existing.status,
          checkoutUrl: null,
          provider: existing.provider,
          reused: true,
        };
      }

      const amountMinor = toMinor(input.amount);
      const outstandingMinor = await outstandingBalanceMinor(db, student.id);

      if (outstandingMinor <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "There is nothing outstanding on your account.",
        });
      }
      if (amountMinor > outstandingMinor) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You can pay up to GHS ${fromMinor(outstandingMinor).toFixed(2)}.`,
        });
      }

      const gateway = getGateway();
      const reference = buildReference("PI");

      const [intent] = await db
        .insert(paymentIntents)
        .values({
          reference,
          purpose: "student_fee",
          studentId: student.id,
          initiatedByUserId: ctx.user.id,
          provider: gateway.name,
          idempotencyKey: input.idempotencyKey,
          amount: toAmountString(amountMinor),
          currency: "GHS",
          status: "initiated",
        })
        .returning({ id: paymentIntents.id });

      const opened = await gateway.initiate({
        reference,
        amountMinor,
        currency: "GHS",
        email: student.email,
        callbackUrl: input.callbackUrl,
      });

      await db
        .update(paymentIntents)
        .set({ providerReference: opened.providerReference, status: "pending" })
        .where(eq(paymentIntents.id, intent!.id));

      return {
        reference,
        amount: fromMinor(amountMinor),
        status: "pending" as const,
        checkoutUrl: opened.checkoutUrl,
        provider: gateway.name,
        reused: false,
      };
    }),

  /**
   * Called when the student returns from the gateway. The reference is all the
   * client supplies; everything that decides the outcome is read from the
   * provider by the server.
   */
  verify: studentProcedure
    .input(
      z.object({
        reference: z.string().min(6).max(64),
        providerReference: z.string().max(160).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [student] = await db
        .select({ id: studentProfiles.id })
        .from(studentProfiles)
        .where(eq(studentProfiles.userId, ctx.user.id))
        .limit(1);

      const [intent] = await db
        .select({ studentId: paymentIntents.studentId })
        .from(paymentIntents)
        .where(eq(paymentIntents.reference, input.reference))
        .limit(1);

      if (!intent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That payment could not be found." });
      }
      // A student may only settle their own intent.
      if (!student || intent.studentId !== student.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This payment is not yours to confirm." });
      }

      const result = await captureVerifiedPayment(db, {
        intentReference: input.reference,
        providerReference: input.providerReference,
        actor: {
          id: ctx.user.id,
          name: ctx.user.name,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        },
      });

      const summary = await studentAccountSummary(db, student.id);
      return { ...result, summary };
    }),

  /** Payment attempts for the signed-in student, newest first. */
  history: studentProcedure.query(async ({ ctx }) => {
    const db = await dbOrThrow();

    const [student] = await db
      .select({ id: studentProfiles.id })
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, ctx.user.id))
      .limit(1);
    if (!student) return [];

    const rows = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.studentId, student.id))
      .orderBy(desc(paymentIntents.createdAt))
      .limit(25);

    return rows.map(row => ({ ...row, amount: money(row.amount) }));
  }),

  /**
   * Development helper that stands in for the provider confirming a charge.
   * Refuses to run in production, so the only way to succeed there is a real
   * verified gateway response.
   */
  simulateProviderSuccess: studentProcedure
    .input(z.object({ reference: z.string().min(6).max(64) }))
    .mutation(async ({ input }) => {
      if (ENV.isProduction) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Simulated payments are not available in production.",
        });
      }

      const db = await dbOrThrow();
      const [intent] = await db
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.reference, input.reference))
        .limit(1);

      if (!intent?.providerReference) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That payment could not be found." });
      }

      confirmManualPayment(intent.providerReference, toMinor(intent.amount));
      return { success: true };
    }),
});

/**
 * Handles one provider webhook delivery.
 *
 * Called from the HTTP route handler, which is where the raw body lives - the
 * signature has to be checked against the exact bytes the provider signed, so
 * this cannot be a tRPC procedure over a parsed payload.
 *
 * Deduplicated on (provider, event id) by a unique index, so a provider
 * retrying the same event cannot book a second payment (§48).
 */
export async function handleGatewayWebhook(input: {
  provider: string;
  eventId: string;
  eventType?: string;
  reference: string;
  payload: unknown;
}): Promise<{ status: "duplicate" | "captured" | "already_captured" | "ignored" }> {
  const db = await dbOrThrow();

  const [recorded] = await db
    .insert(webhookEvents)
    .values({
      provider: input.provider,
      eventId: input.eventId,
      eventType: input.eventType,
      payload: (input.payload ?? null) as never,
    })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.eventId] })
    .returning({ id: webhookEvents.id });

  // No row means this exact event has already been seen and handled.
  if (!recorded) return { status: "duplicate" };

  try {
    const [intent] = await db
      .select({ id: paymentIntents.id })
      .from(paymentIntents)
      .where(eq(paymentIntents.reference, input.reference))
      .limit(1);

    if (!intent) {
      await db
        .update(webhookEvents)
        .set({ processedAt: new Date(), error: "No matching payment intent" })
        .where(eq(webhookEvents.id, recorded.id));
      return { status: "ignored" };
    }

    const result = await captureVerifiedPayment(db, {
      intentReference: input.reference,
      actor: null,
    });

    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.id, recorded.id));

    return { status: result.status };
  } catch (error) {
    await db
      .update(webhookEvents)
      .set({
        processedAt: new Date(),
        error: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(webhookEvents.id, recorded.id));
    throw error;
  }
}
