"use client";

import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import type { PermissionKey } from "@blush/shared/permissions";
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Renders a page only when the caller holds one of the listed permissions.
 *
 * This is presentation, not protection. Every procedure the page calls checks
 * the same permission server-side, so bypassing this component gets an empty
 * page and a string of FORBIDDEN responses rather than data.
 */
export function PermissionGate({
  anyOf,
  children,
}: {
  anyOf: PermissionKey[];
  children: ReactNode;
}) {
  const { canAny, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (!canAny(...anyOf)) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 py-24 text-center">
        <ShieldAlert className="h-8 w-8 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          You do not have access to this area
        </h1>
        <p className="text-sm text-muted-foreground">
          Ask an administrator to grant your account the right role if you need it.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
