import { NextResponse } from "next/server";
import { getDb } from "@blush/db";
import { flush } from "@blush/api/messaging-flush";

/**
 * Drains the message outbox.
 *
 * Messages are normally sent moments after the event that caused them, by the
 * request that caused it. This endpoint exists for the ones that did not get
 * through: a provider that was briefly down, or a serverless function that was
 * frozen before its background send finished. Point a scheduler at it - every
 * five or ten minutes is plenty - and anything still queued is retried.
 *
 * Guarded by a shared secret rather than a session, because the caller is a
 * cron job and has nobody to sign in as. Without `MESSAGING_CRON_SECRET` set,
 * the route refuses everything: an open endpoint that makes the school send
 * text messages is not something to leave lying around by default.
 */
export const dynamic = "force-dynamic";

async function run(request: Request) {
  const secret = process.env.MESSAGING_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "MESSAGING_CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  // Vercel Cron sends the secret as a bearer token; a plain scheduler can send
  // the header instead. Both are accepted so this works wherever it is hosted.
  const authorization = request.headers.get("authorization");
  const provided =
    authorization?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-messaging-secret");

  if (provided !== secret) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const db = await getDb();
  if (!db) {
    return NextResponse.json({ error: "No database connection." }, { status: 503 });
  }

  const result = await flush(db, 100);
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
