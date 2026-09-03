--> The day's services as they are carried out and paid for. Distinct from
--> `appointments`, which is a booking made in advance and carries no money.
CREATE TABLE "serviceSales" (
  "id" serial PRIMARY KEY NOT NULL,
  "serviceDate" date NOT NULL,
  "serviceId" integer,
  "serviceName" varchar(160) NOT NULL,
  "clientName" varchar(160) NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "paymentMethod" "payment_method" NOT NULL,
  "workerUserId" integer,
  "workerName" varchar(160) NOT NULL,
  "note" text,
  "revenueTransactionId" integer,
  "recordedByUserId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  "deletedAt" timestamp
);--> statement-breakpoint

--> The catalogue row and the staff account may both go away; the log of what
--> was done and who did it must not go with them, so these null rather than
--> cascade. The names are snapshotted on the row for the same reason.
ALTER TABLE "serviceSales" ADD CONSTRAINT "serviceSales_serviceId_clinicServices_id_fk"
  FOREIGN KEY ("serviceId") REFERENCES "public"."clinicServices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serviceSales" ADD CONSTRAINT "serviceSales_workerUserId_users_id_fk"
  FOREIGN KEY ("workerUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serviceSales" ADD CONSTRAINT "serviceSales_recordedByUserId_users_id_fk"
  FOREIGN KEY ("recordedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "service_sales_date_idx" ON "serviceSales" USING btree ("serviceDate");--> statement-breakpoint
CREATE INDEX "service_sales_worker_idx" ON "serviceSales" USING btree ("workerUserId");--> statement-breakpoint
CREATE INDEX "service_sales_deleted_idx" ON "serviceSales" USING btree ("deletedAt");
