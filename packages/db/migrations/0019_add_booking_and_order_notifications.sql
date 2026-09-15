ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'appointment_requested';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'appointment_confirmed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'appointment_cancelled';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'order_placed';
