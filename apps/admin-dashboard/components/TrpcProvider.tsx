"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from "@blush/shared/const";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/lib/auth";

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  if (error.message !== UNAUTHED_ERR_MSG) return;
  startLogin();
};

export function TrpcProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          // Screens share the same lists (students, courses, staff), so a
          // short freshness window lets a second visit paint from cache
          // instead of showing the skeleton again. Mutations invalidate the
          // keys they touch, so edits still land immediately.
          staleTime: 30_000,
          gcTime: 30 * 60_000,
          // A failed list should say so rather than sit under a skeleton
          // through three backed-off retries.
          retry: 1,
        },
      },
    });
    client.getQueryCache().subscribe(event => {
      if (event.type === "updated" && event.action.type === "error") {
        const error = event.query.state.error;
        redirectToLoginIfUnauthorized(error);
        console.error("[API Query Error]", error);
      }
    });
    client.getMutationCache().subscribe(event => {
      if (event.type === "updated" && event.action.type === "error") {
        const error = event.mutation.state.error;
        redirectToLoginIfUnauthorized(error);
        console.error("[API Mutation Error]", error);
      }
    });
    return client;
  });

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
          headers() {
            try {
              const raw = sessionStorage.getItem("manus-cookie");
              if (raw) {
                const prefix = `${COOKIE_NAME}=`;
                const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
                const token = pair?.trim().slice(prefix.length);
                if (token) {
                  return { Authorization: `Bearer ${token}` };
                }
              }
            } catch {
              // sessionStorage unavailable
            }
            return {};
          },
          fetch(input, init) {
            return globalThis.fetch(input, {
              ...(init ?? {}),
              credentials: "include",
            });
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
