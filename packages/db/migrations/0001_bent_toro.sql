CREATE TYPE "public"."address_type" AS ENUM('shipping', 'billing');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."certificate_status" AS ENUM('issued', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."class_status" AS ENUM('scheduled', 'active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."coupon_type" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('active', 'inactive', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."fee_adjustment_type" AS ENUM('discount', 'surcharge');--> statement-breakpoint
CREATE TYPE "public"."gallery_category" AS ENUM('student_work', 'graduation', 'training', 'facilities', 'hair', 'makeup', 'nails', 'events');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'email', 'sms', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('application_submitted', 'application_approved', 'application_rejected', 'missing_document', 'admission_granted', 'payment_received', 'outstanding_fee', 'new_order', 'order_confirmed', 'order_shipped', 'order_delivered', 'low_stock', 'new_expense', 'certificate_issued', 'general');--> statement-breakpoint
CREATE TYPE "public"."payment_intent_purpose" AS ENUM('student_fee', 'store_order', 'application_fee');--> statement-breakpoint
CREATE TYPE "public"."payment_intent_status" AS ENUM('initiated', 'pending', 'succeeded', 'failed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."publish_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('draft', 'ordered', 'partially_received', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."revenue_source" AS ENUM('student_fee', 'application_fee', 'registration', 'product_sale', 'service', 'other');--> statement-breakpoint
CREATE TYPE "public"."role_key" AS ENUM('super_admin', 'administrator', 'instructor', 'accountant', 'storekeeper', 'ecommerce_manager', 'student', 'customer');--> statement-breakpoint
CREATE TABLE "people" (
	"id" serial PRIMARY KEY NOT NULL,
	"fullName" varchar(160) NOT NULL,
	"email" varchar(320),
	"phone" varchar(40),
	"whatsapp" varchar(40),
	"birthDate" date,
	"gender" varchar(32),
	"address" text,
	"city" varchar(120),
	"country" varchar(120),
	"emergencyContactName" varchar(160),
	"emergencyContactPhone" varchar(40),
	"photoKey" varchar(512),
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(96) NOT NULL,
	"module" varchar(48) NOT NULL,
	"description" varchar(255) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "rolePermissions" (
	"roleId" integer NOT NULL,
	"permissionId" integer NOT NULL,
	CONSTRAINT "role_permission_unique" UNIQUE("roleId","permissionId")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" "role_key" NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" varchar(255),
	"isSystem" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "userRoles" (
	"userId" integer NOT NULL,
	"roleId" integer NOT NULL,
	"assignedByUserId" integer,
	"assignedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_role_unique" UNIQUE("userId","roleId")
);
--> statement-breakpoint
CREATE TABLE "classSessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"classId" integer NOT NULL,
	"sessionDate" date NOT NULL,
	"topic" varchar(255),
	"recordedByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "class_session_date_unique" UNIQUE("classId","sessionDate")
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" serial PRIMARY KEY NOT NULL,
	"courseId" integer NOT NULL,
	"intakeId" integer,
	"moduleId" integer,
	"instructorUserId" integer,
	"title" varchar(180) NOT NULL,
	"room" varchar(80),
	"dayOfWeek" integer,
	"startsAt" time,
	"endsAt" time,
	"status" "class_status" DEFAULT 'scheduled' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courseModules" (
	"id" serial PRIMARY KEY NOT NULL,
	"courseId" integer NOT NULL,
	"code" varchar(32) NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text,
	"sequence" integer DEFAULT 1 NOT NULL,
	"durationHours" integer,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_module_code_unique" UNIQUE("courseId","code")
);
--> statement-breakpoint
CREATE TABLE "certificateVerifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"certificateId" integer,
	"lookupValue" varchar(64) NOT NULL,
	"wasFound" boolean DEFAULT false NOT NULL,
	"ipAddress" varchar(64),
	"userAgent" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"certificateNumber" varchar(40) NOT NULL,
	"verificationToken" varchar(64) NOT NULL,
	"studentId" integer NOT NULL,
	"courseId" integer NOT NULL,
	"enrollmentId" integer,
	"completionDate" date NOT NULL,
	"issuedAt" timestamp DEFAULT now() NOT NULL,
	"issuedByUserId" integer,
	"finalGrade" varchar(8),
	"status" "certificate_status" DEFAULT 'issued' NOT NULL,
	"revokedAt" timestamp,
	"revokedReason" varchar(255),
	CONSTRAINT "certificates_certificateNumber_unique" UNIQUE("certificateNumber"),
	CONSTRAINT "certificates_verificationToken_unique" UNIQUE("verificationToken")
);
--> statement-breakpoint
CREATE TABLE "productCategories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(120) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"imageKey" varchar(512),
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "productCategories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "productImages" (
	"id" serial PRIMARY KEY NOT NULL,
	"inventoryItemId" integer NOT NULL,
	"storageKey" varchar(512) NOT NULL,
	"altText" varchar(255),
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productVariations" (
	"id" serial PRIMARY KEY NOT NULL,
	"inventoryItemId" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"value" varchar(120) NOT NULL,
	"priceDelta" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"sku" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchaseOrderItems" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchaseOrderId" integer NOT NULL,
	"inventoryItemId" integer NOT NULL,
	"itemName" varchar(180) NOT NULL,
	"quantityOrdered" integer NOT NULL,
	"quantityReceived" integer DEFAULT 0 NOT NULL,
	"unitCost" numeric(10, 2) NOT NULL,
	"lineTotal" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchaseOrders" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" varchar(40) NOT NULL,
	"supplierId" integer NOT NULL,
	"orderDate" date NOT NULL,
	"expectedDate" date,
	"status" "purchase_order_status" DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"amountPaid" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"notes" text,
	"createdByUserId" integer,
	"receivedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchaseOrders_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "supplierPayments" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplierId" integer NOT NULL,
	"purchaseOrderId" integer,
	"amount" numeric(12, 2) NOT NULL,
	"paidAt" timestamp DEFAULT now() NOT NULL,
	"reference" varchar(120),
	"note" text,
	"recordedByUserId" integer
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"personId" integer,
	"name" varchar(160) NOT NULL,
	"company" varchar(160),
	"phone" varchar(40),
	"whatsapp" varchar(40),
	"email" varchar(320),
	"address" text,
	"productsSupplied" text,
	"outstandingBalance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"notes" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"description" varchar(255),
	"discountType" "coupon_type" NOT NULL,
	"discountValue" numeric(10, 2) NOT NULL,
	"minimumSubtotal" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"usageLimit" integer,
	"usageCount" integer DEFAULT 0 NOT NULL,
	"startsOn" date,
	"endsOn" date,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "customerAddresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"addressType" "address_type" DEFAULT 'shipping' NOT NULL,
	"label" varchar(80),
	"line1" varchar(255) NOT NULL,
	"line2" varchar(255),
	"city" varchar(120),
	"region" varchar(120),
	"country" varchar(120),
	"landmark" varchar(255),
	"isDefault" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"personId" integer NOT NULL,
	"userId" integer,
	"status" "customer_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"totalOrders" integer DEFAULT 0 NOT NULL,
	"totalSpent" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"lastOrderAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "orderAddresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"addressType" "address_type" DEFAULT 'shipping' NOT NULL,
	"line1" varchar(255) NOT NULL,
	"line2" varchar(255),
	"city" varchar(120),
	"region" varchar(120),
	"country" varchar(120),
	"landmark" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "orderStatusEvents" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"fromStatus" varchar(40),
	"toStatus" varchar(40) NOT NULL,
	"note" text,
	"createdByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenseCategories" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(48) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(255),
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "expenseCategories_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "feeAdjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"feeChargeId" integer,
	"adjustmentType" "fee_adjustment_type" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reason" varchar(255) NOT NULL,
	"createdByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feeStructures" (
	"id" serial PRIMARY KEY NOT NULL,
	"courseId" integer,
	"intakeId" integer,
	"feeType" "fee_type" NOT NULL,
	"label" varchar(180) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"isMandatory" boolean DEFAULT true NOT NULL,
	"dueOffsetDays" integer DEFAULT 0 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fee_structure_unique" UNIQUE("courseId","intakeId","feeType")
);
--> statement-breakpoint
CREATE TABLE "paymentAllocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"paymentId" integer NOT NULL,
	"feeChargeId" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocation_unique" UNIQUE("paymentId","feeChargeId")
);
--> statement-breakpoint
CREATE TABLE "paymentIntents" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" varchar(64) NOT NULL,
	"purpose" "payment_intent_purpose" NOT NULL,
	"studentId" integer,
	"storeOrderId" integer,
	"applicationId" integer,
	"initiatedByUserId" integer,
	"provider" varchar(40) NOT NULL,
	"providerReference" varchar(160),
	"idempotencyKey" varchar(96) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(8) DEFAULT 'GHS' NOT NULL,
	"status" "payment_intent_status" DEFAULT 'initiated' NOT NULL,
	"failureReason" varchar(255),
	"verifiedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "paymentIntents_reference_unique" UNIQUE("reference"),
	CONSTRAINT "paymentIntents_idempotencyKey_unique" UNIQUE("idempotencyKey")
);
--> statement-breakpoint
CREATE TABLE "revenueTransactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" "revenue_source" NOT NULL,
	"sourceType" varchar(48) NOT NULL,
	"sourceId" integer,
	"paymentId" integer,
	"studentId" integer,
	"storeOrderId" integer,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(8) DEFAULT 'GHS' NOT NULL,
	"description" varchar(255) NOT NULL,
	"reversalOfId" integer,
	"occurredAt" timestamp DEFAULT now() NOT NULL,
	"recordedByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhookEvents" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar(40) NOT NULL,
	"eventId" varchar(160) NOT NULL,
	"eventType" varchar(80),
	"payload" jsonb,
	"processedAt" timestamp,
	"error" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_event_unique" UNIQUE("provider","eventId")
);
--> statement-breakpoint
CREATE TABLE "staffAssignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"staffId" integer NOT NULL,
	"courseId" integer,
	"classId" integer,
	"assignedAt" timestamp DEFAULT now() NOT NULL,
	"assignedByUserId" integer,
	CONSTRAINT "staff_assignment_unique" UNIQUE("staffId","courseId","classId")
);
--> statement-breakpoint
CREATE TABLE "auditLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"userName" varchar(160),
	"action" varchar(80) NOT NULL,
	"entity" varchar(64) NOT NULL,
	"entityId" integer,
	"entityLabel" varchar(180),
	"oldValue" jsonb,
	"newValue" jsonb,
	"summary" varchar(400),
	"ipAddress" varchar(64),
	"userAgent" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notificationDeliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"notificationId" integer NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"destination" varchar(320),
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"sentAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notificationPreferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"type" "notification_type" NOT NULL,
	"inApp" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"sms" boolean DEFAULT false NOT NULL,
	"whatsapp" boolean DEFAULT false NOT NULL,
	CONSTRAINT "notification_preference_unique" UNIQUE("userId","type")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(180) NOT NULL,
	"body" text,
	"entityType" varchar(48),
	"entityId" integer,
	"link" varchar(255),
	"readAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "systemSettings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(96) NOT NULL,
	"category" varchar(48) NOT NULL,
	"value" jsonb,
	"description" varchar(255),
	"updatedByUserId" integer,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "systemSettings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "banners" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(180) NOT NULL,
	"subtitle" varchar(255),
	"imageKey" varchar(512),
	"ctaLabel" varchar(80),
	"ctaHref" varchar(255),
	"placement" varchar(48) DEFAULT 'homepage' NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blogCategories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(120) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blogCategories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "blogPosts" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(180) NOT NULL,
	"title" varchar(200) NOT NULL,
	"excerpt" varchar(400),
	"content" text NOT NULL,
	"featuredImageKey" varchar(512),
	"authorUserId" integer,
	"authorName" varchar(160),
	"categoryId" integer,
	"tags" varchar(320),
	"seoTitle" varchar(180),
	"seoDescription" varchar(320),
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"publishedAt" date,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	CONSTRAINT "blogPosts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(140) NOT NULL,
	"title" varchar(180) NOT NULL,
	"summary" varchar(320),
	"description" text,
	"imageKey" varchar(512),
	"location" varchar(180),
	"startsAt" timestamp NOT NULL,
	"endsAt" timestamp,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" varchar(320) NOT NULL,
	"answer" text NOT NULL,
	"category" varchar(80),
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "galleryItems" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(180),
	"caption" varchar(320),
	"category" "gallery_category" NOT NULL,
	"storageKey" varchar(512) NOT NULL,
	"altText" varchar(255),
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"uploadedByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(120) NOT NULL,
	"title" varchar(180) NOT NULL,
	"content" text,
	"seoTitle" varchar(180),
	"seoDescription" varchar(320),
	"ogImageKey" varchar(512),
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"updatedByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "siteServices" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(120) NOT NULL,
	"name" varchar(160) NOT NULL,
	"summary" varchar(320),
	"description" text,
	"imageKey" varchar(512),
	"priceFrom" varchar(40),
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "siteServices_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" serial PRIMARY KEY NOT NULL,
	"authorName" varchar(160) NOT NULL,
	"authorRole" varchar(120),
	"quote" text NOT NULL,
	"photoKey" varchar(512),
	"rating" integer,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "feeCharges" ALTER COLUMN "amountDue" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orderItems" ALTER COLUMN "lineTotal" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "paymentPlans" ALTER COLUMN "totalAmount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "paymentPlans" ALTER COLUMN "installmentAmount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "storeOrders" ALTER COLUMN "subtotal" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "storeOrders" ALTER COLUMN "total" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "personId" integer;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "reviewedAt" timestamp;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "personId" integer;--> statement-breakpoint
