import { index, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Website contact-form enquiries, kept until the desk marks them handled.
export const enquiries = pgTable(
  "enquiries",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    subject: varchar("subject", { length: 180 }),
    message: text("message").notNull(),
    // new -> handled. The desk also deletes outright spam.
    status: varchar("status", { length: 24 }).default("new").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("enquiries_status_idx").on(table.status)],
);
