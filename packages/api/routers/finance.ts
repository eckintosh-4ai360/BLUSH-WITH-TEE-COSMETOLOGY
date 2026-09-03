import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  courses,
  enrollments,
  expenseCategories,
  expenses,
  feeAdjustments,
  feeCharges,
  feeStructures,
  intakes,
  notificationDeliveries,
  payments,
  revenueTransactions,
  studentProfiles,
} from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { buildReference, slugify } from "../platform.utils";
import { recordAudit } from "../services/audit";
import { syncAllCharges } from "../services/billing";
import { isUniqueViolation } from "../services/dbErrors";
import { announce, firstName, schoolName } from "../services/messaging/announce";
import { readMessagingConfig } from "../services/messaging/config";
import { flush, flushInBackground, render } from "../services/messaging/dispatch";
import { describeSmsConfig, normaliseMsisdn, smsSegments } from "../services/messaging/sms";
import { allocatePayment, assertRefundable, studentAccountSummary } from "../services/fees";
import { fromMinor, money, toAmountString, toMinor } from "../services/money";
import { notify, staffRecipients } from "../services/notify";
import { listInputSchema, likePattern, paginate, paginationBounds } from "../services/pagination";
import { recordRevenue, reverseRevenue } from "../services/revenue";
import { permissionProcedure, router } from "../trpc";

const FEE_TYPES = ["tuition", "registration", "materials", "exam", "certification", "other"] as const;
const PAYMENT_METHODS = ["cash", "mobile_money", "bank", "card", "online"] as const;
/** The two halves of the business the school runs its books as. */
const EXPENSE_SCOPES = ["school", "store"] as const;
const EXPENSE_CATEGORIES = [
  "rent",
  "utilities",
  "salaries",
  "transport",
  "equipment",
  "beauty_products",
  "maintenance",
  "marketing",
  "stationery",
  "cleaning",
  "other",
] as const;

const cedis = (value: number) => `GHS ${value.toFixed(2)}`;

/**
 * The `expenseCategories` row an expense should point at.
 *
 * The enum column only knows the eleven categories it was declared with, and
 * "other" is the escape hatch - which on its own tells a reader nothing about
 * what the money went on. A name typed alongside it becomes a real category
 * row, so "Bank charges" is filed under "Bank charges" from then on and shows
 * up in the picker for the next person.
 *
 * Matched on a slug rather than the typed text, so "Bank Charges", "bank
 * charges" and "Bank  charges" are the same category rather than three.
 */
async function resolveExpenseCategory(
  db: Awaited<ReturnType<typeof dbOrThrow>>,
  input: { category: (typeof EXPENSE_CATEGORIES)[number]; customCategory?: string },
  actorId: number,
): Promise<{ categoryId: number | null; label: string }> {
  const typed = input.customCategory?.trim();

  if (input.category !== "other" || !typed) {
    const [known] = await db
      .select({ id: expenseCategories.id, name: expenseCategories.name })
      .from(expenseCategories)
      .where(eq(expenseCategories.key, input.category))
      .limit(1);
    return { categoryId: known?.id ?? null, label: known?.name ?? input.category };
  }

  const key = slugify(typed).slice(0, 48);
  if (!key) return { categoryId: null, label: input.category };

  const [existing] = await db
    .select({ id: expenseCategories.id, name: expenseCategories.name, isActive: expenseCategories.isActive })
    .from(expenseCategories)
    .where(eq(expenseCategories.key, key))
    .limit(1);

  if (existing) {
    // A retired category being used again is brought back rather than
    // duplicated under a suffixed key.
    if (!existing.isActive) {
      await db
        .update(expenseCategories)
        .set({ isActive: true })
        .where(eq(expenseCategories.id, existing.id));
    }
    return { categoryId: existing.id, label: existing.name };
  }

  const [created] = await db
    .insert(expenseCategories)
    .values({ key, name: typed.slice(0, 120), description: "Added while recording an expense." })
    .returning({ id: expenseCategories.id });

  void actorId;
  return { categoryId: created?.id ?? null, label: typed };
}

/**
 * Works out the arrears text message for one student, and whether it can go.
 *
 * The balance is recomputed here rather than taken from the caller: the amount
 * a student is told they owe must come from the ledger, not from a number a
 * browser sent back. Everything else - the wording, the number format, the
 * provider - is the shared messaging configuration, so a school that has
 * reworded the reminder gets its own words here too.
 *
 * `blocker` is the single reason this cannot be sent right now, phrased for
 * the person about to press the button. It is null when the message will go.
 */
async function buildFeeReminder(db: Awaited<ReturnType<typeof dbOrThrow>>, studentId: number) {
  const [student] = await db
    .select({
      id: studentProfiles.id,
      studentNumber: studentProfiles.studentNumber,
      fullName: studentProfiles.fullName,
      phone: studentProfiles.phone,
    })
    .from(studentProfiles)
    .where(and(eq(studentProfiles.id, studentId), isNull(studentProfiles.deletedAt)))
    .limit(1);
  if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Student was not found." });

  const [summary, config, school] = await Promise.all([
    studentAccountSummary(db, studentId),
    readMessagingConfig(db),
    schoolName(db),
  ]);

  const destination = normaliseMsisdn(student.phone);
  const message = render(config.events.templates.outstanding_fee?.sms ?? "", {
    school,
    name: firstName(student.fullName),
    fullName: student.fullName,
    reference: student.studentNumber,
    amount: cedis(summary.outstanding),
  });

  // Deliberately not gated on `masterEnabled` or the per-event SMS switch.
  // Those govern what the system sends on its own; this message exists because
  // a member of staff asked for it by name. What is still respected is whether
  // SMS works at all - an unconfigured provider cannot be clicked past.
  const blocker =
    summary.outstanding <= 0
      ? "This account has nothing outstanding."
      : !destination
        ? "No usable phone number is on file for this student."
        : !config.sms.enabled
          ? "SMS is switched off. Turn it on under Settings > Messaging."
          : (describeSmsConfig(config.sms) ??
            (message.trim() ? null : "The fee reminder template is empty."));

  return {
    student,
    outstanding: summary.outstanding,
    destination,
    message,
    segments: smsSegments(message),
    blocker,
  };
}

