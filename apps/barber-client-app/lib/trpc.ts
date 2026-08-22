import { createTRPCReact } from "@trpc/react-query";
import type { ClientAppRouter } from "@blush/api/client-router";

export const trpc = createTRPCReact<ClientAppRouter>();
