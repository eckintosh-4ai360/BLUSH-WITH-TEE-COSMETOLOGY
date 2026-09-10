// Core RBAC permission keys and role definitions for authorization.

export const PERMISSIONS = {
  // Admissions
  "admissions.read": "View applications and intakes",
  "admissions.write": "Create and edit applications and intakes",
  "admissions.review": "Approve or reject applications",
  "admissions.delete": "Remove applications from the register",

  // Students
  "students.read": "View student records",
  "students.write": "Create and edit student records",
  "students.delete": "Archive student records",

  // Academics
  "academics.read": "View courses, modules, classes and timetables",
  "academics.write": "Manage courses, modules, classes and timetables",
  "attendance.read": "View attendance records",
  "attendance.write": "Record and amend attendance",
  "results.read": "View assessment results",
  "results.write": "Enter and amend assessment results",
  "certificates.read": "View issued certificates",
  "certificates.write": "Issue and revoke certificates",

  // Finance
  "finance.read": "View financial summaries and reports",
  "fees.read": "View fee structures and student balances",
  "fees.write": "Manage fee structures, charges and adjustments",
  "payments.read": "View payment records",
  "payments.write": "Record payments and refunds",
  "expenses.read": "View expenses",
  "expenses.write": "Record expenses",
  "expenses.approve": "Approve or reject expenses",
  "services.read": "View the daily services log",
  "services.write": "Record services carried out and what was charged",
  "closing.read": "View the daily closing register",
  "closing.write": "Close the register at the end of the day",
  "closing.reopen": "Unlock a day that has already been closed",

  // Inventory and procurement
  "inventory.read": "View stock levels and movements",
  "inventory.write": "Adjust stock and manage items",
  "suppliers.read": "View suppliers",
  "suppliers.write": "Manage suppliers",
  "purchases.read": "View purchase orders",
  "purchases.write": "Raise and receive purchase orders",

  // Commerce
  "products.read": "View the product catalogue",
  "products.write": "Manage products, categories and coupons",
  "orders.read": "View store orders",
  "orders.write": "Progress, cancel and refund orders",
  "customers.read": "View customer records",
  "customers.write": "Manage customer records",

  // People and access
  "staff.read": "View staff records",
  "staff.write": "Manage staff records and assignments",
  "staff.salary.read": "View staff salary information",
  "roles.read": "View roles and permissions",
  "roles.write": "Assign roles and permissions",

  // Platform
  "appointments.read": "View clinic appointments",
  "appointments.write": "Manage clinic appointments",
  "cms.read": "View website content",
  "cms.write": "Publish and edit website content",
  "reports.read": "Generate and export reports",
  "notifications.read": "View the notification centre",
  "audit.read": "View the audit log",
  "settings.read": "View system settings",
  "settings.write": "Change system settings",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

// Assignable role keys in the platform.
export type RoleKey =
  | "super_admin"
  | "administrator"
  | "instructor"
  | "accountant"
  | "storekeeper"
  | "ecommerce_manager"
  | "secretary"
  | "customer";

const READ_ONLY_ACADEMIC: PermissionKey[] = [
  "academics.read",
  "students.read",
  "attendance.read",
  "attendance.write",
  "results.read",
  "results.write",
];

// Role configuration mapping role keys to default permissions.
export const ROLE_DEFINITIONS: Record<
  RoleKey,
  { name: string; description: string; permissions: PermissionKey[] | "*" }
> = {
  super_admin: {
    name: "Super Admin",
    description: "Full, unrestricted access to every module.",
    permissions: "*",
  },
  administrator: {
    name: "Administrator",
    description: "Students, applications, courses, attendance and general reports.",
    permissions: [
      "admissions.read",
      "admissions.write",
      "admissions.review",
      "admissions.delete",
      "students.read",
      "students.write",
      "students.delete",
      "academics.read",
      "academics.write",
      "attendance.read",
      "attendance.write",
      "results.read",
      "certificates.read",
      "certificates.write",
      "appointments.read",
      "appointments.write",
      "services.read",
      "services.write",
      "staff.read",
      "cms.read",
      "cms.write",
      "reports.read",
      "notifications.read",
      "customers.read",
      "orders.read",
      "products.read",
      "inventory.read",
      "settings.read",
    ],
  },
  instructor: {
    name: "Instructor",
    description: "Assigned classes and students, attendance, results and academic information.",
    permissions: [...READ_ONLY_ACADEMIC, "notifications.read", "inventory.read"],
  },
  accountant: {
    name: "Accountant",
    description: "Fees, payments, expenses, revenue and financial reports.",
    permissions: [
      "finance.read",
      "fees.read",
      "fees.write",
      "payments.read",
      "payments.write",
      "expenses.read",
      "expenses.write",
      "expenses.approve",
      "closing.read",
      "closing.write",
      "students.read",
      "orders.read",
      "reports.read",
      "notifications.read",
      "staff.salary.read",
      "purchases.read",
      "suppliers.read",
    ],
  },
  storekeeper: {
    name: "Storekeeper",
    description: "Inventory, purchases, suppliers and stock movement.",
    permissions: [
      "inventory.read",
      "inventory.write",
      "suppliers.read",
      "suppliers.write",
      "purchases.read",
      "purchases.write",
      "products.read",
      "reports.read",
      "notifications.read",
    ],
  },
  ecommerce_manager: {
    name: "E-Commerce Manager",
    description: "Products, orders, customers, sales and inventory.",
    permissions: [
      "products.read",
      "products.write",
      "orders.read",
      "orders.write",
      "customers.read",
      "customers.write",
      "inventory.read",
      "inventory.write",
      "reports.read",
      "notifications.read",
      "cms.read",
    ],
  },
  // Front desk role covering day-to-day operations, payments, and till closing.
  secretary: {
    name: "Secretary",
    description:
      "Front desk: admissions, registrations, attendance, shop sales, payments and daily closing.",
    permissions: [
      // Reception and registration
      "admissions.read",
      "admissions.write",
      "students.read",
      "students.write",
      "academics.read",

      // Attendance register
      "attendance.read",
      "attendance.write",

      // Payment collection
      "fees.read",
      "payments.read",
      "payments.write",

      // Petty cash expenses
      "expenses.read",
      "expenses.write",

      // Daily till closing
      "closing.read",
      "closing.write",

      // Shop sales
      "orders.read",
      "orders.write",
      "products.read",
      "inventory.read",
      "customers.read",
      "customers.write",

      // Student clinic bookings
      "appointments.read",
      "appointments.write",

      // Daily services tracking
      "services.read",
      "services.write",

      "notifications.read",
    ],
  },
  customer: {
    name: "Customer",
    description: "Storefront account holder.",
    permissions: [],
  },
};

export const ROLE_KEYS = Object.keys(ROLE_DEFINITIONS) as RoleKey[];

// Resolves concrete list of permissions granted by a specific role.
export function permissionsForRole(role: RoleKey): PermissionKey[] {
  const definition = ROLE_DEFINITIONS[role];
  if (!definition) return [];
  return definition.permissions === "*" ? [...PERMISSION_KEYS] : definition.permissions;
}

// Combines all unique permissions granted across multiple roles.
export function permissionsForRoles(roles: RoleKey[]): Set<PermissionKey> {
  const granted = new Set<PermissionKey>();
  for (const role of roles) {
    for (const permission of permissionsForRole(role)) granted.add(permission);
  }
  return granted;
}
