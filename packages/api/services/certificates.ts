import { desc, eq, like, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { certificates, systemSettings } from "@blush/db/schema";
import type { Database, DbExecutor } from "../dbOrThrow";
import { gradeForPercent, type GradeBand } from "./grading";

/**
 * Certificate numbering and verification tokens.
 *
 * Two separate identifiers on purpose:
 *
 *   certificateNumber is printed on the certificate and quoted by people. It
 *   is sequential and readable, which also means it is guessable.
 *
 *   verificationToken is what the QR code and verification URL carry. It is
 *   random, so knowing one certificate number tells an attacker nothing about
 *   anybody else's record.
 */

export type CertificateSettings = { prefix: string; signatureName: string; signatureTitle: string };

const DEFAULT_SETTINGS: CertificateSettings = {
  prefix: "COS",
  signatureName: "Principal",
  signatureTitle: "Principal",
};

export async function certificateSettings(db: DbExecutor): Promise<CertificateSettings> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, "certificate.settings"))
    .limit(1);

  const stored = (row?.value ?? {}) as Partial<CertificateSettings>;
  return { ...DEFAULT_SETTINGS, ...stored };
}

/** Unguessable token behind the public verification URL. */
export function newVerificationToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Next number in this year's sequence, e.g. `COS-2026-00124`.
 *
 * Read inside the issuing transaction; the unique constraint on the column is
 * what actually guarantees no two certificates share a number, and the caller
 * retries if two issues race.
 */
export async function nextCertificateNumber(db: DbExecutor, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;

  const [latest] = await db
    .select({ certificateNumber: certificates.certificateNumber })
    .from(certificates)
    .where(like(certificates.certificateNumber, pattern))
    .orderBy(desc(certificates.certificateNumber))
    .limit(1);

  const lastSequence = latest ? Number(latest.certificateNumber.split("-").pop() ?? 0) : 0;
  const next = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;

  return `${prefix}-${year}-${String(next).padStart(5, "0")}`;
}

export type IssueCertificateInput = {
  studentId: number;
  courseId: number;
  enrollmentId?: number | null;
  completionDate: Date;
  finalGrade?: string | null;
  issuedByUserId?: number | null;
};

/**
 * Issues one certificate, retrying if another issue took the number first.
 *
 * The retry loop exists because the number is derived from a read: two
 * concurrent issues can both compute the same next value, and the unique
 * constraint rejects the loser rather than letting a duplicate through (§64).
 */
export async function issueCertificate(
  db: Database,
  input: IssueCertificateInput,
): Promise<{ id: number; certificateNumber: string; verificationToken: string }> {
  const { prefix } = await certificateSettings(db);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const certificateNumber = await nextCertificateNumber(db, prefix);
    const verificationToken = newVerificationToken();

    try {
      const [row] = await db
        .insert(certificates)
        .values({
          certificateNumber,
          verificationToken,
          studentId: input.studentId,
          courseId: input.courseId,
          enrollmentId: input.enrollmentId ?? null,
          completionDate: input.completionDate,
          finalGrade: input.finalGrade ?? null,
          issuedByUserId: input.issuedByUserId ?? null,
        })
        .returning({ id: certificates.id });

      if (row?.id) return { id: row.id, certificateNumber, verificationToken };
    } catch (error) {
      const isDuplicate =
        typeof error === "object" &&
        error !== null &&
        (error as { code?: string }).code === "23505";
      if (!isDuplicate) throw error;
      // Someone else took this number; recompute and try again.
    }
  }

  throw new TRPCError({
    code: "CONFLICT",
    message: "A certificate number could not be reserved. Please try again.",
  });
}

/**
 * Grade for a completed course, from the weighted mean of its assessments.
 *
 * The band lookup is shared with the per-assessment marking in
 * `services/grading.ts`, so a certificate and the result sheet it was worked
 * out from cannot disagree about what a percentage is worth.
 */
export function deriveGrade(
  results: Array<{ score: string | number; totalScore: number; weight?: string | number }>,
  bands: GradeBand[],
): { percent: number; grade: string } | null {
  if (!results.length) return null;

  let weightedScore = 0;
  let weightTotal = 0;

  for (const result of results) {
    if (!result.totalScore) continue;
    const weight = Number(result.weight ?? 1) || 1;
    weightedScore += (Number(result.score) / result.totalScore) * weight;
    weightTotal += weight;
  }

  if (!weightTotal) return null;

  const percent = Math.round((weightedScore / weightTotal) * 10000) / 100;
  return { percent, grade: gradeForPercent(percent, bands) };
}

/** Certificate count by status, used on the dashboard and reports. */
export async function certificateCounts(db: DbExecutor) {
  const rows = await db
    .select({ status: certificates.status, total: sql<number>`count(*)::int` })
    .from(certificates)
    .groupBy(certificates.status);

  const byStatus = new Map(rows.map(row => [row.status, Number(row.total)]));
  return {
    issued: byStatus.get("issued") ?? 0,
    revoked: byStatus.get("revoked") ?? 0,
  };
}
