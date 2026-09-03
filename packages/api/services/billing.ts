import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  courses,
  enrollments,
  feeCharges,
  feeStructures,
  paymentAllocations,
  payments,
  studentProfiles,
} from "@blush/db/schema";
import type { DbExecutor } from "../dbOrThrow";
import { allocatePayment } from "./fees";
import { toAmountString, toMinor } from "./money";

/**
 * Turning what a programme costs into what a student owes.
 *
 * Fee structures were configuration nothing ever read: `raiseChargesFromStructure`
 * existed but had no callers, so enrolling a student raised a single hardcoded
 * `0.00` "Program tuition" row and nothing else. Every downstream figure was
 * therefore correct arithmetic over an empty account - the payment dialog said
 * GHS 0.00 billed, a mandatory registration fee never appeared, and the arrears
 * run found nobody in arrears because nobody had been billed anything.
 *
 * This is the missing step. A live enrolment is billed:
 *
 *   The programme's tuition, taken from a `tuition` fee structure when one is
 *   configured for that course, and otherwise from `courses.tuition` - the
 *   price the programme is advertised at. The fallback is what makes a school
 *   that has configured nothing still bill correctly.
 *
 *   Every other applicable fee structure: those naming the course, and those
 *   naming no course at all, which is how "all programmes" is expressed.
 *
 * Idempotent throughout. It is called when an enrolment is created and again,
 * by hand, whenever the price list changes, so running twice must never bill
 * twice.
 */

export type FeeType =
  | "tuition"
  | "registration"
  | "materials"
  | "exam"
  | "certification"
  | "other";

export type StructureRow = {
  id: number;
  feeType: FeeType;
  label: string;
  amount: string;
  dueOffsetDays: number;
};

/** A charge already on the account, as far as planning is concerned. */
export type ExistingCharge = {
  id: number;
  feeStructureId: number | null;
  feeType: string;
  amountDue: string;
};

export type PlannedCharge = {
  feeStructureId: number | null;
  feeType: FeeType;
  description: string;
  amount: string;
  dueOffsetDays: number;
};

/**
 * A charge that is really a placeholder: the zero-amount "Program tuition" row
 * the old approval path inserted. It is filled in rather than joined by a
 * second tuition charge, so an account that was already wrong is corrected
 * instead of doubled.
 */
export type RepairedCharge = { id: number; amount: string; description: string };

export type ChargePlan = { create: PlannedCharge[]; repair: RepairedCharge[] };

/**
 * What is still to be billed, given what the price list says and what the
 * account already holds.
 *
 * Pure, because this is the rule that decides what a student is asked to pay
 * and it should be readable and testable without a database behind it.
 */
export function planCharges(input: {
  structures: StructureRow[];
  /** The programme's advertised price, used when no tuition structure applies. */
  courseTuition: string | number | null;
  courseTitle: string;
  existing: ExistingCharge[];
}): ChargePlan {
  const create: PlannedCharge[] = [];
  const repair: RepairedCharge[] = [];

  // Anything already raised from a given structure is not raised again.
  const billedStructureIds = new Set(
    input.existing
      .map(charge => charge.feeStructureId)
      .filter((id): id is number => id !== null),
  );

  for (const structure of input.structures) {
    if (billedStructureIds.has(structure.id)) continue;
    create.push({
      feeStructureId: structure.id,
      feeType: structure.feeType,
      description: structure.label,
      amount: structure.amount,
      dueOffsetDays: structure.dueOffsetDays,
    });
  }

  // Tuition only falls back to the programme price when the price list does
  // not already cover it - otherwise a configured tuition fee and the course's
  // own price would both be billed.
  const tuitionConfigured =
    input.structures.some(structure => structure.feeType === "tuition") ||
    input.existing.some(
      charge => charge.feeType === "tuition" && charge.feeStructureId !== null,
    );

  if (tuitionConfigured) return { create, repair };

  const tuitionMinor = toMinor(input.courseTuition ?? 0);
  if (tuitionMinor <= 0) return { create, repair };

  const description = `${input.courseTitle} tuition`;
  const ownTuition = input.existing.filter(
    charge => charge.feeType === "tuition" && charge.feeStructureId === null,
  );

  // A real tuition charge is already there; leave it alone. Correcting an
  // amount somebody may have part-paid is an edit, not a sync.
  if (ownTuition.some(charge => toMinor(charge.amountDue) > 0)) return { create, repair };

  const placeholder = ownTuition.find(charge => toMinor(charge.amountDue) === 0);
  if (placeholder) {
    repair.push({
      id: placeholder.id,
      amount: toAmountString(tuitionMinor),
      description,
    });
    return { create, repair };
  }

  create.push({
    feeStructureId: null,
    feeType: "tuition",
    description,
    amount: toAmountString(tuitionMinor),
    dueOffsetDays: 0,
  });

  return { create, repair };
}

