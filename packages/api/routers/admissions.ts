import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { applicationDocuments, applications, courses } from "@blush/db/schema";
import { storagePut } from "@blush/storage";
import { dbOrThrow } from "../dbOrThrow";
import {
  MAX_UPLOAD_BASE64_LENGTH,
  buildReference,
  safeFileName,
  validateDocumentUpload,
} from "../platform.utils";
import { announce } from "../services/messaging/announce";
import { flushInBackground } from "../services/messaging/dispatch";
import { router, throttledPublicProcedure } from "../trpc";

/** An applicant fills a form once; a script fills it as fast as it can. */
const submitLimit = throttledPublicProcedure({ bucket: "admissions.submit", limit: 5, windowMs: 60 * 60_000 });
const uploadLimit = throttledPublicProcedure({ bucket: "admissions.upload", limit: 20, windowMs: 60 * 60_000 });
const lookupLimit = throttledPublicProcedure({ bucket: "admissions.lookup", limit: 30, windowMs: 10 * 60_000 });

const applicationInput = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(7).max(40),
  whatsapp: z.string().trim().max(40).optional(),
  birthDate: z.coerce.date().optional(),
  hometown: z.string().trim().max(160).optional(),
  age: z.number().int().min(10).max(120).optional(),
  gender: z.string().trim().max(32).optional(),
  maritalStatus: z.string().trim().max(32).optional(),
  address: z.string().trim().max(1500).optional(),
  emergencyContact: z.string().trim().max(180).optional(),
  emergencyRelationship: z.string().trim().max(80).optional(),
  instagram: z.string().trim().max(120).optional(),
  tiktok: z.string().trim().max(120).optional(),
  otherSocialMedia: z.string().trim().max(160).optional(),
  educationalLevel: z.string().trim().max(120).optional(),
  education: z.string().trim().max(1800).optional(),
  courseId: z.number().int().positive(),
  paymentPlan: z.string().trim().max(80).optional(),
  duration: z.string().trim().max(80).optional(),
  startDate: z.coerce.date().optional(),
  guardianName: z.string().trim().max(160).optional(),
  guardianAddress: z.string().trim().max(1500).optional(),
  guardianPhone: z.string().trim().max(40).optional(),
  signatureData: z.string().trim().max(500).optional(),
  agreedToTerms: z.boolean().default(true),
  statement: z.string().trim().max(3000).optional(),
});

export const admissionsRouter = router({
  submit: submitLimit.input(applicationInput).mutation(async ({ input, ctx }) => {
    const db = await dbOrThrow();
    const [course] = await db
      .select()
      .from(courses)
      .where(and(eq(courses.id, input.courseId), eq(courses.isActive, true)))
      .limit(1);
    if (!course) throw new TRPCError({ code: "NOT_FOUND", message: "The selected program is unavailable." });

    const reference = buildReference("APP");
    const [inserted] = await db
      .insert(applications)
      .values({
        reference,
        userId: ctx.user?.id,
        fullName: input.fullName,
        email: input.email.toLowerCase(),
        phone: input.phone,
        whatsapp: input.whatsapp,
        birthDate: input.birthDate,
        hometown: input.hometown,
        age: input.age,
        gender: input.gender,
        maritalStatus: input.maritalStatus,
        address: input.address,
        emergencyContact: input.emergencyContact,
        emergencyRelationship: input.emergencyRelationship,
        instagram: input.instagram,
        tiktok: input.tiktok,
        otherSocialMedia: input.otherSocialMedia,
        educationalLevel: input.educationalLevel,
        education: input.education,
        courseId: input.courseId,
        paymentPlan: input.paymentPlan,
        duration: input.duration || `${course.durationWeeks} weeks`,
        startDate: input.startDate,
        guardianName: input.guardianName,
        guardianAddress: input.guardianAddress,
        guardianPhone: input.guardianPhone,
        signatureData: input.signatureData,
        agreedToTerms: input.agreedToTerms,
        statement: input.statement,
        status: "submitted",
        submittedAt: new Date(),
      })
      .returning({ id: applications.id });

    // Confirmed to the applicant on the channels the school has switched on.
    // Queued rather than sent here so a provider outage cannot turn a
    // successfully filed application into an error on the form.
    await announce(db, {
      type: "application_submitted",
      recipient: {
        name: input.fullName,
        email: input.email.toLowerCase(),
        phone: input.phone,
        userId: ctx.user?.id ?? null,
      },
      title: "Application received",
      body: `Your application for ${course.title} is with us. Reference ${reference}.`,
      facts: { course: course.title, reference },
      entityType: "application",
      entityId: inserted?.id,
      link: "/portal",
    });
    flushInBackground(db);

    return { applicationId: inserted?.id, reference, courseTitle: course.title };
  }),
  uploadDocument: uploadLimit.input(z.object({
    reference: z.string().min(6).max(32),
    email: z.string().email(),
    documentType: z.enum(["transcript", "government_id", "passport_photo", "certificate", "other"]),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(3).max(120),
    base64Data: z.string().min(8).max(MAX_UPLOAD_BASE64_LENGTH),
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
    }).returning({ id: applicationDocuments.id });
    return { documentId: inserted[0]?.id, url: stored.url };
  }),
  /**
   * An applicant checking on their own application.
   *
   * Public and unauthenticated, so the selected columns are the whole security
   * boundary. What comes back is what the applicant themselves filled in, plus
   * the decision if one has been made - enough for them to print the form they
   * signed, which is the common reason for coming back here.
   *
   * What is deliberately absent is the office side of the record: the CEO
   * endorsement and its signature, who reviewed it, the row id, the linked
   * account. Those are the school's notes on the applicant, not the
   * applicant's own submission, and reference-plus-email is a weak enough key
   * that it should only unlock the latter.
   */
  lookup: lookupLimit.input(z.object({ reference: z.string().min(6), email: z.string().email() })).query(async ({ input }) => {
    const db = await dbOrThrow();
    const rows = await db.select({
      reference: applications.reference,
      status: applications.status,
      createdAt: applications.createdAt,
      submittedAt: applications.submittedAt,
      decisionNote: applications.decisionNote,
      courseTitle: courses.title,

      // Their own answers, so the signed form can be reprinted.
      fullName: applications.fullName,
      email: applications.email,
      phone: applications.phone,
      whatsapp: applications.whatsapp,
      birthDate: applications.birthDate,
      hometown: applications.hometown,
      age: applications.age,
      gender: applications.gender,
      maritalStatus: applications.maritalStatus,
      address: applications.address,
      emergencyContact: applications.emergencyContact,
      emergencyRelationship: applications.emergencyRelationship,
      instagram: applications.instagram,
      tiktok: applications.tiktok,
      otherSocialMedia: applications.otherSocialMedia,
      educationalLevel: applications.educationalLevel,
      education: applications.education,
      paymentPlan: applications.paymentPlan,
      duration: applications.duration,
      startDate: applications.startDate,
      guardianName: applications.guardianName,
      guardianAddress: applications.guardianAddress,
      guardianPhone: applications.guardianPhone,
      signatureData: applications.signatureData,
      agreedToTerms: applications.agreedToTerms,
      statement: applications.statement,
    }).from(applications).innerJoin(courses, eq(applications.courseId, courses.id)).where(and(
      eq(applications.reference, input.reference),
      eq(applications.email, input.email.toLowerCase()),
    )).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "No application matches that reference and email." });
    return rows[0];
  }),
});
