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
import {
  addressType,
  cartStatus,
  couponType,
  customerStatus,
  orderFulfillmentStatus,
  orderPaymentStatus,
} from "./enums";
import { people, users } from "./identity";
import { inventoryItems } from "./inventory";

/**
 * The commerce facet of a person. A shopper who later applies to the school
 * keeps one `people` row and gains a student profile beside this one, so the
 * two records are the same human rather than duplicates.
 */
export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    personId: integer("personId")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    userId: integer("userId").references(() => users.id, { onDelete: "set null" }),
    status: customerStatus("status").default("active").notNull(),
    notes: text("notes"),
    /** Denormalised rollups, recalculated when an order is paid. */
    totalOrders: integer("totalOrders").default(0).notNull(),
    totalSpent: numeric("totalSpent", { precision: 12, scale: 2 }).default("0.00").notNull(),
    lastOrderAt: timestamp("lastOrderAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deletedAt"),
  },
  table => [
    index("customers_person_idx").on(table.personId),
    index("customers_status_idx").on(table.status),
  ],
);

export const customerAddresses = pgTable(
  "customerAddresses",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customerId")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    addressType: addressType("addressType").default("shipping").notNull(),
    label: varchar("label", { length: 80 }),
    line1: varchar("line1", { length: 255 }).notNull(),
    line2: varchar("line2", { length: 255 }),
    city: varchar("city", { length: 120 }),
    region: varchar("region", { length: 120 }),
    country: varchar("country", { length: 120 }),
    landmark: varchar("landmark", { length: 255 }),
    isDefault: boolean("isDefault").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("customer_addresses_customer_idx").on(table.customerId)],
);

export const coupons = pgTable(
  "coupons",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 40 }).notNull().unique(),
    description: varchar("description", { length: 255 }),
    discountType: couponType("discountType").notNull(),
    discountValue: numeric("discountValue", { precision: 10, scale: 2 }).notNull(),
    minimumSubtotal: numeric("minimumSubtotal", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),
    usageLimit: integer("usageLimit"),
    usageCount: integer("usageCount").default(0).notNull(),
    startsOn: date("startsOn", { mode: "date" }),
    endsOn: date("endsOn", { mode: "date" }),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("coupons_active_idx").on(table.isActive)],
);

export const carts = pgTable(
  "carts",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").references(() => users.id, { onDelete: "set null" }),
    sessionToken: varchar("sessionToken", { length: 96 }).unique(),
    status: cartStatus("status").default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [index("carts_status_idx").on(table.status)],
);

