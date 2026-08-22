import { describe, expect, it } from "vitest";
import {
  PERMISSION_KEYS,
  ROLE_KEYS,
  permissionsForRole,
  permissionsForRoles,
  type PermissionKey,
} from "@blush/shared/permissions";

describe("role definitions", () => {
  it("gives the owner every permission, including any added later", () => {
    const owner = permissionsForRole("super_admin");
    expect(owner).toHaveLength(PERMISSION_KEYS.length);
    for (const permission of PERMISSION_KEYS) expect(owner).toContain(permission);
  });

  it("only ever grants permissions that exist in the catalogue", () => {
    const known = new Set<string>(PERMISSION_KEYS);
    for (const role of ROLE_KEYS) {
      for (const permission of permissionsForRole(role)) {
        expect(known.has(permission)).toBe(true);
      }
    }
  });

  it("keeps salary visibility away from roles that should not see it", () => {
    // §32: pay is not exposed to users without explicit permission.
    for (const role of ["administrator", "instructor", "storekeeper", "ecommerce_manager"] as const) {
      expect(permissionsForRole(role)).not.toContain("staff.salary.read" as PermissionKey);
    }
    expect(permissionsForRole("accountant")).toContain("staff.salary.read" as PermissionKey);
  });

  it("keeps an instructor out of money and administration", () => {
    const instructor = permissionsForRole("instructor");
    for (const forbidden of [
      "finance.read",
      "payments.write",
      "expenses.write",
      "roles.write",
      "settings.write",
      "audit.read",
    ] as PermissionKey[]) {
      expect(instructor).not.toContain(forbidden);
    }
    // But they can do their actual job.
    expect(instructor).toContain("attendance.write" as PermissionKey);
    expect(instructor).toContain("results.write" as PermissionKey);
  });

  it("keeps a storekeeper out of student and financial records", () => {
    const storekeeper = permissionsForRole("storekeeper");
    for (const forbidden of [
      "students.read",
      "finance.read",
      "payments.read",
      "admissions.read",
    ] as PermissionKey[]) {
      expect(storekeeper).not.toContain(forbidden);
    }
    expect(storekeeper).toContain("inventory.write" as PermissionKey);
    expect(storekeeper).toContain("purchases.write" as PermissionKey);
  });

  it("keeps an accountant out of stock mutation and content publishing", () => {
    const accountant = permissionsForRole("accountant");
    expect(accountant).not.toContain("inventory.write" as PermissionKey);
    expect(accountant).not.toContain("cms.write" as PermissionKey);
    expect(accountant).toContain("payments.write" as PermissionKey);
  });

  it("gives students and customers no back-office permissions at all", () => {
    expect(permissionsForRole("student")).toEqual([]);
    expect(permissionsForRole("customer")).toEqual([]);
  });

  it("unions the permissions of every role a user holds", () => {
    const combined = permissionsForRoles(["instructor", "accountant"]);
    expect(combined.has("results.write")).toBe(true);
    expect(combined.has("payments.write")).toBe(true);
    expect(combined.has("roles.write")).toBe(false);
  });
});
