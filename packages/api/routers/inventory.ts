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
import {
  alertLowStock,
  alertLowStockInBackground,
  lowStockItems,
} from "../services/lowStock";
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

  /**
   * Creates a product category, or brings a retired one back.
   *
   * Categories used to arrive only through a spreadsheet import or the seed,
   * which left the item form with an empty dropdown on a fresh install. A
   * category is picked by name in that form, so a second row sharing a slug
   * would be indistinguishable there — hence the slug check rather than a
   * blind insert.
   */
  createCategory: permissionProcedure("inventory.write")
    .input(
      z.object({
        name: z.string().min(2).max(120),
        description: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();
      const slug = slugify(input.name);

      const [existing] = await db
        .select()
        .from(productCategories)
        .where(eq(productCategories.slug, slug))
        .limit(1);

      if (existing?.isActive) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `"${existing.name}" is already a category.`,
        });
      }

      // A retired category is invisible in the dropdown, so the admin cannot
      // know it is there. Reviving it keeps the items already filed under it.
      if (existing) {
        await db
          .update(productCategories)
          .set({ name: input.name, description: input.description ?? existing.description, isActive: true })
          .where(eq(productCategories.id, existing.id));
        await recordAudit(db, ctx.actor, {
          action: "update",
          entity: "productCategory",
          entityId: existing.id,
          entityLabel: input.name,
          newValue: { name: input.name, isActive: true },
          summary: `${ctx.actor?.name ?? "System"} restored the ${input.name} category`,
        });
        return { id: existing.id, name: input.name, restored: true };
      }

      const [{ nextSortOrder }] = await db
        .select({
          nextSortOrder: sql<number>`coalesce(max(${productCategories.sortOrder}), -1) + 1`,
        })
        .from(productCategories);

      const values = {
        name: input.name,
        slug,
        description: input.description ?? null,
        sortOrder: Number(nextSortOrder ?? 0),
      };

      const [created] = await db
        .insert(productCategories)
        .values(values)
        .returning({ id: productCategories.id });

      if (!created?.id) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Category was not created.",
        });
      }

      await recordAudit(db, ctx.actor, {
        action: "create",
        entity: "productCategory",
        entityId: created.id,
        entityLabel: input.name,
        newValue: values,
      });

      return { id: created.id, name: input.name, restored: false };
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
   * Takes an item off the stock list.
   *
   * Soft, because the ledger, past orders and purchase orders all point at the
   * row and have to keep resolving: what an invoice from last year says was
   * sold must still name something. `deletedAt` is what every listing filters
   * on, and the two flags come down with it so no storefront or admissions
   * path can reach an item that has been removed.
   *
   * Two things refuse it, both because deleting through them would lose money
   * quietly rather than loudly.
   */
  deleteItem: permissionProcedure("inventory.write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      return db.transaction(async tx => {
        const [existing] = await tx
          .select()
          .from(inventoryItems)
          .where(and(eq(inventoryItems.id, input.id), isNull(inventoryItems.deletedAt)))
          .limit(1);

        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That item is no longer on the list." });
        }

        // Stock on hand is money on a shelf. Deleting the item drops it out of
        // the valuation without a movement saying where it went, which is
        // exactly the hole the ledger exists to prevent. Write it off first.
        if (existing.quantityOnHand !== 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `"${existing.name}" still has ${existing.quantityOnHand} in stock. Record a movement to clear the balance first, so the ledger says where it went.`,
          });
        }

        // An order already placed with a supplier will be received against
        // this item later, and receiving puts stock back on a row nothing can
        // show you.
        const [onOrder] = await tx
          .select({ total: count() })
          .from(purchaseOrderItems)
          .innerJoin(purchaseOrders, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
          .where(
            and(
              eq(purchaseOrderItems.inventoryItemId, input.id),
              inArray(purchaseOrders.status, ["draft", "ordered", "partially_received"]),
            ),
          );

        const pending = Number(onOrder?.total ?? 0);
        if (pending > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `"${existing.name}" is on ${pending} open purchase order${pending === 1 ? "" : "s"}. Receive or cancel ${pending === 1 ? "it" : "them"} first.`,
          });
        }

        await tx
          .update(inventoryItems)
          // Removed as well as withdrawn: `deletedAt` hides it from the lists
          // that filter on it, and the flags are what the selling and
          // classroom paths check.
          .set({
            deletedAt: new Date(),
            isActive: false,
            isSellable: false,
            updatedAt: new Date(),
          })
          .where(eq(inventoryItems.id, input.id));

        await recordAudit(tx, ctx.actor, {
          action: "delete",
          entity: "inventoryItem",
          entityId: existing.id,
          entityLabel: `${existing.sku} · ${existing.name}`,
          oldValue: {
            sku: existing.sku,
            name: existing.name,
            category: existing.category,
            quantityOnHand: existing.quantityOnHand,
            unitCost: existing.unitCost,
            sellingPrice: existing.sellingPrice,
          },
          summary: `${ctx.actor.name ?? "Staff"} removed stock item "${existing.name}" (${existing.sku})`,
        });

        return { id: existing.id, name: existing.name };
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

      const outcome = await db.transaction(async tx => {
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

      // Raised after the commit, never inside it: a warning must not go out
      // for a movement that then rolls back.
      if (outcome.crossedReorderLevel) alertLowStockInBackground(db, ctx.actor);

      return outcome;
    }),

  /**
   * Takes a stock movement back.
   *
   * The ledger is append-only, so nothing is erased: this posts the opposite
   * movement and leaves both rows standing. Deleting the original instead
   * would strand every `balanceAfter` recorded after it - each one describes a
   * running total that would no longer add up - and leave `quantityOnHand`
   * disagreeing with the ledger that is supposed to explain it.
   *
   * The reversal points back at what it cancels through `referenceType` and
   * `referenceId`, which is what lets a row be shown as already reversed and
   * what stops it being reversed twice.
   */
  reverseMovement: permissionProcedure("inventory.write")
    .input(
      z.object({
        movementId: z.number().int().positive(),
        reason: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const outcome = await db.transaction(async tx => {
        const [original] = await tx
          .select({
            movement: inventoryMovements,
            itemName: inventoryItems.name,
          })
          .from(inventoryMovements)
          .innerJoin(inventoryItems, eq(inventoryMovements.inventoryItemId, inventoryItems.id))
          .where(eq(inventoryMovements.id, input.movementId))
          .limit(1);

        if (!original) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That movement is no longer on file." });
        }

        // Reversing a reversal walks the balance back and forth and reads as
        // noise in the ledger. Record a fresh movement instead.
        if (original.movement.referenceType === "reversal") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This entry is itself a reversal. Record a new movement rather than undoing it.",
          });
        }

        const [already] = await tx
          .select({ id: inventoryMovements.id })
          .from(inventoryMovements)
          .where(
            and(
              eq(inventoryMovements.referenceType, "reversal"),
              eq(inventoryMovements.referenceId, input.movementId),
            ),
          )
          .limit(1);

        if (already) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That movement has already been reversed.",
          });
        }

        const describe = original.movement.movementType.replaceAll("_", " ");

        // Mirrors the original's type rather than filing everything under
        // `adjustment`, so reversing a sale does not turn up in a report of
        // hand corrections. `referenceType` is what marks it as a reversal.
        const result = await applyStockMovement(tx, {
          inventoryItemId: original.movement.inventoryItemId,
          movementType: original.movement.movementType,
          quantityDelta: -original.movement.quantityDelta,
          note: input.reason?.trim()
            ? `Reversed: ${input.reason.trim()}`
            : `Reversed ${describe} of ${original.movement.quantityDelta > 0 ? "+" : ""}${original.movement.quantityDelta}`,
          unitCostMinor:
            original.movement.unitCost == null
              ? null
              : Math.round(Number(original.movement.unitCost) * 100),
          referenceType: "reversal",
          referenceId: original.movement.id,
          performedByUserId: ctx.user.id,
        });

        await recordAudit(tx, ctx.actor, {
          action: "reverse_stock_movement",
          entity: "inventoryItem",
          entityId: original.movement.inventoryItemId,
          entityLabel: original.itemName,
          oldValue: {
            movementId: original.movement.id,
            movementType: original.movement.movementType,
            quantityDelta: original.movement.quantityDelta,
          },
          newValue: { quantityOnHand: result.balanceAfter },
          summary: `${ctx.actor.name ?? "Staff"} reversed a ${describe} of ${original.movement.quantityDelta} on ${original.itemName}`,
        });

        return { ...result, itemName: original.itemName };
      });

      // Reversing a receipt takes stock back out, which can take an item low.
      // Raised after the commit, never inside it.
      if (outcome.crossedReorderLevel) alertLowStockInBackground(db, ctx.actor);

      return outcome;
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
            // So a reversed row can be marked as such and its undo withheld,
            // rather than the second attempt failing at the server.
            reversedByMovementId: sql<number | null>`(
              select r."id" from ${inventoryMovements} r
              where r."referenceType" = 'reversal'
                and r."referenceId" = ${inventoryMovements.id}
              limit 1
            )`,
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
          isReversal: row.movement.referenceType === "reversal",
          isReversed: row.reversedByMovementId !== null,
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

  /* ---------------------------------------------------------------------- */
  /* Low stock                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * What is low right now, for the button that offers to report it.
   *
   * Separate from `items` with a `low` filter because the screen wants only
   * the count and needs it whichever page of the table is being looked at.
   */
  lowStock: permissionProcedure("inventory.read").query(async () => {
    const db = await dbOrThrow();
    const rows = await lowStockItems(db);
    return { count: rows.length, items: rows.slice(0, 10) };
  }),

  /**
   * Raises the low-stock alert by hand (§69).
   *
   * Forced, unlike the automatic one: somebody has pressed a button and is
   * waiting to see it happen, so the quiet period that stops a busy morning
   * sending a dozen texts does not apply. Sends nothing when nothing is low,
   * and says so.
   *
   * Needs `inventory.write` rather than read. Reading which items are low is
   * one thing; making the school pay for a round of text messages is another.
   */
  notifyLowStock: permissionProcedure("inventory.write").mutation(async ({ ctx }) => {
    const db = await dbOrThrow();
    return alertLowStock(db, { force: true, actor: ctx.actor });
  }),
});