/** One run texts a school, not a country. Past this, something has gone wrong. */
const MAX_ARREARS_RECIPIENTS = 500;

/**
 * Everyone in arrears, with the message each of them would get.
 *
 * The per-student builder is deliberately not reused in a loop: it re-reads
 * the messaging config and the school name every time, which is three extra
 * round trips per student. Here the settings are read once and the balances
 * come from one aggregate, so the cost is the same for four hundred students
 * as for four.
 *
 * Every student who owes something is returned, including the ones who cannot
 * be reached. A run that quietly dropped them would report "sent to 38" while
 * nobody ever found out that six have no phone number on file.
 */
async function buildArrearsRun(db: Awaited<ReturnType<typeof dbOrThrow>>) {
  const [config, school] = await Promise.all([readMessagingConfig(db), schoolName(db)]);

  const template = config.events.templates.outstanding_fee?.sms ?? "";

  // Same shape as the outstanding list, so the two can never disagree about
  // who owes what.
  const owing = await db
    .select({
      id: studentProfiles.id,
      studentNumber: studentProfiles.studentNumber,
      fullName: studentProfiles.fullName,
      phone: studentProfiles.phone,
      billed: sql<string>`coalesce(sum(${feeCharges.amountDue}), 0)`,
      paid: sql<string>`coalesce(sum(${feeCharges.amountPaid}), 0)`,
    })
    .from(studentProfiles)
    .leftJoin(feeCharges, eq(feeCharges.studentId, studentProfiles.id))
    .where(and(isNull(studentProfiles.deletedAt), ne(studentProfiles.status, "graduated")))
    .groupBy(studentProfiles.id)
    .having(
      sql`coalesce(sum(${feeCharges.amountDue}), 0) > coalesce(sum(${feeCharges.amountPaid}), 0)`,
    )
    .orderBy(desc(sql`coalesce(sum(${feeCharges.amountDue}), 0) - coalesce(sum(${feeCharges.amountPaid}), 0)`));

  // Anyone already texted about arrears today is left out. The button says
  // "message everyone", and a second press an hour later must not mean every
  // student is told twice what they owe.
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const alreadyToday = await db
    .select({ destination: notificationDeliveries.destination })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.type, "outstanding_fee"),
        eq(notificationDeliveries.channel, "sms"),
        gte(notificationDeliveries.createdAt, since),
      ),
    );
  const textedToday = new Set(
    alreadyToday.map(row => row.destination).filter((value): value is string => Boolean(value)),
  );

  const recipients = owing.map(student => {
    const outstanding = money(student.billed) - money(student.paid);
    const destination = normaliseMsisdn(student.phone);
    return {
      id: student.id,
      studentNumber: student.studentNumber,
      fullName: student.fullName,
      outstanding,
      destination,
      alreadySentToday: Boolean(destination && textedToday.has(destination)),
      message: render(template, {
        school,
        name: firstName(student.fullName),
        fullName: student.fullName,
        reference: student.studentNumber,
        amount: cedis(outstanding),
      }),
    };
  });

  const sendable = recipients.filter(
    row => row.destination && !row.alreadySentToday && row.message.trim(),
  );

  // One reason the whole run cannot go, phrased for the person at the button.
  // Anything that stops only some students is counted instead, not raised.
  const blocker = !recipients.length
    ? "No student is in arrears."
    : !config.sms.enabled
      ? "SMS is switched off. Turn it on under Settings > Messaging."
      : (describeSmsConfig(config.sms) ??
        (template.trim() ? null : "The fee reminder template is empty.") ??
        (sendable.length ? null : "Nobody in arrears can be reached by text right now."));

  return {
    recipients,
    sendable,
    blocker,
    totals: {
      owing: recipients.length,
      sendable: sendable.length,
      noPhone: recipients.filter(row => !row.destination).length,
      alreadySentToday: recipients.filter(row => row.alreadySentToday).length,
      arrears: recipients.reduce((sum, row) => sum + row.outstanding, 0),
    },
  };
}

