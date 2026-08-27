import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  applications,
  certificates,
  courses,
  customers,
  inventoryItems,
  payments,
  people,
  storeOrders,
  studentProfiles,
} from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import {
  admissionMetrics,
  commerceMetrics,
  coursePopularity,
  enrollmentByMonth,
  expensesByCategory,
  financeMetrics,
  inventoryMovementByMonth,
  inventoryMetrics,
  productSales,
  revenueByMonth,
  studentMetrics,
} from "../services/analytics";
import { ensurePlatformBootstrapped } from "../services/bootstrap";
import { likePattern } from "../services/pagination";
import { money } from "../services/money";
import { anyPermissionProcedure, authedProcedure, router } from "../trpc";

const overviewProcedure = anyPermissionProcedure(
  "students.read",
  "finance.read",
  "orders.read",
  "inventory.read",
  "admissions.read",
);

export const dashboardRouter = router({
  /**
   * Everything the owner asks at a glance (§20). Each group is permission
   * filtered, so an accountant sees money and a storekeeper sees stock without
   * either being handed the other.
   */
  overview: overviewProcedure.query(async ({ ctx }) => {
    const db = await dbOrThrow();
    await ensurePlatformBootstrapped(db);

    const [students, finance, inventory, commerce, admissions] = await Promise.all([
      ctx.access.can("students.read") ? studentMetrics(db) : null,
      ctx.access.can("finance.read") ? financeMetrics(db) : null,
      ctx.access.can("inventory.read") ? inventoryMetrics(db) : null,
      ctx.access.can("orders.read") ? commerceMetrics(db) : null,
      ctx.access.can("admissions.read") ? admissionMetrics(db) : null,
    ]);

    return { students, finance, inventory, commerce, admissions };
  }),

  /** The six analytics series named in §20 and §70. */
  charts: overviewProcedure.query(async ({ ctx }) => {
    const db = await dbOrThrow();
    const canSeeMoney = ctx.access.can("finance.read");

    const [revenue, expenses, enrollment, products, popularity, movement] = await Promise.all([
      canSeeMoney ? revenueByMonth(db) : null,
      canSeeMoney ? expensesByCategory(db) : null,
      ctx.access.can("students.read") ? enrollmentByMonth(db) : null,
      ctx.access.canAny("orders.read", "products.read") ? productSales(db) : null,
      ctx.access.canAny("academics.read", "students.read") ? coursePopularity(db) : null,
      ctx.access.can("inventory.read") ? inventoryMovementByMonth(db) : null,
    ]);

    return { revenue, expenses, enrollment, products, popularity, movement };
  }),

  /** Recent activity strip under the metric tiles. */
  activity: overviewProcedure.query(async ({ ctx }) => {
    const db = await dbOrThrow();

    const [recentApplications, recentOrders, recentPayments, lowStock] = await Promise.all([
      ctx.access.can("admissions.read")
        ? db
            .select({
              id: applications.id,
              reference: applications.reference,
              fullName: applications.fullName,
              status: applications.status,
              createdAt: applications.createdAt,
              courseTitle: courses.title,
            })
            .from(applications)
            .innerJoin(courses, eq(applications.courseId, courses.id))
            .where(isNull(applications.deletedAt))
            .orderBy(desc(applications.createdAt))
            .limit(6)
        : [],
      ctx.access.can("orders.read")
        ? db
            .select({
              id: storeOrders.id,
              orderNumber: storeOrders.orderNumber,
              customerName: storeOrders.customerName,
              total: storeOrders.total,
              paymentStatus: storeOrders.paymentStatus,
              fulfillmentStatus: storeOrders.fulfillmentStatus,
              createdAt: storeOrders.createdAt,
            })
            .from(storeOrders)
            .orderBy(desc(storeOrders.createdAt))
            .limit(6)
        : [],
      ctx.access.can("payments.read")
        ? db
            .select({
              id: payments.id,
              reference: payments.reference,
              amount: payments.amount,
              paymentMethod: payments.paymentMethod,
              paidAt: payments.paidAt,
              studentName: studentProfiles.fullName,
            })
            .from(payments)
            .leftJoin(studentProfiles, eq(payments.studentId, studentProfiles.id))
            .where(eq(payments.status, "completed"))
            .orderBy(desc(payments.paidAt))
            .limit(6)
        : [],
      ctx.access.can("inventory.read")
        ? db
            .select({
              id: inventoryItems.id,
              name: inventoryItems.name,
              sku: inventoryItems.sku,
              quantityOnHand: inventoryItems.quantityOnHand,
              reorderLevel: inventoryItems.reorderLevel,
            })
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.isActive, true),
                isNull(inventoryItems.deletedAt),
                sql`${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`,
              ),
            )
            .orderBy(inventoryItems.quantityOnHand)
            .limit(6)
        : [],
    ]);

    return {
      recentApplications,
      recentOrders: recentOrders.map(order => ({ ...order, total: money(order.total) })),
      recentPayments: recentPayments.map(payment => ({
        ...payment,
        amount: money(payment.amount),
      })),
      lowStock,
    };
  }),

  /**
   * Global admin search (§61). One box that resolves a student number, an
   * order reference, a certificate number, a person, or a product.
   */
  search: authedProcedure
    .input(z.object({ term: z.string().trim().min(2).max(80) }))
    .query(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const pattern = likePattern(input.term);

      const [students, applicants, orders, products, customerRows, certificateRows] =
        await Promise.all([
          ctx.access.can("students.read")
            ? db
                .select({
                  id: studentProfiles.id,
                  studentNumber: studentProfiles.studentNumber,
                  fullName: studentProfiles.fullName,
                  status: studentProfiles.status,
                })
                .from(studentProfiles)
                .where(
                  and(
                    isNull(studentProfiles.deletedAt),
                    or(
                      ilike(studentProfiles.studentNumber, pattern),
                      ilike(studentProfiles.fullName, pattern),
                      ilike(studentProfiles.email, pattern),
                      ilike(studentProfiles.phone, pattern),
                    ),
                  ),
                )
                .limit(5)
            : [],
          ctx.access.can("admissions.read")
            ? db
                .select({
                  id: applications.id,
                  reference: applications.reference,
                  fullName: applications.fullName,
                  status: applications.status,
                })
                .from(applications)
                .where(
                  and(
                    isNull(applications.deletedAt),
                    or(
                      ilike(applications.reference, pattern),
                      ilike(applications.fullName, pattern),
                      ilike(applications.email, pattern),
                    ),
                  ),
                )
                .limit(5)
            : [],
          ctx.access.can("orders.read")
            ? db
                .select({
                  id: storeOrders.id,
                  orderNumber: storeOrders.orderNumber,
                  customerName: storeOrders.customerName,
                  total: storeOrders.total,
                  fulfillmentStatus: storeOrders.fulfillmentStatus,
                })
                .from(storeOrders)
                .where(
                  or(
                    ilike(storeOrders.orderNumber, pattern),
                    ilike(storeOrders.customerName, pattern),
                    ilike(storeOrders.customerEmail, pattern),
                  ),
                )
                .limit(5)
            : [],
          ctx.access.canAny("products.read", "inventory.read")
            ? db
                .select({
                  id: inventoryItems.id,
                  sku: inventoryItems.sku,
                  name: inventoryItems.name,
                  quantityOnHand: inventoryItems.quantityOnHand,
                })
                .from(inventoryItems)
                .where(
                  and(
                    isNull(inventoryItems.deletedAt),
                    or(ilike(inventoryItems.sku, pattern), ilike(inventoryItems.name, pattern)),
                  ),
                )
                .limit(5)
            : [],
          ctx.access.can("customers.read")
            ? db
                .select({
                  id: customers.id,
                  fullName: people.fullName,
                  email: people.email,
                  phone: people.phone,
                })
                .from(customers)
                .innerJoin(people, eq(customers.personId, people.id))
                .where(
                  and(
                    isNull(customers.deletedAt),
                    or(
                      ilike(people.fullName, pattern),
                      ilike(people.email, pattern),
                      ilike(people.phone, pattern),
                    ),
                  ),
                )
                .limit(5)
            : [],
          ctx.access.can("certificates.read")
            ? db
                .select({
                  id: certificates.id,
                  certificateNumber: certificates.certificateNumber,
                  studentName: studentProfiles.fullName,
                  status: certificates.status,
                })
                .from(certificates)
                .innerJoin(studentProfiles, eq(certificates.studentId, studentProfiles.id))
                .where(ilike(certificates.certificateNumber, pattern))
                .limit(5)
            : [],
        ]);

      return {
        students: students.map(row => ({
          ...row,
          href: `/students?student=${row.id}`,
          label: `${row.studentNumber} - ${row.fullName}`,
        })),
        applications: applicants.map(row => ({
          ...row,
          href: `/admissions?application=${row.id}`,
          label: `${row.reference} - ${row.fullName}`,
        })),
        orders: orders.map(row => ({
          ...row,
          total: money(row.total),
          href: `/orders/${row.id}`,
          label: `${row.orderNumber} - ${row.customerName}`,
        })),
        products: products.map(row => ({
          ...row,
          href: `/inventory?item=${row.id}`,
          label: `${row.sku} - ${row.name}`,
        })),
        customers: customerRows.map(row => ({
          ...row,
          href: `/orders?search=${encodeURIComponent(row.fullName)}`,
          label: row.fullName,
        })),
        certificates: certificateRows.map(row => ({
          ...row,
          href: `/students/certificates?search=${encodeURIComponent(row.certificateNumber)}`,
          label: `${row.certificateNumber} - ${row.studentName}`,
        })),
      };
    }),
});
