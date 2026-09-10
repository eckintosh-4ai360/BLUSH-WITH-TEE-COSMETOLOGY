import { desc, eq, like, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { certificates, systemSettings } from "@blush/db/schema";
import type { Database, DbExecutor } from "../dbOrThrow";
import { isUniqueViolation } from "./dbErrors";
import { gradeForPercent, type GradeBand } from "./grading";

// Certificate numbering and verification tokens.

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

// Unguessable token behind the public verification URL.
export function newVerificationToken(): string {
  return randomBytes(24).toString("base64url");
}

// Next number in this year's sequence, e.
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

// Issues one certificate, retrying if another issue took the number first.
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
      // Someone else took this number; recompute and try again.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  throw new TRPCError({
    code: "CONFLICT",
    message: "A certificate number could not be reserved. Please try again.",
  });
}

// Grade for a completed course, from the weighted mean of its assessments.
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

// Certificate count by status, used on the dashboard and reports.
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