/** `dueOffsetDays` after `base`, as a plain calendar date. */
function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * The price list entries that apply to one enrolment.
 *
 * A null `courseId` means every programme and a null `intakeId` means every
 * intake - that is how "applies to all" is written in this table. Only
 * mandatory fees are raised automatically: an optional one is something a
 * student opts into, so billing it to everybody would be the opposite of what
 * the flag means.
 */
export async function applicableStructures(
  db: DbExecutor,
  where: { courseId: number; intakeId: number | null },
): Promise<StructureRow[]> {
  const rows = await db
    .select({
      id: feeStructures.id,
      feeType: feeStructures.feeType,
      label: feeStructures.label,
      amount: feeStructures.amount,
      dueOffsetDays: feeStructures.dueOffsetDays,
    })
    .from(feeStructures)
    .where(
      and(
        eq(feeStructures.isActive, true),
        eq(feeStructures.isMandatory, true),
        or(isNull(feeStructures.courseId), eq(feeStructures.courseId, where.courseId)),
        where.intakeId
          ? or(isNull(feeStructures.intakeId), eq(feeStructures.intakeId, where.intakeId))
          : isNull(feeStructures.intakeId),
      ),
    )
    .orderBy(asc(feeStructures.id));

  return rows as StructureRow[];
}

export type SyncResult = { raised: number; repaired: number; reallocated: number };

/**
 * Brings one student's account in line with the price list.
 *
 * Every live enrolment is billed for whatever it is missing. Completed
 * payments that were taken before the charges existed are then allocated, so
 * the two ways the system counts what has been paid - the payments table and
 * `feeCharges.amountPaid` - do not disagree the moment billing catches up.
 */
export async function syncStudentCharges(
  db: DbExecutor,
  studentId: number,
  createdByUserId?: number | null,
): Promise<SyncResult> {
  const result: SyncResult = { raised: 0, repaired: 0, reallocated: 0 };

  const live = await db
    .select({
      enrollmentId: enrollments.id,
      courseId: enrollments.courseId,
      intakeId: enrollments.intakeId,
      enrolledAt: enrollments.enrolledAt,
      courseTitle: courses.title,
      courseTuition: courses.tuition,
    })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(
      and(
        eq(enrollments.studentId, studentId),
        inArray(enrollments.status, ["active", "paused"]),
      ),
    )
    .orderBy(asc(enrollments.id));

  if (!live.length) return result;

  for (const enrolment of live) {
    const structures = await applicableStructures(db, {
      courseId: enrolment.courseId,
      intakeId: enrolment.intakeId,
    });

    // Charges filed against this enrolment, plus the ones raised before
    // enrolments were recorded on them at all - the legacy placeholder has a
    // null `enrollmentId`, and skipping it would raise a second tuition row.
    const existing = await db
      .select({
        id: feeCharges.id,
        feeStructureId: feeCharges.feeStructureId,
        feeType: feeCharges.feeType,
        amountDue: feeCharges.amountDue,
      })
      .from(feeCharges)
      .where(
        and(
          eq(feeCharges.studentId, studentId),
          or(
            eq(feeCharges.enrollmentId, enrolment.enrollmentId),
            isNull(feeCharges.enrollmentId),
          ),
        ),
      );

    const plan = planCharges({
      structures,
      courseTuition: enrolment.courseTuition,
      courseTitle: enrolment.courseTitle,
      existing,
    });

    for (const fix of plan.repair) {
      await db
        .update(feeCharges)
        .set({
          amountDue: fix.amount,
          description: fix.description,
          enrollmentId: enrolment.enrollmentId,
        })
        .where(eq(feeCharges.id, fix.id));
      result.repaired += 1;
    }

    if (plan.create.length) {
      await db.insert(feeCharges).values(
        plan.create.map(charge => ({
          studentId,
          enrollmentId: enrolment.enrollmentId,
          feeStructureId: charge.feeStructureId,
          feeType: charge.feeType,
          description: charge.description,
          amountDue: charge.amount,
          dueDate: addDays(enrolment.enrolledAt, charge.dueOffsetDays),
          createdByUserId: createdByUserId ?? null,
        })),
      );
      result.raised += plan.create.length;
    }
  }

  result.reallocated = await allocateUnappliedPayments(db, studentId);
  return result;
}

