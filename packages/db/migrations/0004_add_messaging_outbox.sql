ALTER TABLE "notificationDeliveries" ALTER COLUMN "notificationId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notificationDeliveries" ADD COLUMN "type" "notification_type";--> statement-breakpoint
ALTER TABLE "notificationDeliveries" ADD COLUMN "recipientName" varchar(160);--> statement-breakpoint
ALTER TABLE "notificationDeliveries" ADD COLUMN "subject" varchar(255);--> statement-breakpoint
ALTER TABLE "notificationDeliveries" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "notificationDeliveries" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notificationDeliveries" ADD COLUMN "lastAttemptAt" timestamp;--> statement-breakpoint
CREATE INDEX "notification_deliveries_pending_idx" ON "notificationDeliveries" USING btree ("status","createdAt");