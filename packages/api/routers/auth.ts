import { cookies } from "next/headers";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@blush/shared/const";
import { ROLE_DEFINITIONS } from "@blush/shared/permissions";
import {
  MAX_PASSWORD_LENGTH,
  changePassword,
  ensureDefaultAdmin,
  getSessionCookieOptions,
  signInWithPassword,
  signSession,
} from "@blush/auth";
import { dbOrThrow } from "../dbOrThrow";
import { recordAudit } from "../services/audit";
import {
  authedProcedure,
  protectedProcedure,
  publicProcedure,
  router,
  throttledPublicProcedure,
} from "../trpc";

/**
 * Per-account lockout already stops eight guesses at one inbox. This stops the
 * other shape of the same attack: one password tried against many addresses,
 * which never trips a per-account counter.
 */
const loginLimit = throttledPublicProcedure({ bucket: "auth.login", limit: 20, windowMs: 15 * 60_000 });

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.user) return null;
    // The hash never leaves the server, not even to an authenticated client.
    const { passwordHash: _passwordHash, ...safe } = ctx.user;
    return safe;
  }),

  /**
   * Email and password sign-in.
   *
   * On the first call against an empty system this also creates the owner
   * account, so a fresh install can be signed into without a console step.
   */
  login: loginLimit
    .input(
      z.object({
        email: z.string().trim().email().max(320),
        password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      await ensureDefaultAdmin();

      const result = await signInWithPassword(input.email, input.password);

      if (!result.ok) {
        await recordAudit(db, null, {
          action: "login_failed",
          entity: "user",
          entityLabel: input.email.trim().toLowerCase(),
          newValue: { reason: result.reason },
          summary: `Failed sign-in for ${input.email.trim().toLowerCase()}`,
        }).catch(() => {
          // An audit failure must not become a login error.
        });

        throw new TRPCError({ code: "UNAUTHORIZED", message: result.message });
      }

      const token = await signSession({ userId: result.user.id, email: result.user.email });

      const cookieStore = await cookies();
      cookieStore.set(COOKIE_NAME, token, getSessionCookieOptions(ctx.req));

      await recordAudit(
        db,
        { id: result.user.id, name: result.user.name, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent },
        {
          action: "login",
          entity: "user",
          entityId: result.user.id,
          entityLabel: result.user.email,
          summary: `${result.user.name ?? result.user.email} signed in`,
        },
      ).catch(() => {});

      return {
        success: true as const,
        mustChangePassword: result.user.mustChangePassword,
        role: result.user.role,
      };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, "", { ...getSessionCookieOptions(ctx.req), maxAge: 0 });
    return { success: true } as const;
  }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
        newPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await changePassword(ctx.user.id, input.currentPassword, input.newPassword);
      if (!result.ok) throw new TRPCError({ code: "BAD_REQUEST", message: result.message });

      const db = await dbOrThrow();
      await recordAudit(
        db,
        { id: ctx.user.id, name: ctx.user.name, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent },
        {
          action: "change_password",
          entity: "user",
          entityId: ctx.user.id,
          summary: `${ctx.user.name ?? "A user"} changed their password`,
        },
      );

      return { success: true } as const;
    }),

  /**
   * The signed-in account plus the permissions it actually holds, so the
   * dashboard can render the right navigation. This is a convenience for the
   * UI - every procedure re-checks the same permissions server-side.
   */
  session: authedProcedure.query(({ ctx }) => ({
    user: {
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
      role: ctx.user.role,
      mustChangePassword: ctx.user.mustChangePassword,
    },
    roles: ctx.access.roles.map(role => ({ key: role, name: ROLE_DEFINITIONS[role].name })),
    permissions: Array.from(ctx.access.permissions),
  })),
});
