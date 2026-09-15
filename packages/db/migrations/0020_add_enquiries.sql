CREATE TABLE "enquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(40),
	"subject" varchar(180),
	"message" text NOT NULL,
	"status" varchar(24) DEFAULT 'new' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "enquiries_status_idx" ON "enquiries" ("status");
