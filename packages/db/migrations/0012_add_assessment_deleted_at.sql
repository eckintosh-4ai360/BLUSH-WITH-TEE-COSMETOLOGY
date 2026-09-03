--> Removing an assessment is soft, like every other removal in this schema.
--> `assessmentResults` cascades from `assessmentId`, so a hard delete would
--> take every mark recorded against the assessment with it.
ALTER TABLE "assessments" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint

--> The catalogue, the mark sheets and the weighted grade all filter on this,
--> so it is read on every one of those queries.
CREATE INDEX "assessments_deleted_idx" ON "assessments" USING btree ("deletedAt");
