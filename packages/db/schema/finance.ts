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

// Fee structure pricing definition by fee type.
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

// Individual fee billed to a student.
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
    // Running paid amount updated via payment allocations.
    amountPaid: numeric("amountPaid", { precision: 10, scale: 2 }).default("0.00").notNull(),
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

// Student account fee discounts and surcharges.
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

// Gateway payment attempt tracked before server verification.
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
    // Unique client submission key preventing duplicate capture.
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

// Provider webhook payload deduplicated by event id.
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
    // Unique provider transaction reference.
    reference: varchar("reference", { length: 64 }).notNull().unique(),
    studentId: integer("studentId").references(() => studentProfiles.id, { onDelete: "set null" }),
    storeOrderId: integer("storeOrderId").references(() => storeOrders.id, {
      onDelete: "set null",
    }),
    paymentIntentId: integer("paymentIntentId").references(() => paymentIntents.id, {
      onDelete: "set null",
    }),
    // Optional single charge association for backward compatibility.
    feeChargeId: integer("feeChargeId").references(() => feeCharges.id, { onDelete: "set null" }),
    feeType: feeTypeEnum("feeType"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum("paymentMethod").notNull(),
    status: paymentStatusEnum("status").default("completed").notNull(),
    // Unique when present: the same gateway reference cannot be booked twice.
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

// Allocation link connecting payments to specific fee charges.
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

// Financial revenue ledger tracking income and reversals.
export const revenueTransactions = pgTable(
  "revenueTransactions",
  {
    id: serial("id").primaryKey(),
    source: revenueSource("source").notNull(),
    // Source entity generating this revenue record.
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
    // Reference pointing to original cancelled revenue transaction.
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
    // Legacy category enum maintained for backward compatibility.
    category: expenseCategory("category").default("other").notNull(),
    categoryId: integer("categoryId").references(() => expenseCategories.id, {
      onDelete: "restrict",
    }),
    // Division assignment: school or store.
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

// End-of-day register closing and cash reconciliation record.
export const dailyClosings = pgTable(
  "dailyClosings",
  {
    id: serial("id").primaryKey(),
    // Unique date for daily register closing.
    closingDate: date("closingDate", { mode: "date" }).notNull().unique(),
    customersServed: integer("customersServed").default(0).notNull(),

    cashSales: numeric("cashSales", { precision: 12, scale: 2 }).default("0.00").notNull(),
    momoSales: numeric("momoSales", { precision: 12, scale: 2 }).default("0.00").notNull(),
    cardSales: numeric("cardSales", { precision: 12, scale: 2 }).default("0.00").notNull(),
    bankSales: numeric("bankSales", { precision: 12, scale: 2 }).default("0.00").notNull(),
    onlineSales: numeric("onlineSales", { precision: 12, scale: 2 }).default("0.00").notNull(),
    totalSales: numeric("totalSales", { precision: 12, scale: 2 }).default("0.00").notNull(),

    // Total daily expenses across all payment methods.
    totalExpenses: numeric("totalExpenses", { precision: 12, scale: 2 }).default("0.00").notNull(),
    // Out-of-drawer cash expenses deducted from till.
    cashExpenses: numeric("cashExpenses", { precision: 12, scale: 2 }).default("0.00").notNull(),

    // Calculated cash expected in the till.
    expectedCash: numeric("expectedCash", { precision: 12, scale: 2 }).default("0.00").notNull(),
    countedCash: numeric("countedCash", { precision: 12, scale: 2 }).default("0.00").notNull(),
    // Cash variance between counted and expected amounts.
    discrepancy: numeric("discrepancy", { precision: 12, scale: 2 }).default("0.00").notNull(),

    notes: text("notes"),
    closedByUserId: integer("closedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    closedAt: timestamp("closedAt").defaultNow().notNull(),
    // Timestamp marking register reopened for corrections.
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
