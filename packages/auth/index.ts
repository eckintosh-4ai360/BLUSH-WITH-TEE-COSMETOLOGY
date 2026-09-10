import { eq } from "drizzle-orm";
import { ForbiddenError } from "@blush/shared";
import { getDb, users, type User } from "@blush/db";
import { readSessionToken, verifySession } from "./session";

export * from "./password";
export * from "./session";
export * from "./credentials";

// Authenticated user record returned by authentication check.
export type AuthenticatedUser = User;

// Authenticates incoming request from session token and re-reads user from database.
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

// SDK adapter for backward compatibility.
export const sdk = { authenticateRequest };
