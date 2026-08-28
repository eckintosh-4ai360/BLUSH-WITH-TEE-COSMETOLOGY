ALTER TABLE "applications" ALTER COLUMN "status" SET DEFAULT 'submitted';--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "toiletries" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "productFee" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "category" varchar(64);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "hometown" varchar(160);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "age" integer;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "maritalStatus" varchar(32);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "emergencyRelationship" varchar(80);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "instagram" varchar(120);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "tiktok" varchar(120);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "otherSocialMedia" varchar(160);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "educationalLevel" varchar(120);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "paymentPlan" varchar(80);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "duration" varchar(80);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "startDate" date;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "guardianName" varchar(160);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "guardianAddress" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "guardianPhone" varchar(40);--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "signatureData" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "agreedToTerms" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "ceoEndorsed" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "ceoEndorsementDate" timestamp;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "ceoEndorsementSignature" varchar(160);