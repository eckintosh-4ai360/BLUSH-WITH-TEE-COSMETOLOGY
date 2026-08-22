import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextFor(role: "user" | "student" | "staff" | "admin"): TrpcContext {
  return { user: { id: 99, openId: `role-${role}`, name: role, email: `${role}@example.com`, loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("portal role guards", () => {
  it("blocks general users from the student portal procedure before querying student data", async () => {
    await expect(appRouter.createCaller(contextFor("user")).platform.portal.mine()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("blocks students from staff operations before inventory or appointment data is read", async () => {
    await expect(appRouter.createCaller(contextFor("student")).platform.staff.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
