import { NextRequest, NextResponse } from "next/server";
import { isStorageConfigured, storageGetSignedUrl } from "./index";

/**
 * What the app decided about one request for one storage key.
 *
 * `unauthenticated` and `forbidden` are kept apart so the handler can answer
 * 401 or 403 rather than collapsing both into "no".
 */
export type StorageAccessDecision = "allow" | "unauthenticated" | "forbidden";

export type StorageAccessCheck = (
  request: Request,
  key: string,
) => Promise<StorageAccessDecision>;

/**
 * Builds the `/api/manus-storage/[...key]` Route Handler: resolves a signed
 * Cloudinary delivery URL for the requested key and 307-redirects to it.
 *
 * Assets are stored as Cloudinary `authenticated` resources, so this handler
 * is the only way to reach them — which makes it the enforcement point for the
 * app's access rules, not a convenience wrapper. `authorize` is required for
 * exactly that reason: mounting the route without a policy would publish every
 * admissions document to anyone holding a key, so the type system does not
 * allow it.
 */
export function createStorageProxyHandler(authorize: StorageAccessCheck) {
  return async function GET(
    request: NextRequest,
    context: { params: Promise<{ key: string[] }> }
  ): Promise<NextResponse> {
    const { key: keyParts } = await context.params;
    const key = keyParts?.join("/");
    if (!key) {
      return NextResponse.json({ error: "Missing storage key" }, { status: 400 });
    }

    let decision: StorageAccessDecision;
    try {
      decision = await authorize(request, key);
    } catch (err) {
      // A policy that cannot reach the database must refuse, never wave through.
      console.error("[StorageProxy] authorization failed:", err);
      return NextResponse.json({ error: "Storage proxy error" }, { status: 502 });
    }

    if (decision === "unauthenticated") {
      return NextResponse.json({ error: "Sign in to view this file" }, { status: 401 });
    }
    if (decision !== "allow") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!isStorageConfigured()) {
      return NextResponse.json({ error: "Storage proxy not configured" }, { status: 500 });
    }

    try {
      const url = await storageGetSignedUrl(key);
      if (!url) {
        return NextResponse.json({ error: "Empty signed URL from backend" }, { status: 502 });
      }

      const response = NextResponse.redirect(url, 307);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      return NextResponse.json({ error: "Storage proxy error" }, { status: 502 });
    }
  };
}