export const cartItems = pgTable(
  "cartItems",
  {
    id: serial("id").primaryKey(),
    cartId: integer("cartId")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    inventoryItemId: integer("inventoryItemId")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [index("cart_items_cart_idx").on(table.cartId)],
);

export const storeOrders = pgTable(
  "storeOrders",
  {
    id: serial("id").primaryKey(),
    orderNumber: varchar("orderNumber", { length: 40 }).notNull().unique(),
    customerId: integer("customerId").references(() => customers.id, { onDelete: "set null" }),
    userId: integer("userId").references(() => users.id, { onDelete: "set null" }),
    /** Contact snapshot as given at checkout. */
    customerName: varchar("customerName", { length: 160 }).notNull(),
    customerEmail: varchar("customerEmail", { length: 320 }).notNull(),
    customerPhone: varchar("customerPhone", { length: 40 }).notNull(),
    deliveryAddress: text("deliveryAddress"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    discount: numeric("discount", { precision: 12, scale: 2 }).default("0.00").notNull(),
    deliveryFee: numeric("deliveryFee", { precision: 12, scale: 2 }).default("0.00").notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    couponId: integer("couponId").references(() => coupons.id, { onDelete: "set null" }),
    paymentStatus: orderPaymentStatus("paymentStatus").default("pending").notNull(),
    fulfillmentStatus: orderFulfillmentStatus("fulfillmentStatus").default("new").notNull(),
    /** Set when stock has been deducted, so it can never be deducted twice. */
    stockDeductedAt: timestamp("stockDeductedAt"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [
    index("store_orders_customer_idx").on(table.customerId),
    index("store_orders_payment_status_idx").on(table.paymentStatus),
    index("store_orders_fulfillment_status_idx").on(table.fulfillmentStatus),
    index("store_orders_created_idx").on(table.createdAt),
  ],
);

export const orderItems = pgTable(
  "orderItems",
  {
    id: serial("id").primaryKey(),
    orderId: integer("orderId")
      .notNull()
      .references(() => storeOrders.id, { onDelete: "cascade" }),
    inventoryItemId: integer("inventoryItemId")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    itemName: varchar("itemName", { length: 180 }).notNull(),
    unitPrice: numeric("unitPrice", { precision: 10, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull(),
    quantityReturned: integer("quantityReturned").default(0).notNull(),
    lineTotal: numeric("lineTotal", { precision: 12, scale: 2 }).notNull(),
  },
  table => [
    index("order_items_order_idx").on(table.orderId),
    index("order_items_item_idx").on(table.inventoryItemId),
  ],
);

export const orderAddresses = pgTable(
  "orderAddresses",
  {
    id: serial("id").primaryKey(),
    orderId: integer("orderId")
      .notNull()
      .references(() => storeOrders.id, { onDelete: "cascade" }),
    addressType: addressType("addressType").default("shipping").notNull(),
    line1: varchar("line1", { length: 255 }).notNull(),
    line2: varchar("line2", { length: 255 }),
    city: varchar("city", { length: 120 }),
    region: varchar("region", { length: 120 }),
    country: varchar("country", { length: 120 }),
    landmark: varchar("landmark", { length: 255 }),
  },
  table => [index("order_addresses_order_idx").on(table.orderId)],
);

/** Append-only order timeline shown on the admin order page. */
export const orderStatusEvents = pgTable(
  "orderStatusEvents",
  {
    id: serial("id").primaryKey(),
    orderId: integer("orderId")
      .notNull()
      .references(() => storeOrders.id, { onDelete: "cascade" }),
    fromStatus: varchar("fromStatus", { length: 40 }),
    toStatus: varchar("toStatus", { length: 40 }).notNull(),
    note: text("note"),
    createdByUserId: integer("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("order_status_events_order_idx").on(table.orderId)],
);

export const customersRelations = relations(customers, ({ one, many }) => ({
  person: one(people, { fields: [customers.personId], references: [people.id] }),
  user: one(users, { fields: [customers.userId], references: [users.id] }),
  addresses: many(customerAddresses),
  orders: many(storeOrders),
}));

export const customerAddressesRelations = relations(customerAddresses, ({ one }) => ({
  customer: one(customers, { fields: [customerAddresses.customerId], references: [customers.id] }),
}));

export const cartsRelations = relations(carts, ({ many }) => ({
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  item: one(inventoryItems, {
    fields: [cartItems.inventoryItemId],
    references: [inventoryItems.id],
  }),
}));

export const storeOrdersRelations = relations(storeOrders, ({ one, many }) => ({
  customer: one(customers, { fields: [storeOrders.customerId], references: [customers.id] }),
  items: many(orderItems),
  addresses: many(orderAddresses),
  events: many(orderStatusEvents),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(storeOrders, { fields: [orderItems.orderId], references: [storeOrders.id] }),
  item: one(inventoryItems, {
    fields: [orderItems.inventoryItemId],
    references: [inventoryItems.id],
  }),
}));

export const orderStatusEventsRelations = relations(orderStatusEvents, ({ one }) => ({
  order: one(storeOrders, { fields: [orderStatusEvents.orderId], references: [storeOrders.id] }),
}));

export type Customer = typeof customers.$inferSelect;
export type CustomerAddress = typeof customerAddresses.$inferSelect;
export type StoreOrder = typeof storeOrders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
