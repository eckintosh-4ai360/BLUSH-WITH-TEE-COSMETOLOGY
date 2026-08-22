import {
  BadgeCheck,
  Bell,
  BookOpen,
  Boxes,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Contact,
  CreditCard,
  FileBarChart,
  FileText,
  GalleryVerticalEnd,
  GraduationCap,
  Images,
  LayoutDashboard,
  ListChecks,
  Newspaper,
  Package,
  PackageSearch,
  Quote,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Tags,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCog,
  UserRoundPlus,
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
 * The admin navigation from §52. Every entry is gated by the permission its
 * page needs, so the sidebar a storekeeper sees differs from an accountant.
 * The gate here is cosmetic - each page and procedure enforces it again.
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
    label: "Admissions",
    items: [
      {
        label: "Applications",
        path: "/admissions",
        icon: ClipboardList,
        permissions: ["admissions.read"],
      },
      {
        label: "Intakes",
        path: "/admissions/intakes",
        icon: CalendarClock,
        permissions: ["admissions.read", "academics.read"],
      },
    ],
  },
  {
    label: "Students",
    items: [
      { label: "All students", path: "/students", icon: Users, permissions: ["students.read"] },
      {
        label: "Enrolments",
        path: "/students/enrollments",
        icon: UserRoundPlus,
        permissions: ["students.read"],
      },
      {
        label: "Attendance",
        path: "/students/attendance",
        icon: ListChecks,
        permissions: ["attendance.read"],
      },
      {
        label: "Results",
        path: "/students/results",
        icon: BadgeCheck,
        permissions: ["results.read"],
      },
      {
        label: "Certificates",
        path: "/students/certificates",
        icon: ScrollText,
        permissions: ["certificates.read"],
      },
    ],
  },
  {
    label: "Academics",
    items: [
      { label: "Courses", path: "/academics", icon: GraduationCap, permissions: ["academics.read"] },
      {
        label: "Modules",
        path: "/academics/modules",
        icon: BookOpen,
        permissions: ["academics.read"],
      },
      {
        label: "Classes",
        path: "/academics/classes",
        icon: Sparkles,
        permissions: ["academics.read"],
      },
      {
        label: "Timetable",
        path: "/academics/timetable",
        icon: CalendarDays,
        permissions: ["academics.read"],
      },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Fees", path: "/finance/fees", icon: Wallet, permissions: ["fees.read"] },
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
      { label: "Revenue", path: "/finance", icon: TrendingUp, permissions: ["finance.read"] },
      {
        label: "Financial reports",
        path: "/reports/finance",
        icon: FileBarChart,
        permissions: ["reports.read", "finance.read"],
      },
    ],
  },
  {
    label: "E-commerce",
    items: [
      { label: "Products", path: "/products", icon: Store, permissions: ["products.read"] },
      {
        label: "Categories",
        path: "/products/categories",
        icon: Tags,
        permissions: ["products.read"],
      },
      { label: "Orders", path: "/orders", icon: ShoppingBag, permissions: ["orders.read"] },
      { label: "Customers", path: "/customers", icon: Contact, permissions: ["customers.read"] },
      { label: "Coupons", path: "/products/coupons", icon: Receipt, permissions: ["products.write"] },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Stock", path: "/inventory", icon: Boxes, permissions: ["inventory.read"] },
      {
        label: "Stock movements",
        path: "/inventory/movements",
        icon: PackageSearch,
        permissions: ["inventory.read"],
      },
      {
        label: "Purchases",
        path: "/inventory/purchases",
        icon: ShoppingCart,
        permissions: ["purchases.read"],
      },
      { label: "Suppliers", path: "/suppliers", icon: Truck, permissions: ["suppliers.read"] },
      {
        label: "Low stock",
        path: "/inventory?filter=low",
        icon: Package,
        permissions: ["inventory.read"],
      },
    ],
  },
  {
    label: "Staff",
    items: [
      { label: "Staff", path: "/staff", icon: UserCog, permissions: ["staff.read"] },
      { label: "Roles", path: "/staff/roles", icon: ShieldCheck, permissions: ["roles.read"] },
      {
        label: "Permissions",
        path: "/staff/permissions",
        icon: ShieldCheck,
        permissions: ["roles.read"],
      },
    ],
  },
  {
    label: "Website",
    items: [
      { label: "Pages", path: "/website/pages", icon: FileText, permissions: ["cms.read"] },
      {
        label: "Banners",
        path: "/website/banners",
        icon: GalleryVerticalEnd,
        permissions: ["cms.read"],
      },
      { label: "Services", path: "/website/services", icon: Sparkles, permissions: ["cms.read"] },
      { label: "Gallery", path: "/website/gallery", icon: Images, permissions: ["cms.read"] },
      { label: "Blog", path: "/website/blog", icon: Newspaper, permissions: ["cms.read"] },
      {
        label: "Testimonials",
        path: "/website/testimonials",
        icon: Quote,
        permissions: ["cms.read"],
      },
      { label: "FAQs", path: "/website/faqs", icon: BookOpen, permissions: ["cms.read"] },
      { label: "Events", path: "/website/events", icon: CalendarDays, permissions: ["cms.read"] },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Appointments",
        path: "/appointments",
        icon: CalendarClock,
        permissions: ["appointments.read"],
      },
      { label: "Reports", path: "/reports", icon: FileBarChart, permissions: ["reports.read"] },
      {
        label: "Notifications",
        path: "/notifications",
        icon: Bell,
        permissions: ["notifications.read"],
      },
      { label: "Audit logs", path: "/audit", icon: ScrollText, permissions: ["audit.read"] },
      { label: "Settings", path: "/settings", icon: Settings, permissions: ["settings.read"] },
    ],
  },
];
