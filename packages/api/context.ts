import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { sdk, type AuthenticatedUser } from "@blush/auth";

export type TrpcContext = {
  req: Request;
  user: AuthenticatedUser | null;
};

export async function createContext(
  opts: FetchCreateContextFnOptions
): Promise<TrpcContext> {
  let user: AuthenticatedUser | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    user,
  };
}
