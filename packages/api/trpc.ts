import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@blush/shared/const";
import type { PermissionKey } from "@blush/shared/permissions";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { dbOrThrow } from "./dbOrThrow";
import { resolveAccess, type AccessContext } from "./services/access";
import type { AuditActor } from "./services/audit";
import { enforceRateLimit, type RateLimitRule } from "./services/rateLimit";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);

/**
 * A public procedure with a per-caller budget.
 *
 * The caller is identified by the forwarded address, which a client behind no
 * trusted proxy can rewrite — so this raises the cost of scraping rather than
 * making it impossible. It belongs here anyway: the endpoints it guards are
 * unauthenticated, and without it a single machine can walk the whole
 * certificate register or fill the applications table overnight.
 */
export function throttledPublicProcedure(rule: RateLimitRule) {
  return t.procedure.use(async ({ ctx, next }) => {
    enforceRateLimit(ctx.ipAddress, rule);
    return next();
  });
}

/**
 * Loads the caller permission set once per request and exposes an audit actor
 * built from the same session, so every downstream procedure can both check
 * authorisation and attribute what it writes.
 */
const withAccess = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const db = await dbOrThrow();
  const access = await resolveAccess(db, ctx.user);

  const actor: AuditActor = {
    id: ctx.user.id,
    name: ctx.user.name,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  };

  return next({ ctx: { ...ctx, user: ctx.user, db, access, actor } });
});

/** Any signed-in account, with its resolved permissions attached. */
export const authedProcedure = t.procedure.use(withAccess);

/**
 * Builds a procedure that refuses the call unless the caller holds every one
 * of the listed permissions. This is the enforcement point referred to in §33:
 * hiding the menu item is presentation, this is the control.
 */
export function permissionProcedure(...required: PermissionKey[]) {
  return authedProcedure.use(async ({ ctx, next }) => {
    for (const permission of required) ctx.access.assert(permission);
    return next({ ctx });
  });
}

/** Passes when the caller holds at least one of the listed permissions. */
export function anyPermissionProcedure(...required: PermissionKey[]) {
  return authedProcedure.use(async ({ ctx, next }) => {
    if (required.length && !ctx.access.canAny(...required)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action.",
      });
    }
    return next({ ctx });
  });
}

const requireStudent = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user || (ctx.user.role !== "student" && ctx.user.role !== "admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Student access is required." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const requireStaff = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user || (ctx.user.role !== "staff" && ctx.user.role !== "admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Staff access is required." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const studentProcedure = protectedProcedure.use(requireStudent);
export const staffProcedure = protectedProcedure.use(requireStaff);

/** Staff-portal procedure that also carries permissions and an audit actor. */
export const staffAccessProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "staff" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Staff access is required." });
  }
  return next({ ctx });
});

/**
 * Reserved for owner-level operations. Prefer `permissionProcedure` for
 * anything a delegated role should be able to do.
 */
export const adminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

export type { AccessContext };
