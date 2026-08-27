import { and, avg, count, desc, eq, gte, ilike, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  assessmentResults,
  assessments,
  attendanceRecords,
  certificates,
  courses,
  enrollments,
  expenseCategories,
  expenses,
  feeCharges,
  inventoryItems,
  orderItems,
  payments,
  productCategories,
  revenueTransactions,
  storeOrders,
  studentProfiles,
  suppliers,
} from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { money } from "../services/money";
import {
  likePattern,
  listInputSchema,
  paginate,
  paginationBounds,
} from "../services/pagination";
import { permissionProcedure, router } from "../trpc";

/**
 * The standard report set (§42, §65).
 *
 * Every report is a summary rather than a feed: the activity feeds already
 * exist as their own screens, and duplicating them here would mean two places
 * to keep correct. What these add is the arithmetic across rows — collected
 * against billed, revenue against expenses, present against sessions held.
 *
 * Two rules hold throughout:
 *
 *   Reports are read-only and never cache. A figure on a report is computed
 *   from the same rows the ledger screens show, at the moment it is asked for.
 *
 *   Every one is gated on `reports.read` *and* the permission for the data it
 *   reads, so being allowed to run reports is not a way around not being
 *   allowed to see salaries, or fees, or attendance.
 */

/** A date window. Both ends optional; absent means unbounded. */
const rangeInput = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

type Range = z.infer<typeof rangeInput>;

/**
 * Reversals are stored as negative counter-entries rather than deletions
 * (§29), so a plain SUM already nets refunds off. Nothing here needs to filter
 * them out — and filtering them out would overstate income.
 */
function revenueWindow(range: Range) {
  return and(
    range.dateFrom ? gte(revenueTransactions.occurredAt, range.dateFrom) : undefined,
    range.dateTo ? lte(revenueTransactions.occurredAt, range.dateTo) : undefined,
  );
}

/** Rejected expenses are proposals that were turned down, not money spent. */
function expenseWindow(range: Range) {
  return and(
    ne(expenses.approvalStatus, "rejected"),
    range.dateFrom ? gte(expenses.expenseDate, range.dateFrom) : undefined,
    range.dateTo ? lte(expenses.expenseDate, range.dateTo) : undefined,
  );
}

const MONTH = sql`date_trunc('month', ${revenueTransactions.occurredAt})`;

