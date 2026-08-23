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
const { getSessionCookieOptions } = await import("@blush/auth/session");

function context(url: string): import("./context").TrpcContext {
  return {
    req: new Request(url),
    ipAddress: "203.0.113.10",
    userAgent: "vitest",
    user: null,
  };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    cookieCalls.length = 0;

    const caller = clientAppRouter.createCaller(
      context("https://academy.example.com/api/trpc/auth.logout"),
    );
    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(cookieCalls).toHaveLength(1);
    expect(cookieCalls[0]?.name).toBe(COOKIE_NAME);
    expect(cookieCalls[0]?.value).toBe("");

    // maxAge 0 is what actually removes it; the rest must match the cookie as
    // it was set, or the browser keeps the original instead of replacing it.
    expect(cookieCalls[0]?.options).toMatchObject({
      maxAge: 0,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });
});

describe("session cookie options", () => {
  it("marks the cookie secure over https", () => {
    const options = getSessionCookieOptions(new Request("https://academy.example.com/"));
    expect(options.secure).toBe(true);
    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe("/");
  });

  it("honours a proxy that terminated TLS upstream", () => {
    const options = getSessionCookieOptions(
      new Request("http://internal.local/", { headers: { "x-forwarded-proto": "https,http" } }),
    );
    expect(options.secure).toBe(true);
  });

  it("drops secure on plain http so localhost can sign in", () => {
    // A Secure cookie is discarded by the browser over http, which would make
    // development sign-in fail silently.
    expect(getSessionCookieOptions(new Request("http://localhost:3000/")).secure).toBe(false);
  });

  it("uses SameSite=Lax, since sign-in is same-origin", () => {
    expect(getSessionCookieOptions(new Request("https://academy.example.com/")).sameSite).toBe(
      "lax",
    );
  });
});
