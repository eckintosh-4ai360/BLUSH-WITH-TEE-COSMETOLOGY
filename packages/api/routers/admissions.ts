import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { applicationDocuments, applications, courses } from "@blush/db/schema";
import { storagePut } from "@blush/storage";
import { dbOrThrow } from "../dbOrThrow";
import { buildReference, safeFileName, validateDocumentUpload } from "../platform.utils";
import { publicProcedure, router } from "../trpc";

const applicationInput = z.object({
  fullName: z.string().min(2).max(160),
  email: z.string().email(),
  phone: z.string().min(7).max(40),
  whatsapp: z.string().max(40).optional(),
  birthDate: z.coerce.date().optional(),
  gender: z.string().max(32).optional(),
  address: z.string().max(1500).optional(),
  emergencyContact: z.string().max(180).optional(),
  education: z.string().max(1800).optional(),
  courseId: z.number().int().positive(),
  statement: z.string().max(3000).optional(),
});

export const admissionsRouter = router({
  submit: publicProcedure.input(applicationInput).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const [course] = await db.select().from(courses).where(and(eq(courses.id, input.courseId), eq(courses.isActive, true))).limit(1);
    if (!course) throw new TRPCError({ code: "NOT_FOUND", message: "The selected program is unavailable." });

    const reference = buildReference("APP");
    const inserted = await db.insert(applications).values({
      reference,
      userId: ctx.user?.id,
      fullName: input.fullName,
      email: input.email.toLowerCase(),
      phone: input.phone,
      whatsapp: input.whatsapp,
      birthDate: input.birthDate,
      gender: input.gender,
      address: input.address,
      emergencyContact: input.emergencyContact,
      education: input.education,
      courseId: input.courseId,
      statement: input.statement,
      status: "submitted",
      submittedAt: new Date(),
    }).$returningId();

    return { applicationId: inserted[0]?.id, reference };
  }),
  uploadDocument: publicProcedure.input(z.object({
    reference: z.string().min(6).max(32),
    email: z.string().email(),
    documentType: z.enum(["transcript", "government_id", "passport_photo", "certificate", "other"]),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(3).max(120),
    base64Data: z.string().min(8),
  })).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const [application] = await db.select().from(applications).where(and(
      eq(applications.reference, input.reference),
      eq(applications.email, input.email.toLowerCase()),
    )).limit(1);
    if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Application could not be verified." });

    let buffer: Buffer;
    try {
      buffer = validateDocumentUpload(input.mimeType, input.base64Data);
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid document." });
    }

    const storageKey = `applications/${application.id}/${Date.now()}-${safeFileName(input.fileName)}`;
    const stored = await storagePut(storageKey, buffer, input.mimeType);
    const inserted = await db.insert(applicationDocuments).values({
      applicationId: application.id,
      documentType: input.documentType,
      storageKey: stored.key,
      fileName: safeFileName(input.fileName),
      mimeType: input.mimeType,
      sizeBytes: buffer.length,
      uploadedByUserId: ctx.user?.id,
    }).$returningId();
    return { documentId: inserted[0]?.id, url: stored.url };
  }),
  lookup: publicProcedure.input(z.object({ reference: z.string().min(6), email: z.string().email() })).query(async ({ input }) => {
    const db = await dbOrThrow();
    const rows = await db.select({
      reference: applications.reference,
      status: applications.status,
      createdAt: applications.createdAt,
      submittedAt: applications.submittedAt,
      decisionNote: applications.decisionNote,
      courseTitle: courses.title,
    }).from(applications).innerJoin(courses, eq(applications.courseId, courses.id)).where(and(
      eq(applications.reference, input.reference),
      eq(applications.email, input.email.toLowerCase()),
    )).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "No application matches that reference and email." });
    return rows[0];
  }),
});
