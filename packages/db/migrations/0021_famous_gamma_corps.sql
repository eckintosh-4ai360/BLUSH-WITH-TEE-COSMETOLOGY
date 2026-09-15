CREATE TYPE "public"."revamping_payment_method" AS ENUM('cash', 'mobile_money', 'bank', 'card', 'memo');--> statement-breakpoint
CREATE TABLE "revampingRecords" (
	"id" serial PRIMARY KEY NOT NULL,
	"revampDate" date NOT NULL,
	"clientName" varchar(160) NOT NULL,
	"quantity" integer NOT NULL,
	"style" varchar(160) NOT NULL,
	"totalAmount" numeric(12, 2) NOT NULL,
	"amountPaid" numeric(12, 2) NOT NULL,
	"amountLeft" numeric(12, 2) NOT NULL,
	"paymentMethod" "revamping_payment_method" NOT NULL,
	"recordedByUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "revampingRecords" ADD CONSTRAINT "revampingRecords_recordedByUserId_users_id_fk" FOREIGN KEY ("recordedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revamping_date_idx" ON "revampingRecords" USING btree ("revampDate");--> statement-breakpoint
CREATE INDEX "revamping_deleted_idx" ON "revampingRecords" USING btree ("deletedAt");