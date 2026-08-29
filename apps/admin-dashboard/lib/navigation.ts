import {
  BadgeCheck,
  BookOpen,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  CalendarCheck,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  LockKeyhole,
  ChartColumnBig,
  PackageSearch,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@blush/shared/permissions";

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Shown when the caller holds any one of these. */
  permissions: PermissionKey[];
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

/**
 * The admin navigation (§52).
 *
 * Every entry here points at a route that exists, and is gated by the
 * permission that route needs - so the sidebar a storekeeper sees differs from
 * an accountant's, and nothing in it leads to a dead end. The gate is
 * cosmetic; each page and procedure enforces the same permission again.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "",
    items: [
      {
        label: "Dashboard",
        path: "/",
        icon: LayoutDashboard,
        permissions: [
          "students.read",
          "finance.read",
          "orders.read",
          "inventory.read",
          "admissions.read",
        ],
      },
    ],
  },
  {
    label: "School",
    items: [
      {
        label: "Admissions",
        path: "/admissions",
        icon: ClipboardList,
        permissions: ["admissions.read"],
      },
      { label: "Students", path: "/students", icon: Users, permissions: ["students.read"] },
      {
        label: "Programmes",
        path: "/programs",
        icon: BookOpen,
        permissions: ["academics.read"],
      },
      {
        label: "Academics",
        path: "/academics",
        icon: GraduationCap,
        permissions: ["academics.read"],
      },
      {
        label: "Attendance",
        path: "/academics/attendance",
        icon: CalendarCheck,
        permissions: ["attendance.read"],
      },
      {
        label: "Certificates",
        path: "/students/certificates",
        icon: BadgeCheck,
        permissions: ["certificates.read"],
      },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Overview", path: "/finance", icon: TrendingUp, permissions: ["finance.read"] },
      {
        label: "Fee structure",
        path: "/finance/structures",
        icon: ReceiptText,
        permissions: ["fees.read"],
      },
      { label: "Fees owed", path: "/finance/fees", icon: Wallet, permissions: ["fees.read"] },
      {
        label: "Payments",
        path: "/finance/payments",
        icon: CreditCard,
        permissions: ["payments.read"],
      },
      {
        label: "Expenses",
        path: "/finance/expenses",
        icon: TrendingDown,
        permissions: ["expenses.read"],
      },
      {
        label: "Daily closing",
        path: "/finance/closing",
        icon: LockKeyhole,
        permissions: ["closing.read"],
      },
    ],
  },
  {
    label: "Commerce",
    items: [
      { label: "Orders", path: "/orders", icon: ShoppingBag, permissions: ["orders.read"] },
      { label: "Stock", path: "/inventory", icon: Boxes, permissions: ["inventory.read"] },
      {
        label: "Stock movements",
        path: "/inventory/movements",
        icon: PackageSearch,
        permissions: ["inventory.read"],
      },
      { label: "Suppliers", path: "/suppliers", icon: Truck, permissions: ["suppliers.read"] },
      {
        label: "Purchase orders",
        path: "/purchases",
        icon: ClipboardCheck,
        permissions: ["purchases.read"],
      },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Staff", path: "/staff", icon: UserCog, permissions: ["staff.read"] },
      { label: "Access", path: "/staff/roles", icon: ShieldCheck, permissions: ["roles.read"] },
      {
        label: "Clinic bookings",
        path: "/operations",
        icon: CalendarClock,
        permissions: ["appointments.read"],
      },
      {
        label: "Reports",
        path: "/reports",
        icon: ChartColumnBig,
        permissions: ["reports.read"],
      },
      { label: "Audit log", path: "/audit", icon: ScrollText, permissions: ["audit.read"] },
      { label: "Settings", path: "/settings", icon: Settings, permissions: ["settings.read"] },
    ],
  },
];
