import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import {
  attendanceStatus,
  certificateStatus,
  enrollmentStatus,
  studentStatus,
} from "./enums";
import { assessments, classSessions, classes, courses, intakes } from "./academics";
import { applications } from "./admissions";
import { people, users } from "./identity";

export const studentProfiles = pgTable(
  "studentProfiles",
  {
    id: serial("id").primaryKey(),
    personId: integer("personId").references(() => people.id, { onDelete: "restrict" }),
    userId: integer("userId")
      .unique()
      .references(() => users.id, { onDelete: "set null" }),
    applicationId: integer("applicationId")
      .unique()
      .references(() => applications.id, { onDelete: "set null" }),
    studentNumber: varchar("studentNumber", { length: 40 }).notNull().unique(),
    fullName: varchar("fullName", { length: 160 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    phone: varchar("phone", { length: 40 }).notNull(),
    profileImageKey: varchar("profileImageKey", { length: 512 }),
    status: studentStatus("status").default("active").notNull(),
    graduatedAt: timestamp("graduatedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deletedAt"),
  },
  table => [
    index("student_profiles_status_idx").on(table.status),
    index("student_profiles_person_idx").on(table.personId),
    index("student_profiles_created_idx").on(table.createdAt),
  ],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: serial("id").primaryKey(),
    studentId: integer("studentId")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "cascade" }),
    courseId: integer("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    intakeId: integer("intakeId").references(() => intakes.id, { onDelete: "set null" }),
    enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
    expectedCompletionDate: date("expectedCompletionDate", { mode: "date" }),
    completedAt: timestamp("completedAt"),
    progressPercent: integer("progressPercent").default(0).notNull(),
    status: enrollmentStatus("status").default("active").notNull(),
  },
  table => [
    /**
     * One live enrolment per student per course.
     *
     * Partial on purpose. The rule is about enrolments that are *running*, and
     * withdrawing or completing one has to leave the student free to sit the
     * course again - which a plain unique constraint over the same columns
     * would forbid.
     *
     * It replaces a `(studentId, courseId, intakeId)` constraint that claimed
     * this and never did it: `intakeId` is null for every enrolment made from
     * the academics screen, and Postgres treats nulls in a unique constraint
     * as distinct, so the constraint matched nothing and a student could be
     * placed on the same programme any number of times.
     */
    uniqueIndex("enrollment_live_course_unique")
      .on(table.studentId, table.courseId)
      .where(sql`status in ('active', 'paused')`),
    index("enrollments_student_idx").on(table.studentId),
    index("enrollments_course_idx").on(table.courseId),
    index("enrollments_status_idx").on(table.status),
  ],
);

export const attendanceRecords = pgTable(
  "attendanceRecords",
  {
    id: serial("id").primaryKey(),
    enrollmentId: integer("enrollmentId")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    classId: integer("classId").references(() => classes.id, { onDelete: "set null" }),
    classSessionId: integer("classSessionId").references(() => classSessions.id, {
      onDelete: "set null",
    }),
    classDate: date("classDate", { mode: "date" }).notNull(),
    status: attendanceStatus("status").notNull(),
    recordedByUserId: integer("recordedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    note: varchar("note", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    // One mark per student per class day - re-marking updates in place.
    unique("attendance_enrollment_date_unique").on(table.enrollmentId, table.classDate),
    index("attendance_date_idx").on(table.classDate),
    index("attendance_status_idx").on(table.status),
  ],
);

export const assessmentResults = pgTable(
  "assessmentResults",
  {
    id: serial("id").primaryKey(),
    assessmentId: integer("assessmentId")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    studentId: integer("studentId")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 6, scale: 2 }).notNull(),
    grade: varchar("grade", { length: 8 }),
    instructorComment: text("instructorComment"),
    gradedByUserId: integer("gradedByUserId").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [
    unique("assessment_result_unique").on(table.assessmentId, table.studentId),
    index("assessment_results_student_idx").on(table.studentId),
  ],
);

export const certificates = pgTable(
  "certificates",
  {
    id: serial("id").primaryKey(),
    certificateNumber: varchar("certificateNumber", { length: 40 }).notNull().unique(),
    /** Unguessable token behind the public verification URL and QR code. */
    verificationToken: varchar("verificationToken", { length: 64 }).notNull().unique(),
    studentId: integer("studentId")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    courseId: integer("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    enrollmentId: integer("enrollmentId").references(() => enrollments.id, {
      onDelete: "set null",
    }),
    completionDate: date("completionDate", { mode: "date" }).notNull(),
    issuedAt: timestamp("issuedAt").defaultNow().notNull(),
    issuedByUserId: integer("issuedByUserId").references(() => users.id, { onDelete: "set null" }),
    finalGrade: varchar("finalGrade", { length: 8 }),
    status: certificateStatus("status").default("issued").notNull(),
    revokedAt: timestamp("revokedAt"),
    revokedReason: varchar("revokedReason", { length: 255 }),
  },
  table => [
    index("certificates_student_idx").on(table.studentId),
    index("certificates_status_idx").on(table.status),
  ],
);