export const financeRouter = router({
  /* ---------------------------------------------------------------------- */
  /* Fee structures (§24)                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * The fee catalogue, with the programme each line belongs to.
   *
   * A structure with no course is the school-wide default — registration, say —
   * so `courseTitle` is null rather than the row being dropped by the join.
   */
  feeStructures: permissionProcedure("fees.read").query(async () => {
    const db = await dbOrThrow();
    const rows = await db
      .select({ structure: feeStructures, courseTitle: courses.title })
      .from(feeStructures)
      .leftJoin(courses, eq(feeStructures.courseId, courses.id))
      .orderBy(courses.title, feeStructures.feeType);
    return rows.map(({ structure, courseTitle }) => ({
      ...structure,
      amount: money(structure.amount),
      courseTitle,
    }));
  }),

  /**
   * Bills the current price list to everyone already on the register.
   *
   * Changing a price list does not reach back on its own, and it should not:
   * silently re-billing every student the moment a figure is typed is how an
   * account nobody meant to touch acquires a charge. This is that step made
   * explicit, for the ordinary case of adding a fee that applies to everyone
   * and then wanting the students already enrolled to be charged it.
   *
   * Idempotent. Running it twice raises nothing the second time, so it is safe
   * to press whenever somebody is unsure whether it has been run.
   */
  applyFeeStructures: permissionProcedure("fees.write").mutation(async ({ ctx }) => {
    const db = await dbOrThrow();
    const result = await syncAllCharges(db, ctx.user.id);

    if (result.raised || result.repaired) {
      await recordAudit(db, ctx.actor, {
        action: "update",
        entity: "feeCharge",
        entityLabel: "Fee structure applied",
        newValue: result,
        summary: `${ctx.actor.name ?? "Staff"} billed ${result.raised + result.repaired} charge${result.raised + result.repaired === 1 ? "" : "s"} to ${result.students} student${result.students === 1 ? "" : "s"}`,
      });
    }

    return result;
  }),

  upsertFeeStructure: permissionProcedure("fees.write")
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        courseId: z.number().int().positive().nullable(),
        intakeId: z.number().int().positive().nullable(),
        feeType: z.enum(FEE_TYPES),
        label: z.string().min(2).max(180),
        amount: z.number().min(0),
        isMandatory: z.boolean().default(true),
        dueOffsetDays: z.number().int().min(0).max(3650).default(0),
        isActive: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const values = {
        courseId: input.courseId,
        intakeId: input.intakeId,
        feeType: input.feeType,
        label: input.label,
        amount: toAmountString(toMinor(input.amount)),
        isMandatory: input.isMandatory,
        dueOffsetDays: input.dueOffsetDays,
        isActive: input.isActive,
      };

      if (input.id) {
        const [before] = await db
          .select()
          .from(feeStructures)
          .where(eq(feeStructures.id, input.id))
          .limit(1);
        await db.update(feeStructures).set(values).where(eq(feeStructures.id, input.id));
        await recordAudit(db, ctx.actor, {
          action: "update",
          entity: "feeStructure",
          entityId: input.id,
          entityLabel: input.label,
          oldValue: before,
          newValue: values,
        });
        return { id: input.id };
      }

      const [created] = await db
        .insert(feeStructures)
        .values(values)
        .returning({ id: feeStructures.id });
      await recordAudit(db, ctx.actor, {
        action: "create",
        entity: "feeStructure",
        entityId: created?.id,
        entityLabel: input.label,
        newValue: values,
      });
      return { id: created?.id };
    }),

  /* ---------------------------------------------------------------------- */
  /* Student fee accounts (§24)                                             */
  /* ---------------------------------------------------------------------- */

  /** The account equation, plus the charges behind it. */
  studentAccount: permissionProcedure("fees.read")
    .input(z.object({ studentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const [student] = await db
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.id, input.studentId))
        .limit(1);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Student was not found." });

      const [summary, charges, adjustments, history] = await Promise.all([
        studentAccountSummary(db, input.studentId),
        db
          .select()
          .from(feeCharges)
          .where(eq(feeCharges.studentId, input.studentId))
          .orderBy(feeCharges.dueDate, feeCharges.id),
        db
          .select()
          .from(feeAdjustments)
          .where(eq(feeAdjustments.studentId, input.studentId))
          .orderBy(desc(feeAdjustments.createdAt)),
        db
          .select()
          .from(payments)
          .where(eq(payments.studentId, input.studentId))
          .orderBy(desc(payments.paidAt)),
      ]);

      return {
        student,
        summary,
        charges: charges.map(charge => ({
          ...charge,
          amountDue: money(charge.amountDue),
          amountPaid: money(charge.amountPaid),
          balance: money(charge.amountDue) - money(charge.amountPaid),
        })),
        adjustments: adjustments.map(row => ({ ...row, amount: money(row.amount) })),
        payments: history.map(row => ({
          ...row,
          amount: money(row.amount),
          refundedAmount: money(row.refundedAmount),
        })),
      };
    }),

  /** Outstanding-balance report, paginated server-side (§25, §43). */
  /**
   * The fee register: every student on the books with what they owe, and a
   * place to take money against it.
   *
   * Distinct from `outstanding`, which lists only the students carrying a
   * balance. A register has to show the settled accounts too - a clerk works
   * down a list of names looking for one, and a name that vanishes the moment
   * its balance clears is a name they cannot find to check.
   *
   * Programme and intake are read separately for the page rather than joined
   * in: a student on two programmes would otherwise multiply their own fee
   * rows and be billed twice over in the aggregate.
   */
  feeRegister: permissionProcedure("fees.read")
    .input(
      listInputSchema.extend({
        standing: z.enum(["all", "pending", "paid"]).default("all"),
        courseId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        isNull(studentProfiles.deletedAt),
        ne(studentProfiles.status, "graduated"),
        input.courseId
          ? sql`exists (
              select 1 from "enrollments" e
              where e."studentId" = ${studentProfiles.id}
                and e."courseId" = ${input.courseId}
                and e."status" in ('active', 'paused')
            )`
          : undefined,
        input.search
          ? or(
              ilike(studentProfiles.fullName, likePattern(input.search)),
              ilike(studentProfiles.studentNumber, likePattern(input.search)),
              ilike(studentProfiles.phone, likePattern(input.search)),
            )
          : undefined,
      );

      const owing = sql`coalesce(sum(${feeCharges.amountDue}), 0) - coalesce(sum(${feeCharges.amountPaid}), 0)`;
      const standingFilter =
        input.standing === "pending"
          ? sql`${owing} > 0`
          : input.standing === "paid"
            ? sql`${owing} <= 0`
            : undefined;

      const [rows, [total]] = await Promise.all([
        db
          .select({
            studentId: studentProfiles.id,
            studentNumber: studentProfiles.studentNumber,
            fullName: studentProfiles.fullName,
            email: studentProfiles.email,
            phone: studentProfiles.phone,
            status: studentProfiles.status,
            billed: sql<string>`coalesce(sum(${feeCharges.amountDue}), 0)`,
            paid: sql<string>`coalesce(sum(${feeCharges.amountPaid}), 0)`,
          })
          .from(studentProfiles)
          .leftJoin(feeCharges, eq(feeCharges.studentId, studentProfiles.id))
          .where(where)
          .groupBy(studentProfiles.id)
          .having(standingFilter)
          // Biggest debt first, so the work is at the top; settled accounts
          // fall to the end where they are looked up rather than worked.
          .orderBy(desc(owing), asc(studentProfiles.fullName))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(
            db
              .select({ id: studentProfiles.id })
              .from(studentProfiles)
              .leftJoin(feeCharges, eq(feeCharges.studentId, studentProfiles.id))
              .where(where)
              .groupBy(studentProfiles.id)
              .having(standingFilter)
              .as("register"),
          ),
      ]);

      const ids = rows.map(row => row.studentId);
      const placements = ids.length
        ? await db
            .select({
              studentId: enrollments.studentId,
              courseTitle: courses.title,
              intakeTitle: intakes.title,
            })
            .from(enrollments)
            .innerJoin(courses, eq(enrollments.courseId, courses.id))
            .leftJoin(intakes, eq(enrollments.intakeId, intakes.id))
            .where(
              and(
                inArray(enrollments.studentId, ids),
                inArray(enrollments.status, ["active", "paused"]),
              ),
            )
        : [];

      // The most recent completed payment, for the receipt button on the row.
      const receipts = ids.length
        ? await db
            .select({
              studentId: payments.studentId,
              reference: payments.reference,
              amount: payments.amount,
              refundedAmount: payments.refundedAmount,
              paymentMethod: payments.paymentMethod,
              transactionReference: payments.transactionReference,
              paidAt: payments.paidAt,
            })
            .from(payments)
            .where(and(inArray(payments.studentId, ids), eq(payments.status, "completed")))
            .orderBy(desc(payments.paidAt), desc(payments.id))
        : [];

      const latestReceipt = new Map<number, (typeof receipts)[number]>();
      for (const receipt of receipts) {
        if (receipt.studentId === null) continue;
        if (!latestReceipt.has(receipt.studentId)) latestReceipt.set(receipt.studentId, receipt);
      }

      return paginate(
        rows.map(row => {
          const mine = placements.filter(place => place.studentId === row.studentId);
          const receipt = latestReceipt.get(row.studentId);
          const billed = money(row.billed);
          const paid = money(row.paid);

          return {
            ...row,
            programme: mine.map(place => place.courseTitle).join(", ") || null,
            intake:
              mine
                .map(place => place.intakeTitle)
                .filter((title): title is string => Boolean(title))
                .join(", ") || null,
            totalFees: billed,
            amountPaid: paid,
            outstanding: Math.max(billed - paid, 0),
            /** Nothing billed is not the same as nothing owed; the UI says so. */
            billedAnything: billed > 0,
            lastPayment: receipt
              ? {
                  reference: receipt.reference,
                  amount: money(receipt.amount),
                  refundedAmount: money(receipt.refundedAmount),
                  paymentMethod: receipt.paymentMethod,
                  transactionReference: receipt.transactionReference,
                  paidAt: receipt.paidAt,
                }
              : null,
          };
        }),
        Number(total?.total ?? 0),
        input,
      );
    }),

  outstanding: permissionProcedure("fees.read")
    .input(listInputSchema)
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const searchFilter = input.search
        ? or(
            ilike(studentProfiles.fullName, likePattern(input.search)),
            ilike(studentProfiles.studentNumber, likePattern(input.search)),
          )
        : undefined;

      const where = and(isNull(studentProfiles.deletedAt), searchFilter);

      const [rows, [total]] = await Promise.all([
        db
          .select({
            studentId: studentProfiles.id,
            studentNumber: studentProfiles.studentNumber,
            fullName: studentProfiles.fullName,
            email: studentProfiles.email,
            phone: studentProfiles.phone,
            status: studentProfiles.status,
            billed: sql<string>`coalesce(sum(${feeCharges.amountDue}), 0)`,
            paid: sql<string>`coalesce(sum(${feeCharges.amountPaid}), 0)`,
          })
          .from(studentProfiles)
          .leftJoin(feeCharges, eq(feeCharges.studentId, studentProfiles.id))
          .where(where)
          .groupBy(studentProfiles.id)
          .having(sql`coalesce(sum(${feeCharges.amountDue}), 0) > coalesce(sum(${feeCharges.amountPaid}), 0)`)
          .orderBy(desc(sql`coalesce(sum(${feeCharges.amountDue}), 0) - coalesce(sum(${feeCharges.amountPaid}), 0)`))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`count(*)` })
          .from(
            db
              .select({ id: studentProfiles.id })
              .from(studentProfiles)
              .leftJoin(feeCharges, eq(feeCharges.studentId, studentProfiles.id))
              .where(where)
              .groupBy(studentProfiles.id)
              .having(sql`coalesce(sum(${feeCharges.amountDue}), 0) > coalesce(sum(${feeCharges.amountPaid}), 0)`)
              .as("owing"),
          ),
      ]);

      return paginate(
        rows.map(row => ({
          ...row,
          totalFees: money(row.billed),
          amountPaid: money(row.paid),
          outstanding: money(row.billed) - money(row.paid),
        })),
        Number(total?.total ?? 0),
        input,
      );
    }),

  /* ---------------------------------------------------------------------- */
  /* Arrears reminders                                                      */
  /* ---------------------------------------------------------------------- */

  /**
   * Exactly what the student would receive, before anybody sends it.
   *
   * A text message cannot be recalled, so the wording, the number it goes to
   * and the figure it quotes are all shown first and come from the same code
   * that does the sending.
   */
  feeReminderPreview: permissionProcedure("fees.write")
    .input(z.object({ studentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      return buildFeeReminder(db, input.studentId);
    }),

  /** Texts one student what they owe. */
  sendFeeReminder: permissionProcedure("fees.write")
    .input(z.object({ studentId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const reminder = await buildFeeReminder(db, input.studentId);
      if (reminder.blocker) {
        throw new TRPCError({ code: "BAD_REQUEST", message: reminder.blocker });
      }

      const [delivery] = await db
        .insert(notificationDeliveries)
        .values({
          type: "outstanding_fee",
          channel: "sms",
          destination: reminder.destination,
          recipientName: reminder.student.fullName.slice(0, 160),
          subject: "Fee reminder",
          body: reminder.message,
          status: "queued",
        })
        .returning({ id: notificationDeliveries.id });
      if (!delivery?.id) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The reminder could not be queued." });
      }

      await recordAudit(db, ctx.actor, {
        action: "notify",
        entity: "studentAccount",
        entityId: reminder.student.id,
        entityLabel: reminder.student.fullName,
        newValue: { channel: "sms", amount: reminder.outstanding },
        summary: `${ctx.actor.name ?? "Staff"} texted ${reminder.student.fullName} about ${cedis(reminder.outstanding)} in arrears`,
      });

      // Sent in the foreground, unlike the automatic messages: somebody is
      // watching the button and is owed a real answer rather than "queued".
      // Narrowed to this row so a backlog of older messages cannot be what the
      // batch spends itself on while they wait.
      await flush(db, 1, delivery.id);

      const [sent] = await db
        .select({ status: notificationDeliveries.status, error: notificationDeliveries.error })
        .from(notificationDeliveries)
        .where(eq(notificationDeliveries.id, delivery.id))
        .limit(1);

      return {
        // Reported from the row itself, so a provider that refused the message
        // is not announced as a success.
        status: sent?.status ?? "queued",
        error: sent?.status === "sent" ? null : (sent?.error ?? null),
        destination: reminder.destination,
        outstanding: reminder.outstanding,
      };
    }),

  /**
   * What a whole arrears run would do, before anybody sets it off.
   *
   * The same shape as the single-student preview and for the same reason:
   * a few hundred text messages cannot be recalled, so the count, the total
   * and a real example of the wording are all shown first.
   */
  arrearsRunPreview: permissionProcedure("fees.write").query(async () => {
    const db = await dbOrThrow();
    const run = await buildArrearsRun(db);

    return {
      blocker: run.blocker,
      totals: run.totals,
      capped: run.sendable.length > MAX_ARREARS_RECIPIENTS,
      limit: MAX_ARREARS_RECIPIENTS,
      /** A real row, so the wording shown is the wording that goes out. */
      sample: run.sendable[0]
        ? {
            fullName: run.sendable[0].fullName,
            destination: run.sendable[0].destination,
            outstanding: run.sendable[0].outstanding,
            message: run.sendable[0].message,
            segments: smsSegments(run.sendable[0].message),
          }
        : null,
      unreachable: run.recipients
        .filter(row => !row.destination)
        .slice(0, 20)
        .map(row => ({ fullName: row.fullName, studentNumber: row.studentNumber })),
    };
  }),

  /** Texts every student in arrears the amount they personally owe. */
  sendArrearsRun: permissionProcedure("fees.write").mutation(async ({ ctx }) => {
    const db = await dbOrThrow();
    const run = await buildArrearsRun(db);

    if (run.blocker) {
      throw new TRPCError({ code: "BAD_REQUEST", message: run.blocker });
    }
    if (run.sendable.length > MAX_ARREARS_RECIPIENTS) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `${run.sendable.length} students are in arrears, which is past the ${MAX_ARREARS_RECIPIENTS} a single run will send. Chase the largest balances individually.`,
      });
    }

    const queued = await db
      .insert(notificationDeliveries)
      .values(
        run.sendable.map(row => ({
          type: "outstanding_fee" as const,
          channel: "sms" as const,
          destination: row.destination,
          recipientName: row.fullName.slice(0, 160),
          subject: "Fee reminder",
          body: row.message,
          status: "queued" as const,
        })),
      )
      .returning({ id: notificationDeliveries.id });

    await recordAudit(db, ctx.actor, {
      action: "notify",
      entity: "studentAccount",
      entityLabel: "Fee arrears run",
      newValue: {
        channel: "sms",
        students: run.sendable.length,
        arrears: run.totals.arrears,
        skippedNoPhone: run.totals.noPhone,
        skippedAlreadySentToday: run.totals.alreadySentToday,
      },
      summary: `${ctx.actor.name ?? "Staff"} texted ${run.sendable.length} student${run.sendable.length === 1 ? "" : "s"} about ${cedis(run.totals.arrears)} in arrears`,
    });

    // Drained in the foreground like the single send: somebody is watching the
    // button and is owed the real outcome rather than "queued".
    //
    // Named row by row, not merely limited to the same count. Rows are drained
    // oldest first, so a bare limit would spend the batch on whatever backlog
    // was already waiting and leave this run's messages sitting in the queue -
    // while the counts below, read from this run's rows, reported them as
    // undelivered.
    const queuedIds = queued.map(row => row.id);
    await flush(db, queuedIds.length, queuedIds);

    const settled = queuedIds.length
      ? await db
          .select({ status: notificationDeliveries.status, error: notificationDeliveries.error })
          .from(notificationDeliveries)
          .where(inArray(notificationDeliveries.id, queuedIds))
      : [];

    // Counted from the rows themselves, so a provider that refused half of
    // them is not reported back as a clean sweep.
    const sent = settled.filter(row => row.status === "sent").length;
    const failed = settled.filter(row => row.status === "failed").length;

    return {
      sent,
      failed,
      queued: settled.length - sent - failed,
      skippedNoPhone: run.totals.noPhone,
      skippedAlreadySentToday: run.totals.alreadySentToday,
      arrears: run.totals.arrears,
      firstError: settled.find(row => row.status === "failed")?.error ?? null,
    };
  }),

  createCharge: permissionProcedure("fees.write")
    .input(
      z.object({
        studentId: z.number().int().positive(),
        enrollmentId: z.number().int().positive().optional(),
        feeType: z.enum(FEE_TYPES),
        description: z.string().min(2).max(255),
        amountDue: z.number().positive(),
        dueDate: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [charge] = await db
        .insert(feeCharges)
        .values({
          studentId: input.studentId,
          enrollmentId: input.enrollmentId,
          feeType: input.feeType,
          description: input.description,
          amountDue: toAmountString(toMinor(input.amountDue)),
          dueDate: input.dueDate,
          createdByUserId: ctx.user.id,
        })
        .returning({ id: feeCharges.id });

      await recordAudit(db, ctx.actor, {
        action: "create",
        entity: "feeCharge",
        entityId: charge?.id,
        entityLabel: input.description,
        newValue: { amountDue: input.amountDue, feeType: input.feeType },
        summary: `${ctx.actor.name ?? "Staff"} billed GHS ${input.amountDue.toFixed(2)} to student ${input.studentId}`,
      });

      return { id: charge?.id };
    }),

  /** Discounts and surcharges are recorded, never edited into the charge. */
  adjust: permissionProcedure("fees.write")
    .input(
      z.object({
        studentId: z.number().int().positive(),
        feeChargeId: z.number().int().positive().optional(),
        adjustmentType: z.enum(["discount", "surcharge"]),
        amount: z.number().positive(),
        reason: z.string().min(2).max(255),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [row] = await db
        .insert(feeAdjustments)
        .values({
          studentId: input.studentId,
          feeChargeId: input.feeChargeId,
          adjustmentType: input.adjustmentType,
          amount: toAmountString(toMinor(input.amount)),
          reason: input.reason,
          createdByUserId: ctx.user.id,
        })
        .returning({ id: feeAdjustments.id });

      await recordAudit(db, ctx.actor, {
        action: input.adjustmentType,
        entity: "studentAccount",
        entityId: input.studentId,
        newValue: { amount: input.amount, reason: input.reason },
        summary: `${ctx.actor.name ?? "Staff"} applied a ${input.adjustmentType} of GHS ${input.amount.toFixed(2)} to student ${input.studentId}`,
      });

      return { id: row?.id };
    }),

  /* ---------------------------------------------------------------------- */
  /* Payments (§25)                                                         */
  /* ---------------------------------------------------------------------- */

  payments: permissionProcedure("payments.read")
    .input(
      listInputSchema.extend({
        method: z.enum(PAYMENT_METHODS).optional(),
        studentId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        input.method ? eq(payments.paymentMethod, input.method) : undefined,
        input.studentId ? eq(payments.studentId, input.studentId) : undefined,
        input.dateFrom ? gte(payments.paidAt, input.dateFrom) : undefined,
        input.dateTo ? lte(payments.paidAt, input.dateTo) : undefined,
        input.search
          ? or(
              ilike(payments.reference, likePattern(input.search)),
              ilike(payments.transactionReference, likePattern(input.search)),
              ilike(studentProfiles.fullName, likePattern(input.search)),
            )
          : undefined,
      );

      const [rows, [total]] = await Promise.all([
        db
          .select({
            payment: payments,
            studentName: studentProfiles.fullName,
            studentNumber: studentProfiles.studentNumber,
          })
          .from(payments)
          .leftJoin(studentProfiles, eq(payments.studentId, studentProfiles.id))
          .where(where)
          .orderBy(desc(payments.paidAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: count() })
          .from(payments)
          .leftJoin(studentProfiles, eq(payments.studentId, studentProfiles.id))
          .where(where),
      ]);

      return paginate(
        rows.map(row => ({
          ...row.payment,
          amount: money(row.payment.amount),
          refundedAmount: money(row.payment.refundedAmount),
          studentName: row.studentName,
          studentNumber: row.studentNumber,
        })),
        Number(total?.total ?? 0),
        input,
      );
    }),

  /**
   * Records a student payment as one atomic unit: the payment row, its
   * allocation across open charges, and the revenue line. If any step fails
   * none of it is written, so a balance can never fall out of step with the
   * money actually received (§48).
   */
  recordStudentPayment: permissionProcedure("payments.write")
    .input(
      z.object({
        studentId: z.number().int().positive(),
        feeChargeId: z.number().int().positive().optional(),
        amount: z.number().positive(),
        paymentMethod: z.enum(PAYMENT_METHODS),
        transactionReference: z.string().max(120).optional(),
        feeType: z.enum(FEE_TYPES).optional(),
        note: z.string().max(1000).optional(),
        paidAt: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const amountMinor = toMinor(input.amount);

      const [student] = await db
        .select({
          id: studentProfiles.id,
          fullName: studentProfiles.fullName,
          userId: studentProfiles.userId,
          email: studentProfiles.email,
          phone: studentProfiles.phone,
        })
        .from(studentProfiles)
        .where(eq(studentProfiles.id, input.studentId))
        .limit(1);
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Student was not found." });

      try {
        const result = await db.transaction(async tx => {
          const reference = buildReference("PAY");

          const [payment] = await tx
            .insert(payments)
            .values({
              reference,
              studentId: input.studentId,
              feeChargeId: input.feeChargeId,
              feeType: input.feeType,
              amount: toAmountString(amountMinor),
              paymentMethod: input.paymentMethod,
              status: "completed",
              transactionReference: input.transactionReference || null,
              note: input.note,
              receivedByUserId: ctx.user.id,
              recordedByUserId: ctx.user.id,
              paidAt: input.paidAt ?? new Date(),
            })
            .returning({ id: payments.id });

          if (!payment?.id) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Payment could not be recorded.",
            });
          }

          const allocations = await allocatePayment(tx, {
            paymentId: payment.id,
            studentId: input.studentId,
            amountMinor,
            preferredFeeChargeId: input.feeChargeId ?? null,
          });

          await recordRevenue(tx, {
            source: "student_fee",
            sourceType: "payment",
            sourceId: payment.id,
            paymentId: payment.id,
            studentId: input.studentId,
            amountMinor,
            description: `Student payment ${reference}`,
            occurredAt: input.paidAt ?? new Date(),
            recordedByUserId: ctx.user.id,
          });

          await recordAudit(tx, ctx.actor, {
            action: "record_payment",
            entity: "payment",
            entityId: payment.id,
            entityLabel: reference,
            newValue: {
              amount: input.amount,
              method: input.paymentMethod,
              allocations: allocations.length,
            },
            summary: `${ctx.actor.name ?? "Staff"} recorded GHS ${input.amount.toFixed(2)} for ${student.fullName}`,
          });

          const summary = await studentAccountSummary(tx, input.studentId);

          await announce(tx, {
            type: "payment_received",
            recipient: {
              name: student.fullName,
              email: student.email,
              phone: student.phone,
              userId: student.userId,
            },
            title: `Payment received: GHS ${input.amount.toFixed(2)}`,
            body: `Reference ${reference}. Your fee balance has been updated.`,
            facts: {
              amount: `GHS ${input.amount.toFixed(2)}`,
              reference,
              balance:
                summary.outstanding > 0
                  ? `Your outstanding balance is GHS ${summary.outstanding.toFixed(2)}.`
                  : "Your fees are fully paid.",
            },
            entityType: "payment",
            entityId: payment.id,
            link: "/portal",
          });

          return { id: payment.id, reference, allocations: allocations.length, summary };
        });

        // After the commit: the receipt must describe a payment that is
        // actually on file.
        flushInBackground(db);
        return result;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That transaction reference has already been recorded.",
          });
        }
        throw error;
      }
    }),

  /**
   * Refunds are counter-entries: the payment keeps its original amount and a
   * negative revenue line cancels it (§29). Old rows are never rewritten.
   */
  refundPayment: permissionProcedure("payments.write")
    .input(
      z.object({
        paymentId: z.number().int().positive(),
        amount: z.number().positive(),
        reason: z.string().min(2).max(255),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      return db.transaction(async tx => {
        const [payment] = await tx
          .select()
          .from(payments)
          .where(eq(payments.id, input.paymentId))
          .limit(1);
        if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Payment was not found." });

        const refundMinor = toMinor(input.amount);
        assertRefundable(toMinor(payment.amount), toMinor(payment.refundedAmount), refundMinor);

        const nextRefunded = toMinor(payment.refundedAmount) + refundMinor;

        await tx
          .update(payments)
          .set({
            refundedAmount: toAmountString(nextRefunded),
            status: nextRefunded >= toMinor(payment.amount) ? "refunded" : payment.status,
          })
          .where(eq(payments.id, payment.id));

        const [ledgerRow] = await tx
          .select({ id: revenueTransactions.id })
          .from(revenueTransactions)
          .where(eq(revenueTransactions.paymentId, payment.id))
          .limit(1);

        if (ledgerRow) {
          await reverseRevenue(tx, {
            revenueTransactionId: ledgerRow.id,
            amountMinor: refundMinor,
            reason: `Refund: ${input.reason}`,
            recordedByUserId: ctx.user.id,
          });
        }

        await recordAudit(tx, ctx.actor, {
          action: "refund_payment",
          entity: "payment",
          entityId: payment.id,
          entityLabel: payment.reference,
          oldValue: { refundedAmount: money(payment.refundedAmount) },
          newValue: { refundedAmount: fromMinor(nextRefunded), reason: input.reason },
          summary: `${ctx.actor.name ?? "Staff"} refunded GHS ${input.amount.toFixed(2)} on ${payment.reference}`,
        });

        return { success: true, refundedAmount: fromMinor(nextRefunded) };
      });
    }),

  /* ---------------------------------------------------------------------- */
  /* Expenses (§27)                                                         */
  /* ---------------------------------------------------------------------- */

  expenseCategories: permissionProcedure("expenses.read").query(async () => {
    const db = await dbOrThrow();
    return db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.isActive, true))
      .orderBy(expenseCategories.name);
  }),

  expenses: permissionProcedure("expenses.read")
    .input(
      listInputSchema.extend({
        category: z.enum(EXPENSE_CATEGORIES).optional(),
        scope: z.enum(EXPENSE_SCOPES).optional(),
        approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        isNull(expenses.deletedAt),
        input.category ? eq(expenses.category, input.category) : undefined,
        input.scope ? eq(expenses.scope, input.scope) : undefined,
        input.approvalStatus ? eq(expenses.approvalStatus, input.approvalStatus) : undefined,
        input.dateFrom ? gte(expenses.expenseDate, input.dateFrom) : undefined,
        input.dateTo ? lte(expenses.expenseDate, input.dateTo) : undefined,
        input.search
          ? or(
              ilike(expenses.title, likePattern(input.search)),
              ilike(expenses.vendor, likePattern(input.search)),
            )
          : undefined,
      );

      const [rows, [total], [sum]] = await Promise.all([
        db
          // Left-joined so an expense recorded before the category table
          // existed still comes back, with the enum as its only label.
          .select({ expense: expenses, categoryName: expenseCategories.name })
          .from(expenses)
          .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
          .where(where)
          .orderBy(desc(expenses.expenseDate), desc(expenses.id))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(expenses).where(where),
        db
          .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
          .from(expenses)
          .where(where),
      ]);

      return {
        ...paginate(
          rows.map(({ expense, categoryName }) => ({
            ...expense,
            amount: money(expense.amount),
            // What the row is filed under, in the words it was filed with. A
            // custom category reads as itself rather than as "other".
            categoryLabel: categoryName ?? expense.category,
          })),
          Number(total?.total ?? 0),
          input,
        ),
        filteredTotal: money(sum?.total),
      };
    }),

  addExpense: permissionProcedure("expenses.write")
    .input(
      z.object({
        title: z.string().min(2).max(180),
        category: z.enum(EXPENSE_CATEGORIES),
        /** Names the category when `category` is "other". Ignored otherwise. */
        customCategory: z.string().trim().max(120).optional(),
        scope: z.enum(EXPENSE_SCOPES).default("school"),
        amount: z.number().positive(),
        expenseDate: z.coerce.date(),
        vendor: z.string().max(160).optional(),
        paymentMethod: z.enum(PAYMENT_METHODS),
        receiptKey: z.string().max(512).optional(),
        note: z.string().max(2000).optional(),
        /** Held for approval when the recorder cannot approve their own spend. */
        requiresApproval: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const category = await resolveExpenseCategory(db, input, ctx.user.id);

      const needsApproval = input.requiresApproval || !ctx.access.can("expenses.approve");

      const [expense] = await db
        .insert(expenses)
        .values({
          title: input.title,
          category: input.category,
          categoryId: category.categoryId,
          scope: input.scope,
          amount: toAmountString(toMinor(input.amount)),
          expenseDate: input.expenseDate,
          vendor: input.vendor,
          paymentMethod: input.paymentMethod,
          receiptKey: input.receiptKey,
          note: input.note,
          approvalStatus: needsApproval ? "pending" : "approved",
          approvedByUserId: needsApproval ? null : ctx.user.id,
          approvedAt: needsApproval ? null : new Date(),
          recordedByUserId: ctx.user.id,
        })
        .returning({ id: expenses.id });

      await recordAudit(db, ctx.actor, {
        action: "create",
        entity: "expense",
        entityId: expense?.id,
        entityLabel: input.title,
        newValue: { amount: input.amount, category: category.label, scope: input.scope },
        summary: `${ctx.actor.name ?? "Staff"} recorded a GHS ${input.amount.toFixed(2)} ${input.scope} expense (${category.label})`,
      });

      if (needsApproval) {
        await notify(db, {
          userIds: await staffRecipients(db, ["admin"]),
          type: "new_expense",
          title: `Expense awaiting approval: ${input.title}`,
          body: `GHS ${input.amount.toFixed(2)} recorded by ${ctx.actor.name ?? "a staff member"}.`,
          entityType: "expense",
          entityId: expense?.id,
          link: "/finance/expenses",
        });
      }

      return { id: expense?.id, approvalStatus: needsApproval ? "pending" : "approved" };
    }),

  /**
   * Corrects a recorded expense.
   *
   * An edit by someone who cannot approve sends the expense back to pending,
   * for the same reason recording one does: otherwise the amount on an
   * already-approved expense could be changed after the decision was made,
   * and the approval would still be sitting there vouching for it.
   */
  updateExpense: permissionProcedure("expenses.write")
    .input(
      z.object({
        expenseId: z.number().int().positive(),
        title: z.string().min(2).max(180),
        category: z.enum(EXPENSE_CATEGORIES),
        /** Names the category when `category` is "other". Ignored otherwise. */
        customCategory: z.string().trim().max(120).optional(),
        scope: z.enum(EXPENSE_SCOPES).default("school"),
        amount: z.number().positive(),
        expenseDate: z.coerce.date(),
        vendor: z.string().max(160).optional(),
        paymentMethod: z.enum(PAYMENT_METHODS),
        note: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [before] = await db
        .select()
        .from(expenses)
        .where(and(eq(expenses.id, input.expenseId), isNull(expenses.deletedAt)))
        .limit(1);

      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That expense is no longer on file." });
      }

      const category = await resolveExpenseCategory(db, input, ctx.user.id);

      const canApprove = ctx.access.can("expenses.approve");
      const reopened = !canApprove && before.approvalStatus === "approved";

      await db
        .update(expenses)
        .set({
          title: input.title,
          category: input.category,
          categoryId: category.categoryId,
          scope: input.scope,
          amount: toAmountString(toMinor(input.amount)),
          expenseDate: input.expenseDate,
          vendor: input.vendor ?? null,
          paymentMethod: input.paymentMethod,
          note: input.note ?? null,
          ...(reopened
            ? { approvalStatus: "pending" as const, approvedByUserId: null, approvedAt: null }
            : {}),
        })
        .where(eq(expenses.id, input.expenseId));

      await recordAudit(db, ctx.actor, {
        action: "update",
        entity: "expense",
        entityId: before.id,
        entityLabel: input.title,
        oldValue: {
          title: before.title,
          category: before.category,
          scope: before.scope,
          amount: money(before.amount),
          vendor: before.vendor,
          paymentMethod: before.paymentMethod,
          approvalStatus: before.approvalStatus,
        },
        newValue: {
          title: input.title,
          category: input.category,
          scope: input.scope,
          amount: input.amount,
          vendor: input.vendor ?? null,
          paymentMethod: input.paymentMethod,
          approvalStatus: reopened ? "pending" : before.approvalStatus,
        },
        summary: `${ctx.actor.name ?? "Staff"} edited the GHS ${input.amount.toFixed(2)} expense "${input.title}"`,
      });

      return { id: before.id, reopened };
    }),

  /**
   * Takes an expense off the books.
   *
   * Soft, like every other removal here - the row stays for the audit trail
   * and drops out of the lists and the totals, which both filter on
   * `deletedAt`. Removing one that has already been approved is held to the
   * approver's bar: it changes a figure somebody signed off.
   */
  deleteExpense: permissionProcedure("expenses.write")
    .input(z.object({ expenseId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [before] = await db
        .select()
        .from(expenses)
        .where(and(eq(expenses.id, input.expenseId), isNull(expenses.deletedAt)))
        .limit(1);

      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That expense is no longer on file." });
      }

      if (before.approvalStatus === "approved" && !ctx.access.can("expenses.approve")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "That expense is approved. Only a finance administrator can remove it.",
        });
      }

      await db
        .update(expenses)
        .set({ deletedAt: new Date() })
        .where(eq(expenses.id, input.expenseId));

      await recordAudit(db, ctx.actor, {
        action: "delete",
        entity: "expense",
        entityId: before.id,
        entityLabel: before.title,
        oldValue: {
          title: before.title,
          category: before.category,
          amount: money(before.amount),
          approvalStatus: before.approvalStatus,
        },
        summary: `${ctx.actor.name ?? "Staff"} removed the GHS ${money(before.amount).toFixed(2)} expense "${before.title}"`,
      });

      return { id: before.id, title: before.title };
    }),

  reviewExpense: permissionProcedure("expenses.approve")
    .input(
      z.object({
        expenseId: z.number().int().positive(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const [before] = await db
        .select()
        .from(expenses)
        .where(eq(expenses.id, input.expenseId))
        .limit(1);
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Expense was not found." });

      await db
        .update(expenses)
        .set({
          approvalStatus: input.decision,
          approvedByUserId: ctx.user.id,
          approvedAt: new Date(),
          note: input.note ?? before.note,
        })
        .where(eq(expenses.id, input.expenseId));

      await recordAudit(db, ctx.actor, {
        action: `expense_${input.decision}`,
        entity: "expense",
        entityId: input.expenseId,
        entityLabel: before.title,
        oldValue: { approvalStatus: before.approvalStatus },
        newValue: { approvalStatus: input.decision },
      });

      return { success: true };
    }),

  /* ---------------------------------------------------------------------- */
  /* Revenue ledger (§28)                                                   */
  /* ---------------------------------------------------------------------- */

  revenue: permissionProcedure("finance.read")
    .input(listInputSchema)
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        input.dateFrom ? gte(revenueTransactions.occurredAt, input.dateFrom) : undefined,
        input.dateTo ? lte(revenueTransactions.occurredAt, input.dateTo) : undefined,
        input.search ? ilike(revenueTransactions.description, likePattern(input.search)) : undefined,
      );

      const [rows, [total], [sum]] = await Promise.all([
        db
          .select()
          .from(revenueTransactions)
          .where(where)
          .orderBy(desc(revenueTransactions.occurredAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(revenueTransactions).where(where),
        db
          .select({ total: sql<string>`coalesce(sum(${revenueTransactions.amount}), 0)` })
          .from(revenueTransactions)
          .where(where),
      ]);

      return {
        ...paginate(
          rows.map(row => ({ ...row, amount: money(row.amount) })),
          Number(total?.total ?? 0),
          input,
        ),
        filteredTotal: money(sum?.total),
      };
    }),
});
