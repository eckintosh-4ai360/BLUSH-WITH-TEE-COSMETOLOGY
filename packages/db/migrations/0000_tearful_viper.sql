CREATE TYPE "public"."application_document_type" AS ENUM('transcript', 'government_id', 'passport_photo', 'certificate', 'other');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('draft', 'submitted', 'under_review', 'more_information', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('requested', 'confirmed', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."assessment_type" AS ENUM('theory', 'practical', 'project', 'exam');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'late', 'absent', 'excused');--> statement-breakpoint
CREATE TYPE "public"."cart_status" AS ENUM('active', 'converted', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'paused', 'completed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('rent', 'utilities', 'salaries', 'transport', 'equipment', 'beauty_products', 'maintenance', 'marketing', 'stationery', 'cleaning', 'other');--> statement-breakpoint
CREATE TYPE "public"."fee_charge_status" AS ENUM('open', 'partially_paid', 'paid', 'waived');--> statement-breakpoint
CREATE TYPE "public"."fee_type" AS ENUM('tuition', 'registration', 'materials', 'exam', 'certification', 'other');--> statement-breakpoint
CREATE TYPE "public"."intake_status" AS ENUM('open', 'closed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('received', 'retail_sale', 'classroom_use', 'adjustment', 'damaged', 'return');--> statement-breakpoint
CREATE TYPE "public"."media_purpose" AS ENUM('brochure', 'gallery', 'product', 'application', 'receipt', 'profile', 'other');--> statement-breakpoint
CREATE TYPE "public"."order_fulfillment_status" AS ENUM('new', 'confirmed', 'processing', 'ready', 'shipped', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_payment_status" AS ENUM('pending', 'paid', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'mobile_money', 'bank', 'card', 'online');--> statement-breakpoint
CREATE TYPE "public"."payment_plan_status" AS ENUM('active', 'completed', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'completed', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."staff_status" AS ENUM('active', 'inactive', 'on_leave');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'suspended', 'completed', 'graduated', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'student', 'staff', 'admin');--> statement-breakpoint
CREATE TABLE "applicationDocuments" (
	"id" serial PRIMARY KEY NOT NULL,
	"applicationId" integer NOT NULL,
	"documentType" "application_document_type" NOT NULL,
	"storageKey" varchar(512) NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"mimeType" varchar(120) NOT NULL,
	"sizeBytes" integer NOT NULL,
	"uploadedByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" varchar(32) NOT NULL,
	"userId" integer,
	"fullName" varchar(160) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(40) NOT NULL,
	"whatsapp" varchar(40),
	"birthDate" date,
	"gender" varchar(32),
	"address" text,
	"emergencyContact" varchar(180),
	"education" text,
	"courseId" integer NOT NULL,
	"intakeId" integer,
	"statement" text,
	"status" "application_status" DEFAULT 'draft' NOT NULL,
	"decisionNote" text,
	"reviewedByUserId" integer,
	"submittedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "applications_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" varchar(40) NOT NULL,
	"serviceId" integer NOT NULL,
	"customerName" varchar(160) NOT NULL,
	"customerEmail" varchar(320) NOT NULL,
	"customerPhone" varchar(40) NOT NULL,
	"startsAt" timestamp NOT NULL,
	"note" text,
	"status" "appointment_status" DEFAULT 'requested' NOT NULL,
	"assignedStaffUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "assessmentResults" (
	"id" serial PRIMARY KEY NOT NULL,
	"assessmentId" integer NOT NULL,
	"studentId" integer NOT NULL,
	"score" numeric(6, 2) NOT NULL,
	"grade" varchar(8),
	"instructorComment" text,
	"gradedByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"courseId" integer NOT NULL,
	"title" varchar(180) NOT NULL,
	"assessmentType" "assessment_type" NOT NULL,
	"totalScore" integer NOT NULL,
	"dueDate" date,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendanceRecords" (
	"id" serial PRIMARY KEY NOT NULL,
	"enrollmentId" integer NOT NULL,
	"classDate" date NOT NULL,
	"status" "attendance_status" NOT NULL,
	"recordedByUserId" integer,
	"note" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cartItems" (
	"id" serial PRIMARY KEY NOT NULL,
	"cartId" integer NOT NULL,
	"inventoryItemId" integer NOT NULL,
	"quantity" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"sessionToken" varchar(96),
	"status" "cart_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "carts_sessionToken_unique" UNIQUE("sessionToken")
);
--> statement-breakpoint
CREATE TABLE "clinicServices" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"durationMinutes" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"title" varchar(160) NOT NULL,
	"summary" text NOT NULL,
	"description" text NOT NULL,
	"durationWeeks" integer NOT NULL,
	"tuition" numeric(10, 2) NOT NULL,
	"schedule" varchar(160),
	"certification" varchar(160),
	"requirements" text,
	"isFeatured" boolean DEFAULT false NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "courses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"courseId" integer NOT NULL,
	"intakeId" integer,
	"enrolledAt" timestamp DEFAULT now() NOT NULL,
	"expectedCompletionDate" date,
	"progressPercent" integer DEFAULT 0 NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(180) NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"expenseDate" date NOT NULL,
	"vendor" varchar(160),
	"paymentMethod" "payment_method" NOT NULL,
	"receiptKey" varchar(512),
	"note" text,
	"recordedByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feeCharges" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"enrollmentId" integer,
	"feeType" "fee_type" NOT NULL,
	"description" varchar(255) NOT NULL,
	"amountDue" numeric(10, 2) NOT NULL,
	"dueDate" date,
	"status" "fee_charge_status" DEFAULT 'open' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intakes" (
	"id" serial PRIMARY KEY NOT NULL,
	"courseId" integer NOT NULL,
	"title" varchar(120) NOT NULL,
	"startDate" date NOT NULL,
	"applicationDeadline" date,
	"capacity" integer NOT NULL,
	"status" "intake_status" DEFAULT 'open' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventoryItems" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku" varchar(64) NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text,
	"category" varchar(80) NOT NULL,
	"imageKey" varchar(512),
	"quantityOnHand" integer DEFAULT 0 NOT NULL,
	"reorderLevel" integer DEFAULT 0 NOT NULL,
	"unitCost" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"sellingPrice" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"isSellable" boolean DEFAULT false NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventoryItems_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "inventoryMovements" (
	"id" serial PRIMARY KEY NOT NULL,
	"inventoryItemId" integer NOT NULL,
	"movementType" "inventory_movement_type" NOT NULL,
	"quantityDelta" integer NOT NULL,
	"referenceType" varchar(64),
	"referenceId" integer,
	"note" text,
	"performedByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mediaFiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerUserId" integer,
	"purpose" "media_purpose" NOT NULL,
	"storageKey" varchar(512) NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"mimeType" varchar(120) NOT NULL,
	"sizeBytes" integer NOT NULL,
	"altText" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orderItems" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderId" integer NOT NULL,
	"inventoryItemId" integer NOT NULL,
	"itemName" varchar(180) NOT NULL,
	"unitPrice" numeric(10, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"lineTotal" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paymentPlans" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"title" varchar(180) NOT NULL,
	"totalAmount" numeric(10, 2) NOT NULL,
	"installmentAmount" numeric(10, 2) NOT NULL,
	"nextDueDate" date,
	"status" "payment_plan_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" varchar(64) NOT NULL,
	"studentId" integer,
	"feeChargeId" integer,
	"storeOrderId" integer,
	"amount" numeric(10, 2) NOT NULL,
	"paymentMethod" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'completed' NOT NULL,
	"transactionReference" varchar(120),
	"recordedByUserId" integer,
	"paidAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "staffProfiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"position" varchar(120) NOT NULL,
	"phone" varchar(40),
	"employmentDate" date,
	"status" "staff_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staffProfiles_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "storeOrders" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderNumber" varchar(40) NOT NULL,
	"userId" integer,
	"customerName" varchar(160) NOT NULL,
	"customerEmail" varchar(320) NOT NULL,
	"customerPhone" varchar(40) NOT NULL,
	"deliveryAddress" text,
	"subtotal" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"paymentStatus" "order_payment_status" DEFAULT 'pending' NOT NULL,
	"fulfillmentStatus" "order_fulfillment_status" DEFAULT 'new' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "storeOrders_orderNumber_unique" UNIQUE("orderNumber")
);
--> statement-breakpoint
CREATE TABLE "studentProfiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"applicationId" integer,
	"studentNumber" varchar(40) NOT NULL,
	"fullName" varchar(160) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(40) NOT NULL,
	"profileImageKey" varchar(512),
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "studentProfiles_userId_unique" UNIQUE("userId"),
	CONSTRAINT "studentProfiles_applicationId_unique" UNIQUE("applicationId"),
	CONSTRAINT "studentProfiles_studentNumber_unique" UNIQUE("studentNumber")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
