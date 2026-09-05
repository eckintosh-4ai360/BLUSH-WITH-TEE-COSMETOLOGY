"use client";

import { useCallback, useMemo } from "react";
import type { PermissionKey } from "@blush/shared/permissions";
import { trpc } from "@/lib/trpc";

/**
 * The caller permission set, used to decide what the dashboard shows.
 *
 * This is presentation only. Hiding a menu item is a courtesy to the reader;
 * the API refuses the call regardless of what the browser renders.
 */
export function usePermissions() {
  const session = trpc.auth.session.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  const granted = useMemo(
    () => new Set((session.data?.permissions ?? []) as PermissionKey[]),
    [session.data?.permissions],
  );

  const can = useCallback((permission: PermissionKey) => granted.has(permission), [granted]);

  const canAny = useCallback(
    (...permissions: PermissionKey[]) => permissions.some(permission => granted.has(permission)),
    [granted],
  );

  const isAdmin = useMemo(() => {
    if (session.data?.user?.role === "admin") return true;
    const roleKeys = (session.data?.roles ?? []).map(r =>
      typeof r === "string" ? r : (r as { key: string }).key,
    );
    return roleKeys.includes("super_admin") || roleKeys.includes("administrator");
  }, [session.data?.user?.role, session.data?.roles]);

  return {
    can,
    canAny,
    isAdmin,
    permissions: granted,
    roles: session.data?.roles ?? [],
    user: session.data?.user ?? null,
    mustChangePassword: session.data?.user.mustChangePassword ?? false,
    isLoading: session.isLoading,
  };
}
