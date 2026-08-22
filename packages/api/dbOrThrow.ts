import { TRPCError } from "@trpc/server";
import { getDb } from "@blush/db";

export async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
  return db;
}
