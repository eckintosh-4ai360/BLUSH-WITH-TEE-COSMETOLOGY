import { describe, expect, it } from "vitest";
import { clientAppRouter } from "./clientRouter";
import { adminAppRouter } from "./adminRouter";
import type { TrpcContext } from "./context";

function contextFor(role: "user" | "student" | "staff" | "admin"): TrpcContext {
  return {
    req: new Request("http://localhost/"),
    user: { id: 99, openId: `role-${role}`, name: role, email: `${role}@example.com`, loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  };
}

describe("portal role guards", () => {
  it("blocks general users from the student portal procedure before querying student data", async () => {
    await expect(clientAppRouter.createCaller(contextFor("user")).portal.mine()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("blocks students from staff operations before inventory or appointment data is read", async () => {
    await expect(adminAppRouter.createCaller(contextFor("student")).staff.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
