"use client";

import { useRouter } from "next/navigation";
import {
  BookPlus,
  ChevronDown,
  FileBarChart,
  PackagePlus,
  Plus,
  Receipt,
  ShoppingCart,
  TrendingDown,
  UserRoundPlus,
  Users,
} from "lucide-react";
import type { PermissionKey } from "@blush/shared/permissions";
import { Button } from "@blush/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@blush/ui/components/ui/dropdown-menu";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Dashboard shortcuts (§62). Each entry declares the permission it needs, so
 * the menu only offers work the signed-in role can actually complete - the
 * API enforces the same permission again when the action runs.
 */
const ACTIONS: Array<{
  label: string;
  href: string;
  icon: typeof Plus;
  permission: PermissionKey;
}> = [
  { label: "New student", href: "/students?new=1", icon: Users, permission: "students.write" },
  {
    label: "New application",
    href: "/admissions?new=1",
    icon: UserRoundPlus,
    permission: "admissions.write",
  },
  {
    label: "Record payment",
    href: "/finance/payments?new=1",
    icon: Receipt,
    permission: "payments.write",
  },
  {
    label: "Add expense",
    href: "/finance/expenses?new=1",
    icon: TrendingDown,
    permission: "expenses.write",
  },
  { label: "Add product", href: "/inventory?new=1", icon: PackagePlus, permission: "inventory.write" },
  {
    label: "Record purchase",
    href: "/inventory/purchases?new=1",
    icon: ShoppingCart,
    permission: "purchases.write",
  },
  { label: "Add course", href: "/academics?new=1", icon: BookPlus, permission: "academics.write" },
  { label: "Generate report", href: "/reports", icon: FileBarChart, permission: "reports.read" },
];

export function QuickActions() {
  const router = useRouter();
  const { can, isLoading } = usePermissions();

  const available = ACTIONS.filter(action => can(action.permission));
  if (isLoading || !available.length) return null;

  const [primary, ...rest] = available;

  return (
    <div className="flex items-center gap-2">
      <Button onClick={() => router.push(primary.href)} className="gap-2">
        <Plus className="h-4 w-4" />
        {primary.label}
      </Button>

      {rest.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-1" aria-label="More quick actions">
              More
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {rest.map(action => (
              <DropdownMenuItem
                key={action.href}
                onClick={() => router.push(action.href)}
                className="cursor-pointer gap-2"
              >
                <action.icon className="h-4 w-4 text-muted-foreground" />
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
