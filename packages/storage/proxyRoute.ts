import { NextRequest, NextResponse } from "next/server";
import { isStorageConfigured, storageGetSignedUrl } from "./index";

// Access control evaluation outcomes for storage key requests.
export type StorageAccessDecision = "allow" | "unauthenticated" | "forbidden";

export type StorageAccessCheck = (
  request: Request,
  key: string,
) => Promise<StorageAccessDecision>;

// Creates authenticated route handler that redirects valid requests to signed URLs.
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
      // Refuse access on authorization failure.
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
