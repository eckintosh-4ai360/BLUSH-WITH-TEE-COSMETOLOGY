import { relations } from "drizzle-orm";
import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { staffStatus } from "./enums";
import { classes, courses } from "./academics";
import { people, users } from "./identity";

export const staffProfiles = pgTable(
  "staffProfiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    personId: integer("personId").references(() => people.id, { onDelete: "set null" }),
    staffNumber: varchar("staffNumber", { length: 40 }).unique(),
    position: varchar("position", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 320 }),
    photoKey: varchar("photoKey", { length: 512 }),
    employmentDate: date("employmentDate", { mode: "date" }),
    /**
     * Compensation. Never selected into a response unless the caller holds
     * `staff.salary.read`, which only finance and ownership roles carry (§32).
     */
    salary: numeric("salary", { precision: 12, scale: 2 }),
    status: staffStatus("status").default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deletedAt"),
  },
  table => [index("staff_profiles_status_idx").on(table.status)],
);

/** Which courses and classes a staff member may teach or mark. */
export const staffAssignments = pgTable(
  "staffAssignments",
  {
    id: serial("id").primaryKey(),
    staffId: integer("staffId")
      .notNull()
      .references(() => staffProfiles.id, { onDelete: "cascade" }),
    courseId: integer("courseId").references(() => courses.id, { onDelete: "cascade" }),
    classId: integer("classId").references(() => classes.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assignedAt").defaultNow().notNull(),
    assignedByUserId: integer("assignedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  table => [
    unique("staff_assignment_unique").on(table.staffId, table.courseId, table.classId),
    index("staff_assignments_staff_idx").on(table.staffId),
    index("staff_assignments_course_idx").on(table.courseId),
  ],
);

export const staffProfilesRelations = relations(staffProfiles, ({ one, many }) => ({
  user: one(users, { fields: [staffProfiles.userId], references: [users.id] }),
  person: one(people, { fields: [staffProfiles.personId], references: [people.id] }),
  assignments: many(staffAssignments),
}));

export const staffAssignmentsRelations = relations(staffAssignments, ({ one }) => ({
  staff: one(staffProfiles, {
    fields: [staffAssignments.staffId],
    references: [staffProfiles.id],
  }),
  course: one(courses, { fields: [staffAssignments.courseId], references: [courses.id] }),
  class: one(classes, { fields: [staffAssignments.classId], references: [classes.id] }),
}));

export type StaffProfile = typeof staffProfiles.$inferSelect;
export type StaffAssignment = typeof staffAssignments.$inferSelect;
