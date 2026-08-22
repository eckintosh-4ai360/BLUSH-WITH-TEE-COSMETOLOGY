import { cookies } from "next/headers";
import { COOKIE_NAME } from "@blush/shared/const";
import { ROLE_DEFINITIONS } from "@blush/shared/permissions";
import { getSessionCookieOptions } from "@blush/auth/cookies";
import { authedProcedure, publicProcedure, router } from "../trpc";

export const authRouter = router({
  me: publicProcedure.query(opts => opts.ctx.user),

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
    },
    roles: ctx.access.roles.map(role => ({
      key: role,
      name: ROLE_DEFINITIONS[role].name,
    })),
    permissions: Array.from(ctx.access.permissions),
  })),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    const cookieStore = await cookies();
    const cookieOptions = getSessionCookieOptions(ctx.req);
    cookieStore.set(COOKIE_NAME, "", { ...cookieOptions, maxAge: 0 });
    return { success: true } as const;
  }),
});
