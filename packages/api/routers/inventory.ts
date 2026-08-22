import { and, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  inventoryItems,
  inventoryMovements,
  productCategories,
  purchaseOrderItems,
  purchaseOrders,
  supplierPayments,
  suppliers,
  users,
} from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { buildReference, slugify } from "../platform.utils";
import { recordAudit } from "../services/audit";
import { money, toAmountString, toMinor } from "../services/money";
import { notify, staffRecipients } from "../services/notify";
import { listInputSchema, likePattern, paginate, paginationBounds } from "../services/pagination";
import { applyStockMovement } from "../services/stock";
import { permissionProcedure, router } from "../trpc";

const MOVEMENT_TYPES = [
  "received",
  "retail_sale",
  "classroom_use",
  "adjustment",
  "damaged",
  "return",
] as const;

export const inventoryRouter = router({
  /* ---------------------------------------------------------------------- */
  /* Stock                                                                  */
  /* ---------------------------------------------------------------------- */

  items: permissionProcedure("inventory.read")
    .input(
      listInputSchema.extend({
        stockFilter: z.enum(["all", "low", "out", "sellable"]).default("all"),
        categoryId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const stockCondition =
        input.stockFilter === "low"
          ? sql`${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`
          : input.stockFilter === "out"
            ? eq(inventoryItems.quantityOnHand, 0)
            : input.stockFilter === "sellable"
              ? eq(inventoryItems.isSellable, true)
              : undefined;

      const where = and(
        isNull(inventoryItems.deletedAt),
        stockCondition,
        input.categoryId ? eq(inventoryItems.categoryId, input.categoryId) : undefined,
        input.search
          ? or(
              ilike(inventoryItems.name, likePattern(input.search)),
              ilike(inventoryItems.sku, likePattern(input.search)),
            )
          : undefined,
      );

      const [rows, [total], [valuation]] = await Promise.all([
        db
          .select({
            item: inventoryItems,
            categoryName: productCategories.name,
            supplierName: suppliers.name,
          })
          .from(inventoryItems)
          .leftJoin(productCategories, eq(inventoryItems.categoryId, productCategories.id))
          .leftJoin(suppliers, eq(inventoryItems.supplierId, suppliers.id))
          .where(where)
          .orderBy(inventoryItems.name)
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(inventoryItems).where(where),
        db
          .select({
            atCost: sql<string>`coalesce(sum(${inventoryItems.quantityOnHand} * ${inventoryItems.unitCost}), 0)`,
          })
          .from(inventoryItems)
          .where(where),
      ]);

      return {
        ...paginate(
          rows.map(row => ({
            ...row.item,
            unitCost: money(row.item.unitCost),
            sellingPrice: money(row.item.sellingPrice),
            categoryName: row.categoryName,
            supplierName: row.supplierName,
            isLowStock: row.item.quantityOnHand <= row.item.reorderLevel,
          })),
          Number(total?.total ?? 0),
          input,
        ),
        valuation: money(valuation?.atCost),
      };
    }),

  categories: permissionProcedure("inventory.read").query(async () => {
    const db = await dbOrThrow();
    return db
      .select()
      .from(productCategories)
      .where(eq(productCategories.isActive, true))
      .orderBy(productCategories.sortOrder, productCategories.name);
  }),

  saveItem: permissionProcedure("inventory.write")
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        sku: z.string().min(2).max(64),
        name: z.string().min(2).max(180),
        description: z.string().max(2000).optional(),
        category: z.string().min(2).max(80),
        categoryId: z.number().int().positive().optional(),
        supplierId: z.number().int().positive().optional(),
        reorderLevel: z.number().int().min(0),
        unitCost: z.number().min(0),
        sellingPrice: z.number().min(0),
        isSellable: z.boolean(),
        isActive: z.boolean().default(true),
        /** Only accepted on create; later changes must go through a movement. */
        openingQuantity: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const values = {
        sku: input.sku,
        slug: slugify(input.name),
        name: input.name,
        description: input.description,
        category: input.category,
        categoryId: input.categoryId,
        supplierId: input.supplierId,
        reorderLevel: input.reorderLevel,
        unitCost: toAmountString(toMinor(input.unitCost)),
        sellingPrice: toAmountString(toMinor(input.sellingPrice)),
        isSellable: input.isSellable,
        isActive: input.isActive,
      };

      if (input.id) {
        const [before] = await db
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, input.id))
          .limit(1);
        if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Item was not found." });

        await db.update(inventoryItems).set(values).where(eq(inventoryItems.id, input.id));
        await recordAudit(db, ctx.actor, {
          action: "update",
          entity: "inventoryItem",
          entityId: input.id,
          entityLabel: input.name,
          oldValue: { ...before, unitCost: money(before.unitCost) },
          newValue: values,
        });
        return { id: input.id };
      }

      return db.transaction(async tx => {
        const [item] = await tx
          .insert(inventoryItems)
          .values({ ...values, quantityOnHand: 0 })
          .returning({ id: inventoryItems.id });

        if (!item?.id) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Item was not created." });
        }

        // Opening stock is a real movement, so the ledger explains every unit.
        if (input.openingQuantity && input.openingQuantity > 0) {
          await applyStockMovement(tx, {
            inventoryItemId: item.id,
            movementType: "received",
            quantityDelta: input.openingQuantity,
            referenceType: "opening_balance",
            unitCostMinor: toMinor(input.unitCost),
            note: "Opening balance",
            performedByUserId: ctx.user.id,
          });
        }

        await recordAudit(tx, ctx.actor, {
          action: "create",
          entity: "inventoryItem",
          entityId: item.id,
          entityLabel: input.name,
          newValue: { ...values, openingQuantity: input.openingQuantity ?? 0 },
        });

        return { id: item.id };
      });
    }),

  /**
   * Every stock change goes through here, so quantity on hand and the ledger
   * are written together and can never disagree (§48). Only an explicit
   * adjustment may push a balance below zero, and only with the right
   * permission (§64).
   */
  recordMovement: permissionProcedure("inventory.write")
    .input(
      z.object({
        inventoryItemId: z.number().int().positive(),
        movementType: z.enum(MOVEMENT_TYPES),
        quantity: z.number().int().refine(value => value !== 0, "Quantity cannot be zero."),
        note: z.string().max(1000).optional(),
        unitCost: z.number().min(0).optional(),
        allowNegative: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      return db.transaction(async tx => {
        const [item] = await tx
          .select({ name: inventoryItems.name, before: inventoryItems.quantityOnHand })
          .from(inventoryItems)
          .where(eq(inventoryItems.id, input.inventoryItemId))
          .limit(1);
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item was not found." });

        const result = await applyStockMovement(tx, {
          inventoryItemId: input.inventoryItemId,
          movementType: input.movementType,
          quantityDelta: input.quantity,
          note: input.note,
          unitCostMinor: input.unitCost == null ? null : toMinor(input.unitCost),
          referenceType: "manual",
          performedByUserId: ctx.user.id,
          allowNegative: input.allowNegative && input.movementType === "adjustment",
        });

        await recordAudit(tx, ctx.actor, {
          action: `stock_${input.movementType}`,
          entity: "inventoryItem",
          entityId: input.inventoryItemId,
          entityLabel: item.name,
          oldValue: { quantityOnHand: item.before },
          newValue: { quantityOnHand: result.balanceAfter },
          summary: `${ctx.actor.name ?? "Staff"} adjusted ${item.name} stock from ${item.before} to ${result.balanceAfter}`,
        });

        return result;
      });
    }),

  movements: permissionProcedure("inventory.read")
    .input(
      listInputSchema.extend({
        inventoryItemId: z.number().int().positive().optional(),
        movementType: z.enum(MOVEMENT_TYPES).optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        input.inventoryItemId
          ? eq(inventoryMovements.inventoryItemId, input.inventoryItemId)
          : undefined,
        input.movementType ? eq(inventoryMovements.movementType, input.movementType) : undefined,
        input.dateFrom ? gte(inventoryMovements.createdAt, input.dateFrom) : undefined,
        input.dateTo ? lte(inventoryMovements.createdAt, input.dateTo) : undefined,
        input.search ? ilike(inventoryItems.name, likePattern(input.search)) : undefined,
      );

      const [rows, [total]] = await Promise.all([
        db
          .select({
            movement: inventoryMovements,
            itemName: inventoryItems.name,
            sku: inventoryItems.sku,
            performedBy: users.name,
          })
          .from(inventoryMovements)
          .innerJoin(inventoryItems, eq(inventoryMovements.inventoryItemId, inventoryItems.id))
          .leftJoin(users, eq(inventoryMovements.performedByUserId, users.id))
          .where(where)
          .orderBy(desc(inventoryMovements.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: count() })
          .from(inventoryMovements)
          .innerJoin(inventoryItems, eq(inventoryMovements.inventoryItemId, inventoryItems.id))
          .where(where),
      ]);

      return paginate(
        rows.map(row => ({
          ...row.movement,
          unitCost: row.movement.unitCost ? money(row.movement.unitCost) : null,
          itemName: row.itemName,
          sku: row.sku,
          performedBy: row.performedBy,
        })),
        Number(total?.total ?? 0),
        input,
      );
    }),

  /* ---------------------------------------------------------------------- */
  /* Suppliers (§30)                                                        */
  /* ---------------------------------------------------------------------- */

  suppliers: permissionProcedure("suppliers.read")
    .input(listInputSchema)
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        isNull(suppliers.deletedAt),
        input.search
          ? or(
              ilike(suppliers.name, likePattern(input.search)),
              ilike(suppliers.company, likePattern(input.search)),
              ilike(suppliers.phone, likePattern(input.search)),
            )
          : undefined,
      );

      const [rows, [total]] = await Promise.all([
        db.select().from(suppliers).where(where).orderBy(suppliers.name).limit(limit).offset(offset),
        db.select({ total: count() }).from(suppliers).where(where),
      ]);

      return paginate(
        rows.map(row => ({ ...row, outstandingBalance: money(row.outstandingBalance) })),
        Number(total?.total ?? 0),
        input,
      );
    }),

  supplierDetail: permissionProcedure("suppliers.read")
    .input(z.object({ supplierId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const [supplier] = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, input.supplierId))
        .limit(1);
      if (!supplier) throw new TRPCError({ code: "NOT_FOUND", message: "Supplier was not found." });

      const [orders, items, paymentHistory] = await Promise.all([
        db
          .select()
          .from(purchaseOrders)
          .where(eq(purchaseOrders.supplierId, input.supplierId))
          .orderBy(desc(purchaseOrders.orderDate))
          .limit(25),
        db
          .select({ id: inventoryItems.id, name: inventoryItems.name, sku: inventoryItems.sku })
          .from(inventoryItems)
          .where(eq(inventoryItems.supplierId, input.supplierId)),
        db
          .select()
          .from(supplierPayments)
          .where(eq(supplierPayments.supplierId, input.supplierId))
          .orderBy(desc(supplierPayments.paidAt))
          .limit(25),
      ]);

      return {
        supplier: { ...supplier, outstandingBalance: money(supplier.outstandingBalance) },
        purchaseHistory: orders.map(order => ({
          ...order,
          total: money(order.total),
          amountPaid: money(order.amountPaid),
        })),
        itemsSupplied: items,
        payments: paymentHistory.map(row => ({ ...row, amount: money(row.amount) })),
      };
    }),

  saveSupplier: permissionProcedure("suppliers.write")
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        name: z.string().min(2).max(160),
        company: z.string().max(160).optional(),
        phone: z.string().max(40).optional(),
        whatsapp: z.string().max(40).optional(),
        email: z.string().email().max(320).optional().or(z.literal("")),
        address: z.string().max(1000).optional(),
        productsSupplied: z.string().max(1000).optional(),
        notes: z.string().max(2000).optional(),
        isActive: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const { id, email, ...rest } = input;
      const values = { ...rest, email: email || null };

      if (id) {
        await db.update(suppliers).set(values).where(eq(suppliers.id, id));
        await recordAudit(db, ctx.actor, {
          action: "update",
          entity: "supplier",
          entityId: id,
          entityLabel: input.name,
          newValue: values,
        });
        return { id };
      }

      const [created] = await db.insert(suppliers).values(values).returning({ id: suppliers.id });
      await recordAudit(db, ctx.actor, {
        action: "create",
        entity: "supplier",
        entityId: created?.id,
        entityLabel: input.name,
        newValue: values,
      });
      return { id: created?.id };
    }),

  /* ---------------------------------------------------------------------- */
  /* Purchase orders (§31)                                                  */
  /* ---------------------------------------------------------------------- */

  purchaseOrders: permissionProcedure("purchases.read")
    .input(
      listInputSchema.extend({
        status: z
          .enum(["draft", "ordered", "partially_received", "received", "cancelled"])
          .optional(),
        supplierId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await dbOrThrow();
      const { limit, offset } = paginationBounds(input);

      const where = and(
        input.status ? eq(purchaseOrders.status, input.status) : undefined,
        input.supplierId ? eq(purchaseOrders.supplierId, input.supplierId) : undefined,
        input.search ? ilike(purchaseOrders.reference, likePattern(input.search)) : undefined,
      );

      const [rows, [total]] = await Promise.all([
        db
          .select({ order: purchaseOrders, supplierName: suppliers.name })
          .from(purchaseOrders)
          .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
          .where(where)
          .orderBy(desc(purchaseOrders.orderDate))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(purchaseOrders).where(where),
      ]);

      return paginate(
        rows.map(row => ({
          ...row.order,
          total: money(row.order.total),
          subtotal: money(row.order.subtotal),
          amountPaid: money(row.order.amountPaid),
          supplierName: row.supplierName,
        })),
        Number(total?.total ?? 0),
        input,
      );
    }),

  purchaseOrderDetail: permissionProcedure("purchases.read")
    .input(z.object({ purchaseOrderId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await dbOrThrow();

      const [order] = await db
        .select({ order: purchaseOrders, supplierName: suppliers.name })
        .from(purchaseOrders)
        .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
        .where(eq(purchaseOrders.id, input.purchaseOrderId))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order not found." });

      const items = await db
        .select()
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, input.purchaseOrderId));

      return {
        ...order.order,
        supplierName: order.supplierName,
        total: money(order.order.total),
        subtotal: money(order.order.subtotal),
        amountPaid: money(order.order.amountPaid),
        items: items.map(item => ({
          ...item,
          unitCost: money(item.unitCost),
          lineTotal: money(item.lineTotal),
        })),
      };
    }),

  createPurchaseOrder: permissionProcedure("purchases.write")
    .input(
      z.object({
        supplierId: z.number().int().positive(),
        orderDate: z.coerce.date(),
        expectedDate: z.coerce.date().optional(),
        notes: z.string().max(2000).optional(),
        items: z
          .array(
            z.object({
              inventoryItemId: z.number().int().positive(),
              quantityOrdered: z.number().int().min(1),
              unitCost: z.number().min(0),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      return db.transaction(async tx => {
        const catalogue = await tx
          .select({ id: inventoryItems.id, name: inventoryItems.name })
          .from(inventoryItems)
          .where(
            inArray(
              inventoryItems.id,
              input.items.map(item => item.inventoryItemId),
            ),
          );
        const nameById = new Map(catalogue.map(row => [row.id, row.name]));

        const lines = input.items.map(item => {
          const name = nameById.get(item.inventoryItemId);
          if (!name) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "One of the ordered items no longer exists.",
            });
          }
          const lineMinor = toMinor(item.unitCost) * item.quantityOrdered;
          return {
            inventoryItemId: item.inventoryItemId,
            itemName: name,
            quantityOrdered: item.quantityOrdered,
            unitCost: toAmountString(toMinor(item.unitCost)),
            lineTotal: toAmountString(lineMinor),
            lineMinor,
          };
        });

        const totalMinor = lines.reduce((sum, line) => sum + line.lineMinor, 0);
        const reference = buildReference("PO");

        const [order] = await tx
          .insert(purchaseOrders)
          .values({
            reference,
            supplierId: input.supplierId,
            orderDate: input.orderDate,
            expectedDate: input.expectedDate,
            status: "ordered",
            subtotal: toAmountString(totalMinor),
            total: toAmountString(totalMinor),
            notes: input.notes,
            createdByUserId: ctx.user.id,
          })
          .returning({ id: purchaseOrders.id });

        if (!order?.id) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Purchase order was not created.",
          });
        }

        await tx.insert(purchaseOrderItems).values(
          lines.map(({ lineMinor: _lineMinor, ...line }) => ({
            ...line,
            purchaseOrderId: order.id,
          })),
        );

        await recordAudit(tx, ctx.actor, {
          action: "create",
          entity: "purchaseOrder",
          entityId: order.id,
          entityLabel: reference,
          newValue: { supplierId: input.supplierId, total: totalMinor / 100, lines: lines.length },
        });

        return { id: order.id, reference, total: totalMinor / 100 };
      });
    }),

  /**
   * Receiving stock increases inventory and books what is owed to the
   * supplier, inside one transaction (§31).
   */
  receivePurchaseOrder: permissionProcedure("purchases.write")
    .input(
      z.object({
        purchaseOrderId: z.number().int().positive(),
        lines: z
          .array(
            z.object({
              purchaseOrderItemId: z.number().int().positive(),
              quantityReceived: z.number().int().min(1),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      return db.transaction(async tx => {
        const [order] = await tx
          .select()
          .from(purchaseOrders)
          .where(eq(purchaseOrders.id, input.purchaseOrderId))
          .limit(1);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order not found." });
        if (order.status === "cancelled") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A cancelled purchase order cannot be received.",
          });
        }

        const items = await tx
          .select()
          .from(purchaseOrderItems)
          .where(eq(purchaseOrderItems.purchaseOrderId, order.id));
        const itemById = new Map(items.map(item => [item.id, item]));

        let receivedValueMinor = 0;

        for (const line of input.lines) {
          const item = itemById.get(line.purchaseOrderItemId);
          if (!item) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown purchase order line." });
          }

          const outstanding = item.quantityOrdered - item.quantityReceived;
          if (line.quantityReceived > outstanding) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Cannot receive more than the ${outstanding} outstanding units of ${item.itemName}.`,
            });
          }

          await applyStockMovement(tx, {
            inventoryItemId: item.inventoryItemId,
            movementType: "received",
            quantityDelta: line.quantityReceived,
            referenceType: "purchase_order",
            referenceId: order.id,
            unitCostMinor: toMinor(item.unitCost),
            note: `Received against ${order.reference}`,
            performedByUserId: ctx.user.id,
          });

          await tx
            .update(purchaseOrderItems)
            .set({ quantityReceived: item.quantityReceived + line.quantityReceived })
            .where(eq(purchaseOrderItems.id, item.id));

          receivedValueMinor += toMinor(item.unitCost) * line.quantityReceived;
        }

        const refreshed = await tx
          .select()
          .from(purchaseOrderItems)
          .where(eq(purchaseOrderItems.purchaseOrderId, order.id));
        const fullyReceived = refreshed.every(item => item.quantityReceived >= item.quantityOrdered);
        const anyReceived = refreshed.some(item => item.quantityReceived > 0);

        await tx
          .update(purchaseOrders)
          .set({
            status: fullyReceived ? "received" : anyReceived ? "partially_received" : order.status,
            receivedAt: fullyReceived ? new Date() : order.receivedAt,
          })
          .where(eq(purchaseOrders.id, order.id));

        // Goods received but not yet paid for are owed to the supplier.
        await tx
          .update(suppliers)
          .set({
            outstandingBalance: sql`${suppliers.outstandingBalance} + ${toAmountString(receivedValueMinor)}`,
          })
          .where(eq(suppliers.id, order.supplierId));

        await recordAudit(tx, ctx.actor, {
          action: "receive_stock",
          entity: "purchaseOrder",
          entityId: order.id,
          entityLabel: order.reference,
          newValue: { lines: input.lines, valueReceived: receivedValueMinor / 100 },
          summary: `${ctx.actor.name ?? "Staff"} received stock against ${order.reference}`,
        });

        return { success: true, fullyReceived };
      });
    }),

  paySupplier: permissionProcedure("purchases.write")
    .input(
      z.object({
        supplierId: z.number().int().positive(),
        purchaseOrderId: z.number().int().positive().optional(),
        amount: z.number().positive(),
        reference: z.string().max(120).optional(),
        note: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const amountMinor = toMinor(input.amount);

      return db.transaction(async tx => {
        await tx.insert(supplierPayments).values({
          supplierId: input.supplierId,
          purchaseOrderId: input.purchaseOrderId,
          amount: toAmountString(amountMinor),
          reference: input.reference,
          note: input.note,
          recordedByUserId: ctx.user.id,
        });

        await tx
          .update(suppliers)
          .set({
            outstandingBalance: sql`${suppliers.outstandingBalance} - ${toAmountString(amountMinor)}`,
          })
          .where(eq(suppliers.id, input.supplierId));

        if (input.purchaseOrderId) {
          await tx
            .update(purchaseOrders)
            .set({ amountPaid: sql`${purchaseOrders.amountPaid} + ${toAmountString(amountMinor)}` })
            .where(eq(purchaseOrders.id, input.purchaseOrderId));
        }

        await recordAudit(tx, ctx.actor, {
          action: "pay_supplier",
          entity: "supplier",
          entityId: input.supplierId,
          newValue: { amount: input.amount, purchaseOrderId: input.purchaseOrderId },
          summary: `${ctx.actor.name ?? "Staff"} paid GHS ${input.amount.toFixed(2)} to supplier ${input.supplierId}`,
        });

        return { success: true };
      });
    }),

  /** Raises the low-stock alerts described in §69. */
  notifyLowStock: permissionProcedure("inventory.read").mutation(async ({ ctx }) => {
    const db = await dbOrThrow();

    const low = await db
      .select({ id: inventoryItems.id, name: inventoryItems.name, qty: inventoryItems.quantityOnHand })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.isActive, true),
          isNull(inventoryItems.deletedAt),
          sql`${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`,
        ),
      )
      .limit(25);

    if (!low.length) return { alerted: 0 };

    await notify(db, {
      userIds: await staffRecipients(db, ["admin", "staff"]),
      type: "low_stock",
      title: `${low.length} item${low.length === 1 ? "" : "s"} at or below reorder level`,
      body: low
        .slice(0, 5)
        .map(item => `${item.name} (${item.qty} left)`)
        .join(", "),
      entityType: "inventory",
      link: "/inventory?filter=low",
    });

    await recordAudit(db, ctx.actor, {
      action: "low_stock_alert",
      entity: "inventory",
      newValue: { items: low.length },
    });

    return { alerted: low.length };
  }),
});
