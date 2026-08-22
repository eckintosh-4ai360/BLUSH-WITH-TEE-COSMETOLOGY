import { adminAppRouter } from "@blush/api/admin-router";
import { createTrpcRouteHandler } from "@blush/api/route-handler";

export const { GET, POST } = createTrpcRouteHandler(adminAppRouter);
