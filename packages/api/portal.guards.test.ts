import { describe, expect, it } from "vitest";
import { clientAppRouter } from "./clientRouter";
import { adminAppRouter } from "./adminRouter";
import type { TrpcContext } from "./context";

function contextFor(role: "user" | "student" | "staff" | "admin" | null): TrpcContext {
  return {
    req: new Request("http://localhost/"),
    ipAddress: "203.0.113.7",
    userAgent: "vitest",
    user: role
      ? {
          id: 99,
          openId: `role-${role}`,
          personId: null,
          name: role,
          email: `${role}@example.com`,
          loginMethod: "test",
          role,
          isActive: true,
          twoFactorEnabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null,
  };
}

describe("portal role guards", () => {
  it("blocks general users from the student portal before any student data is read", async () => {
    await expect(
      clientAppRouter.createCaller(contextFor("user")).portal.mine(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks students from staff operations before inventory or appointment data is read", async () => {
    await expect(
      adminAppRouter.createCaller(contextFor("student")).staff.overview(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks signed-out callers from the student portal", async () => {
    await expect(
      clientAppRouter.createCaller(contextFor(null)).portal.mine(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

/**
 * These assert the shape of the guard rather than the grant: a signed-out
 * caller is refused before the procedure does any work at all, so no
 * permission-gated endpoint can leak data to an anonymous request.
 */
describe("permission-gated procedures reject anonymous callers", () => {
  const anonymous = () => adminAppRouter.createCaller(contextFor(null));

  const calls: Array<[string, () => Promise<unknown>]> = [
    ["dashboard.overview", () => anonymous().dashboard.overview()],
    ["dashboard.charts", () => anonymous().dashboard.charts()],
    ["dashboard.activity", () => anonymous().dashboard.activity()],
    ["dashboard.search", () => anonymous().dashboard.search({ term: "ST-2026" })],
    ["finance.payments", () => anonymous().finance.payments({ page: 1, pageSize: 25, sortDir: "desc" })],
    ["finance.expenses", () => anonymous().finance.expenses({ page: 1, pageSize: 25, sortDir: "desc" })],
    ["finance.revenue", () => anonymous().finance.revenue({ page: 1, pageSize: 25, sortDir: "desc" })],
    ["finance.feeStructures", () => anonymous().finance.feeStructures()],
    ["inventory.items", () => anonymous().inventory.items({ page: 1, pageSize: 25, sortDir: "desc", stockFilter: "all" })],
    ["inventory.suppliers", () => anonymous().inventory.suppliers({ page: 1, pageSize: 25, sortDir: "desc" })],
    ["inventory.purchaseOrders", () => anonymous().inventory.purchaseOrders({ page: 1, pageSize: 25, sortDir: "desc" })],
    ["orders.list", () => anonymous().orders.list({ page: 1, pageSize: 25, sortDir: "desc" })],
    ["orders.detail", () => anonymous().orders.detail({ orderId: 1 })],
    ["notifications.list", () => anonymous().notifications.list({ unreadOnly: false, limit: 10 })],
    ["auth.session", () => anonymous().auth.session()],
  ];

  for (const [name, call] of calls) {
    it(`refuses ${name}`, async () => {
      await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  }
});

describe("mutations reject anonymous callers", () => {
  const anonymous = () => adminAppRouter.createCaller(contextFor(null));

  const mutations: Array<[string, () => Promise<unknown>]> = [
    [
      "finance.recordStudentPayment",
      () =>
        anonymous().finance.recordStudentPayment({
          studentId: 1,
          amount: 100,
          paymentMethod: "cash",
        }),
    ],
    [
      "finance.refundPayment",
      () => anonymous().finance.refundPayment({ paymentId: 1, amount: 50, reason: "test" }),
    ],
    [
      "inventory.recordMovement",
      () =>
        anonymous().inventory.recordMovement({
          inventoryItemId: 1,
          movementType: "adjustment",
          quantity: -1,
          allowNegative: false,
        }),
    ],
    [
      "orders.updateStatus",
      () => anonymous().orders.updateStatus({ orderId: 1, status: "delivered" }),
    ],
    [
      "orders.refund",
      () => anonymous().orders.refund({ orderId: 1, amount: 10, reason: "test", restock: true }),
    ],
  ];

  for (const [name, call] of mutations) {
    it(`refuses ${name}`, async () => {
      await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  }
});
