/**
 * The authorisation vocabulary for the whole platform.
 *
 * These keys are the single source of truth shared by the API (which enforces
 * them on every procedure) and the dashboards (which use them to decide what to
 * render). Hiding a button is a courtesy; the backend check is the control.
 */

export const PERMISSIONS = {
  // Admissions
  "admissions.read": "View applications and intakes",
  "admissions.write": "Create and edit applications and intakes",
  "admissions.review": "Approve or reject applications",

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

/**
 * The roles that can be assigned.
 *
 * `student` is absent on purpose. It is still a value in the database enum,
 * because dropping one from a Postgres type means recreating it, but it is no
 * longer a role: the front desk is `secretary`, and student portal access
 * comes from `users.role` rather than from here.
 */
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

/**
 * Role definitions straight from the brief (§33). Super admin is handled as a
 * wildcard rather than a list so a newly added permission is never silently
 * withheld from the owner.
 */
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
      "students.read",
      "students.write",
      "academics.read",
      "academics.write",
      "attendance.read",
      "attendance.write",
      "results.read",
      "certificates.read",
      "certificates.write",
      "appointments.read",
      "appointments.write",
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
  /**
   * The front desk.
   *
   * A secretary is the person the school actually runs through: they take the
   * money, register the walk-ins, mark the register, sell from the shop and
   * count the till at the end of the day. The set below is drawn to cover that
   * day rather than to fit a department.
   *
   * What is deliberately withheld is as much the point. They record expenses
   * but cannot approve them; they close the till but cannot reopen a closed
   * day; they file applications but do not decide them; they read stock but do
   * not adjust it. Each of those is a second pair of eyes on the first, and
   * the desk should not be both.
   */
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

      // The register
      "attendance.read",
      "attendance.write",

      // Taking money. `fees.read` is not optional here - a payment cannot be
      // applied to a balance nobody is allowed to see.
      "fees.read",
      "payments.read",
      "payments.write",

      // Cash paid out of the till. Without this the drawer cannot be
      // reconciled: cash expenses are subtracted from what should be in it,
      // so a secretary who cannot record them will be short every time.
      "expenses.read",
      "expenses.write",

      // End of day
      "closing.read",
      "closing.write",

      // The shop
      "orders.read",
      "orders.write",
      "products.read",
      "inventory.read",
      "customers.read",
      "customers.write",

      // Student clinic bookings
      "appointments.read",
      "appointments.write",

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

/**
 * Expands a role to its concrete permission set, resolving the wildcard.
 *
 * An unknown key grants nothing rather than throwing. Roles are retired from
 * time to time and a row can outlive its definition; a stale grant should
 * quietly carry no privileges, not break every request the holder makes.
 */
export function permissionsForRole(role: RoleKey): PermissionKey[] {
  const definition = ROLE_DEFINITIONS[role];
  if (!definition) return [];
  return definition.permissions === "*" ? [...PERMISSION_KEYS] : definition.permissions;
}

/** Union of the permissions granted by every role a user holds. */
export function permissionsForRoles(roles: RoleKey[]): Set<PermissionKey> {
  const granted = new Set<PermissionKey>();
  for (const role of roles) {
    for (const permission of permissionsForRole(role)) granted.add(permission);
  }
  return granted;
}
