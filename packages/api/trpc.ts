import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@blush/shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

const requireStudent = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user || (ctx.user.role !== "student" && ctx.user.role !== "admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Student access is required." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const requireStaff = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user || (ctx.user.role !== "staff" && ctx.user.role !== "admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Staff access is required." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const studentProcedure = protectedProcedure.use(requireStudent);
export const staffProcedure = protectedProcedure.use(requireStaff);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