/**
 * Scanned copies of the award as it was actually issued.
 *
 * The printable certificate is generated from the row above, but what the
 * school hands over is paper: signed, stamped, and often signed back by the
 * student on collection. Keeping the scan against the record means the file
 * drawer is reachable from the certificate rather than from a shelf, and a
 * dispute years later can be answered with the document itself.
 *
 * Several scans per certificate are allowed - front and back, the signed copy
 * and the collection slip - so this is a child table rather than a column.
 */
export const certificateScans = pgTable(
  "certificateScans",
  {
    id: serial("id").primaryKey(),
    certificateId: integer("certificateId")
      .notNull()
      .references(() => certificates.id, { onDelete: "cascade" }),
    /** Private storage key. Never a public URL - scans are proxied. */
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 120 }).notNull(),
    sizeBytes: integer("sizeBytes").notNull(),
    /** What this particular copy is: "signed original", "collection slip". */
    note: varchar("note", { length: 255 }),
    uploadedByUserId: integer("uploadedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("certificate_scans_certificate_idx").on(table.certificateId)],
);

/** Audit trail of every public verification lookup. */
export const certificateVerifications = pgTable(
  "certificateVerifications",
  {
    id: serial("id").primaryKey(),
    certificateId: integer("certificateId").references(() => certificates.id, {
      onDelete: "cascade",
    }),
    lookupValue: varchar("lookupValue", { length: 64 }).notNull(),
    wasFound: boolean("wasFound").default(false).notNull(),
    ipAddress: varchar("ipAddress", { length: 64 }),
    userAgent: varchar("userAgent", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("certificate_verifications_certificate_idx").on(table.certificateId)],
);

export const studentProfilesRelations = relations(studentProfiles, ({ one, many }) => ({
  person: one(people, { fields: [studentProfiles.personId], references: [people.id] }),
  user: one(users, { fields: [studentProfiles.userId], references: [users.id] }),
  application: one(applications, {
    fields: [studentProfiles.applicationId],
    references: [applications.id],
  }),
  enrollments: many(enrollments),
  results: many(assessmentResults),
  certificates: many(certificates),
}));

export const enrollmentsRelations = relations(enrollments, ({ one, many }) => ({
  student: one(studentProfiles, {
    fields: [enrollments.studentId],
    references: [studentProfiles.id],
  }),
  course: one(courses, { fields: [enrollments.courseId], references: [courses.id] }),
  intake: one(intakes, { fields: [enrollments.intakeId], references: [intakes.id] }),
  attendance: many(attendanceRecords),
}));

export const attendanceRecordsRelations = relations(attendanceRecords, ({ one }) => ({
  enrollment: one(enrollments, {
    fields: [attendanceRecords.enrollmentId],
    references: [enrollments.id],
  }),
  class: one(classes, { fields: [attendanceRecords.classId], references: [classes.id] }),
}));

export const assessmentResultsRelations = relations(assessmentResults, ({ one }) => ({
  assessment: one(assessments, {
    fields: [assessmentResults.assessmentId],
    references: [assessments.id],
  }),
  student: one(studentProfiles, {
    fields: [assessmentResults.studentId],
    references: [studentProfiles.id],
  }),
}));

export const certificatesRelations = relations(certificates, ({ one, many }) => ({
  student: one(studentProfiles, {
    fields: [certificates.studentId],
    references: [studentProfiles.id],
  }),
  course: one(courses, { fields: [certificates.courseId], references: [courses.id] }),
  verifications: many(certificateVerifications),
  scans: many(certificateScans),
}));

export const certificateScansRelations = relations(certificateScans, ({ one }) => ({
  certificate: one(certificates, {
    fields: [certificateScans.certificateId],
    references: [certificates.id],
  }),
}));

export type StudentProfile = typeof studentProfiles.$inferSelect;
export type Enrollment = typeof enrollments.$inferSelect;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type AssessmentResult = typeof assessmentResults.$inferSelect;
export type Certificate = typeof certificates.$inferSelect;
export type CertificateScan = typeof certificateScans.$inferSelect;
