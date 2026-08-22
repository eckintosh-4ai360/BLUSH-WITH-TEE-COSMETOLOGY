import {
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export const userRole = pgEnum("user_role", ["user", "student", "staff", "admin"]);

export const intakeStatus = pgEnum("intake_status", ["open", "closed", "completed"]);

export const applicationStatus = pgEnum("application_status", [
  "draft",
  "submitted",
  "under_review",
  "more_information",
  "approved",
  "rejected",
]);

export const applicationDocumentType = pgEnum("application_document_type", [
  "transcript",
  "government_id",
  "passport_photo",
  "certificate",
  "other",
]);

export const studentStatus = pgEnum("student_status", [
  "active",
  "suspended",
  "completed",
  "graduated",
  "withdrawn",
]);

export const enrollmentStatus = pgEnum("enrollment_status", [
  "active",
  "paused",
  "completed",
  "withdrawn",
]);

export const attendanceStatus = pgEnum("attendance_status", [
  "present",
  "late",
  "absent",
  "excused",
]);

export const assessmentTypeEnum = pgEnum("assessment_type", [
  "theory",
  "practical",
  "project",
  "exam",
]);

export const staffStatus = pgEnum("staff_status", ["active", "inactive", "on_leave"]);

export const inventoryMovementType = pgEnum("inventory_movement_type", [
  "received",
  "retail_sale",
  "classroom_use",
  "adjustment",
  "damaged",
  "return",
]);

export const cartStatus = pgEnum("cart_status", ["active", "converted", "abandoned"]);

export const orderPaymentStatus = pgEnum("order_payment_status", [
  "pending",
  "paid",
  "refunded",
  "failed",
]);

export const orderFulfillmentStatus = pgEnum("order_fulfillment_status", [
  "new",
  "confirmed",
  "processing",
  "ready",
  "shipped",
  "delivered",
  "cancelled",
]);

export const feeTypeEnum = pgEnum("fee_type", [
  "tuition",
  "registration",
  "materials",
  "exam",
  "certification",
  "other",
]);

export const feeChargeStatus = pgEnum("fee_charge_status", [
  "open",
  "partially_paid",
  "paid",
  "waived",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "mobile_money",
  "bank",
  "card",
  "online",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "completed",
  "failed",
  "refunded",
]);

export const paymentPlanStatus = pgEnum("payment_plan_status", [
  "active",
  "completed",
  "paused",
  "cancelled",
]);

export const expenseCategory = pgEnum("expense_category", [
  "rent",
  "utilities",
  "salaries",
  "transport",
  "equipment",
  "beauty_products",
  "maintenance",
  "marketing",
  "stationery",
  "cleaning",
  "other",
]);

export const appointmentStatus = pgEnum("appointment_status", [
  "requested",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

export const mediaPurpose = pgEnum("media_purpose", [
  "brochure",
  "gallery",
  "product",
  "application",
  "receipt",
  "profile",
  "other",
]);

/* -------------------------------------------------------------------------- */
/* Tables                                                                      */
/* -------------------------------------------------------------------------- */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  title: varchar("title", { length: 160 }).notNull(),
  summary: text("summary").notNull(),
  description: text("description").notNull(),
  durationWeeks: integer("durationWeeks").notNull(),
  tuition: numeric("tuition", { precision: 10, scale: 2 }).notNull(),
  schedule: varchar("schedule", { length: 160 }),
  certification: varchar("certification", { length: 160 }),
  requirements: text("requirements"),
  isFeatured: boolean("isFeatured").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const intakes = pgTable("intakes", {
  id: serial("id").primaryKey(),
  courseId: integer("courseId").notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  startDate: date("startDate").notNull(),
  applicationDeadline: date("applicationDeadline"),
  capacity: integer("capacity").notNull(),
  status: intakeStatus("status").default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),
  reference: varchar("reference", { length: 32 }).notNull().unique(),
  userId: integer("userId"),
  fullName: varchar("fullName", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 40 }).notNull(),
  whatsapp: varchar("whatsapp", { length: 40 }),
  birthDate: date("birthDate"),
  gender: varchar("gender", { length: 32 }),
  address: text("address"),
  emergencyContact: varchar("emergencyContact", { length: 180 }),
  education: text("education"),
  courseId: integer("courseId").notNull(),
  intakeId: integer("intakeId"),
  statement: text("statement"),
  status: applicationStatus("status").default("draft").notNull(),
  decisionNote: text("decisionNote"),
  reviewedByUserId: integer("reviewedByUserId"),
  submittedAt: timestamp("submittedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const applicationDocuments = pgTable("applicationDocuments", {
  id: serial("id").primaryKey(),
  applicationId: integer("applicationId").notNull(),
  documentType: applicationDocumentType("documentType").notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  uploadedByUserId: integer("uploadedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const studentProfiles = pgTable("studentProfiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId").unique(),
  applicationId: integer("applicationId").unique(),
  studentNumber: varchar("studentNumber", { length: 40 }).notNull().unique(),
  fullName: varchar("fullName", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 40 }).notNull(),
  profileImageKey: varchar("profileImageKey", { length: 512 }),
  status: studentStatus("status").default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const enrollments = pgTable("enrollments", {
  id: serial("id").primaryKey(),
  studentId: integer("studentId").notNull(),
  courseId: integer("courseId").notNull(),
  intakeId: integer("intakeId"),
  enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
  expectedCompletionDate: date("expectedCompletionDate"),
  progressPercent: integer("progressPercent").default(0).notNull(),
  status: enrollmentStatus("status").default("active").notNull(),
});

export const attendanceRecords = pgTable("attendanceRecords", {
  id: serial("id").primaryKey(),
  enrollmentId: integer("enrollmentId").notNull(),
  classDate: date("classDate").notNull(),
  status: attendanceStatus("status").notNull(),
  recordedByUserId: integer("recordedByUserId"),
  note: varchar("note", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const assessments = pgTable("assessments", {
  id: serial("id").primaryKey(),
  courseId: integer("courseId").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  assessmentType: assessmentTypeEnum("assessmentType").notNull(),
  totalScore: integer("totalScore").notNull(),
  dueDate: date("dueDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const assessmentResults = pgTable("assessmentResults", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessmentId").notNull(),
  studentId: integer("studentId").notNull(),
  score: numeric("score", { precision: 6, scale: 2 }).notNull(),
  grade: varchar("grade", { length: 8 }),
  instructorComment: text("instructorComment"),
  gradedByUserId: integer("gradedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const staffProfiles = pgTable("staffProfiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  position: varchar("position", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  employmentDate: date("employmentDate"),
  status: staffStatus("status").default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const inventoryItems = pgTable("inventoryItems", {
  id: serial("id").primaryKey(),
  sku: varchar("sku", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 80 }).notNull(),
  imageKey: varchar("imageKey", { length: 512 }),
  quantityOnHand: integer("quantityOnHand").default(0).notNull(),
  reorderLevel: integer("reorderLevel").default(0).notNull(),
  unitCost: numeric("unitCost", { precision: 10, scale: 2 }).default("0.00").notNull(),
  sellingPrice: numeric("sellingPrice", { precision: 10, scale: 2 }).default("0.00").notNull(),
  isSellable: boolean("isSellable").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const inventoryMovements = pgTable("inventoryMovements", {
  id: serial("id").primaryKey(),
  inventoryItemId: integer("inventoryItemId").notNull(),
  movementType: inventoryMovementType("movementType").notNull(),
  quantityDelta: integer("quantityDelta").notNull(),
  referenceType: varchar("referenceType", { length: 64 }),
  referenceId: integer("referenceId"),
  note: text("note"),
  performedByUserId: integer("performedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const carts = pgTable("carts", {
  id: serial("id").primaryKey(),
  userId: integer("userId"),
  sessionToken: varchar("sessionToken", { length: 96 }).unique(),
  status: cartStatus("status").default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const cartItems = pgTable("cartItems", {
  id: serial("id").primaryKey(),
  cartId: integer("cartId").notNull(),
  inventoryItemId: integer("inventoryItemId").notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const storeOrders = pgTable("storeOrders", {
  id: serial("id").primaryKey(),
  orderNumber: varchar("orderNumber", { length: 40 }).notNull().unique(),
  userId: integer("userId"),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  customerEmail: varchar("customerEmail", { length: 320 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 40 }).notNull(),
  deliveryAddress: text("deliveryAddress"),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  paymentStatus: orderPaymentStatus("paymentStatus").default("pending").notNull(),
  fulfillmentStatus: orderFulfillmentStatus("fulfillmentStatus").default("new").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const orderItems = pgTable("orderItems", {
  id: serial("id").primaryKey(),
  orderId: integer("orderId").notNull(),
  inventoryItemId: integer("inventoryItemId").notNull(),
  itemName: varchar("itemName", { length: 180 }).notNull(),
  unitPrice: numeric("unitPrice", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull(),
  lineTotal: numeric("lineTotal", { precision: 10, scale: 2 }).notNull(),
});

export const feeCharges = pgTable("feeCharges", {
  id: serial("id").primaryKey(),
  studentId: integer("studentId").notNull(),
  enrollmentId: integer("enrollmentId"),
  feeType: feeTypeEnum("feeType").notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  amountDue: numeric("amountDue", { precision: 10, scale: 2 }).notNull(),
  dueDate: date("dueDate"),
  status: feeChargeStatus("status").default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  reference: varchar("reference", { length: 64 }).notNull().unique(),
  studentId: integer("studentId"),
  feeChargeId: integer("feeChargeId"),
  storeOrderId: integer("storeOrderId"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum("paymentMethod").notNull(),
  status: paymentStatusEnum("status").default("completed").notNull(),
  transactionReference: varchar("transactionReference", { length: 120 }),
  recordedByUserId: integer("recordedByUserId"),
  paidAt: timestamp("paidAt").defaultNow().notNull(),
});

export const paymentPlans = pgTable("paymentPlans", {
  id: serial("id").primaryKey(),
  studentId: integer("studentId").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  totalAmount: numeric("totalAmount", { precision: 10, scale: 2 }).notNull(),
  installmentAmount: numeric("installmentAmount", { precision: 10, scale: 2 }).notNull(),
  nextDueDate: date("nextDueDate"),
  status: paymentPlanStatus("status").default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  category: expenseCategory("category").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  expenseDate: date("expenseDate").notNull(),
  vendor: varchar("vendor", { length: 160 }),
  paymentMethod: paymentMethodEnum("paymentMethod").notNull(),
  receiptKey: varchar("receiptKey", { length: 512 }),
  note: text("note"),
  recordedByUserId: integer("recordedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const clinicServices = pgTable("clinicServices", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  durationMinutes: integer("durationMinutes").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  reference: varchar("reference", { length: 40 }).notNull().unique(),
  serviceId: integer("serviceId").notNull(),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  customerEmail: varchar("customerEmail", { length: 320 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 40 }).notNull(),
  startsAt: timestamp("startsAt").notNull(),
  note: text("note"),
  status: appointmentStatus("status").default("requested").notNull(),
  assignedStaffUserId: integer("assignedStaffUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const mediaFiles = pgTable("mediaFiles", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("ownerUserId"),
  purpose: mediaPurpose("purpose").notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  altText: varchar("altText", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type StudentProfile = typeof studentProfiles.$inferSelect;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type StoreOrder = typeof storeOrders.$inferSelect;
