import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { inventoryMovementType, purchaseOrderStatus } from "./enums";
import { people, users } from "./identity";

export const productCategories = pgTable(
  "productCategories",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    imageKey: varchar("imageKey", { length: 512 }),
    sortOrder: integer("sortOrder").default(0).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("product_categories_active_idx").on(table.isActive)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),
    personId: integer("personId").references(() => people.id, { onDelete: "set null" }),
    name: varchar("name", { length: 160 }).notNull(),
    company: varchar("company", { length: 160 }),
    phone: varchar("phone", { length: 40 }),
    whatsapp: varchar("whatsapp", { length: 40 }),
    email: varchar("email", { length: 320 }),
    address: text("address"),
    productsSupplied: text("productsSupplied"),
    /** Money owed to this supplier, maintained by receipt and payment flows. */
    outstandingBalance: numeric("outstandingBalance", { precision: 12, scale: 2 })
      .default("0.00")
      .notNull(),
    notes: text("notes"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deletedAt"),
  },
  table => [index("suppliers_name_idx").on(table.name)],
);

/**
 * One row per stock-keeping item. This is deliberately both the product record
 * and the stock record: a single source of truth means the storefront, the
 * classroom, and the stockroom can never disagree about what is on hand.
 */
export const inventoryItems = pgTable(
  "inventoryItems",
  {
    id: serial("id").primaryKey(),
    sku: varchar("sku", { length: 64 }).notNull().unique(),
    slug: varchar("slug", { length: 180 }).unique(),
    name: varchar("name", { length: 180 }).notNull(),
    description: text("description"),
    /** Legacy free-text category, superseded by categoryId. */
    category: varchar("category", { length: 80 }).notNull(),
    categoryId: integer("categoryId").references(() => productCategories.id, {
      onDelete: "set null",
    }),
    supplierId: integer("supplierId").references(() => suppliers.id, { onDelete: "set null" }),
    imageKey: varchar("imageKey", { length: 512 }),
    quantityOnHand: integer("quantityOnHand").default(0).notNull(),
    reorderLevel: integer("reorderLevel").default(0).notNull(),
    unitCost: numeric("unitCost", { precision: 10, scale: 2 }).default("0.00").notNull(),
    sellingPrice: numeric("sellingPrice", { precision: 10, scale: 2 }).default("0.00").notNull(),
    seoTitle: varchar("seoTitle", { length: 180 }),
    seoDescription: varchar("seoDescription", { length: 320 }),
    isSellable: boolean("isSellable").default(false).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deletedAt"),
  },
  table => [
    index("inventory_items_sellable_idx").on(table.isSellable, table.isActive),
    index("inventory_items_category_idx").on(table.categoryId),
    index("inventory_items_name_idx").on(table.name),
  ],
);

export const productImages = pgTable(
  "productImages",
  {
    id: serial("id").primaryKey(),
    inventoryItemId: integer("inventoryItemId")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    altText: varchar("altText", { length: 255 }),
    sortOrder: integer("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("product_images_item_idx").on(table.inventoryItemId)],
);

export const productVariations = pgTable(
  "productVariations",
  {
    id: serial("id").primaryKey(),
    inventoryItemId: integer("inventoryItemId")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    value: varchar("value", { length: 120 }).notNull(),
    priceDelta: numeric("priceDelta", { precision: 10, scale: 2 }).default("0.00").notNull(),
    sku: varchar("sku", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("product_variations_item_idx").on(table.inventoryItemId)],
);

/**
 * Append-only stock ledger. Quantity on hand is only ever changed alongside a
 * movement row inside the same transaction, so stock is always explainable.
 */
export const inventoryMovements = pgTable(
  "inventoryMovements",
  {
    id: serial("id").primaryKey(),
    inventoryItemId: integer("inventoryItemId")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    movementType: inventoryMovementType("movementType").notNull(),
    quantityDelta: integer("quantityDelta").notNull(),
    /** Running balance after this movement, for point-in-time reporting. */
    balanceAfter: integer("balanceAfter"),
    unitCost: numeric("unitCost", { precision: 10, scale: 2 }),
    referenceType: varchar("referenceType", { length: 64 }),
    referenceId: integer("referenceId"),
    note: text("note"),
    performedByUserId: integer("performedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("inventory_movements_item_idx").on(table.inventoryItemId),
    index("inventory_movements_created_idx").on(table.createdAt),
    index("inventory_movements_reference_idx").on(table.referenceType, table.referenceId),
  ],
);

export const purchaseOrders = pgTable(
  "purchaseOrders",
  {
    id: serial("id").primaryKey(),
    reference: varchar("reference", { length: 40 }).notNull().unique(),
    supplierId: integer("supplierId")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    orderDate: date("orderDate", { mode: "date" }).notNull(),
    expectedDate: date("expectedDate", { mode: "date" }),
    status: purchaseOrderStatus("status").default("draft").notNull(),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).default("0.00").notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).default("0.00").notNull(),
    amountPaid: numeric("amountPaid", { precision: 12, scale: 2 }).default("0.00").notNull(),
    notes: text("notes"),
    createdByUserId: integer("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    receivedAt: timestamp("receivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [
    index("purchase_orders_supplier_idx").on(table.supplierId),
    index("purchase_orders_status_idx").on(table.status),
  ],
);

export const purchaseOrderItems = pgTable(
  "purchaseOrderItems",
  {
    id: serial("id").primaryKey(),
    purchaseOrderId: integer("purchaseOrderId")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    inventoryItemId: integer("inventoryItemId")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    itemName: varchar("itemName", { length: 180 }).notNull(),
    quantityOrdered: integer("quantityOrdered").notNull(),
    quantityReceived: integer("quantityReceived").default(0).notNull(),
    unitCost: numeric("unitCost", { precision: 10, scale: 2 }).notNull(),
    lineTotal: numeric("lineTotal", { precision: 12, scale: 2 }).notNull(),
  },
  table => [index("purchase_order_items_order_idx").on(table.purchaseOrderId)],
);

export const supplierPayments = pgTable(
  "supplierPayments",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplierId")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    purchaseOrderId: integer("purchaseOrderId").references(() => purchaseOrders.id, {
      onDelete: "set null",
    }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paidAt: timestamp("paidAt").defaultNow().notNull(),
    reference: varchar("reference", { length: 120 }),
    note: text("note"),
    recordedByUserId: integer("recordedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  table => [index("supplier_payments_supplier_idx").on(table.supplierId)],
);

export const inventoryItemsRelations = relations(inventoryItems, ({ one, many }) => ({
  category: one(productCategories, {
    fields: [inventoryItems.categoryId],
    references: [productCategories.id],
  }),
  supplier: one(suppliers, { fields: [inventoryItems.supplierId], references: [suppliers.id] }),
  images: many(productImages),
  variations: many(productVariations),
  movements: many(inventoryMovements),
}));

export const productCategoriesRelations = relations(productCategories, ({ many }) => ({
  items: many(inventoryItems),
}));

export const inventoryMovementsRelations = relations(inventoryMovements, ({ one }) => ({
  item: one(inventoryItems, {
    fields: [inventoryMovements.inventoryItemId],
    references: [inventoryItems.id],
  }),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  purchaseOrders: many(purchaseOrders),
  items: many(inventoryItems),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [purchaseOrders.supplierId], references: [suppliers.id] }),
  items: many(purchaseOrderItems),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderItems.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  item: one(inventoryItems, {
    fields: [purchaseOrderItems.inventoryItemId],
    references: [inventoryItems.id],
  }),
}));

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type ProductCategory = typeof productCategories.$inferSelect;
