import { clientAppRouter } from "@blush/api/client-router";
import { createTrpcRouteHandler } from "@blush/api/route-handler";

export const { GET, POST } = createTrpcRouteHandler(clientAppRouter);
