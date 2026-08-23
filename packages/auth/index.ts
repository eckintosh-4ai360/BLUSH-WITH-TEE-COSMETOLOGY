import { eq } from "drizzle-orm";
import { ForbiddenError } from "@blush/shared";
import { getDb, users, type User } from "@blush/db";
import { readSessionToken, verifySession } from "./session";

export * from "./password";
export * from "./session";
export * from "./credentials";

/** Result of `sdk.authenticateRequest`. */
export type AuthenticatedUser = User;

/**
 * Turns a request into the account behind it.
 *
 * The token carries only a user id; the account is re-read every request, so a
 * deactivated user or a changed role takes effect immediately instead of when
 * their token happens to expire.
 */
async function authenticateRequest(req: Request): Promise<AuthenticatedUser> {
  const claims = await verifySession(readSessionToken(req));
  if (!claims) throw ForbiddenError("No valid session");

  const db = await getDb();
  if (!db) throw ForbiddenError("Database unavailable");

  const [account] = await db.select().from(users).where(eq(users.id, claims.userId)).limit(1);

  if (!account) throw ForbiddenError("Account no longer exists");
  if (!account.isActive) throw ForbiddenError("Account is deactivated");

  return account;
}

/**
 * Kept as an object so existing call sites read the same. It is now a thin
 * wrapper over local session verification rather than an OAuth client.
 */
export const sdk = { authenticateRequest };
