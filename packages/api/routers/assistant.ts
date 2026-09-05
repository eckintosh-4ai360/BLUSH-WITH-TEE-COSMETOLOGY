import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { AiError, activeModel, isAiConfigured } from "@blush/ai";
import { dbOrThrow } from "../dbOrThrow";
import { ask } from "../services/assistant/agent";
import { enforceRateLimit } from "../services/rateLimit";
import { availableTools } from "../services/assistant/registry";
import { authedProcedure, publicProcedure, router, throttledPublicProcedure } from "../trpc";

/**
 * A member of staff can ask more often than a passer-by, but not without
 * limit: every question costs a model call, and a stuck client should not be
 * able to spend the school's credit in a loop.
 */
const staffLimit = { bucket: "assistant.ask", limit: 60, windowMs: 10 * 60_000 };
const publicLimit = throttledPublicProcedure({
  bucket: "assistant.chat",
  limit: 20,
  windowMs: 10 * 60_000,
});

const turn = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
});

const askInput = z.object({
  question: z.string().trim().min(1, "Ask a question.").max(2000),
  history: z.array(turn).max(20).default([]),
});

export const assistantRouter = router({
  /**
   * Whether the assistant can run, and what it can reach for this caller.
   * Read before the panel renders, so an unconfigured deployment says so
   * instead of failing on the first message.
   */
  status: authedProcedure.query(async ({ ctx }) => {
    if (!isAiConfigured()) {
      return { enabled: false as const, model: null, toolCount: 0 };
    }

    const db = await dbOrThrow();
    const tools = availableTools("staff", { db, access: ctx.access, now: new Date() });

    return { enabled: true as const, model: activeModel(), toolCount: tools.length };
  }),

  /** The staff assistant: reads whatever the caller is allowed to read. */
  ask: authedProcedure
    .use(async ({ ctx, next }) => {
      enforceRateLimit(String(ctx.user.id), staffLimit);
      return next({ ctx });
    })
    .input(askInput)
    .mutation(async ({ ctx, input }) => {
      const db = await dbOrThrow();

      try {
        return await ask({
          question: input.question,
          history: input.history,
          audience: "staff",
          db,
          access: ctx.access,
          caller: { name: ctx.user.name ?? null, roles: ctx.access.roles },
        });
      } catch (error) {
        throw asTrpcError(error);
      }
    }),

  /**
   * The website assistant. Unauthenticated, and given a catalogue that reaches
   * only what is already published - so there is nothing here for a visitor to
   * talk their way into.
   */
  chat: publicLimit
    .input(askInput)
    .mutation(async ({ input }) => {
      const db = await dbOrThrow();

      try {
        return await ask({
          question: input.question,
          history: input.history,
          audience: "public",
          db,
          access: null,
          caller: { name: null, roles: [] },
        });
      } catch (error) {
        throw asTrpcError(error);
      }
    }),

  /** Lets the website hide its chat launcher when no key is configured. */
  available: publicProcedure.query(() => ({ enabled: isAiConfigured() })),
});

/**
 * Provider failures are already written for a person to read, so they are
 * passed through rather than replaced with a generic message. Anything else is
 * logged and generalised, because it may carry query detail.
 */
function asTrpcError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;

  if (error instanceof AiError) {
    return new TRPCError({
      code: error.status === 429 ? "TOO_MANY_REQUESTS" : "INTERNAL_SERVER_ERROR",
      message: error.message,
      cause: error,
    });
  }

  console.error("[Assistant] Unexpected failure:", error);
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "The assistant could not answer that. Try again in a moment.",
  });
}
