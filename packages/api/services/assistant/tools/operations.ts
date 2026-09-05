import { and, asc, count, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  appointments,
  clinicServices,
  customers,
  inventoryItems,
  inventoryMovements,
  orderItems,
  people,
  purchaseOrders,
  staffProfiles,
  storeOrders,
  suppliers,
  users,
} from "@blush/db/schema";
import { fromMinor, toMinor } from "../../money";
import { defineTool } from "../types";
import { isoDay, likeTerm, since } from "./shared";

export const inventoryTools = [
  defineTool({
    name: "inventory_status",
    description:
      "Stock on hand, what is low, and what it is worth. Use for stock levels and reordering.",
    permissions: ["inventory.read", "products.read"],
    input: z.object({
      search: z.string().optional().describe("Item name, SKU or category."),
      lowStockOnly: z.boolean().default(false).describe("Only items at or below reorder level."),
      limit: z.number().int().min(1).max(40).default(20),
    }),
    async run(args, ctx) {
      const filters = [isNull(inventoryItems.deletedAt), eq(inventoryItems.isActive, true)];
      if (args.lowStockOnly) {
        filters.push(sql`${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`);
      }
      if (args.search) {
        const term = likeTerm(args.search);
        filters.push(
          or(
            ilike(inventoryItems.name, term),
            ilike(inventoryItems.sku, term),
            ilike(inventoryItems.category, term),
          )!,
        );
      }

      const [rows, totals] = await Promise.all([
        ctx.db
          .select({
            sku: inventoryItems.sku,
            name: inventoryItems.name,
            category: inventoryItems.category,
            quantityOnHand: inventoryItems.quantityOnHand,
            reorderLevel: inventoryItems.reorderLevel,
            unitCost: inventoryItems.unitCost,
            sellingPrice: inventoryItems.sellingPrice,
            soldOnline: inventoryItems.isSellable,
          })
          .from(inventoryItems)
          .where(and(...filters))
          .orderBy(args.lowStockOnly ? asc(inventoryItems.quantityOnHand) : asc(inventoryItems.name))
          .limit(args.limit),
        ctx.db
          .select({
            items: count(),
            lowStock: sql<number>`count(*) filter (where ${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel})`,
            outOfStock: sql<number>`count(*) filter (where ${inventoryItems.quantityOnHand} <= 0)`,
            stockValue: sql<string>`coalesce(sum(${inventoryItems.quantityOnHand} * ${inventoryItems.unitCost}), 0)`,
          })
          .from(inventoryItems)
          .where(and(isNull(inventoryItems.deletedAt), eq(inventoryItems.isActive, true))),
      ]);

      return {
        currency: "GHS",
        overall: {
          items: totals[0]?.items ?? 0,
          lowStock: Number(totals[0]?.lowStock ?? 0),
          outOfStock: Number(totals[0]?.outOfStock ?? 0),
          stockValueAtCost: fromMinor(toMinor(totals[0]?.stockValue)),
        },
        shown: rows.length,
        items: rows.map(row => ({
          ...row,
          needsReorder: row.quantityOnHand <= row.reorderLevel,
        })),
      };
    },
  }),

  defineTool({
    name: "stock_movements",
    description:
      "Recent stock movements: received, sold, used in class, written off.",
    permissions: ["inventory.read"],
    input: z.object({
      days: z.number().int().min(1).max(180).default(30),
      itemSearch: z.string().optional().describe("One item, by name or SKU."),
      limit: z.number().int().min(1).max(40).default(20),
    }),
    async run(args, ctx) {
      const from = since(ctx.now, args.days);
      const filters = [gte(inventoryMovements.createdAt, from)];
      if (args.itemSearch) {
        const term = likeTerm(args.itemSearch);
        filters.push(or(ilike(inventoryItems.name, term), ilike(inventoryItems.sku, term))!);
      }

      const [rows, byType] = await Promise.all([
        ctx.db
          .select({
            item: inventoryItems.name,
            sku: inventoryItems.sku,
            movementType: inventoryMovements.movementType,
            quantityDelta: inventoryMovements.quantityDelta,
            balanceAfter: inventoryMovements.balanceAfter,
            note: inventoryMovements.note,
            at: inventoryMovements.createdAt,
          })
          .from(inventoryMovements)
          .innerJoin(inventoryItems, eq(inventoryMovements.inventoryItemId, inventoryItems.id))
          .where(and(...filters))
          .orderBy(desc(inventoryMovements.createdAt))
          .limit(args.limit),
        ctx.db
          .select({
            movementType: inventoryMovements.movementType,
            units: sql<number>`coalesce(sum(abs(${inventoryMovements.quantityDelta})), 0)`,
          })
          .from(inventoryMovements)
          .where(gte(inventoryMovements.createdAt, from))
          .groupBy(inventoryMovements.movementType),
      ]);

      return {
        window: { days: args.days, from: isoDay(from) },
        movements: rows,
        unitsByType: Object.fromEntries(byType.map(row => [row.movementType, Number(row.units)])),
      };
    },
  }),

  defineTool({
    name: "list_suppliers",
    description: "Suppliers, what they supply and what is owed to them.",
    permissions: ["suppliers.read", "purchases.read"],
    input: z.object({
      search: z.string().optional().describe("Supplier or company name."),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    async run(args, ctx) {
      const filters = [isNull(suppliers.deletedAt)];
      if (args.search) {
        const term = likeTerm(args.search);
        filters.push(or(ilike(suppliers.name, term), ilike(suppliers.company, term))!);
      }

      const rows = await ctx.db
        .select({
          name: suppliers.name,
          company: suppliers.company,
          phone: suppliers.phone,
          email: suppliers.email,
          productsSupplied: suppliers.productsSupplied,
          outstandingBalance: suppliers.outstandingBalance,
          isActive: suppliers.isActive,
        })
        .from(suppliers)
        .where(and(...filters))
        .orderBy(desc(suppliers.outstandingBalance))
        .limit(args.limit);

      return { currency: "GHS", count: rows.length, suppliers: rows };
    },
  }),

  defineTool({
    name: "list_purchase_orders",
    description: "Purchase orders raised with suppliers and their progress.",
    permissions: ["purchases.read"],
    input: z.object({
      status: z
        .enum(["draft", "ordered", "partially_received", "received", "cancelled"])
        .optional(),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    async run(args, ctx) {
      const rows = await ctx.db
        .select({
          reference: purchaseOrders.reference,
          supplier: suppliers.name,
          orderDate: purchaseOrders.orderDate,
          expectedDate: purchaseOrders.expectedDate,
          status: purchaseOrders.status,
          total: purchaseOrders.total,
          amountPaid: purchaseOrders.amountPaid,
          receivedAt: purchaseOrders.receivedAt,
        })
        .from(purchaseOrders)
        .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
        .where(args.status ? eq(purchaseOrders.status, args.status) : undefined)
        .orderBy(desc(purchaseOrders.orderDate))
        .limit(args.limit);

      return { currency: "GHS", count: rows.length, purchaseOrders: rows };
    },
  }),
];

export const commerceTools = [
  defineTool({
    name: "list_orders",
    description:
      "Store orders with totals, payment and delivery state. Use for online sales or one order.",
    permissions: ["orders.read"],
    input: z.object({
      days: z.number().int().min(1).max(365).default(30),
      paymentStatus: z.enum(["pending", "paid", "refunded", "failed"]).optional(),
      fulfillmentStatus: z
        .enum(["new", "confirmed", "processing", "ready", "shipped", "delivered", "cancelled"])
        .optional(),
      search: z.string().optional().describe("Order number or customer name."),
      limit: z.number().int().min(1).max(40).default(15),
    }),
    async run(args, ctx) {
      const from = since(ctx.now, args.days);
      const filters = [gte(storeOrders.createdAt, from)];
      if (args.paymentStatus) filters.push(eq(storeOrders.paymentStatus, args.paymentStatus));
      if (args.fulfillmentStatus) {
        filters.push(eq(storeOrders.fulfillmentStatus, args.fulfillmentStatus));
      }
      if (args.search) {
        const term = likeTerm(args.search);
        filters.push(
          or(ilike(storeOrders.orderNumber, term), ilike(storeOrders.customerName, term))!,
        );
      }

      const [rows, totals] = await Promise.all([
        ctx.db
          .select({
            orderNumber: storeOrders.orderNumber,
            customer: storeOrders.customerName,
            phone: storeOrders.customerPhone,
            total: storeOrders.total,
            paymentStatus: storeOrders.paymentStatus,
            fulfillmentStatus: storeOrders.fulfillmentStatus,
            placedAt: storeOrders.createdAt,
          })
          .from(storeOrders)
          .where(and(...filters))
          .orderBy(desc(storeOrders.createdAt))
          .limit(args.limit),
        ctx.db
          .select({
            orders: count(),
            paidValue: sql<string>`coalesce(sum(${storeOrders.total}) filter (where ${storeOrders.paymentStatus} = 'paid'), 0)`,
            awaitingPayment: sql<number>`count(*) filter (where ${storeOrders.paymentStatus} = 'pending')`,
            awaitingDispatch: sql<number>`count(*) filter (where ${storeOrders.fulfillmentStatus} in ('new','confirmed','processing','ready'))`,
          })
          .from(storeOrders)
          .where(gte(storeOrders.createdAt, from)),
      ]);

      return {
        currency: "GHS",
        window: { days: args.days, from: isoDay(from) },
        windowTotals: {
          orders: totals[0]?.orders ?? 0,
          paidValue: fromMinor(toMinor(totals[0]?.paidValue)),
          awaitingPayment: Number(totals[0]?.awaitingPayment ?? 0),
          awaitingDispatch: Number(totals[0]?.awaitingDispatch ?? 0),
        },
        shown: rows.length,
        orders: rows,
      };
    },
  }),

  defineTool({
    name: "best_selling_products",
    description:
      "Top-selling products by units and value. Use for best sellers and what to restock.",
    permissions: ["orders.read", "products.read"],
    input: z.object({
      days: z.number().int().min(1).max(365).default(90),
      limit: z.number().int().min(1).max(25).default(10),
    }),
    async run(args, ctx) {
      const from = since(ctx.now, args.days);

      const rows = await ctx.db
        .select({
          item: orderItems.itemName,
          unitsSold: sql<number>`coalesce(sum(${orderItems.quantity} - ${orderItems.quantityReturned}), 0)`,
          value: sql<string>`coalesce(sum(${orderItems.lineTotal}), 0)`,
        })
        .from(orderItems)
        .innerJoin(storeOrders, eq(orderItems.orderId, storeOrders.id))
        .where(and(gte(storeOrders.createdAt, from), eq(storeOrders.paymentStatus, "paid")))
        .groupBy(orderItems.itemName)
        .orderBy(desc(sql`sum(${orderItems.quantity} - ${orderItems.quantityReturned})`))
        .limit(args.limit);

      return {
        currency: "GHS",
        window: { days: args.days, from: isoDay(from) },
        products: rows.map(row => ({
          item: row.item,
          unitsSold: Number(row.unitsSold),
          value: fromMinor(toMinor(row.value)),
        })),
      };
    },
  }),

  defineTool({
    name: "list_customers",
    description: "Store customers, what they have spent and when they last ordered.",
    permissions: ["customers.read"],
    input: z.object({
      search: z.string().optional().describe("Customer name, email or phone."),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    async run(args, ctx) {
      const filters = [isNull(customers.deletedAt)];
      if (args.search) {
        const term = likeTerm(args.search);
        filters.push(
          or(ilike(people.fullName, term), ilike(people.email, term), ilike(people.phone, term))!,
        );
      }

      const rows = await ctx.db
        .select({
          name: people.fullName,
          email: people.email,
          phone: people.phone,
          status: customers.status,
          totalOrders: customers.totalOrders,
          totalSpent: customers.totalSpent,
          lastOrderAt: customers.lastOrderAt,
        })
        .from(customers)
        .innerJoin(people, eq(customers.personId, people.id))
        .where(and(...filters))
        .orderBy(desc(customers.totalSpent))
        .limit(args.limit);

      return { currency: "GHS", count: rows.length, customers: rows };
    },
  }),
];

export const peopleTools = [
  defineTool({
    name: "list_staff",
    description:
      "Staff directory: position, contact details, employment status.",
    permissions: ["staff.read"],
    input: z.object({
      search: z.string().optional().describe("Staff name, number or position."),
      status: z.enum(["active", "inactive", "on_leave"]).optional(),
      limit: z.number().int().min(1).max(40).default(20),
    }),
    async run(args, ctx) {
      const filters = [isNull(staffProfiles.deletedAt)];
      if (args.status) filters.push(eq(staffProfiles.status, args.status));
      if (args.search) {
        const term = likeTerm(args.search);
        filters.push(
          or(
            ilike(people.fullName, term),
            ilike(staffProfiles.staffNumber, term),
            ilike(staffProfiles.position, term),
          )!,
        );
      }

      const showSalary = ctx.access?.can("staff.salary.read") ?? false;

      const rows = await ctx.db
        .select({
          staffNumber: staffProfiles.staffNumber,
          name: people.fullName,
          position: staffProfiles.position,
          phone: staffProfiles.phone,
          email: staffProfiles.email,
          status: staffProfiles.status,
          employmentDate: staffProfiles.employmentDate,
          salary: staffProfiles.salary,
        })
        .from(staffProfiles)
        .innerJoin(people, eq(staffProfiles.personId, people.id))
        .where(and(...filters))
        .orderBy(asc(people.fullName))
        .limit(args.limit);

      return {
        currency: "GHS",
        count: rows.length,
        salaryVisible: showSalary,
        staff: rows.map(({ salary, ...row }) => (showSalary ? { ...row, salary } : row)),
      };
    },
  }),

  defineTool({
    name: "list_appointments",
    description:
      "Clinic and salon appointments: service, client and time. Use for the diary.",
    permissions: ["appointments.read"],
    input: z.object({
      status: z
        .enum(["requested", "confirmed", "completed", "cancelled", "no_show"])
        .optional(),
      upcomingOnly: z.boolean().default(true).describe("Only from now onwards."),
      limit: z.number().int().min(1).max(40).default(20),
    }),
    async run(args, ctx) {
      const filters = [];
      if (args.status) filters.push(eq(appointments.status, args.status));
      if (args.upcomingOnly) filters.push(gte(appointments.startsAt, ctx.now));

      const rows = await ctx.db
        .select({
          reference: appointments.reference,
          service: clinicServices.name,
          price: clinicServices.price,
          durationMinutes: clinicServices.durationMinutes,
          client: appointments.customerName,
          phone: appointments.customerPhone,
          startsAt: appointments.startsAt,
          status: appointments.status,
          assignedTo: users.name,
        })
        .from(appointments)
        .innerJoin(clinicServices, eq(appointments.serviceId, clinicServices.id))
        .leftJoin(users, eq(appointments.assignedStaffUserId, users.id))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(args.upcomingOnly ? asc(appointments.startsAt) : desc(appointments.startsAt))
        .limit(args.limit);

      return { currency: "GHS", count: rows.length, appointments: rows };
    },
  }),
];
