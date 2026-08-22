import { NextRequest, NextResponse } from "next/server";
import { ENV } from "@blush/env";

/**
 * Builds the `/api/manus-storage/[...key]` Route Handler that mirrors the
 * original Express `/manus-storage/*` proxy: resolves a presigned GET URL
 * from Forge and 307-redirects the browser to it.
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

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      return NextResponse.json({ error: "Storage proxy not configured" }, { status: 500 });
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        return NextResponse.json({ error: "Storage backend error" }, { status: 502 });
      }

      const { url } = (await forgeResp.json()) as { url: string };
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
