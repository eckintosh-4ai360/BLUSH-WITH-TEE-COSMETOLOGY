import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  ROLE_DEFINITIONS,
  ROLE_KEYS,
  permissionsForRole,
  type PermissionKey,
  type RoleKey,
} from "@blush/shared/permissions";
import { permissions, rolePermissions, roles, userRoles, users } from "@blush/db/schema";
import type { Database } from "../dbOrThrow";

/**
 * Fallback mapping for accounts that predate granular roles. The coarse
 * `users.role` column still decides which portal a session may enter, so an
 * existing admin keeps working before anyone assigns them a role row.
 */
const LEGACY_ROLE_MAP: Record<string, RoleKey | null> = {
  admin: "super_admin",
  staff: "instructor",
  // A student portal account carries no back-office role. The role it used to
  // map to has been retired in favour of `secretary`, and it granted nothing
  // in any case - portal access comes from `users.role`, not from here.
  student: null,
  user: "customer",
};

let seedPromise: Promise<void> | null = null;

/**
 * Writes the role and permission catalogue into the database. Idempotent, and
 * memoised per process so concurrent requests do not race each other.
 */
export async function ensureAccessControlSeeded(db: Database): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedAccessControl(db).catch(error => {
      // Allow a later request to retry rather than caching the failure.
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
}

async function seedAccessControl(db: Database): Promise<void> {
  await db
    .insert(permissions)
    .values(
      PERMISSION_KEYS.map(key => ({
        key,
        module: key.split(".")[0] ?? "platform",
        description: PERMISSIONS[key],
      })),
    )
    .onConflictDoNothing({ target: permissions.key });

  await db
    .insert(roles)
    .values(
      ROLE_KEYS.map(key => ({
        key,
        name: ROLE_DEFINITIONS[key].name,
        description: ROLE_DEFINITIONS[key].description,
        isSystem: true,
      })),
    )
    .onConflictDoNothing({ target: roles.key });

  await retireUndefinedRoles(db);

  const [roleRows, permissionRows] = await Promise.all([
    db.select({ id: roles.id, key: roles.key }).from(roles),
    db.select({ id: permissions.id, key: permissions.key }).from(permissions),
  ]);

  const permissionIdByKey = new Map(permissionRows.map(row => [row.key, row.id]));
  const grants: Array<{ roleId: number; permissionId: number }> = [];

  for (const role of roleRows) {
    for (const permissionKey of permissionsForRole(role.key as RoleKey)) {
      const permissionId = permissionIdByKey.get(permissionKey);
      if (permissionId) grants.push({ roleId: role.id, permissionId });
    }
  }

  if (grants.length) {
    await db.insert(rolePermissions).values(grants).onConflictDoNothing();
  }
}

/**
 * Removes roles that are no longer defined.
 *
 * The catalogue insert never deletes, so a retired role would linger in the
 * table and keep appearing in the admin UI as something assignable. One that
 * somebody still holds is left alone deliberately: silently stripping a live
 * grant is a worse outcome than showing a stale name, and `permissionsForRole`
 * already resolves an unknown key to no privileges. Reassign the holders and
 * the row goes on the next boot.
 */
async function retireUndefinedRoles(db: Database): Promise<void> {
  const defined = new Set<string>(ROLE_KEYS);

  const existing = await db.select({ id: roles.id, key: roles.key }).from(roles);
  const retired = existing.filter(role => !defined.has(role.key));
  if (!retired.length) return;

  const heldRows = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(
      inArray(
        userRoles.roleId,
        retired.map(role => role.id),
      ),
    );
  const held = new Set(heldRows.map(row => row.roleId));

  const removable = retired.filter(role => !held.has(role.id)).map(role => role.id);
  if (removable.length) {
    // rolePermissions cascades off the role, so the grants go with it.
    await db.delete(roles).where(inArray(roles.id, removable));
  }
}

export type AccessContext = {
  userId: number;
  roles: RoleKey[];
  permissions: Set<PermissionKey>;
  can: (permission: PermissionKey) => boolean;
  canAny: (...list: PermissionKey[]) => boolean;
  assert: (permission: PermissionKey) => void;
};

/**
 * Resolves everything a signed-in account is allowed to do. Grants come from
 * the database so an owner can retune a role without a deploy; the static
 * catalogue is only the seed and the fallback.
 */
export async function resolveAccess(
  db: Database,
  user: { id: number; role: string },
): Promise<AccessContext> {
  await ensureAccessControlSeeded(db);

  const assigned = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, user.id));

  let roleKeys = assigned.map(row => row.key as RoleKey);

  if (!roleKeys.length) {
    const fallback = LEGACY_ROLE_MAP[user.role] ?? null;
    roleKeys = fallback ? [fallback] : [];
  }

  const granted = new Set<PermissionKey>();

  if (roleKeys.length) {
    const rows = await db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(roles.key, roleKeys));

    for (const row of rows) granted.add(row.key as PermissionKey);

    // If the catalogue has not been persisted yet, fall back to the static map
    // so authorisation never fails open or shut on a cold database.
    if (!rows.length) {
      for (const roleKey of roleKeys) {
        for (const permission of permissionsForRole(roleKey)) granted.add(permission);
      }
    }
  }

  const can = (permission: PermissionKey) => granted.has(permission);

  return {
    userId: user.id,
    roles: roleKeys,
    permissions: granted,
    can,
    canAny: (...list: PermissionKey[]) => list.some(can),
    assert: (permission: PermissionKey) => {
      if (!can(permission)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `This action requires the "${PERMISSIONS[permission]}" permission.`,
        });
      }
    },
  };
}

/** Grants a role to a user, creating the role row if the catalogue is stale. */
export async function assignRole(
  db: Database,
  input: { userId: number; role: RoleKey; assignedByUserId?: number },
): Promise<void> {
  await ensureAccessControlSeeded(db);
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, input.role)).limit(1);
  if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Unknown role." });

  await db
    .insert(userRoles)
    .values({ userId: input.userId, roleId: role.id, assignedByUserId: input.assignedByUserId })
    .onConflictDoNothing();

  // Keep the coarse portal gate in step with the finest-grained role held.
  const portalRole = portalRoleFor(input.role);
  if (portalRole) await db.update(users).set({ role: portalRole }).where(eq(users.id, input.userId));
}

export async function revokeRole(
  db: Database,
  input: { userId: number; role: RoleKey },
): Promise<void> {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, input.role))
    .limit(1);
  if (!role) return;
  await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, input.userId), eq(userRoles.roleId, role.id)));
}

/** Which portal a granular role should be able to reach. */
export function portalRoleFor(role: RoleKey): "user" | "student" | "staff" | "admin" {
  switch (role) {
    case "super_admin":
    case "administrator":
      return "admin";
    case "instructor":
    case "accountant":
    case "storekeeper":
    case "ecommerce_manager":
    // The desk works inside the dashboard, so a secretary is staff. What they
    // can actually do there is decided by their permissions, not by this.
    case "secretary":
      return "staff";
    default:
      return "user";
  }
}
