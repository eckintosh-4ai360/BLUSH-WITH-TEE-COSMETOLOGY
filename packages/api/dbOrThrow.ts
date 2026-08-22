import { TRPCError } from "@trpc/server";
import { getDb } from "@blush/db";

export async function dbOrThrow() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
  return db;
}

/** The drizzle client. */
export type Database = Awaited<ReturnType<typeof dbOrThrow>>;

/**
 * A drizzle handle that may be either the pool client or an open transaction.
 * Services take this so the same helper can be called standalone or composed
 * into a larger atomic operation.
 */
export type DbExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
