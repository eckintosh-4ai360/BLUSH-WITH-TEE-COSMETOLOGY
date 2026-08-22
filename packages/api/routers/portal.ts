import { desc, eq } from "drizzle-orm";
import {
  applicationDocuments,
  applications,
  assessmentResults,
  assessments,
  attendanceRecords,
  courses,
  enrollments,
  feeCharges,
  payments,
  storeOrders,
  studentProfiles,
} from "@blush/db/schema";
import { storageGet } from "@blush/storage";
import { dbOrThrow } from "../dbOrThrow";
import { money } from "../platform.utils";
import { router, studentProcedure } from "../trpc";

export const portalRouter = router({
  mine: studentProcedure.query(async ({ ctx }) => {
    const db = await dbOrThrow();
    const [profile] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, ctx.user.id)).limit(1);
    if (!profile) return { role: ctx.user.role, profile: null, enrollment: [], balances: [], attendance: [], results: [], application: null, documents: [], orders: [] };
    const enrolled = await db.select({ enrollment: enrollments, courseTitle: courses.title }).from(enrollments).innerJoin(courses, eq(enrollments.courseId, courses.id)).where(eq(enrollments.studentId, profile.id));
    const balances = await db.select().from(feeCharges).where(eq(feeCharges.studentId, profile.id));
    const attendance = await db.select({ attendance: attendanceRecords, courseTitle: courses.title }).from(attendanceRecords).innerJoin(enrollments, eq(attendanceRecords.enrollmentId, enrollments.id)).innerJoin(courses, eq(enrollments.courseId, courses.id)).where(eq(enrollments.studentId, profile.id)).orderBy(desc(attendanceRecords.classDate)).limit(12);
    const results = await db.select({ result: assessmentResults, title: assessments.title, assessmentType: assessments.assessmentType, totalScore: assessments.totalScore }).from(assessmentResults).innerJoin(assessments, eq(assessmentResults.assessmentId, assessments.id)).where(eq(assessmentResults.studentId, profile.id)).orderBy(desc(assessmentResults.createdAt));
    const orders = await db.select().from(storeOrders).where(eq(storeOrders.userId, ctx.user.id)).orderBy(desc(storeOrders.createdAt));
    const [application] = profile.applicationId ? await db.select().from(applications).where(eq(applications.id, profile.applicationId)).limit(1) : [undefined];
    const documents = profile.applicationId ? await db.select().from(applicationDocuments).where(eq(applicationDocuments.applicationId, profile.applicationId)) : [];
    const paymentHistory = await db.select().from(payments).where(eq(payments.studentId, profile.id)).orderBy(desc(payments.paidAt));
    return {
      role: ctx.user.role,
      profile,
      enrollment: enrolled,
      balances,
      attendance,
      results,
      application,
      documents: await Promise.all(documents.map(async document => ({ ...document, url: (await storageGet(document.storageKey)).url }))),
      payments: paymentHistory.map(payment => ({ ...payment, amount: money(payment.amount) })),
      orders: orders.map(order => ({ ...order, total: money(order.total) })),
    };
  }),
});
