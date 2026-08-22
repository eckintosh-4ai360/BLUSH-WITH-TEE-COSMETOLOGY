import { pgEnum } from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Identity & access                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Coarse account type. Fine-grained authorisation lives in the roles /
 * permissions tables — this only decides which portal a session may enter.
 */
export const userRole = pgEnum("user_role", ["user", "student", "staff", "admin"]);

export const roleKey = pgEnum("role_key", [
  "super_admin",
  "administrator",
  "instructor",
  "accountant",
  "storekeeper",
  "ecommerce_manager",
  "student",
  "customer",
]);

/* -------------------------------------------------------------------------- */
/* Academics & admissions                                                     */
/* -------------------------------------------------------------------------- */

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

export const classStatus = pgEnum("class_status", ["scheduled", "active", "completed", "cancelled"]);

export const certificateStatus = pgEnum("certificate_status", ["issued", "revoked"]);

/* -------------------------------------------------------------------------- */
/* Staff                                                                      */
/* -------------------------------------------------------------------------- */

export const staffStatus = pgEnum("staff_status", ["active", "inactive", "on_leave"]);

/* -------------------------------------------------------------------------- */
/* Inventory & procurement                                                    */
/* -------------------------------------------------------------------------- */

export const inventoryMovementType = pgEnum("inventory_movement_type", [
  "received",
  "retail_sale",
  "classroom_use",
  "adjustment",
  "damaged",
  "return",
]);

export const purchaseOrderStatus = pgEnum("purchase_order_status", [
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
]);

/* -------------------------------------------------------------------------- */
/* Commerce                                                                   */
/* -------------------------------------------------------------------------- */

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

export const customerStatus = pgEnum("customer_status", ["active", "inactive", "blocked"]);

export const addressType = pgEnum("address_type", ["shipping", "billing"]);

export const couponType = pgEnum("coupon_type", ["percentage", "fixed"]);

/* -------------------------------------------------------------------------- */
/* Finance                                                                    */
/* -------------------------------------------------------------------------- */

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

export const feeAdjustmentType = pgEnum("fee_adjustment_type", ["discount", "surcharge"]);

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

/** Lifecycle of a gateway-initiated payment, verified server-side before capture. */
export const paymentIntentStatus = pgEnum("payment_intent_status", [
  "initiated",
  "pending",
  "succeeded",
  "failed",
  "abandoned",
]);

export const paymentIntentPurpose = pgEnum("payment_intent_purpose", [
  "student_fee",
  "store_order",
  "application_fee",
]);

/** Where a revenue line came from. Every line is traceable to its source row. */
export const revenueSource = pgEnum("revenue_source", [
  "student_fee",
  "application_fee",
  "registration",
  "product_sale",
  "service",
  "other",
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

export const approvalStatus = pgEnum("approval_status", ["pending", "approved", "rejected"]);

/* -------------------------------------------------------------------------- */
/* Operations                                                                 */
/* -------------------------------------------------------------------------- */

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

export const notificationChannel = pgEnum("notification_channel", [
  "in_app",
  "email",
  "sms",
  "whatsapp",
]);

export const notificationType = pgEnum("notification_type", [
  "application_submitted",
  "application_approved",
  "application_rejected",
  "missing_document",
  "admission_granted",
  "payment_received",
  "outstanding_fee",
  "new_order",
  "order_confirmed",
  "order_shipped",
  "order_delivered",
  "low_stock",
  "new_expense",
  "certificate_issued",
  "general",
]);

export const deliveryStatus = pgEnum("delivery_status", ["queued", "sent", "failed", "skipped"]);

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

export const publishStatus = pgEnum("publish_status", ["draft", "published", "archived"]);

export const galleryCategory = pgEnum("gallery_category", [
  "student_work",
  "graduation",
  "training",
  "facilities",
  "hair",
  "makeup",
  "nails",
  "events",
]);
