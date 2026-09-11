CREATE TYPE "appointment_location" AS ENUM ('salon', 'home');--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "location" "appointment_location" DEFAULT 'salon' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "locationDetails" text;
