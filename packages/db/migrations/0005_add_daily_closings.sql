CREATE TABLE "dailyClosings" (
	"id" serial PRIMARY KEY NOT NULL,
	"closingDate" date NOT NULL,
	"customersServed" integer DEFAULT 0 NOT NULL,
	"cashSales" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"momoSales" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"cardSales" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"bankSales" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"onlineSales" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"totalSales" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"totalExpenses" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"cashExpenses" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"expectedCash" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"countedCash" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"discrepancy" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"notes" text,
	"closedByUserId" integer,
	"closedAt" timestamp DEFAULT now() NOT NULL,
	"reopenedAt" timestamp,
	"reopenedByUserId" integer,
	"reopenReason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dailyClosings_closingDate_unique" UNIQUE("closingDate")
);
--> statement-breakpoint
ALTER TABLE "dailyClosings" ADD CONSTRAINT "dailyClosings_closedByUserId_users_id_fk" FOREIGN KEY ("closedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dailyClosings" ADD CONSTRAINT "dailyClosings_reopenedByUserId_users_id_fk" FOREIGN KEY ("reopenedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_closings_date_idx" ON "dailyClosings" USING btree ("closingDate");