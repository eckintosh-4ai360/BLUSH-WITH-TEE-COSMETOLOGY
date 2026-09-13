CREATE TYPE "public"."staff_department" AS ENUM('school', 'salon', 'shop');--> statement-breakpoint
ALTER TABLE "staffProfiles" ADD COLUMN "department" "staff_department" DEFAULT 'school' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventoryItems" ALTER COLUMN "sku" DROP NOT NULL;
