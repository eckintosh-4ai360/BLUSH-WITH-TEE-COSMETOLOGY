"use client";

import { trpc } from "@/lib/trpc";

// The contact details and social links the school keeps in Settings. They rarely change, so
// one fetch serves every page a visitor opens.
export function useSchoolProfile() {
  return trpc.content.schoolProfile.useQuery(undefined, {
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}
