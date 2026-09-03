import { eq } from "drizzle-orm";
import { systemSettings } from "@blush/db/schema";
import type { DbExecutor } from "../dbOrThrow";

/**
 * The grade bands the school marks against.
 *
 * One place, because a grade has to mean the same thing wherever it is
 * printed. A certificate says "B" for a course, a result sheet says "B" for a
 * practical, and both are the same band table read from the same setting - if
 * they were not, a student could hold a certificate that disagrees with the
 * marks it was worked out from.
 */

export type GradeBand = { grade: string; min: number };

/** Used until an owner saves their own under `academic.grading`. */
export const DEFAULT_BANDS: GradeBand[] = [
  { grade: "A", min: 80 },
  { grade: "B", min: 70 },
  { grade: "C", min: 60 },
  { grade: "D", min: 50 },
  { grade: "F", min: 0 },
];

export const DEFAULT_PASS_MARK = 50;

export type Grading = { bands: GradeBand[]; passMark: number };

/**
 * The band a percentage falls in.
 *
 * Highest threshold first, so overlapping or unsorted bands still resolve to
 * the best one earned rather than whichever happened to be listed first. A
 * percentage below every threshold takes the lowest band - there is always a
 * grade, even if it is the failing one.
 */
export function gradeForPercent(percent: number, bands: GradeBand[]): string {
  const ordered = [...bands].sort((a, b) => b.min - a.min);
  return ordered.find(band => percent >= band.min)?.grade ?? ordered.at(-1)?.grade ?? "F";
}

/** Whether a percentage is a pass, by the school's own mark rather than 50. */
export function isPass(percent: number, passMark: number): boolean {
  return percent >= passMark;
}

/**
 * Reads the bands, falling back rather than failing.
 *
 * A missing or half-written setting must not stop marks being entered: an
 * unreadable band table means the defaults are used, not that the school
 * cannot grade anybody today.
 */
export async function readGrading(db: DbExecutor): Promise<Grading> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, "academic.grading"))
    .limit(1);

  const stored = (row?.value ?? {}) as { bands?: unknown; passMark?: unknown };

  const bands = Array.isArray(stored.bands)
    ? stored.bands.filter(
        (band): band is GradeBand =>
          typeof band === "object" &&
          band !== null &&
          typeof (band as GradeBand).grade === "string" &&
          Number.isFinite((band as GradeBand).min),
      )
    : [];

  return {
    bands: bands.length ? bands : DEFAULT_BANDS,
    passMark: Number.isFinite(stored.passMark) ? Number(stored.passMark) : DEFAULT_PASS_MARK,
  };
}

/** A score out of a total, as a percentage rounded to two places. */
export function toPercent(score: number, totalScore: number): number {
  if (!totalScore) return 0;
  return Math.round((score / totalScore) * 10000) / 100;
}
