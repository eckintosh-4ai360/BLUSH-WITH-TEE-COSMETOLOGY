import { and, count, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  ROLE_DEFINITIONS,
  ROLE_KEYS,
  PERMISSIONS,
  PERMISSION_KEYS,
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
import { dbOrThrow } from "../dbOrThrow";
import { assignRole, ensureAccessControlSeeded, revokeRole } from "../services/access";
import { recordAudit } from "../services/audit";
import { listInputSchema, likePattern, paginate, paginationBounds } from "../services/pagination";
import { permissionProcedure, router } from "../trpc";

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
