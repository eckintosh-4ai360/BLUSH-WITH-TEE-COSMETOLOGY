import { and, count, desc, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  ROLE_DEFINITIONS,
  ROLE_KEYS,
  PERMISSIONS,
  PERMISSION_KEYS,
  type RoleKey,
} from "@blush/shared/permissions";
import {
  auditLogs,
  permissions as permissionsTable,
  rolePermissions,
  roles,
  systemSettings,
  userRoles,
  users,
} from "@blush/db/schema";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  createAccount,
  setPassword,
} from "@blush/auth";
import { dbOrThrow } from "../dbOrThrow";
import { linkStudentAccount } from "../services/people";
import {
  assignRole,
  ensureAccessControlSeeded,
  portalRoleFor,
  revokeRole,
} from "../services/access";
import { recordAudit } from "../services/audit";
import { listInputSchema, likePattern, paginate, paginationBounds } from "../services/pagination";
import { authedProcedure, permissionProcedure, router } from "../trpc";

const ROLE_KEY_ENUM = z.enum(ROLE_KEYS as [string, ...string[]]);

export const platformRouter = router({
  /* ---------------------------------------------------------------------- */
  /* Audit log (§44)                                                        */
  /* ---------------------------------------------------------------------- */

  auditLog: permissionProcedure("audit.read")
    .input(
      listInputSchema.extend({
        entity: z.string().max(64).optional(),
        action: z.string().max(80).optional(),
        userId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        input.entity ? eq(auditLogs.entity, input.entity) : undefined,
        input.action ? eq(auditLogs.action, input.action) : undefined,
        input.userId ? eq(auditLogs.userId, input.userId) : undefined,
        input.dateFrom ? gte(auditLogs.createdAt, input.dateFrom) : undefined,
        input.dateTo ? lte(auditLogs.createdAt, input.dateTo) : undefined,
        input.search
          ? or(
              ilike(auditLogs.summary, likePattern(input.search)),
              ilike(auditLogs.entityLabel, likePattern(input.search)),
              ilike(auditLogs.userName, likePattern(input.search)),
            )
          : undefined,
      );

      const [rows, [total]] = await Promise.all([
        db
          .select()
          .from(auditLogs)
          .where(where)
          .orderBy(desc(auditLogs.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(auditLogs).where(where),
      ]);

      return paginate(rows, Number(total?.total ?? 0), input);
    }),

  /** Distinct entities and actions, used to populate the audit filters. */
  auditFacets: permissionProcedure("audit.read").query(async () => {
    const db = await dbOrThrow();

    const [entities, actions] = await Promise.all([
      db.selectDistinct({ entity: auditLogs.entity }).from(auditLogs).orderBy(auditLogs.entity),
      db.selectDistinct({ action: auditLogs.action }).from(auditLogs).orderBy(auditLogs.action),
    ]);

    return {
      entities: entities.map(row => row.entity),
      actions: actions.map(row => row.action),
    };
  }),

  /* ---------------------------------------------------------------------- */
  /* Roles and permissions (§33)                                            */
  /* ---------------------------------------------------------------------- */

  roles: permissionProcedure("roles.read").query(async () => {
    const db = await dbOrThrow();
    await ensureAccessControlSeeded(db);

    const [roleRows, grants] = await Promise.all([
      db.select().from(roles).orderBy(roles.id),
      db
        .select({ roleKey: roles.key, permissionKey: permissionsTable.key })
        .from(rolePermissions)
        .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
        .innerJoin(permissionsTable, eq(rolePermissions.permissionId, permissionsTable.id)),
    ]);

    const byRole = new Map<string, string[]>();
    for (const grant of grants) {
      const list = byRole.get(grant.roleKey) ?? [];
      list.push(grant.permissionKey);
      byRole.set(grant.roleKey, list);
    }

    return roleRows.map(role => ({
      ...role,
      description: role.description ?? ROLE_DEFINITIONS[role.key]?.description ?? null,
      permissions: byRole.get(role.key) ?? [],
    }));
  }),

  /** The permission catalogue, grouped by module, for the roles screen. */
  permissionCatalogue: permissionProcedure("roles.read").query(() => {
    const grouped = new Map<string, Array<{ key: string; description: string }>>();

    for (const key of PERMISSION_KEYS) {
      const moduleName = key.split(".")[0] ?? "platform";
      const list = grouped.get(moduleName) ?? [];
      list.push({ key, description: PERMISSIONS[key] });
      grouped.set(moduleName, list);
    }

    return Array.from(grouped, ([moduleName, entries]) => ({ module: moduleName, entries }));
  }),

  /** Accounts with a back-office role, for the staff access screen. */
  accounts: permissionProcedure("roles.read")
    .input(listInputSchema)
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = input.search
        ? or(ilike(users.name, likePattern(input.search)), ilike(users.email, likePattern(input.search)))
        : undefined;

      const [rows, [total], assignments] = await Promise.all([
        db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            isActive: users.isActive,
            mustChangePassword: users.mustChangePassword,
            lastSignedIn: users.lastSignedIn,
          })
          .from(users)
          .where(where)
          .orderBy(desc(users.lastSignedIn))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(users).where(where),
        db
          .select({ userId: userRoles.userId, roleKey: roles.key })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id)),
      ]);

      const rolesByUser = new Map<number, string[]>();
      for (const assignment of assignments) {
        const list = rolesByUser.get(assignment.userId) ?? [];
        list.push(assignment.roleKey);
        rolesByUser.set(assignment.userId, list);
      }

      return paginate(
        rows.map(row => ({ ...row, roles: rolesByUser.get(row.id) ?? [] })),
        Number(total?.total ?? 0),
        input,
      );
    }),

  /**
   * Creates a sign-in account (§45).
   *
   * The password is hashed before it is stored and is flagged for change on
   * first use, so an administrator setting one up never leaves a shared secret
   * in place. Granting the role is part of the same call, because an account
   * with no role can sign in and see nothing, which reads as a broken system.
   */
  createUser: permissionProcedure("roles.write")
    .input(
      z.object({
        name: z.string().trim().min(2).max(160),
        email: z.string().trim().email().max(320),
        password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
        role: ROLE_KEY_ENUM,
        mustChangePassword: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const created = await createAccount({
        name: input.name,
        email: input.email,
        password: input.password,
        role: portalRoleFor(input.role as RoleKey),
        mustChangePassword: input.mustChangePassword,
      });

      if (!created.ok) throw new TRPCError({ code: "BAD_REQUEST", message: created.message });

      await assignRole(db, {
        userId: created.userId,
        role: input.role as never,
        assignedByUserId: ctx.user.id,
      });

      // A student is usually admitted before anyone sets up their sign-in, so
      // the record is already waiting when the account is made. Claim it here
      // rather than leaving the new account looking at an empty portal.
      await linkStudentAccount(db, { id: created.userId, email: input.email });

      await recordAudit(db, ctx.actor, {
        action: "create_user",
        entity: "user",
        entityId: created.userId,
        entityLabel: input.email.toLowerCase(),
        newValue: { name: input.name, role: input.role },
        summary: `${ctx.actor.name ?? "Staff"} created an account for ${input.email.toLowerCase()} as ${input.role}`,
      });

      return { id: created.userId };
    }),

  /** Sets a new password for another account, flagged for change on first use. */
  resetUserPassword: permissionProcedure("roles.write")
    .input(
      z.object({
        userId: z.number().int().positive(),
        password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [target] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Account was not found." });

      const result = await setPassword(input.userId, input.password, { mustChange: true });
      if (!result.ok) throw new TRPCError({ code: "BAD_REQUEST", message: result.message });

      await recordAudit(db, ctx.actor, {
        action: "reset_password",
        entity: "user",
        entityId: input.userId,
        entityLabel: target.email,
        summary: `${ctx.actor.name ?? "Staff"} reset the password for ${target.email}`,
      });

      return { success: true };
    }),

  /** Deactivates or restores an account. Sessions are re-checked per request. */
  setUserActive: permissionProcedure("roles.write")
    .input(z.object({ userId: z.number().int().positive(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot deactivate your own account.",
        });
      }

      const [target] = await db
        .select({ email: users.email, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Account was not found." });

      await db.update(users).set({ isActive: input.isActive }).where(eq(users.id, input.userId));

      await recordAudit(db, ctx.actor, {
        action: input.isActive ? "activate_user" : "deactivate_user",
        entity: "user",
        entityId: input.userId,
        entityLabel: target.email,
        oldValue: { isActive: target.isActive },
        newValue: { isActive: input.isActive },
        summary: `${ctx.actor.name ?? "Staff"} ${input.isActive ? "restored" : "deactivated"} ${target.email}`,
      });

      return { success: true };
    }),

  assignRole: permissionProcedure("roles.write")
    .input(z.object({ userId: z.number().int().positive(), role: ROLE_KEY_ENUM }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      if (input.userId === ctx.user.id && input.role !== "super_admin") {
        // Not a hard block, just a guard against the obvious footgun.
        const [self] = await db
          .select({ role: users.role })
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1);
        if (self?.role === "admin") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Ask another administrator to change your own access.",
          });
        }
      }

      await assignRole(db, {
        userId: input.userId,
        role: input.role as never,
        assignedByUserId: ctx.user.id,
      });

      await recordAudit(db, ctx.actor, {
        action: "assign_role",
        entity: "user",
        entityId: input.userId,
        newValue: { role: input.role },
        summary: `${ctx.actor.name ?? "Staff"} granted the ${input.role} role to user ${input.userId}`,
      });

      return { success: true };
    }),

  revokeRole: permissionProcedure("roles.write")
    .input(z.object({ userId: z.number().int().positive(), role: ROLE_KEY_ENUM }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot remove your own access.",
        });
      }

      await revokeRole(db, { userId: input.userId, role: input.role as never });

      await recordAudit(db, ctx.actor, {
        action: "revoke_role",
        entity: "user",
        entityId: input.userId,
        oldValue: { role: input.role },
        summary: `${ctx.actor.name ?? "Staff"} removed the ${input.role} role from user ${input.userId}`,
      });

      return { success: true };
    }),

  /* ---------------------------------------------------------------------- */
  /* System settings (§60)                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * The letterhead: school identity and receipt wording.
   *
   * Open to any signed-in account rather than gated on `settings.read`,
   * because everyone who prints a receipt, statement or invoice needs it and
   * none of it is confidential — it is the address already printed on the door.
   * Editing these still requires `settings.write`.
   */
  documentHeader: authedProcedure.query(async () => {
    const db = await dbOrThrow();
    const rows = await db
      .select({ key: systemSettings.key, value: systemSettings.value })
      .from(systemSettings)
      .where(
        inArray(systemSettings.key, [
          "school.profile",
          "finance.receipt",
          "certificate.settings",
        ]),
      );

    const byKey = new Map(rows.map(row => [row.key, row.value as Record<string, string>]));

    return {
      school: byKey.get("school.profile") ?? {},
      receipt: byKey.get("finance.receipt") ?? {},
      certificate: {
        signatureName: "Principal",
        signatureTitle: "Principal",
        ...(byKey.get("certificate.settings") ?? {}),
      },
    };
  }),

  settings: permissionProcedure("settings.read").query(async () => {
    const db = await dbOrThrow();
    const rows = await db.select().from(systemSettings).orderBy(systemSettings.category, systemSettings.key);

    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = grouped.get(row.category) ?? [];
      list.push(row);
      grouped.set(row.category, list);
    }

    return Array.from(grouped, ([category, entries]) => ({ category, entries }));
  }),

  updateSetting: permissionProcedure("settings.write")
    .input(z.object({ key: z.string().min(1).max(96), value: z.unknown() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [before] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, input.key))
        .limit(1);
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Unknown setting." });

      await db
        .update(systemSettings)
        .set({ value: input.value as never, updatedByUserId: ctx.user.id })
        .where(eq(systemSettings.key, input.key));

      await recordAudit(db, ctx.actor, {
        action: "update_setting",
        entity: "systemSetting",
        entityId: before.id,
        entityLabel: input.key,
        oldValue: before.value,
        newValue: input.value,
        summary: `${ctx.actor.name ?? "Staff"} changed the ${input.key} setting`,
      });

      return { success: true };
    }),
});
