import { relations } from "drizzle-orm";
import {
  boolean,
  date,
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
  approvalStatus,
  expenseCategory,
  expenseScope,
  feeAdjustmentType,
  feeChargeStatus,
  feeTypeEnum,
  paymentIntentPurpose,
  paymentIntentStatus,
  paymentMethodEnum,
  paymentPlanStatus,
  paymentStatusEnum,
  revenueSource,
} from "./enums";
import { courses, intakes } from "./academics";
import { applications } from "./admissions";
import { users } from "./identity";
import { enrollments, studentProfiles } from "./students";
import { storeOrders } from "./commerce";

/** Configurable price list: what a given course/intake charges, by fee type. */
export const feeStructures = pgTable(
  "feeStructures",
  {
    id: serial("id").primaryKey(),
    courseId: integer("courseId").references(() => courses.id, { onDelete: "cascade" }),
    intakeId: integer("intakeId").references(() => intakes.id, { onDelete: "cascade" }),
    feeType: feeTypeEnum("feeType").notNull(),
    label: varchar("label", { length: 180 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    isMandatory: boolean("isMandatory").default(true).notNull(),
    dueOffsetDays: integer("dueOffsetDays").default(0).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [
    unique("fee_structure_unique").on(table.courseId, table.intakeId, table.feeType),
    index("fee_structures_course_idx").on(table.courseId),
  ],
);

/** A single amount billed to one student. */
export const feeCharges = pgTable(
  "feeCharges",
  {
    id: serial("id").primaryKey(),
    studentId: integer("studentId")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "cascade" }),
    enrollmentId: integer("enrollmentId").references(() => enrollments.id, {
      onDelete: "set null",
    }),
    feeStructureId: integer("feeStructureId").references(() => feeStructures.id, {
      onDelete: "set null",
    }),
    feeType: feeTypeEnum("feeType").notNull(),
    description: varchar("description", { length: 255 }).notNull(),
    amountDue: numeric("amountDue", { precision: 12, scale: 2 }).notNull(),
    /** Maintained by payment allocation; never edited by hand. */
    amountPaid: numeric("amountPaid", { precision: 12, scale: 2 }).default("0.00").notNull(),
    dueDate: date("dueDate", { mode: "date" }),
    status: feeChargeStatus("status").default("open").notNull(),
    createdByUserId: integer("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [
    index("fee_charges_student_idx").on(table.studentId),
    index("fee_charges_status_idx").on(table.status),
    index("fee_charges_due_idx").on(table.dueDate),
  ],
);

/** Discounts and surcharges applied to a student account (§24). */
export const feeAdjustments = pgTable(
  "feeAdjustments",
  {
    id: serial("id").primaryKey(),
    studentId: integer("studentId")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "cascade" }),
    feeChargeId: integer("feeChargeId").references(() => feeCharges.id, { onDelete: "set null" }),
    adjustmentType: feeAdjustmentType("adjustmentType").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    reason: varchar("reason", { length: 255 }).notNull(),
    createdByUserId: integer("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("fee_adjustments_student_idx").on(table.studentId)],
);

/**
 * A gateway payment attempt. Nothing is captured until the server has verified
 * the provider reference and matched the amount, so a frontend success callback
 * alone can never move money or clear a balance (§49).
 */
export const paymentIntents = pgTable(
  "paymentIntents",
  {
    id: serial("id").primaryKey(),
    reference: varchar("reference", { length: 64 }).notNull().unique(),
    purpose: paymentIntentPurpose("purpose").notNull(),
    studentId: integer("studentId").references(() => studentProfiles.id, { onDelete: "set null" }),
    storeOrderId: integer("storeOrderId").references(() => storeOrders.id, {
      onDelete: "set null",
    }),
    applicationId: integer("applicationId").references(() => applications.id, {
      onDelete: "set null",
    }),
    initiatedByUserId: integer("initiatedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    provider: varchar("provider", { length: 40 }).notNull(),
    providerReference: varchar("providerReference", { length: 160 }),
    /** Guards against the same client attempt being captured twice. */
    idempotencyKey: varchar("idempotencyKey", { length: 96 }).notNull().unique(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 8 }).default("GHS").notNull(),
    status: paymentIntentStatus("status").default("initiated").notNull(),
    failureReason: varchar("failureReason", { length: 255 }),
    verifiedAt: timestamp("verifiedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [
    index("payment_intents_status_idx").on(table.status),
    index("payment_intents_provider_ref_idx").on(table.providerReference),
  ],
);

/** Raw gateway callbacks, deduplicated by provider event id (§48). */
export const webhookEvents = pgTable(
  "webhookEvents",
  {
    id: serial("id").primaryKey(),
    provider: varchar("provider", { length: 40 }).notNull(),
    eventId: varchar("eventId", { length: 160 }).notNull(),
    eventType: varchar("eventType", { length: 80 }),
    payload: jsonb("payload"),
    processedAt: timestamp("processedAt"),
    error: text("error"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [unique("webhook_event_unique").on(table.provider, table.eventId)],
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    reference: varchar("reference", { length: 64 }).notNull().unique(),
    studentId: integer("studentId").references(() => studentProfiles.id, { onDelete: "set null" }),
    storeOrderId: integer("storeOrderId").references(() => storeOrders.id, {
      onDelete: "set null",
    }),
    paymentIntentId: integer("paymentIntentId").references(() => paymentIntents.id, {
      onDelete: "set null",
    }),
    /** Legacy single-charge link; allocations are the source of truth. */
    feeChargeId: integer("feeChargeId").references(() => feeCharges.id, { onDelete: "set null" }),
    feeType: feeTypeEnum("feeType"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum("paymentMethod").notNull(),
    status: paymentStatusEnum("status").default("completed").notNull(),
    /** Unique when present: the same gateway reference cannot be booked twice. */
    transactionReference: varchar("transactionReference", { length: 120 }).unique(),
    note: text("note"),
    receivedByUserId: integer("receivedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    recordedByUserId: integer("recordedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    refundedAmount: numeric("refundedAmount", { precision: 12, scale: 2 })
      .default("0.00")
      .notNull(),
    paidAt: timestamp("paidAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("payments_student_idx").on(table.studentId),
    index("payments_order_idx").on(table.storeOrderId),
    index("payments_paid_at_idx").on(table.paidAt),
    index("payments_status_idx").on(table.status),
  ],
);

/** Splits one payment across the charges it settles (§46). */
export const paymentAllocations = pgTable(
  "paymentAllocations",
  {
    id: serial("id").primaryKey(),
    paymentId: integer("paymentId")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    feeChargeId: integer("feeChargeId")
      .notNull()
      .references(() => feeCharges.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    unique("payment_allocation_unique").on(table.paymentId, table.feeChargeId),
    index("payment_allocations_charge_idx").on(table.feeChargeId),
  ],
);

export const paymentPlans = pgTable(
  "paymentPlans",
  {
    id: serial("id").primaryKey(),
    studentId: integer("studentId")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    totalAmount: numeric("totalAmount", { precision: 12, scale: 2 }).notNull(),
    installmentAmount: numeric("installmentAmount", { precision: 12, scale: 2 }).notNull(),
    nextDueDate: date("nextDueDate", { mode: "date" }),
    status: paymentPlanStatus("status").default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [index("payment_plans_student_idx").on(table.studentId)],
);

/**
 * The revenue ledger. Every earned cedi is a row here linked to the row that
 * earned it, so income is always a sum of real transactions rather than a
 * number somebody typed (§28). Refunds are negative reversal rows - existing
 * lines are never edited (§29).
 */
export const revenueTransactions = pgTable(
  "revenueTransactions",
  {
    id: serial("id").primaryKey(),
    source: revenueSource("source").notNull(),
    /** Row that produced this revenue, e.g. "payment" / "store_order". */
    sourceType: varchar("sourceType", { length: 48 }).notNull(),
    sourceId: integer("sourceId"),
    paymentId: integer("paymentId").references(() => payments.id, { onDelete: "set null" }),
    studentId: integer("studentId").references(() => studentProfiles.id, { onDelete: "set null" }),
    storeOrderId: integer("storeOrderId").references(() => storeOrders.id, {
      onDelete: "set null",
    }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 8 }).default("GHS").notNull(),
    description: varchar("description", { length: 255 }).notNull(),
    /** Set on a reversal row, pointing at the line it cancels. */
    reversalOfId: integer("reversalOfId"),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
    recordedByUserId: integer("recordedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("revenue_source_idx").on(table.source),
    index("revenue_occurred_idx").on(table.occurredAt),
    index("revenue_reference_idx").on(table.sourceType, table.sourceId),
  ],
);

export const expenseCategories = pgTable(
  "expenseCategories",
  {
    id: serial("id").primaryKey(),
    key: varchar("key", { length: 48 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 255 }),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("expense_categories_active_idx").on(table.isActive)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 180 }).notNull(),
    /** Legacy enum column, retained alongside the configurable category table. */
    category: expenseCategory("category").notNull(),
    categoryId: integer("categoryId").references(() => expenseCategories.id, {
      onDelete: "restrict",
    }),
    /** School or store. Existing rows predate the split and read as school. */
    scope: expenseScope("scope").default("school").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    expenseDate: date("expenseDate", { mode: "date" }).notNull(),
    vendor: varchar("vendor", { length: 160 }),
    paymentMethod: paymentMethodEnum("paymentMethod").notNull(),
    receiptKey: varchar("receiptKey", { length: 512 }),
    note: text("note"),
    approvalStatus: approvalStatus("approvalStatus").default("approved").notNull(),
    approvedByUserId: integer("approvedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approvedAt"),
    recordedByUserId: integer("recordedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deletedAt"),
  },
  table => [
    index("expenses_date_idx").on(table.expenseDate),
    index("expenses_category_idx").on(table.category),
    index("expenses_scope_idx").on(table.scope),
    index("expenses_approval_idx").on(table.approvalStatus),
  ],
);

/**
 * One row per day the register was closed.
 *
 * The figures are a snapshot, not a view. Closing a day is the act of saying
 * "this is what the day was", and that statement has to keep meaning the same
 * thing afterwards - a payment backdated into a closed day must not silently
 * rewrite a count somebody signed off on. The live figures are still there to
 * be recomputed and compared against; this is the record of what was agreed.
 *
 * Money is split by channel because only cash is in the drawer. MoMo and card
 * takings never touch the till, so the till is reconciled against
 * `expectedCash` (cash in, less cash paid out) rather than against the day's
 * total takings.
 */
export const dailyClosings = pgTable(
  "dailyClosings",
  {
    id: serial("id").primaryKey(),
    /** Unique: a day is closed once, or reopened and closed again in place. */
    closingDate: date("closingDate", { mode: "date" }).notNull().unique(),
    customersServed: integer("customersServed").default(0).notNull(),

    cashSales: numeric("cashSales", { precision: 12, scale: 2 }).default("0.00").notNull(),
    momoSales: numeric("momoSales", { precision: 12, scale: 2 }).default("0.00").notNull(),
    cardSales: numeric("cardSales", { precision: 12, scale: 2 }).default("0.00").notNull(),
    bankSales: numeric("bankSales", { precision: 12, scale: 2 }).default("0.00").notNull(),
    onlineSales: numeric("onlineSales", { precision: 12, scale: 2 }).default("0.00").notNull(),
    totalSales: numeric("totalSales", { precision: 12, scale: 2 }).default("0.00").notNull(),

    /** Everything spent on the day, however it was paid. */
    totalExpenses: numeric("totalExpenses", { precision: 12, scale: 2 }).default("0.00").notNull(),
    /** The part of that taken out of the drawer, which the till count must account for. */
    cashExpenses: numeric("cashExpenses", { precision: 12, scale: 2 }).default("0.00").notNull(),

    /** cashSales - cashExpenses: what should physically be there. */
    expectedCash: numeric("expectedCash", { precision: 12, scale: 2 }).default("0.00").notNull(),
    countedCash: numeric("countedCash", { precision: 12, scale: 2 }).default("0.00").notNull(),
    /** countedCash - expectedCash. Negative is short, positive is over. */
    discrepancy: numeric("discrepancy", { precision: 12, scale: 2 }).default("0.00").notNull(),

    notes: text("notes"),
    closedByUserId: integer("closedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    closedAt: timestamp("closedAt").defaultNow().notNull(),
    /** Set while a day has been unlocked for correction; cleared on re-close. */
    reopenedAt: timestamp("reopenedAt"),
    reopenedByUserId: integer("reopenedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    reopenReason: text("reopenReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [index("daily_closings_date_idx").on(table.closingDate)],
);

export const dailyClosingsRelations = relations(dailyClosings, ({ one }) => ({
  closedBy: one(users, { fields: [dailyClosings.closedByUserId], references: [users.id] }),
}));

export type DailyClosing = typeof dailyClosings.$inferSelect;

export const feeChargesRelations = relations(feeCharges, ({ one, many }) => ({
  student: one(studentProfiles, {
    fields: [feeCharges.studentId],
    references: [studentProfiles.id],
  }),
  enrollment: one(enrollments, {
    fields: [feeCharges.enrollmentId],
    references: [enrollments.id],
  }),
  allocations: many(paymentAllocations),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  student: one(studentProfiles, { fields: [payments.studentId], references: [studentProfiles.id] }),
  order: one(storeOrders, { fields: [payments.storeOrderId], references: [storeOrders.id] }),
  intent: one(paymentIntents, {
    fields: [payments.paymentIntentId],
    references: [paymentIntents.id],
  }),
  allocations: many(paymentAllocations),
  revenue: many(revenueTransactions),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({ one }) => ({
  payment: one(payments, { fields: [paymentAllocations.paymentId], references: [payments.id] }),
  charge: one(feeCharges, {
    fields: [paymentAllocations.feeChargeId],
    references: [feeCharges.id],
  }),
}));

export const revenueTransactionsRelations = relations(revenueTransactions, ({ one }) => ({
  payment: one(payments, { fields: [revenueTransactions.paymentId], references: [payments.id] }),
  order: one(storeOrders, {
    fields: [revenueTransactions.storeOrderId],
    references: [storeOrders.id],
  }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  expenseCategory: one(expenseCategories, {
    fields: [expenses.categoryId],
    references: [expenseCategories.id],
  }),
}));

export type FeeCharge = typeof feeCharges.$inferSelect;
export type FeeStructure = typeof feeStructures.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentIntent = typeof paymentIntents.$inferSelect;
export type RevenueTransaction = typeof revenueTransactions.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
