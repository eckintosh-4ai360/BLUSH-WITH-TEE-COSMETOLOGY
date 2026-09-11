ALTER TABLE "appointments" ALTER COLUMN "customerEmail" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clinicServices" ADD COLUMN "isBookable" boolean DEFAULT true NOT NULL;