/**
 * Applies money already taken to charges that did not exist when it was taken.
 *
 * Without this a student who paid before being billed shows as fully in
 * arrears on the fee register - which reads the charge rows - while the
 * payments ledger says they paid. Allocation is the only thing allowed to
 * write `feeCharges.amountPaid`, so it is what reconciles them.
 */
async function allocateUnappliedPayments(db: DbExecutor, studentId: number): Promise<number> {
  const taken = await db
    .select({
      id: payments.id,
      amount: payments.amount,
      refunded: payments.refundedAmount,
    })
    .from(payments)
    .where(and(eq(payments.studentId, studentId), eq(payments.status, "completed")))
    .orderBy(asc(payments.id));

  if (!taken.length) return 0;

  // Read separately and joined here rather than as a correlated subquery.
  // Interpolating column helpers inside a raw `sql` subquery renders them
  // unqualified, so `where "paymentId" = "id"` binds `"id"` to the allocation's
  // own id instead of the payment's: the correlation matches nothing, every
  // payment looks unallocated, and the money gets applied a second time.
  // Two plain queries cannot be read the wrong way round.
  const allocatedByPayment = new Map<number, number>();
  const allocated = await db
    .select({
      paymentId: paymentAllocations.paymentId,
      total: sql<string>`coalesce(sum(${paymentAllocations.amount}), 0)`,
    })
    .from(paymentAllocations)
    .where(
      inArray(
        paymentAllocations.paymentId,
        taken.map(payment => payment.id),
      ),
    )
    .groupBy(paymentAllocations.paymentId);

  for (const row of allocated) allocatedByPayment.set(row.paymentId, toMinor(row.total));

  let applied = 0;

  for (const payment of taken) {
    const spareMinor =
      toMinor(payment.amount) -
      toMinor(payment.refunded) -
      (allocatedByPayment.get(payment.id) ?? 0);
    if (spareMinor <= 0) continue;

    const lines = await allocatePayment(db, {
      paymentId: payment.id,
      studentId,
      amountMinor: spareMinor,
    });
    if (lines.length) applied += 1;
  }

  return applied;
}

/**
 * The same, for every student on the register.
 *
 * This is what an administrator runs after changing the price list: adding a
 * fee that applies to all programmes should be able to reach the students
 * already enrolled, and nothing else in the system would ever bill them for it.
 */
export async function syncAllCharges(
  db: DbExecutor,
  createdByUserId?: number | null,
): Promise<SyncResult & { students: number }> {
  const rows = await db
    .selectDistinct({ studentId: enrollments.studentId })
    .from(enrollments)
    .innerJoin(studentProfiles, eq(enrollments.studentId, studentProfiles.id))
    .where(
      and(
        inArray(enrollments.status, ["active", "paused"]),
        isNull(studentProfiles.deletedAt),
      ),
    );

  const total = { raised: 0, repaired: 0, reallocated: 0, students: 0 };

  for (const row of rows) {
    const one = await syncStudentCharges(db, row.studentId, createdByUserId);
    total.raised += one.raised;
    total.repaired += one.repaired;
    total.reallocated += one.reallocated;
    if (one.raised || one.repaired || one.reallocated) total.students += 1;
  }

  return total;
}
