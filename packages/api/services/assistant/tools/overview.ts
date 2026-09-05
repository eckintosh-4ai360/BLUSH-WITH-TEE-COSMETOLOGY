import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  applications,
  certificates,
  courses,
  customers,
  inventoryItems,
  people,
  storeOrders,
  studentProfiles,
} from "@blush/db/schema";
import {
  admissionMetrics,
  commerceMetrics,
  financeMetrics,
  inventoryMetrics,
  studentMetrics,
} from "../../analytics";
import { defineTool } from "../types";
import { likeTerm } from "./shared";

export const overviewTools = [
  defineTool({
    name: "school_overview",
    description:
      "Headline numbers for the whole school: students, money, stock, store orders, admissions. Use first for any broad question about how things are going.",
    permissions: [
      "students.read",
      "finance.read",
      "orders.read",
      "inventory.read",
      "admissions.read",
    ],
    input: z.object({}),
    async run(_args, ctx) {
      const access = ctx.access;

      // Each block is fetched only if the caller may see it, so the model is
      // never handed a figure it would then have to be trusted not to repeat.
      const [students, finance, inventory, commerce, admissions] = await Promise.all([
        access?.can("students.read") ? studentMetrics(ctx.db) : null,
        access?.can("finance.read") ? financeMetrics(ctx.db) : null,
        access?.can("inventory.read") ? inventoryMetrics(ctx.db) : null,
        access?.can("orders.read") ? commerceMetrics(ctx.db) : null,
        access?.can("admissions.read") ? admissionMetrics(ctx.db) : null,
      ]);

      return {
        currency: "GHS",
        asOf: ctx.now.toISOString(),
        students: students ?? "withheld - no permission",
        finance: finance ?? "withheld - no permission",
        inventory: inventory ?? "withheld - no permission",
        store: commerce ?? "withheld - no permission",
        admissions: admissions ?? "withheld - no permission",
      };
    },
  }),

  defineTool({
    name: "find_record",
    description:
      "Resolve a name, number or reference of unknown kind across students, applications, orders, products, customers and certificates.",
    permissions: [
      "students.read",
      "admissions.read",
      "orders.read",
      "products.read",
      "customers.read",
      "certificates.read",
    ],
    input: z.object({
      term: z.string().min(2).describe("Name, number or reference to look for."),
    }),
    async run(args, ctx) {
      const term = likeTerm(args.term);
      const access = ctx.access;

      const [student, application, order, product, customer, certificate] = await Promise.all([
        access?.can("students.read")
          ? ctx.db
              .select({
                studentNumber: studentProfiles.studentNumber,
                fullName: studentProfiles.fullName,
                status: studentProfiles.status,
              })
              .from(studentProfiles)
              .where(
                and(
                  isNull(studentProfiles.deletedAt),
                  or(
                    ilike(studentProfiles.fullName, term),
                    ilike(studentProfiles.studentNumber, term),
                    ilike(studentProfiles.email, term),
                    ilike(studentProfiles.phone, term),
                  ),
                ),
              )
              .limit(5)
          : [],
        access?.can("admissions.read")
          ? ctx.db
              .select({
                reference: applications.reference,
                fullName: applications.fullName,
                status: applications.status,
                course: courses.title,
              })
              .from(applications)
              .innerJoin(courses, eq(applications.courseId, courses.id))
              .where(
                and(
                  isNull(applications.deletedAt),
                  or(
                    ilike(applications.fullName, term),
                    ilike(applications.reference, term),
                    ilike(applications.email, term),
                    ilike(applications.phone, term),
                  ),
                ),
              )
              .limit(5)
          : [],
        access?.can("orders.read")
          ? ctx.db
              .select({
                orderNumber: storeOrders.orderNumber,
                customer: storeOrders.customerName,
                total: storeOrders.total,
                paymentStatus: storeOrders.paymentStatus,
                fulfillmentStatus: storeOrders.fulfillmentStatus,
              })
              .from(storeOrders)
              .where(
                or(ilike(storeOrders.orderNumber, term), ilike(storeOrders.customerName, term)),
              )
              .orderBy(desc(storeOrders.createdAt))
              .limit(5)
          : [],
        access?.canAny("products.read", "inventory.read")
          ? ctx.db
              .select({
                sku: inventoryItems.sku,
                name: inventoryItems.name,
                quantityOnHand: inventoryItems.quantityOnHand,
                sellingPrice: inventoryItems.sellingPrice,
              })
              .from(inventoryItems)
              .where(
                and(
                  isNull(inventoryItems.deletedAt),
                  or(ilike(inventoryItems.name, term), ilike(inventoryItems.sku, term)),
                ),
              )
              .limit(5)
          : [],
        access?.can("customers.read")
          ? ctx.db
              .select({
                name: people.fullName,
                email: people.email,
                phone: people.phone,
                totalSpent: customers.totalSpent,
              })
              .from(customers)
              .innerJoin(people, eq(customers.personId, people.id))
              .where(
                and(
                  isNull(customers.deletedAt),
                  or(
                    ilike(people.fullName, term),
                    ilike(people.email, term),
                    ilike(people.phone, term),
                  ),
                ),
              )
              .limit(5)
          : [],
        access?.can("certificates.read")
          ? ctx.db
              .select({
                certificateNumber: certificates.certificateNumber,
                student: studentProfiles.fullName,
                status: certificates.status,
                course: courses.title,
              })
              .from(certificates)
              .innerJoin(studentProfiles, eq(certificates.studentId, studentProfiles.id))
              .innerJoin(courses, eq(certificates.courseId, courses.id))
              .where(
                or(
                  ilike(certificates.certificateNumber, term),
                  ilike(studentProfiles.fullName, term),
                ),
              )
              .limit(5)
          : [],
      ]);

      const matches = {
        students: student,
        applications: application,
        orders: order,
        products: product,
        customers: customer,
        certificates: certificate,
      };

      const found = Object.values(matches).reduce((sum, rows) => sum + rows.length, 0);

      return { searchedFor: args.term, matchesFound: found, matches };
    },
  }),
];
