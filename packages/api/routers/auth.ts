import { cookies } from "next/headers";
import { COOKIE_NAME } from "@blush/shared/const";
import { getSessionCookieOptions } from "@blush/auth/cookies";
import { publicProcedure, router } from "../trpc";

export const authRouter = router({
  me: publicProcedure.query(opts => opts.ctx.user),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const cookieStore = await cookies();
    const cookieOptions = getSessionCookieOptions(ctx.req);
    cookieStore.set(COOKIE_NAME, "", { ...cookieOptions, maxAge: 0 });
    return {
      success: true,
    } as const;
  }),
});
