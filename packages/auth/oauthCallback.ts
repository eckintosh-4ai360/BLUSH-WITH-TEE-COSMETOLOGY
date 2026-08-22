import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import * as db from "@blush/db";
import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState } from "@blush/shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./index";

/**
 * Builds the `/api/oauth/callback` Route Handler. Each app (admin-dashboard,
 * barber-client-app) mounts its own instance at its own origin — the
 * `__Host-` session cookie is intentionally host-only, so each app keeps an
 * independent session against the same OAuth identity provider.
 */
export function createOAuthCallbackHandler() {
  return async function GET(request: NextRequest): Promise<NextResponse> {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");

    if (!code || !state) {
      return NextResponse.json({ error: "code and state are required" }, { status: 400 });
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login.
    const { nonce } = decodeOAuthState(state);
    const cookieStore = await cookies();
    const expectedNonce = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
    if (!nonce || nonce !== expectedNonce) {
      return NextResponse.json({ error: "invalid oauth state" }, { status: 403 });
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        return NextResponse.json({ error: "openId missing from user info" }, { status: 400 });
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(request);
      const response = NextResponse.redirect(new URL("/", request.url), 302);
      response.cookies.set(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: Math.floor(ONE_YEAR_MS / 1000),
      });
      response.cookies.set(OAUTH_STATE_COOKIE, "", {
        path: "/",
        secure: true,
        sameSite: "none",
        maxAge: 0,
      });
      return response;
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      return NextResponse.json({ error: "OAuth callback failed" }, { status: 500 });
    }
  };
}
