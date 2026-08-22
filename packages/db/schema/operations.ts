import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import {
  appointmentStatus,
  deliveryStatus,
  mediaPurpose,
  notificationChannel,
  notificationType,
} from "./enums";
import { people, users } from "./identity";

export const clinicServices = pgTable(
  "clinicServices",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    durationMinutes: integer("durationMinutes").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("clinic_services_active_idx").on(table.isActive)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: serial("id").primaryKey(),
    reference: varchar("reference", { length: 40 }).notNull().unique(),
    serviceId: integer("serviceId")
      .notNull()
      .references(() => clinicServices.id, { onDelete: "restrict" }),
    personId: integer("personId").references(() => people.id, { onDelete: "set null" }),
    customerName: varchar("customerName", { length: 160 }).notNull(),
    customerEmail: varchar("customerEmail", { length: 320 }).notNull(),
    customerPhone: varchar("customerPhone", { length: 40 }).notNull(),
    startsAt: timestamp("startsAt").notNull(),
    note: text("note"),
    status: appointmentStatus("status").default("requested").notNull(),
    assignedStaffUserId: integer("assignedStaffUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [
    index("appointments_status_idx").on(table.status),
    index("appointments_starts_idx").on(table.startsAt),
  ],
);

export const mediaFiles = pgTable(
  "mediaFiles",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("ownerUserId").references(() => users.id, { onDelete: "set null" }),
    purpose: mediaPurpose("purpose").notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 120 }).notNull(),
    sizeBytes: integer("sizeBytes").notNull(),
    altText: varchar("altText", { length: 255 }),
    /** Private files are only reachable through the authenticated proxy. */
    isPublic: boolean("isPublic").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("media_files_purpose_idx").on(table.purpose)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationType("type").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body"),
    /** Where clicking the notification should land the reader. */
    entityType: varchar("entityType", { length: 48 }),
    entityId: integer("entityId"),
    link: varchar("link", { length: 255 }),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("notifications_user_unread_idx").on(table.userId, table.readAt),
    index("notifications_created_idx").on(table.createdAt),
  ],
);

export const notificationPreferences = pgTable(
  "notificationPreferences",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationType("type").notNull(),
    inApp: boolean("inApp").default(true).notNull(),
    email: boolean("email").default(true).notNull(),
    sms: boolean("sms").default(false).notNull(),
    whatsapp: boolean("whatsapp").default(false).notNull(),
  },
  table => [unique("notification_preference_unique").on(table.userId, table.type)],
);

/** Per-channel send log, so a failed email is visible rather than silent. */
export const notificationDeliveries = pgTable(
  "notificationDeliveries",
  {
    id: serial("id").primaryKey(),
    notificationId: integer("notificationId")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    channel: notificationChannel("channel").notNull(),
    destination: varchar("destination", { length: 320 }),
    status: deliveryStatus("status").default("queued").notNull(),
    error: text("error"),
    sentAt: timestamp("sentAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("notification_deliveries_notification_idx").on(table.notificationId)],
);

/**
 * Immutable record of sensitive actions (§44). Rows are written inside the
 * same transaction as the change they describe and are never updated.
 */
export const auditLogs = pgTable(
  "auditLogs",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").references(() => users.id, { onDelete: "set null" }),
    userName: varchar("userName", { length: 160 }),
    action: varchar("action", { length: 80 }).notNull(),
    entity: varchar("entity", { length: 64 }).notNull(),
    entityId: integer("entityId"),
    entityLabel: varchar("entityLabel", { length: 180 }),
    oldValue: jsonb("oldValue"),
    newValue: jsonb("newValue"),
    summary: varchar("summary", { length: 400 }),
    ipAddress: varchar("ipAddress", { length: 64 }),
    userAgent: varchar("userAgent", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("audit_logs_entity_idx").on(table.entity, table.entityId),
    index("audit_logs_user_idx").on(table.userId),
    index("audit_logs_created_idx").on(table.createdAt),
  ],
);

export const systemSettings = pgTable(
  "systemSettings",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 96 }).notNull().unique(),
    category: varchar("category", { length: 48 }).notNull(),
    value: jsonb("value"),
    description: varchar("description", { length: 255 }),
    updatedByUserId: integer("updatedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [index("system_settings_category_idx").on(table.category)],
);

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  service: one(clinicServices, {
    fields: [appointments.serviceId],
    references: [clinicServices.id],
  }),
  assignedStaff: one(users, {
    fields: [appointments.assignedStaffUserId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one, many }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  deliveries: many(notificationDeliveries),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export type Appointment = typeof appointments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type SystemSetting = typeof systemSettings.$inferSelect;
export type MediaFile = typeof mediaFiles.$inferSelect;
