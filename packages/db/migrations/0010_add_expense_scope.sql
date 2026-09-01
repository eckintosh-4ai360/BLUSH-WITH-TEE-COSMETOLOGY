CREATE TYPE "public"."expense_scope" AS ENUM('school', 'store');--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "scope" "expense_scope" DEFAULT 'school' NOT NULL;--> statement-breakpoint
CREATE INDEX "expenses_scope_idx" ON "expenses" USING btree ("scope");
