import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { assessmentTypeEnum, classStatus, intakeStatus } from "./enums";
import { users } from "./identity";

export const courses = pgTable(
  "courses",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 32 }).notNull().unique(),
    /** SEO-friendly public URL segment. */
    slug: varchar("slug", { length: 180 }).unique(),
    title: varchar("title", { length: 160 }).notNull(),
    summary: text("summary").notNull(),
    description: text("description").notNull(),
    durationWeeks: integer("durationWeeks").notNull(),
    tuition: numeric("tuition", { precision: 10, scale: 2 }).notNull(),
    schedule: varchar("schedule", { length: 160 }),
    certification: varchar("certification", { length: 160 }),
    requirements: text("requirements"),
    toiletries: text("toiletries"),
    productFee: numeric("productFee", { precision: 10, scale: 2 }),
    category: varchar("category", { length: 64 }),
    imageKey: varchar("imageKey", { length: 512 }),
    seoTitle: varchar("seoTitle", { length: 180 }),
    seoDescription: varchar("seoDescription", { length: 320 }),
    isFeatured: boolean("isFeatured").default(false).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deletedAt"),
  },
  table => [index("courses_active_idx").on(table.isActive)],
);

export const courseModules = pgTable(
  "courseModules",
  {
    id: serial("id").primaryKey(),
    courseId: integer("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    /** Position in the syllabus, used for ordering and progress maths. */
    sequence: integer("sequence").default(1).notNull(),
    durationHours: integer("durationHours"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    unique("course_module_code_unique").on(table.courseId, table.code),
    index("course_modules_course_idx").on(table.courseId),
  ],
);

export const intakes = pgTable(
  "intakes",
  {
    id: serial("id").primaryKey(),
    courseId: integer("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull(),
    startDate: date("startDate", { mode: "date" }).notNull(),
    endDate: date("endDate", { mode: "date" }),
    applicationDeadline: date("applicationDeadline", { mode: "date" }),
    capacity: integer("capacity").notNull(),
    status: intakeStatus("status").default("open").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("intakes_course_idx").on(table.courseId),
    index("intakes_status_idx").on(table.status),
  ],
);

/** A taught cohort: one course/intake pairing led by an instructor. */
export const classes = pgTable(
  "classes",
  {
    id: serial("id").primaryKey(),
    courseId: integer("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    intakeId: integer("intakeId").references(() => intakes.id, { onDelete: "set null" }),
    moduleId: integer("moduleId").references(() => courseModules.id, { onDelete: "set null" }),
    instructorUserId: integer("instructorUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 180 }).notNull(),
    room: varchar("room", { length: 80 }),
    /** 0 = Sunday through 6 = Saturday, matching the JS Date getDay() index. */
    dayOfWeek: integer("dayOfWeek"),
    startsAt: time("startsAt"),
    endsAt: time("endsAt"),
    status: classStatus("status").default("scheduled").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [
    index("classes_course_idx").on(table.courseId),
    index("classes_instructor_idx").on(table.instructorUserId),
    index("classes_intake_idx").on(table.intakeId),
  ],
);

/** One dated meeting of a class - the unit attendance is recorded against. */
export const classSessions = pgTable(
  "classSessions",
  {
    id: serial("id").primaryKey(),
    classId: integer("classId")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    sessionDate: date("sessionDate", { mode: "date" }).notNull(),
    topic: varchar("topic", { length: 255 }),
    recordedByUserId: integer("recordedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    unique("class_session_date_unique").on(table.classId, table.sessionDate),
    index("class_sessions_date_idx").on(table.sessionDate),
  ],
);

export const assessments = pgTable(
  "assessments",
  {
    id: serial("id").primaryKey(),
    courseId: integer("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    moduleId: integer("moduleId").references(() => courseModules.id, { onDelete: "set null" }),
    title: varchar("title", { length: 180 }).notNull(),
    assessmentType: assessmentTypeEnum("assessmentType").notNull(),
    totalScore: integer("totalScore").notNull(),
    /** Relative contribution to the final grade. */
    weight: numeric("weight", { precision: 5, scale: 2 }).default("1.00").notNull(),
    dueDate: date("dueDate", { mode: "date" }),
    createdByUserId: integer("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("assessments_course_idx").on(table.courseId),
    index("assessments_module_idx").on(table.moduleId),
  ],
);

export const coursesRelations = relations(courses, ({ many }) => ({
  modules: many(courseModules),
  intakes: many(intakes),
  classes: many(classes),
  assessments: many(assessments),
}));

export const courseModulesRelations = relations(courseModules, ({ one }) => ({
  course: one(courses, { fields: [courseModules.courseId], references: [courses.id] }),
}));

export const intakesRelations = relations(intakes, ({ one, many }) => ({
  course: one(courses, { fields: [intakes.courseId], references: [courses.id] }),
  classes: many(classes),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  course: one(courses, { fields: [classes.courseId], references: [courses.id] }),
  intake: one(intakes, { fields: [classes.intakeId], references: [intakes.id] }),
  module: one(courseModules, { fields: [classes.moduleId], references: [courseModules.id] }),
  instructor: one(users, { fields: [classes.instructorUserId], references: [users.id] }),
  sessions: many(classSessions),
}));

export const classSessionsRelations = relations(classSessions, ({ one }) => ({
  class: one(classes, { fields: [classSessions.classId], references: [classes.id] }),
}));

export const assessmentsRelations = relations(assessments, ({ one }) => ({
  course: one(courses, { fields: [assessments.courseId], references: [courses.id] }),
  module: one(courseModules, { fields: [assessments.moduleId], references: [courseModules.id] }),
}));

export type Course = typeof courses.$inferSelect;
export type CourseModule = typeof courseModules.$inferSelect;
export type Intake = typeof intakes.$inferSelect;
export type ClassRecord = typeof classes.$inferSelect;
export type Assessment = typeof assessments.$inferSelect;
