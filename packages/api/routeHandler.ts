import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { AnyRouter } from "@trpc/server";
import { createContext } from "./context";

/**
 * Builds the `{ GET, POST }` pair for an app's `app/api/trpc/[trpc]/route.ts`,
 * replacing the old Express `createExpressMiddleware` mount.
 */
export function createTrpcRouteHandler<TRouter extends AnyRouter>(router: TRouter) {
  const handler = (req: Request) =>
    fetchRequestHandler({
      endpoint: "/api/trpc",
      req,
      router,
      createContext,
    });

  return { GET: handler, POST: handler };
}
