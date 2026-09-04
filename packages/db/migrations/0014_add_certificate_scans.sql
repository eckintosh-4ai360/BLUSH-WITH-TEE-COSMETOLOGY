--> Scanned copies of the certificate the school actually handed over: the
--> signed and stamped paper, and the slip the student signed on collection.
--> Several per certificate, so the record can hold front, back and receipt.
CREATE TABLE "certificateScans" (
  "id" serial PRIMARY KEY NOT NULL,
  "certificateId" integer NOT NULL,
  "storageKey" varchar(512) NOT NULL,
  "fileName" varchar(255) NOT NULL,
  "mimeType" varchar(120) NOT NULL,
  "sizeBytes" integer NOT NULL,
  "note" varchar(255),
  "uploadedByUserId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

--> A scan is meaningless without the certificate it copies, so it goes with
--> it. The staff account that filed it may leave; the scan must not.
ALTER TABLE "certificateScans" ADD CONSTRAINT "certificateScans_certificateId_certificates_id_fk"
  FOREIGN KEY ("certificateId") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificateScans" ADD CONSTRAINT "certificateScans_uploadedByUserId_users_id_fk"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "certificate_scans_certificate_idx" ON "certificateScans" USING btree ("certificateId");
