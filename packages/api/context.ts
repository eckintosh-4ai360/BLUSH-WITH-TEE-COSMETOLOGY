import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { sdk, type AuthenticatedUser } from "@blush/auth";
import { requestFingerprint } from "./services/audit";

export type TrpcContext = {
  req: Request;
  user: AuthenticatedUser | null;
  /** Caller address and agent, recorded on every audited action (§44). */
  ipAddress: string | null;
  userAgent: string | null;
};

export async function createContext(opts: FetchCreateContextFnOptions): Promise<TrpcContext> {
  let user: AuthenticatedUser | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    // Authentication is optional for public procedures.
    user = null;
  }

  const { ipAddress, userAgent } = requestFingerprint(opts.req);

  return { req: opts.req, user, ipAddress, userAgent };
}
