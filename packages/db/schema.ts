import {
  boolean,
  date,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "student", "staff", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const courses = mysqlTable("courses", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  title: varchar("title", { length: 160 }).notNull(),
  summary: text("summary").notNull(),
  description: text("description").notNull(),
  durationWeeks: int("durationWeeks").notNull(),
  tuition: decimal("tuition", { precision: 10, scale: 2 }).notNull(),
  schedule: varchar("schedule", { length: 160 }),
  certification: varchar("certification", { length: 160 }),
  requirements: text("requirements"),
  isFeatured: boolean("isFeatured").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const intakes = mysqlTable("intakes", {
  id: int("id").autoincrement().primaryKey(),
  courseId: int("courseId").notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  startDate: date("startDate").notNull(),
  applicationDeadline: date("applicationDeadline"),
  capacity: int("capacity").notNull(),
  status: mysqlEnum("status", ["open", "closed", "completed"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const applications = mysqlTable("applications", {
  id: int("id").autoincrement().primaryKey(),
  reference: varchar("reference", { length: 32 }).notNull().unique(),
  userId: int("userId"),
  fullName: varchar("fullName", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 40 }).notNull(),
  whatsapp: varchar("whatsapp", { length: 40 }),
  birthDate: date("birthDate"),
  gender: varchar("gender", { length: 32 }),
  address: text("address"),
  emergencyContact: varchar("emergencyContact", { length: 180 }),
  education: text("education"),
  courseId: int("courseId").notNull(),
  intakeId: int("intakeId"),
  statement: text("statement"),
  status: mysqlEnum("status", ["draft", "submitted", "under_review", "more_information", "approved", "rejected"]).default("draft").notNull(),
  decisionNote: text("decisionNote"),
  reviewedByUserId: int("reviewedByUserId"),
  submittedAt: timestamp("submittedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const applicationDocuments = mysqlTable("applicationDocuments", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId").notNull(),
  documentType: mysqlEnum("documentType", ["transcript", "government_id", "passport_photo", "certificate", "other"]).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  uploadedByUserId: int("uploadedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const studentProfiles = mysqlTable("studentProfiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").unique(),
  applicationId: int("applicationId").unique(),
  studentNumber: varchar("studentNumber", { length: 40 }).notNull().unique(),
  fullName: varchar("fullName", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 40 }).notNull(),
  profileImageKey: varchar("profileImageKey", { length: 512 }),
  status: mysqlEnum("status", ["active", "suspended", "completed", "graduated", "withdrawn"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const enrollments = mysqlTable("enrollments", {
  id: int("id").autoincrement().primaryKey(),
  studentId: int("studentId").notNull(),
  courseId: int("courseId").notNull(),
  intakeId: int("intakeId"),
  enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
  expectedCompletionDate: date("expectedCompletionDate"),
  progressPercent: int("progressPercent").default(0).notNull(),
  status: mysqlEnum("status", ["active", "paused", "completed", "withdrawn"]).default("active").notNull(),
});

export const attendanceRecords = mysqlTable("attendanceRecords", {
  id: int("id").autoincrement().primaryKey(),
  enrollmentId: int("enrollmentId").notNull(),
  classDate: date("classDate").notNull(),
  status: mysqlEnum("status", ["present", "late", "absent", "excused"]).notNull(),
  recordedByUserId: int("recordedByUserId"),
  note: varchar("note", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const assessments = mysqlTable("assessments", {
  id: int("id").autoincrement().primaryKey(),
  courseId: int("courseId").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  assessmentType: mysqlEnum("assessmentType", ["theory", "practical", "project", "exam"]).notNull(),
  totalScore: int("totalScore").notNull(),
  dueDate: date("dueDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const assessmentResults = mysqlTable("assessmentResults", {
  id: int("id").autoincrement().primaryKey(),
  assessmentId: int("assessmentId").notNull(),
  studentId: int("studentId").notNull(),
  score: decimal("score", { precision: 6, scale: 2 }).notNull(),
  grade: varchar("grade", { length: 8 }),
  instructorComment: text("instructorComment"),
  gradedByUserId: int("gradedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const staffProfiles = mysqlTable("staffProfiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  position: varchar("position", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  employmentDate: date("employmentDate"),
  status: mysqlEnum("status", ["active", "inactive", "on_leave"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const inventoryItems = mysqlTable("inventoryItems", {
  id: int("id").autoincrement().primaryKey(),
  sku: varchar("sku", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 80 }).notNull(),
  imageKey: varchar("imageKey", { length: 512 }),
  quantityOnHand: int("quantityOnHand").default(0).notNull(),
  reorderLevel: int("reorderLevel").default(0).notNull(),
  unitCost: decimal("unitCost", { precision: 10, scale: 2 }).default("0.00").notNull(),
  sellingPrice: decimal("sellingPrice", { precision: 10, scale: 2 }).default("0.00").notNull(),
  isSellable: boolean("isSellable").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const inventoryMovements = mysqlTable("inventoryMovements", {
  id: int("id").autoincrement().primaryKey(),
  inventoryItemId: int("inventoryItemId").notNull(),
  movementType: mysqlEnum("movementType", ["received", "retail_sale", "classroom_use", "adjustment", "damaged", "return"]).notNull(),
  quantityDelta: int("quantityDelta").notNull(),
  referenceType: varchar("referenceType", { length: 64 }),
  referenceId: int("referenceId"),
  note: text("note"),
  performedByUserId: int("performedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const carts = mysqlTable("carts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  sessionToken: varchar("sessionToken", { length: 96 }).unique(),
  status: mysqlEnum("status", ["active", "converted", "abandoned"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const cartItems = mysqlTable("cartItems", {
  id: int("id").autoincrement().primaryKey(),
  cartId: int("cartId").notNull(),
  inventoryItemId: int("inventoryItemId").notNull(),
  quantity: int("quantity").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const storeOrders = mysqlTable("storeOrders", {
  id: int("id").autoincrement().primaryKey(),
  orderNumber: varchar("orderNumber", { length: 40 }).notNull().unique(),
  userId: int("userId"),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  customerEmail: varchar("customerEmail", { length: 320 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 40 }).notNull(),
  deliveryAddress: text("deliveryAddress"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid", "refunded", "failed"]).default("pending").notNull(),
  fulfillmentStatus: mysqlEnum("fulfillmentStatus", ["new", "confirmed", "processing", "ready", "shipped", "delivered", "cancelled"]).default("new").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const orderItems = mysqlTable("orderItems", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  inventoryItemId: int("inventoryItemId").notNull(),
  itemName: varchar("itemName", { length: 180 }).notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  quantity: int("quantity").notNull(),
  lineTotal: decimal("lineTotal", { precision: 10, scale: 2 }).notNull(),
});

export const feeCharges = mysqlTable("feeCharges", {
  id: int("id").autoincrement().primaryKey(),
  studentId: int("studentId").notNull(),
  enrollmentId: int("enrollmentId"),
  feeType: mysqlEnum("feeType", ["tuition", "registration", "materials", "exam", "certification", "other"]).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  amountDue: decimal("amountDue", { precision: 10, scale: 2 }).notNull(),
  dueDate: date("dueDate"),
  status: mysqlEnum("status", ["open", "partially_paid", "paid", "waived"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  reference: varchar("reference", { length: 64 }).notNull().unique(),
  studentId: int("studentId"),
  feeChargeId: int("feeChargeId"),
  storeOrderId: int("storeOrderId"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "mobile_money", "bank", "card", "online"]).notNull(),
  status: mysqlEnum("status", ["pending", "completed", "failed", "refunded"]).default("completed").notNull(),
  transactionReference: varchar("transactionReference", { length: 120 }),
  recordedByUserId: int("recordedByUserId"),
  paidAt: timestamp("paidAt").defaultNow().notNull(),
});

export const paymentPlans = mysqlTable("paymentPlans", {
  id: int("id").autoincrement().primaryKey(),
  studentId: int("studentId").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  installmentAmount: decimal("installmentAmount", { precision: 10, scale: 2 }).notNull(),
  nextDueDate: date("nextDueDate"),
  status: mysqlEnum("status", ["active", "completed", "paused", "cancelled"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const expenses = mysqlTable("expenses", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  category: mysqlEnum("category", ["rent", "utilities", "salaries", "transport", "equipment", "beauty_products", "maintenance", "marketing", "stationery", "cleaning", "other"]).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  expenseDate: date("expenseDate").notNull(),
  vendor: varchar("vendor", { length: 160 }),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "mobile_money", "bank", "card", "online"]).notNull(),
  receiptKey: varchar("receiptKey", { length: 512 }),
  note: text("note"),
  recordedByUserId: int("recordedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const clinicServices = mysqlTable("clinicServices", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  durationMinutes: int("durationMinutes").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  reference: varchar("reference", { length: 40 }).notNull().unique(),
  serviceId: int("serviceId").notNull(),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  customerEmail: varchar("customerEmail", { length: 320 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 40 }).notNull(),
  startsAt: timestamp("startsAt").notNull(),
  note: text("note"),
  status: mysqlEnum("status", ["requested", "confirmed", "completed", "cancelled", "no_show"]).default("requested").notNull(),
  assignedStaffUserId: int("assignedStaffUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const mediaFiles = mysqlTable("mediaFiles", {
  id: int("id").autoincrement().primaryKey(),
  ownerUserId: int("ownerUserId"),
  purpose: mysqlEnum("purpose", ["brochure", "gallery", "product", "application", "receipt", "profile", "other"]).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
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
