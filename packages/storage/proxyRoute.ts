import { NextRequest, NextResponse } from "next/server";
import { isStorageConfigured, storageGetSignedUrl } from "./index";

/**
 * Builds the `/api/manus-storage/[...key]` Route Handler: resolves a signed
 * Cloudinary delivery URL for the requested key and 307-redirects to it.
 *
 * Assets are stored as Cloudinary `authenticated` resources, so this handler
 * is the only way to reach them — which is what makes it the right place to
 * enforce access rules.
 */
export function createStorageProxyHandler() {
  return async function GET(
    _request: NextRequest,
    context: { params: Promise<{ key: string[] }> }
  ): Promise<NextResponse> {
    const { key: keyParts } = await context.params;
    const key = keyParts?.join("/");
    if (!key) {
      return NextResponse.json({ error: "Missing storage key" }, { status: 400 });
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
