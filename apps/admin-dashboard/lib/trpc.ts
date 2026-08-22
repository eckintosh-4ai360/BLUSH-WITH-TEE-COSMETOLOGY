import { createTRPCReact } from "@trpc/react-query";
import type { AdminAppRouter } from "@blush/api/admin-router";

export const trpc = createTRPCReact<AdminAppRouter>();