export const reportsRouter = router({
  /* ---------------------------------------------------------------------- */
  /* Finance                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Income against expenses, month by month.
   *
   * Built by full-joining two independent aggregates rather than joining the
   * underlying rows: revenue and expenses share no key, and joining them would
   * multiply every revenue line by the number of expenses in its month.
   */
  incomeVsExpenses: permissionProcedure("reports.read", "finance.read")
    .input(rangeInput)
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const [income, spend] = await Promise.all([
        db
          .select({
            month: sql<string>`to_char(${MONTH}, 'YYYY-MM')`,
            total: sql<string>`coalesce(sum(${revenueTransactions.amount}), 0)`,
          })
          .from(revenueTransactions)
          .where(revenueWindow(input))
          .groupBy(MONTH),
        db
          .select({
            month: sql<string>`to_char(date_trunc('month', ${expenses.expenseDate}), 'YYYY-MM')`,
            total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
          })
          .from(expenses)
          .where(expenseWindow(input))
          .groupBy(sql`date_trunc('month', ${expenses.expenseDate})`),
      ]);

      const byMonth = new Map<string, { income: number; expenses: number }>();
      for (const row of income) {
        byMonth.set(row.month, { income: money(row.total), expenses: 0 });
      }
      for (const row of spend) {
        const entry = byMonth.get(row.month) ?? { income: 0, expenses: 0 };
        entry.expenses = money(row.total);
        byMonth.set(row.month, entry);
      }

      const rows = [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, value]) => ({
          month,
          income: value.income,
          expenses: value.expenses,
          profit: value.income - value.expenses,
        }));

      const totals = rows.reduce(
        (sum, row) => ({
          income: sum.income + row.income,
          expenses: sum.expenses + row.expenses,
          profit: sum.profit + row.profit,
        }),
        { income: 0, expenses: 0, profit: 0 },
      );

      return { rows, totals };
    }),

  /**
   * Profit and loss for one window: where the money came from, where it went,
   * and what is left.
   */
  profitAndLoss: permissionProcedure("reports.read", "finance.read")
    .input(rangeInput)
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const [incomeRows, expenseRows] = await Promise.all([
        db
          .select({
            source: revenueTransactions.source,
            total: sql<string>`coalesce(sum(${revenueTransactions.amount}), 0)`,
          })
          .from(revenueTransactions)
          .where(revenueWindow(input))
          .groupBy(revenueTransactions.source),
        db
          .select({
            category: expenses.category,
            categoryName: expenseCategories.name,
            total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
          })
          .from(expenses)
          .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
          .where(expenseWindow(input))
          .groupBy(expenses.category, expenseCategories.name),
      ]);

      const income = incomeRows
        .map(row => ({ label: row.source, amount: money(row.total) }))
        .sort((a, b) => b.amount - a.amount);

      const outgoings = expenseRows
        .map(row => ({ label: row.categoryName ?? row.category, amount: money(row.total) }))
        .sort((a, b) => b.amount - a.amount);

      const totalIncome = income.reduce((sum, row) => sum + row.amount, 0);
      const totalExpenses = outgoings.reduce((sum, row) => sum + row.amount, 0);

      return {
        income,
        expenses: outgoings,
        totalIncome,
        totalExpenses,
        netProfit: totalIncome - totalExpenses,
        // Guarded: a window with no income would otherwise divide by zero.
        margin: totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0,
      };
    }),

  /**
   * Fee collection by programme: billed against collected.
   *
   * Charges carry `amountPaid` maintained by the allocator, so collection is
   * read off the charge rather than re-derived from payment rows — the two
   * agree by construction, and only one of them knows which charge a part
   * payment settled.
   */
  feeCollection: permissionProcedure("reports.read", "fees.read")
    .input(rangeInput)
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const where = and(
        input.dateFrom ? gte(feeCharges.createdAt, input.dateFrom) : undefined,
        input.dateTo ? lte(feeCharges.createdAt, input.dateTo) : undefined,
      );

      const rows = await db
        .select({
          feeType: feeCharges.feeType,
          charges: count(),
          billed: sql<string>`coalesce(sum(${feeCharges.amountDue}), 0)`,
          collected: sql<string>`coalesce(sum(${feeCharges.amountPaid}), 0)`,
        })
        .from(feeCharges)
        .where(where)
        .groupBy(feeCharges.feeType);

      const mapped = rows
        .map(row => {
          const billed = money(row.billed);
          const collected = money(row.collected);
          return {
            feeType: row.feeType,
            charges: Number(row.charges),
            billed,
            collected,
            outstanding: billed - collected,
            collectionRate: billed > 0 ? (collected / billed) * 100 : 0,
          };
        })
        .sort((a, b) => b.billed - a.billed);

      const totals = mapped.reduce(
        (sum, row) => ({
          charges: sum.charges + row.charges,
          billed: sum.billed + row.billed,
          collected: sum.collected + row.collected,
          outstanding: sum.outstanding + row.outstanding,
        }),
        { charges: 0, billed: 0, collected: 0, outstanding: 0 },
      );

      return {
        rows: mapped,
        totals: {
          ...totals,
          collectionRate: totals.billed > 0 ? (totals.collected / totals.billed) * 100 : 0,
        },
      };
    }),

  /* ---------------------------------------------------------------------- */
  /* School                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Per-course performance: how many enrolled, how many finished, and how they
   * scored.
   *
   * Enrolment and result counts are gathered separately for the same reason as
   * income and expenses above — one student with six results would otherwise
   * be counted six times in the enrolment column.
   */
  coursePerformance: permissionProcedure("reports.read", "academics.read")
    .input(rangeInput)
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const window = and(
        input.dateFrom ? gte(enrollments.enrolledAt, input.dateFrom) : undefined,
        input.dateTo ? lte(enrollments.enrolledAt, input.dateTo) : undefined,
      );

      const [courseRows, enrolmentRows, scoreRows, certificateRows] = await Promise.all([
        db.select({ id: courses.id, title: courses.title, code: courses.code }).from(courses),
        db
          .select({
            courseId: enrollments.courseId,
            enrolled: count(),
            completed: sql<number>`count(*) filter (where ${enrollments.completedAt} is not null)`,
            averageProgress: avg(enrollments.progressPercent),
          })
          .from(enrollments)
          .where(window)
          .groupBy(enrollments.courseId),
        db
          .select({
            courseId: assessments.courseId,
            results: count(),
            // Scored out of the assessment's own total, so courses marked out
            // of 50 and out of 100 are comparable.
            averagePercent: sql<string>`avg(${assessmentResults.score} * 100.0 / nullif(${assessments.totalScore}, 0))`,
          })
          .from(assessmentResults)
          .innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id))
          .groupBy(assessments.courseId),
        db
          .select({ courseId: certificates.courseId, issued: count() })
          .from(certificates)
          .where(eq(certificates.status, "issued"))
          .groupBy(certificates.courseId),
      ]);

      const enrolmentBy = new Map(enrolmentRows.map(row => [row.courseId, row]));
      const scoreBy = new Map(scoreRows.map(row => [row.courseId, row]));
      const certificateBy = new Map(certificateRows.map(row => [row.courseId, row]));

      const rows = courseRows
        .map(course => {
          const enrolment = enrolmentBy.get(course.id);
          const score = scoreBy.get(course.id);
          const enrolled = Number(enrolment?.enrolled ?? 0);
          const completed = Number(enrolment?.completed ?? 0);

          return {
            courseId: course.id,
            code: course.code,
            title: course.title,
            enrolled,
            completed,
            completionRate: enrolled > 0 ? (completed / enrolled) * 100 : 0,
            averageProgress: Number(enrolment?.averageProgress ?? 0),
            resultsRecorded: Number(score?.results ?? 0),
            averageScore: Number(score?.averagePercent ?? 0),
            certificatesIssued: Number(certificateBy.get(course.id)?.issued ?? 0),
          };
        })
        .sort((a, b) => b.enrolled - a.enrolled);

      return {
        rows,
        totals: {
          courses: rows.length,
          enrolled: rows.reduce((sum, row) => sum + row.enrolled, 0),
          completed: rows.reduce((sum, row) => sum + row.completed, 0),
          certificatesIssued: rows.reduce((sum, row) => sum + row.certificatesIssued, 0),
        },
      };
    }),

  /**
   * Attendance per student, against the minimum the school sets.
   *
   * `excused` counts as neither present nor a missed session: it is an
   * authorised absence, and holding it against a rate would punish the student
   * for something already approved.
   */
  attendance: permissionProcedure("reports.read", "attendance.read")
    .input(listInputSchema)
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        input.dateFrom ? gte(attendanceRecords.classDate, input.dateFrom) : undefined,
        input.dateTo ? lte(attendanceRecords.classDate, input.dateTo) : undefined,
        input.search
          ? or(
              ilike(studentProfiles.fullName, likePattern(input.search)),
              ilike(studentProfiles.studentNumber, likePattern(input.search)),
            )
          : undefined,
      );

      const grouped = db
        .select({
          studentId: enrollments.studentId,
          // Every raw-SQL column in a subquery needs an explicit alias: without
          // one, reading it back off `grouped` below throws at query time even
          // though the types line up.
          sessions: count().as("sessions"),
          present: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'present')`.as("present"),
          late: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'late')`.as("late"),
          absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')`.as("absent"),
          excused: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'excused')`.as("excused"),
        })
        .from(attendanceRecords)
        .innerJoin(enrollments, eq(attendanceRecords.enrollmentId, enrollments.id))
        // Joined inside the grouping because the search filters on the student,
        // and a predicate cannot reference a table the subquery never reads.
        .innerJoin(studentProfiles, eq(enrollments.studentId, studentProfiles.id))
        .where(where)
        .groupBy(enrollments.studentId)
        .as("grouped");

      const [rows, [total]] = await Promise.all([
        db
          .select({
            studentId: studentProfiles.id,
            studentNumber: studentProfiles.studentNumber,
            fullName: studentProfiles.fullName,
            sessions: grouped.sessions,
            present: grouped.present,
            late: grouped.late,
            absent: grouped.absent,
            excused: grouped.excused,
          })
          .from(grouped)
          .innerJoin(studentProfiles, eq(grouped.studentId, studentProfiles.id))
          .orderBy(desc(grouped.sessions))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(grouped),
      ]);

      return paginate(
        rows.map(row => {
          const counted = Number(row.sessions) - Number(row.excused);
          const attended = Number(row.present) + Number(row.late);
          return {
            ...row,
            sessions: Number(row.sessions),
            present: Number(row.present),
            late: Number(row.late),
            absent: Number(row.absent),
            excused: Number(row.excused),
            attendanceRate: counted > 0 ? (attended / counted) * 100 : 0,
          };
        }),
        Number(total?.total ?? 0),
        input,
      );
    }),

  /** Everyone who has been awarded a certificate, newest first. */
  graduates: permissionProcedure("reports.read", "certificates.read")
    .input(listInputSchema)
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        eq(certificates.status, "issued"),
        input.dateFrom ? gte(certificates.issuedAt, input.dateFrom) : undefined,
        input.dateTo ? lte(certificates.issuedAt, input.dateTo) : undefined,
        input.search
          ? or(
              ilike(studentProfiles.fullName, likePattern(input.search)),
              ilike(studentProfiles.studentNumber, likePattern(input.search)),
              ilike(certificates.certificateNumber, likePattern(input.search)),
            )
          : undefined,
      );

      const [rows, [total]] = await Promise.all([
        db
          .select({
            certificateId: certificates.id,
            certificateNumber: certificates.certificateNumber,
            studentNumber: studentProfiles.studentNumber,
            fullName: studentProfiles.fullName,
            email: studentProfiles.email,
            courseTitle: courses.title,
            finalGrade: certificates.finalGrade,
            completionDate: certificates.completionDate,
            issuedAt: certificates.issuedAt,
          })
          .from(certificates)
          .innerJoin(studentProfiles, eq(certificates.studentId, studentProfiles.id))
          .innerJoin(courses, eq(certificates.courseId, courses.id))
          .where(where)
          .orderBy(desc(certificates.issuedAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: count() })
          .from(certificates)
          .innerJoin(studentProfiles, eq(certificates.studentId, studentProfiles.id))
          .where(where),
      ]);

      return paginate(rows, Number(total?.total ?? 0), input);
    }),

  /* ---------------------------------------------------------------------- */
  /* Stock and commerce                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * What the stock on hand is worth, at cost and at retail.
   *
   * Retail value is only meaningful for items actually offered for sale, so
   * classroom consumables contribute to the cost column and not the retail
   * one. Reporting them at a selling price they will never be sold at would
   * inflate the figure.
   */
  stockValuation: permissionProcedure("reports.read", "inventory.read")
    .input(listInputSchema)
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        sql`${inventoryItems.deletedAt} is null`,
        input.search
          ? or(
              ilike(inventoryItems.name, likePattern(input.search)),
              ilike(inventoryItems.sku, likePattern(input.search)),
            )
          : undefined,
      );

      const [rows, [total], [totals]] = await Promise.all([
        db
          .select({
            id: inventoryItems.id,
            sku: inventoryItems.sku,
            name: inventoryItems.name,
            categoryName: productCategories.name,
            supplierName: suppliers.name,
            quantityOnHand: inventoryItems.quantityOnHand,
            reorderLevel: inventoryItems.reorderLevel,
            unitCost: inventoryItems.unitCost,
            sellingPrice: inventoryItems.sellingPrice,
            isSellable: inventoryItems.isSellable,
          })
          .from(inventoryItems)
          .leftJoin(productCategories, eq(inventoryItems.categoryId, productCategories.id))
          .leftJoin(suppliers, eq(inventoryItems.supplierId, suppliers.id))
          .where(where)
          .orderBy(desc(sql`${inventoryItems.quantityOnHand} * ${inventoryItems.unitCost}`))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(inventoryItems).where(where),
        db
          .select({
            atCost: sql<string>`coalesce(sum(${inventoryItems.quantityOnHand} * ${inventoryItems.unitCost}), 0)`,
            atRetail: sql<string>`coalesce(sum(${inventoryItems.quantityOnHand} * ${inventoryItems.sellingPrice}) filter (where ${inventoryItems.isSellable}), 0)`,
            units: sql<string>`coalesce(sum(${inventoryItems.quantityOnHand}), 0)`,
            lowStock: sql<number>`count(*) filter (where ${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel})`,
          })
          .from(inventoryItems)
          .where(where),
      ]);

      const atCost = money(totals?.atCost);
      const atRetail = money(totals?.atRetail);

      return {
        ...paginate(
          rows.map(row => {
            const unitCost = money(row.unitCost);
            const sellingPrice = money(row.sellingPrice);
            return {
              ...row,
              unitCost,
              sellingPrice,
              costValue: unitCost * row.quantityOnHand,
              retailValue: row.isSellable ? sellingPrice * row.quantityOnHand : 0,
              isLowStock: row.quantityOnHand <= row.reorderLevel,
            };
          }),
          Number(total?.total ?? 0),
          input,
        ),
        totals: {
          atCost,
          atRetail,
          potentialMargin: atRetail - atCost,
          units: Number(totals?.units ?? 0),
          lowStock: Number(totals?.lowStock ?? 0),
        },
      };
    }),

  /**
   * Which products actually sell.
   *
   * Cancelled orders are excluded — an order that was placed and withdrawn is
   * not a sale, and counting it would overstate both units and revenue.
   */
  productSales: permissionProcedure("reports.read", "orders.read")
    .input(listInputSchema)
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        ne(storeOrders.fulfillmentStatus, "cancelled"),
        input.dateFrom ? gte(storeOrders.createdAt, input.dateFrom) : undefined,
        input.dateTo ? lte(storeOrders.createdAt, input.dateTo) : undefined,
        input.search ? ilike(orderItems.itemName, likePattern(input.search)) : undefined,
      );

      const grouped = db
        .select({
          itemName: orderItems.itemName,
          unitsSold: sql<string>`sum(${orderItems.quantity})`.as("unitsSold"),
          revenue: sql<string>`sum(${orderItems.lineTotal})`.as("revenue"),
          orderCount: sql<number>`count(distinct ${orderItems.orderId})`.as("orderCount"),
        })
        .from(orderItems)
        .innerJoin(storeOrders, eq(orderItems.orderId, storeOrders.id))
        .where(where)
        .groupBy(orderItems.itemName)
        .as("grouped");

      const [rows, [total]] = await Promise.all([
        db
          .select()
          .from(grouped)
          .orderBy(desc(grouped.revenue))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(grouped),
      ]);

      return paginate(
        rows.map(row => ({
          itemName: row.itemName,
          unitsSold: Number(row.unitsSold ?? 0),
          orderCount: Number(row.orderCount ?? 0),
          revenue: money(row.revenue),
        })),
        Number(total?.total ?? 0),
        input,
      );
    }),
});
