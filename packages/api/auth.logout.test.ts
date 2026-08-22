import { describe, expect, it, vi } from "vitest";

type CookieCall = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

const cookieCalls: CookieCall[] = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string, options: Record<string, unknown>) => {
      cookieCalls.push({ name, value, options });
    },
    get: () => undefined,
  }),
}));

const { clientAppRouter } = await import("./clientRouter");
const { COOKIE_NAME } = await import("@blush/shared/const");

describe("auth.logout", () => {
  it("clears the session cookie via next/headers and reports success", async () => {
    cookieCalls.length = 0;
    const req = new Request("https://academy.example.com/api/trpc/auth.logout");
    const ctx: import("./context").TrpcContext = {
      req,
      user: {
        id: 1,
        openId: "sample-user",
        email: "sample@example.com",
        name: "Sample User",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
    };

    const caller = clientAppRouter.createCaller(ctx);
    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(cookieCalls).toHaveLength(1);
    expect(cookieCalls[0]?.name).toBe(COOKIE_NAME);
    expect(cookieCalls[0]?.options).toMatchObject({
      maxAge: 0,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });
});
