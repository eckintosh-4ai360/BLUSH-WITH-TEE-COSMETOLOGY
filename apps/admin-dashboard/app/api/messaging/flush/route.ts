import { NextResponse } from "next/server";
import { getDb } from "@blush/db";
import { flush } from "@blush/api/messaging-flush";

// Drains the message outbox.
export const dynamic = "force-dynamic";

async function run(request: Request) {
  // Vercel Cron signs its calls with CRON_SECRET, so either name works.
  const secret = process.env.MESSAGING_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "MESSAGING_CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  // Vercel Cron sends the secret as a bearer token.
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
