import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { galleryCategory, publishStatus } from "./enums";
import { users } from "./identity";

/** Editable marketing pages (About, Admissions copy, policy pages, ...). */
export const pages = pgTable(
  "pages",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    title: varchar("title", { length: 180 }).notNull(),
    /** Structured blocks so the marketing site can lay content out properly. */
    content: text("content"),
    seoTitle: varchar("seoTitle", { length: 180 }),
    seoDescription: varchar("seoDescription", { length: 320 }),
    ogImageKey: varchar("ogImageKey", { length: 512 }),
    status: publishStatus("status").default("draft").notNull(),
    updatedByUserId: integer("updatedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [index("pages_status_idx").on(table.status)],
);

export const banners = pgTable(
  "banners",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 180 }).notNull(),
    subtitle: varchar("subtitle", { length: 255 }),
    imageKey: varchar("imageKey", { length: 512 }),
    ctaLabel: varchar("ctaLabel", { length: 80 }),
    ctaHref: varchar("ctaHref", { length: 255 }),
    placement: varchar("placement", { length: 48 }).default("homepage").notNull(),
    sortOrder: integer("sortOrder").default(0).notNull(),
    status: publishStatus("status").default("draft").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [index("banners_placement_idx").on(table.placement, table.status)],
);

/** Salon and clinic services advertised on the public site. */
export const siteServices = pgTable(
  "siteServices",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    name: varchar("name", { length: 160 }).notNull(),
    summary: varchar("summary", { length: 320 }),
    description: text("description"),
    imageKey: varchar("imageKey", { length: 512 }),
    priceFrom: varchar("priceFrom", { length: 40 }),
    sortOrder: integer("sortOrder").default(0).notNull(),
    status: publishStatus("status").default("draft").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [index("site_services_status_idx").on(table.status)],
);

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 140 }).notNull().unique(),
    title: varchar("title", { length: 180 }).notNull(),
    summary: varchar("summary", { length: 320 }),
    description: text("description"),
    imageKey: varchar("imageKey", { length: 512 }),
    location: varchar("location", { length: 180 }),
    startsAt: timestamp("startsAt").notNull(),
    endsAt: timestamp("endsAt"),
    status: publishStatus("status").default("draft").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [index("events_starts_idx").on(table.startsAt)],
);

export const galleryItems = pgTable(
  "galleryItems",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 180 }),
    caption: varchar("caption", { length: 320 }),
    category: galleryCategory("category").notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    altText: varchar("altText", { length: 255 }),
    sortOrder: integer("sortOrder").default(0).notNull(),
    status: publishStatus("status").default("draft").notNull(),
    uploadedByUserId: integer("uploadedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [index("gallery_items_category_idx").on(table.category, table.status)],
);

export const testimonials = pgTable(
  "testimonials",
  {
    id: serial("id").primaryKey(),
    authorName: varchar("authorName", { length: 160 }).notNull(),
    authorRole: varchar("authorRole", { length: 120 }),
    quote: text("quote").notNull(),
    photoKey: varchar("photoKey", { length: 512 }),
    rating: integer("rating"),
    sortOrder: integer("sortOrder").default(0).notNull(),
    status: publishStatus("status").default("draft").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [index("testimonials_status_idx").on(table.status)],
);

export const faqs = pgTable(
  "faqs",
  {
    id: serial("id").primaryKey(),
    question: varchar("question", { length: 320 }).notNull(),
    answer: text("answer").notNull(),
    category: varchar("category", { length: 80 }),
    sortOrder: integer("sortOrder").default(0).notNull(),
    status: publishStatus("status").default("draft").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [index("faqs_status_idx").on(table.status)],
);

export const blogCategories = pgTable("blogCategories", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  description: varchar("description", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const blogPosts = pgTable(
  "blogPosts",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 180 }).notNull().unique(),
    title: varchar("title", { length: 200 }).notNull(),
    excerpt: varchar("excerpt", { length: 400 }),
    content: text("content").notNull(),
    featuredImageKey: varchar("featuredImageKey", { length: 512 }),
    authorUserId: integer("authorUserId").references(() => users.id, { onDelete: "set null" }),
    authorName: varchar("authorName", { length: 160 }),
    categoryId: integer("categoryId").references(() => blogCategories.id, {
      onDelete: "set null",
    }),
    /** Comma-separated tags; kept simple because tagging is editorial, not relational. */
    tags: varchar("tags", { length: 320 }),
    seoTitle: varchar("seoTitle", { length: 180 }),
    seoDescription: varchar("seoDescription", { length: 320 }),
    status: publishStatus("status").default("draft").notNull(),
    publishedAt: date("publishedAt", { mode: "date" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deletedAt"),
  },
  table => [
    index("blog_posts_status_idx").on(table.status),
    index("blog_posts_published_idx").on(table.publishedAt),
  ],
);

export const blogPostsRelations = relations(blogPosts, ({ one }) => ({
  category: one(blogCategories, {
    fields: [blogPosts.categoryId],
    references: [blogCategories.id],
  }),
  author: one(users, { fields: [blogPosts.authorUserId], references: [users.id] }),
}));

export const blogCategoriesRelations = relations(blogCategories, ({ many }) => ({
  posts: many(blogPosts),
}));

export type Page = typeof pages.$inferSelect;
export type Banner = typeof banners.$inferSelect;
export type SiteService = typeof siteServices.$inferSelect;
export type GalleryItem = typeof galleryItems.$inferSelect;
export type Testimonial = typeof testimonials.$inferSelect;
export type Faq = typeof faqs.$inferSelect;
export type BlogPost = typeof blogPosts.$inferSelect;
export type EventRecord = typeof events.$inferSelect;
