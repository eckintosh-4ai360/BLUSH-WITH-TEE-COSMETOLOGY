--> Allow applicants and admitted students without an email address to be registered.
ALTER TABLE "applications" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "studentProfiles" ALTER COLUMN "email" DROP NOT NULL;
