import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { roleKey, userRole } from "./enums";

/**
 * The identity spine. One row per human, whether they arrive as an applicant,
 * a shopper, a student, or a staff member. Every profile table points here so
 * the same person is never stored twice (§34, §47).
 */
export const people = pgTable(
  "people",
  {
    id: serial("id").primaryKey(),
    fullName: varchar("fullName", { length: 160 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    whatsapp: varchar("whatsapp", { length: 40 }),
    birthDate: date("birthDate", { mode: "date" }),
    gender: varchar("gender", { length: 32 }),
    address: text("address"),
    city: varchar("city", { length: 120 }),
    country: varchar("country", { length: 120 }),
    emergencyContactName: varchar("emergencyContactName", { length: 160 }),
    emergencyContactPhone: varchar("emergencyContactPhone", { length: 40 }),
    photoKey: varchar("photoKey", { length: 512 }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deletedAt"),
  },
  table => [
    // Case-insensitive uniqueness, but only across live rows: a soft-deleted
    // person must not block re-registration of the same email.
    uniqueIndex("people_email_unique")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.email} is not null and ${table.deletedAt} is null`),
    index("people_phone_idx").on(table.phone),
    index("people_full_name_idx").on(table.fullName),
  ],
);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    personId: integer("personId").references(() => people.id, { onDelete: "set null" }),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    /**
     * scrypt digest as `scrypt$N$r$p$salt$hash`. Never a plain password, and
     * never selected into anything that leaves the server.
     */
    passwordHash: varchar("passwordHash", { length: 255 }),
    passwordUpdatedAt: timestamp("passwordUpdatedAt"),
    /** Set on seeded and reset accounts until the holder picks their own. */
    mustChangePassword: boolean("mustChangePassword").default(false).notNull(),
    /** Throttling state, so a stolen email cannot be brute forced. */
    failedLoginAttempts: integer("failedLoginAttempts").default(0).notNull(),
    lockedUntil: timestamp("lockedUntil"),
    /** Coarse portal gate. Real authorisation is the permission set below. */
    role: userRole("role").default("user").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    /** Reserved for the 2FA rollout described in §45; no secret is stored yet. */
    twoFactorEnabled: boolean("twoFactorEnabled").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => [
    index("users_person_idx").on(table.personId),
    index("users_role_idx").on(table.role),
    // Sign-in looks accounts up by email, case-insensitively.
    uniqueIndex("users_email_unique")
      .on(sql`lower(${table.email})`)
      .where(sql`${table.email} is not null`),
  ],
);

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  key: roleKey("key").notNull().unique(),
  name: varchar("name", { length: 80 }).notNull(),
  description: varchar("description", { length: 255 }),
  /** System roles are seeded and cannot be deleted from the admin UI. */
  isSystem: boolean("isSystem").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Permission keys are `module.action` strings, e.g. `finance.payments.write`. */
export const permissions = pgTable(
  "permissions",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 96 }).notNull().unique(),
    module: varchar("module", { length: 48 }).notNull(),
    description: varchar("description", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("permissions_module_idx").on(table.module)],
);

export const rolePermissions = pgTable(
  "rolePermissions",
  {
    roleId: integer("roleId")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: integer("permissionId")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  table => [
    unique("role_permission_unique").on(table.roleId, table.permissionId),
    index("role_permissions_role_idx").on(table.roleId),
  ],
);

export const userRoles = pgTable(
  "userRoles",
  {
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: integer("roleId")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    assignedByUserId: integer("assignedByUserId"),
    assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  },
  table => [
    unique("user_role_unique").on(table.userId, table.roleId),
    index("user_roles_user_idx").on(table.userId),
  ],
);

export const peopleRelations = relations(people, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  person: one(people, { fields: [users.personId], references: [people.id] }),
  roles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
  users: many(userRoles),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export type Person = typeof people.$inferSelect;
export type InsertPerson = typeof people.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
