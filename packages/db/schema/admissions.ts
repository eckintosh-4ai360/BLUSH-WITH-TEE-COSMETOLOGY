import { relations } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { applicationDocumentType, applicationStatus } from "./enums";
import { courses, intakes } from "./academics";
import { people, users } from "./identity";

/**
 * An application is a point-in-time snapshot of what the applicant declared.
 * The contact columns are deliberately denormalised copies: `personId` links
 * to the canonical person, but the snapshot must not change when that person
 * later edits their profile.
 */
export const applications = pgTable(
  "applications",
  {
    id: serial("id").primaryKey(),
    reference: varchar("reference", { length: 32 }).notNull().unique(),
    personId: integer("personId").references(() => people.id, { onDelete: "set null" }),
    userId: integer("userId").references(() => users.id, { onDelete: "set null" }),
    fullName: varchar("fullName", { length: 160 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    phone: varchar("phone", { length: 40 }).notNull(),
    whatsapp: varchar("whatsapp", { length: 40 }),
    birthDate: date("birthDate", { mode: "date" }),
    gender: varchar("gender", { length: 32 }),
    address: text("address"),
    emergencyContact: varchar("emergencyContact", { length: 180 }),
    education: text("education"),
    courseId: integer("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    intakeId: integer("intakeId").references(() => intakes.id, { onDelete: "set null" }),
    statement: text("statement"),
    status: applicationStatus("status").default("draft").notNull(),
    decisionNote: text("decisionNote"),
    reviewedByUserId: integer("reviewedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewedAt"),
    submittedAt: timestamp("submittedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deletedAt"),
  },
  table => [
    index("applications_status_idx").on(table.status),
    index("applications_course_idx").on(table.courseId),
    index("applications_person_idx").on(table.personId),
    index("applications_created_idx").on(table.createdAt),
  ],
);

export const applicationDocuments = pgTable(
  "applicationDocuments",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("applicationId")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    documentType: applicationDocumentType("documentType").notNull(),
    /** Private storage key. Never a public URL - documents are proxied. */
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 120 }).notNull(),
    sizeBytes: integer("sizeBytes").notNull(),
    uploadedByUserId: integer("uploadedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("application_documents_application_idx").on(table.applicationId)],
);

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  person: one(people, { fields: [applications.personId], references: [people.id] }),
  course: one(courses, { fields: [applications.courseId], references: [courses.id] }),
  intake: one(intakes, { fields: [applications.intakeId], references: [intakes.id] }),
  documents: many(applicationDocuments),
}));

export const applicationDocumentsRelations = relations(applicationDocuments, ({ one }) => ({
  application: one(applications, {
    fields: [applicationDocuments.applicationId],
    references: [applications.id],
  }),
}));

export type Application = typeof applications.$inferSelect;
export type ApplicationDocument = typeof applicationDocuments.$inferSelect;
