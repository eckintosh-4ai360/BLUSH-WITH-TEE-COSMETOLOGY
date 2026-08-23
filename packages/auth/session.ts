import { SignJWT, jwtVerify } from "jose";
import { COOKIE_NAME } from "@blush/shared/const";
import { ENV } from "@blush/env";

/**
 * Session tokens.
 *
 * A short signed JWT holding only the user id and a version stamp. Everything
 * else - role, permissions, whether the account is still active - is read from
 * the database on each request, so revoking access takes effect immediately
 * rather than when a token happens to expire.
 */

export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type SessionClaims = { userId: number; email: string | null };

function secretKey(): Uint8Array {
  const secret = ENV.cookieSecret;
  if (!secret || secret.length < 16) {
    throw new Error(
      "JWT_SECRET is not configured. Set a long random value before signing sessions.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(claims.userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) return null;

    return { userId, email: typeof payload.email === "string" ? payload.email : null };
  } catch {
    // Expired, tampered with, or signed by a different secret.
    return null;
  }
}

/** Reads the session token from a cookie, or a bearer header for API clients. */
export function readSessionToken(req: Request): string | undefined {
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === COOKIE_NAME && rest.length) {
        return decodeURIComponent(rest.join("="));
      }
    }
  }

  const authorization = req.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);

  return undefined;
}

export type SessionCookieOptions = {
  httpOnly: true;
  path: "/";
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
};

/**
 * Cookie flags for the session.
 *
 * `SameSite=Lax` because sign-in is now same-origin - there is no third-party
 * redirect to accommodate, and Lax is what stops the cookie riding along on a
 * cross-site request. `Secure` follows the actual protocol, so localhost over
 * http still works while production over TLS is protected.
 */
export function getSessionCookieOptions(req: Request, maxAge = SESSION_TTL_SECONDS): SessionCookieOptions {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
    maxAge,
  };
}

function isSecureRequest(req: Request): boolean {
  try {
    if (new URL(req.url).protocol === "https:") return true;
  } catch {
    // A relative or malformed URL: fall through to the proxy header.
  }

  const forwarded = req.headers.get("x-forwarded-proto");
  return Boolean(
    forwarded?.split(",").some(proto => proto.trim().toLowerCase() === "https"),
  );
}
