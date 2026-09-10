import { eq } from "drizzle-orm";
import { systemSettings } from "@blush/db/schema";
import type { DbExecutor } from "../dbOrThrow";

// The grade bands the school marks against.

export type GradeBand = { grade: string; min: number };

// Used until an owner saves their own under academic.
export const DEFAULT_BANDS: GradeBand[] = [
  { grade: "A", min: 80 },
  { grade: "B", min: 70 },
  { grade: "C", min: 60 },
  { grade: "D", min: 50 },
  { grade: "F", min: 0 },
];

export const DEFAULT_PASS_MARK = 50;

export type Grading = { bands: GradeBand[]; passMark: number };

// The band a percentage falls in.
export function gradeForPercent(percent: number, bands: GradeBand[]): string {
  const ordered = [...bands].sort((a, b) => b.min - a.min);
  return ordered.find(band => percent >= band.min)?.grade ?? ordered.at(-1)?.grade ?? "F";
}

// Whether a percentage is a pass, by the school's own mark rather than 50.
export function isPass(percent: number, passMark: number): boolean {
  return percent >= passMark;
}

// Reads the bands, falling back rather than failing.
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

// A score out of a total, as a percentage rounded to two places.
export function toPercent(score: number, totalScore: number): number {
  if (!totalScore) return 0;
  return Math.round((score / totalScore) * 10000) / 100;
}