ALTER TABLE "assessmentResults" ADD COLUMN "updatedAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "moduleId" integer;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "weight" numeric(5, 2) DEFAULT '1.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "createdByUserId" integer;--> statement-breakpoint
ALTER TABLE "attendanceRecords" ADD COLUMN "classId" integer;--> statement-breakpoint
ALTER TABLE "attendanceRecords" ADD COLUMN "classSessionId" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "slug" varchar(180);--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "imageKey" varchar(512);--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "seoTitle" varchar(180);--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "seoDescription" varchar(320);--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "completedAt" timestamp;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "categoryId" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "approvalStatus" "approval_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "approvedByUserId" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "approvedAt" timestamp;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "updatedAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint
ALTER TABLE "feeCharges" ADD COLUMN "feeStructureId" integer;--> statement-breakpoint
ALTER TABLE "feeCharges" ADD COLUMN "amountPaid" numeric(12, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "feeCharges" ADD COLUMN "createdByUserId" integer;--> statement-breakpoint
ALTER TABLE "feeCharges" ADD COLUMN "updatedAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "intakes" ADD COLUMN "endDate" date;--> statement-breakpoint
ALTER TABLE "inventoryItems" ADD COLUMN "slug" varchar(180);--> statement-breakpoint
ALTER TABLE "inventoryItems" ADD COLUMN "categoryId" integer;--> statement-breakpoint
ALTER TABLE "inventoryItems" ADD COLUMN "supplierId" integer;--> statement-breakpoint
ALTER TABLE "inventoryItems" ADD COLUMN "seoTitle" varchar(180);--> statement-breakpoint
ALTER TABLE "inventoryItems" ADD COLUMN "seoDescription" varchar(320);--> statement-breakpoint
ALTER TABLE "inventoryItems" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint
ALTER TABLE "inventoryMovements" ADD COLUMN "balanceAfter" integer;--> statement-breakpoint
ALTER TABLE "inventoryMovements" ADD COLUMN "unitCost" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "mediaFiles" ADD COLUMN "isPublic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orderItems" ADD COLUMN "quantityReturned" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "paymentIntentId" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "feeType" "fee_type";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "receivedByUserId" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refundedAmount" numeric(12, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "createdAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "staffProfiles" ADD COLUMN "personId" integer;--> statement-breakpoint
ALTER TABLE "staffProfiles" ADD COLUMN "staffNumber" varchar(40);--> statement-breakpoint
ALTER TABLE "staffProfiles" ADD COLUMN "email" varchar(320);--> statement-breakpoint
ALTER TABLE "staffProfiles" ADD COLUMN "photoKey" varchar(512);--> statement-breakpoint
ALTER TABLE "staffProfiles" ADD COLUMN "salary" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "staffProfiles" ADD COLUMN "updatedAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "staffProfiles" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint
ALTER TABLE "storeOrders" ADD COLUMN "customerId" integer;--> statement-breakpoint
ALTER TABLE "storeOrders" ADD COLUMN "discount" numeric(12, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "storeOrders" ADD COLUMN "deliveryFee" numeric(12, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "storeOrders" ADD COLUMN "couponId" integer;--> statement-breakpoint
ALTER TABLE "storeOrders" ADD COLUMN "stockDeductedAt" timestamp;--> statement-breakpoint
ALTER TABLE "storeOrders" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "studentProfiles" ADD COLUMN "personId" integer;--> statement-breakpoint
ALTER TABLE "studentProfiles" ADD COLUMN "graduatedAt" timestamp;--> statement-breakpoint
ALTER TABLE "studentProfiles" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "personId" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "isActive" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twoFactorEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rolePermissions" ADD CONSTRAINT "rolePermissions_roleId_roles_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rolePermissions" ADD CONSTRAINT "rolePermissions_permissionId_permissions_id_fk" FOREIGN KEY ("permissionId") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userRoles" ADD CONSTRAINT "userRoles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userRoles" ADD CONSTRAINT "userRoles_roleId_roles_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classSessions" ADD CONSTRAINT "classSessions_classId_classes_id_fk" FOREIGN KEY ("classId") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classSessions" ADD CONSTRAINT "classSessions_recordedByUserId_users_id_fk" FOREIGN KEY ("recordedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_intakeId_intakes_id_fk" FOREIGN KEY ("intakeId") REFERENCES "public"."intakes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_moduleId_courseModules_id_fk" FOREIGN KEY ("moduleId") REFERENCES "public"."courseModules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_instructorUserId_users_id_fk" FOREIGN KEY ("instructorUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courseModules" ADD CONSTRAINT "courseModules_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificateVerifications" ADD CONSTRAINT "certificateVerifications_certificateId_certificates_id_fk" FOREIGN KEY ("certificateId") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_studentId_studentProfiles_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."studentProfiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_enrollmentId_enrollments_id_fk" FOREIGN KEY ("enrollmentId") REFERENCES "public"."enrollments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issuedByUserId_users_id_fk" FOREIGN KEY ("issuedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productImages" ADD CONSTRAINT "productImages_inventoryItemId_inventoryItems_id_fk" FOREIGN KEY ("inventoryItemId") REFERENCES "public"."inventoryItems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productVariations" ADD CONSTRAINT "productVariations_inventoryItemId_inventoryItems_id_fk" FOREIGN KEY ("inventoryItemId") REFERENCES "public"."inventoryItems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderItems" ADD CONSTRAINT "purchaseOrderItems_purchaseOrderId_purchaseOrders_id_fk" FOREIGN KEY ("purchaseOrderId") REFERENCES "public"."purchaseOrders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrderItems" ADD CONSTRAINT "purchaseOrderItems_inventoryItemId_inventoryItems_id_fk" FOREIGN KEY ("inventoryItemId") REFERENCES "public"."inventoryItems"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrders" ADD CONSTRAINT "purchaseOrders_supplierId_suppliers_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchaseOrders" ADD CONSTRAINT "purchaseOrders_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPayments" ADD CONSTRAINT "supplierPayments_supplierId_suppliers_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPayments" ADD CONSTRAINT "supplierPayments_purchaseOrderId_purchaseOrders_id_fk" FOREIGN KEY ("purchaseOrderId") REFERENCES "public"."purchaseOrders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplierPayments" ADD CONSTRAINT "supplierPayments_recordedByUserId_users_id_fk" FOREIGN KEY ("recordedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_personId_people_id_fk" FOREIGN KEY ("personId") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customerAddresses" ADD CONSTRAINT "customerAddresses_customerId_customers_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_personId_people_id_fk" FOREIGN KEY ("personId") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orderAddresses" ADD CONSTRAINT "orderAddresses_orderId_storeOrders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."storeOrders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orderStatusEvents" ADD CONSTRAINT "orderStatusEvents_orderId_storeOrders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."storeOrders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orderStatusEvents" ADD CONSTRAINT "orderStatusEvents_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeAdjustments" ADD CONSTRAINT "feeAdjustments_studentId_studentProfiles_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."studentProfiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeAdjustments" ADD CONSTRAINT "feeAdjustments_feeChargeId_feeCharges_id_fk" FOREIGN KEY ("feeChargeId") REFERENCES "public"."feeCharges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeAdjustments" ADD CONSTRAINT "feeAdjustments_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeStructures" ADD CONSTRAINT "feeStructures_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeStructures" ADD CONSTRAINT "feeStructures_intakeId_intakes_id_fk" FOREIGN KEY ("intakeId") REFERENCES "public"."intakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paymentAllocations" ADD CONSTRAINT "paymentAllocations_paymentId_payments_id_fk" FOREIGN KEY ("paymentId") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paymentAllocations" ADD CONSTRAINT "paymentAllocations_feeChargeId_feeCharges_id_fk" FOREIGN KEY ("feeChargeId") REFERENCES "public"."feeCharges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paymentIntents" ADD CONSTRAINT "paymentIntents_studentId_studentProfiles_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."studentProfiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paymentIntents" ADD CONSTRAINT "paymentIntents_storeOrderId_storeOrders_id_fk" FOREIGN KEY ("storeOrderId") REFERENCES "public"."storeOrders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paymentIntents" ADD CONSTRAINT "paymentIntents_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paymentIntents" ADD CONSTRAINT "paymentIntents_initiatedByUserId_users_id_fk" FOREIGN KEY ("initiatedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenueTransactions" ADD CONSTRAINT "revenueTransactions_paymentId_payments_id_fk" FOREIGN KEY ("paymentId") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenueTransactions" ADD CONSTRAINT "revenueTransactions_studentId_studentProfiles_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."studentProfiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenueTransactions" ADD CONSTRAINT "revenueTransactions_storeOrderId_storeOrders_id_fk" FOREIGN KEY ("storeOrderId") REFERENCES "public"."storeOrders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenueTransactions" ADD CONSTRAINT "revenueTransactions_recordedByUserId_users_id_fk" FOREIGN KEY ("recordedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffAssignments" ADD CONSTRAINT "staffAssignments_staffId_staffProfiles_id_fk" FOREIGN KEY ("staffId") REFERENCES "public"."staffProfiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffAssignments" ADD CONSTRAINT "staffAssignments_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffAssignments" ADD CONSTRAINT "staffAssignments_classId_classes_id_fk" FOREIGN KEY ("classId") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffAssignments" ADD CONSTRAINT "staffAssignments_assignedByUserId_users_id_fk" FOREIGN KEY ("assignedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditLogs" ADD CONSTRAINT "auditLogs_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificationDeliveries" ADD CONSTRAINT "notificationDeliveries_notificationId_notifications_id_fk" FOREIGN KEY ("notificationId") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificationPreferences" ADD CONSTRAINT "notificationPreferences_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "systemSettings" ADD CONSTRAINT "systemSettings_updatedByUserId_users_id_fk" FOREIGN KEY ("updatedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blogPosts" ADD CONSTRAINT "blogPosts_authorUserId_users_id_fk" FOREIGN KEY ("authorUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blogPosts" ADD CONSTRAINT "blogPosts_categoryId_blogCategories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."blogCategories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "galleryItems" ADD CONSTRAINT "galleryItems_uploadedByUserId_users_id_fk" FOREIGN KEY ("uploadedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_updatedByUserId_users_id_fk" FOREIGN KEY ("updatedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "people_email_unique" ON "people" USING btree (lower("email")) WHERE "people"."email" is not null and "people"."deletedAt" is null;--> statement-breakpoint
CREATE INDEX "people_phone_idx" ON "people" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "people_full_name_idx" ON "people" USING btree ("fullName");--> statement-breakpoint
CREATE INDEX "permissions_module_idx" ON "permissions" USING btree ("module");--> statement-breakpoint
CREATE INDEX "role_permissions_role_idx" ON "rolePermissions" USING btree ("roleId");--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "userRoles" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "class_sessions_date_idx" ON "classSessions" USING btree ("sessionDate");--> statement-breakpoint
CREATE INDEX "classes_course_idx" ON "classes" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "classes_instructor_idx" ON "classes" USING btree ("instructorUserId");--> statement-breakpoint
CREATE INDEX "classes_intake_idx" ON "classes" USING btree ("intakeId");--> statement-breakpoint
CREATE INDEX "course_modules_course_idx" ON "courseModules" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "certificate_verifications_certificate_idx" ON "certificateVerifications" USING btree ("certificateId");--> statement-breakpoint
CREATE INDEX "certificates_student_idx" ON "certificates" USING btree ("studentId");--> statement-breakpoint
CREATE INDEX "certificates_status_idx" ON "certificates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "product_categories_active_idx" ON "productCategories" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "product_images_item_idx" ON "productImages" USING btree ("inventoryItemId");--> statement-breakpoint
CREATE INDEX "product_variations_item_idx" ON "productVariations" USING btree ("inventoryItemId");--> statement-breakpoint
CREATE INDEX "purchase_order_items_order_idx" ON "purchaseOrderItems" USING btree ("purchaseOrderId");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_idx" ON "purchaseOrders" USING btree ("supplierId");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_idx" ON "purchaseOrders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "supplier_payments_supplier_idx" ON "supplierPayments" USING btree ("supplierId");--> statement-breakpoint
CREATE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "coupons_active_idx" ON "coupons" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_idx" ON "customerAddresses" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "customers_person_idx" ON "customers" USING btree ("personId");--> statement-breakpoint
CREATE INDEX "customers_status_idx" ON "customers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_addresses_order_idx" ON "orderAddresses" USING btree ("orderId");--> statement-breakpoint
CREATE INDEX "order_status_events_order_idx" ON "orderStatusEvents" USING btree ("orderId");--> statement-breakpoint
CREATE INDEX "expense_categories_active_idx" ON "expenseCategories" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "fee_adjustments_student_idx" ON "feeAdjustments" USING btree ("studentId");--> statement-breakpoint
CREATE INDEX "fee_structures_course_idx" ON "feeStructures" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "payment_allocations_charge_idx" ON "paymentAllocations" USING btree ("feeChargeId");--> statement-breakpoint
CREATE INDEX "payment_intents_status_idx" ON "paymentIntents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_intents_provider_ref_idx" ON "paymentIntents" USING btree ("providerReference");--> statement-breakpoint
CREATE INDEX "revenue_source_idx" ON "revenueTransactions" USING btree ("source");--> statement-breakpoint
CREATE INDEX "revenue_occurred_idx" ON "revenueTransactions" USING btree ("occurredAt");--> statement-breakpoint
CREATE INDEX "revenue_reference_idx" ON "revenueTransactions" USING btree ("sourceType","sourceId");--> statement-breakpoint
CREATE INDEX "staff_assignments_staff_idx" ON "staffAssignments" USING btree ("staffId");--> statement-breakpoint
CREATE INDEX "staff_assignments_course_idx" ON "staffAssignments" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "auditLogs" USING btree ("entity","entityId");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "auditLogs" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "auditLogs" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification_idx" ON "notificationDeliveries" USING btree ("notificationId");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("userId","readAt");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "system_settings_category_idx" ON "systemSettings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "banners_placement_idx" ON "banners" USING btree ("placement","status");--> statement-breakpoint
CREATE INDEX "blog_posts_status_idx" ON "blogPosts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blog_posts_published_idx" ON "blogPosts" USING btree ("publishedAt");--> statement-breakpoint
CREATE INDEX "events_starts_idx" ON "events" USING btree ("startsAt");--> statement-breakpoint
CREATE INDEX "faqs_status_idx" ON "faqs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gallery_items_category_idx" ON "galleryItems" USING btree ("category","status");--> statement-breakpoint
CREATE INDEX "pages_status_idx" ON "pages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "site_services_status_idx" ON "siteServices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "testimonials_status_idx" ON "testimonials" USING btree ("status");--> statement-breakpoint
ALTER TABLE "applicationDocuments" ADD CONSTRAINT "applicationDocuments_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicationDocuments" ADD CONSTRAINT "applicationDocuments_uploadedByUserId_users_id_fk" FOREIGN KEY ("uploadedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_personId_people_id_fk" FOREIGN KEY ("personId") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_intakeId_intakes_id_fk" FOREIGN KEY ("intakeId") REFERENCES "public"."intakes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_reviewedByUserId_users_id_fk" FOREIGN KEY ("reviewedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_serviceId_clinicServices_id_fk" FOREIGN KEY ("serviceId") REFERENCES "public"."clinicServices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_personId_people_id_fk" FOREIGN KEY ("personId") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assignedStaffUserId_users_id_fk" FOREIGN KEY ("assignedStaffUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessmentResults" ADD CONSTRAINT "assessmentResults_assessmentId_assessments_id_fk" FOREIGN KEY ("assessmentId") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessmentResults" ADD CONSTRAINT "assessmentResults_studentId_studentProfiles_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."studentProfiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessmentResults" ADD CONSTRAINT "assessmentResults_gradedByUserId_users_id_fk" FOREIGN KEY ("gradedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_moduleId_courseModules_id_fk" FOREIGN KEY ("moduleId") REFERENCES "public"."courseModules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendanceRecords" ADD CONSTRAINT "attendanceRecords_enrollmentId_enrollments_id_fk" FOREIGN KEY ("enrollmentId") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendanceRecords" ADD CONSTRAINT "attendanceRecords_classId_classes_id_fk" FOREIGN KEY ("classId") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendanceRecords" ADD CONSTRAINT "attendanceRecords_classSessionId_classSessions_id_fk" FOREIGN KEY ("classSessionId") REFERENCES "public"."classSessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendanceRecords" ADD CONSTRAINT "attendanceRecords_recordedByUserId_users_id_fk" FOREIGN KEY ("recordedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartItems" ADD CONSTRAINT "cartItems_cartId_carts_id_fk" FOREIGN KEY ("cartId") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cartItems" ADD CONSTRAINT "cartItems_inventoryItemId_inventoryItems_id_fk" FOREIGN KEY ("inventoryItemId") REFERENCES "public"."inventoryItems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_studentId_studentProfiles_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."studentProfiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_intakeId_intakes_id_fk" FOREIGN KEY ("intakeId") REFERENCES "public"."intakes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_expenseCategories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."expenseCategories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approvedByUserId_users_id_fk" FOREIGN KEY ("approvedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recordedByUserId_users_id_fk" FOREIGN KEY ("recordedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeCharges" ADD CONSTRAINT "feeCharges_studentId_studentProfiles_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."studentProfiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeCharges" ADD CONSTRAINT "feeCharges_enrollmentId_enrollments_id_fk" FOREIGN KEY ("enrollmentId") REFERENCES "public"."enrollments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeCharges" ADD CONSTRAINT "feeCharges_feeStructureId_feeStructures_id_fk" FOREIGN KEY ("feeStructureId") REFERENCES "public"."feeStructures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeCharges" ADD CONSTRAINT "feeCharges_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intakes" ADD CONSTRAINT "intakes_courseId_courses_id_fk" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventoryItems" ADD CONSTRAINT "inventoryItems_categoryId_productCategories_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."productCategories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventoryItems" ADD CONSTRAINT "inventoryItems_supplierId_suppliers_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventoryMovements" ADD CONSTRAINT "inventoryMovements_inventoryItemId_inventoryItems_id_fk" FOREIGN KEY ("inventoryItemId") REFERENCES "public"."inventoryItems"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventoryMovements" ADD CONSTRAINT "inventoryMovements_performedByUserId_users_id_fk" FOREIGN KEY ("performedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediaFiles" ADD CONSTRAINT "mediaFiles_ownerUserId_users_id_fk" FOREIGN KEY ("ownerUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orderItems" ADD CONSTRAINT "orderItems_orderId_storeOrders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."storeOrders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orderItems" ADD CONSTRAINT "orderItems_inventoryItemId_inventoryItems_id_fk" FOREIGN KEY ("inventoryItemId") REFERENCES "public"."inventoryItems"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paymentPlans" ADD CONSTRAINT "paymentPlans_studentId_studentProfiles_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."studentProfiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_studentId_studentProfiles_id_fk" FOREIGN KEY ("studentId") REFERENCES "public"."studentProfiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_storeOrderId_storeOrders_id_fk" FOREIGN KEY ("storeOrderId") REFERENCES "public"."storeOrders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_paymentIntentId_paymentIntents_id_fk" FOREIGN KEY ("paymentIntentId") REFERENCES "public"."paymentIntents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_feeChargeId_feeCharges_id_fk" FOREIGN KEY ("feeChargeId") REFERENCES "public"."feeCharges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_receivedByUserId_users_id_fk" FOREIGN KEY ("receivedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedByUserId_users_id_fk" FOREIGN KEY ("recordedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffProfiles" ADD CONSTRAINT "staffProfiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffProfiles" ADD CONSTRAINT "staffProfiles_personId_people_id_fk" FOREIGN KEY ("personId") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storeOrders" ADD CONSTRAINT "storeOrders_customerId_customers_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storeOrders" ADD CONSTRAINT "storeOrders_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storeOrders" ADD CONSTRAINT "storeOrders_couponId_coupons_id_fk" FOREIGN KEY ("couponId") REFERENCES "public"."coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studentProfiles" ADD CONSTRAINT "studentProfiles_personId_people_id_fk" FOREIGN KEY ("personId") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studentProfiles" ADD CONSTRAINT "studentProfiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studentProfiles" ADD CONSTRAINT "studentProfiles_applicationId_applications_id_fk" FOREIGN KEY ("applicationId") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_personId_people_id_fk" FOREIGN KEY ("personId") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_documents_application_idx" ON "applicationDocuments" USING btree ("applicationId");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "applications_course_idx" ON "applications" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "applications_person_idx" ON "applications" USING btree ("personId");--> statement-breakpoint
CREATE INDEX "applications_created_idx" ON "applications" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "appointments_status_idx" ON "appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "appointments_starts_idx" ON "appointments" USING btree ("startsAt");--> statement-breakpoint
CREATE INDEX "assessment_results_student_idx" ON "assessmentResults" USING btree ("studentId");--> statement-breakpoint
CREATE INDEX "assessments_course_idx" ON "assessments" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "assessments_module_idx" ON "assessments" USING btree ("moduleId");--> statement-breakpoint
CREATE INDEX "attendance_date_idx" ON "attendanceRecords" USING btree ("classDate");--> statement-breakpoint
CREATE INDEX "attendance_status_idx" ON "attendanceRecords" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cart_items_cart_idx" ON "cartItems" USING btree ("cartId");--> statement-breakpoint
CREATE INDEX "carts_status_idx" ON "carts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clinic_services_active_idx" ON "clinicServices" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "courses_active_idx" ON "courses" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "enrollments_student_idx" ON "enrollments" USING btree ("studentId");--> statement-breakpoint
CREATE INDEX "enrollments_course_idx" ON "enrollments" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "enrollments_status_idx" ON "enrollments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("expenseDate");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "expenses_approval_idx" ON "expenses" USING btree ("approvalStatus");--> statement-breakpoint
CREATE INDEX "fee_charges_student_idx" ON "feeCharges" USING btree ("studentId");--> statement-breakpoint
CREATE INDEX "fee_charges_status_idx" ON "feeCharges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fee_charges_due_idx" ON "feeCharges" USING btree ("dueDate");--> statement-breakpoint
CREATE INDEX "intakes_course_idx" ON "intakes" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "intakes_status_idx" ON "intakes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inventory_items_sellable_idx" ON "inventoryItems" USING btree ("isSellable","isActive");--> statement-breakpoint
CREATE INDEX "inventory_items_category_idx" ON "inventoryItems" USING btree ("categoryId");--> statement-breakpoint
CREATE INDEX "inventory_items_name_idx" ON "inventoryItems" USING btree ("name");--> statement-breakpoint
CREATE INDEX "inventory_movements_item_idx" ON "inventoryMovements" USING btree ("inventoryItemId");--> statement-breakpoint
CREATE INDEX "inventory_movements_created_idx" ON "inventoryMovements" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "inventory_movements_reference_idx" ON "inventoryMovements" USING btree ("referenceType","referenceId");--> statement-breakpoint
CREATE INDEX "media_files_purpose_idx" ON "mediaFiles" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "orderItems" USING btree ("orderId");--> statement-breakpoint
CREATE INDEX "order_items_item_idx" ON "orderItems" USING btree ("inventoryItemId");--> statement-breakpoint
CREATE INDEX "payment_plans_student_idx" ON "paymentPlans" USING btree ("studentId");--> statement-breakpoint
CREATE INDEX "payments_student_idx" ON "payments" USING btree ("studentId");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("storeOrderId");--> statement-breakpoint
CREATE INDEX "payments_paid_at_idx" ON "payments" USING btree ("paidAt");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staff_profiles_status_idx" ON "staffProfiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "store_orders_customer_idx" ON "storeOrders" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "store_orders_payment_status_idx" ON "storeOrders" USING btree ("paymentStatus");--> statement-breakpoint
CREATE INDEX "store_orders_fulfillment_status_idx" ON "storeOrders" USING btree ("fulfillmentStatus");--> statement-breakpoint
CREATE INDEX "store_orders_created_idx" ON "storeOrders" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "student_profiles_status_idx" ON "studentProfiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "student_profiles_person_idx" ON "studentProfiles" USING btree ("personId");--> statement-breakpoint
CREATE INDEX "student_profiles_created_idx" ON "studentProfiles" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "users_person_idx" ON "users" USING btree ("personId");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
ALTER TABLE "assessmentResults" ADD CONSTRAINT "assessment_result_unique" UNIQUE("assessmentId","studentId");--> statement-breakpoint
ALTER TABLE "attendanceRecords" ADD CONSTRAINT "attendance_enrollment_date_unique" UNIQUE("enrollmentId","classDate");--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollment_student_course_intake_unique" UNIQUE("studentId","courseId","intakeId");--> statement-breakpoint
ALTER TABLE "inventoryItems" ADD CONSTRAINT "inventoryItems_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_transactionReference_unique" UNIQUE("transactionReference");--> statement-breakpoint
ALTER TABLE "staffProfiles" ADD CONSTRAINT "staffProfiles_staffNumber_unique" UNIQUE("staffNumber");