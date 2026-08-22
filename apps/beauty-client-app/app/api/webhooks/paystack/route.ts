import { createHmac, timingSafeEqual } from "node:crypto";
import { handleGatewayWebhook } from "@blush/api/payments-webhook";

export const runtime = "nodejs";
// The signature covers the exact bytes the provider sent, so this route must
// never be cached or statically optimised.
export const dynamic = "force-dynamic";

/**
 * Paystack webhook endpoint.
 *
 * Two things make this safe to expose publicly:
 *
 *   1. The HMAC is computed over the raw request body with the secret key, so
 *      only the provider can produce a request this route will act on.
 *   2. Even then, the body is not believed. The handler re-verifies the charge
 *      with the provider before any money is recorded (§49).
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!secret) {
    console.error("[webhook] PAYSTACK_SECRET_KEY is not configured");
    return Response.json({ error: "Webhooks are not configured." }, { status: 503 });
  }

  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";

  if (!isValidSignature(raw, signature, secret)) {
    // Deliberately terse: an attacker learns nothing about why it failed.
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  let body: {
    event?: string;
    id?: number | string;
    data?: { id?: number | string; reference?: string };
  };

  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Malformed payload." }, { status: 400 });
  }

  const reference = body.data?.reference;
  const eventId = String(body.id ?? body.data?.id ?? "");

  if (!reference || !eventId) {
    return Response.json({ error: "Missing reference." }, { status: 400 });
  }

  try {
    const result = await handleGatewayWebhook({
      provider: "paystack",
      eventId,
      eventType: body.event,
      reference,
      payload: body,
    });

    // Always 200 on a handled event, including duplicates: a non-2xx would
    // make the provider retry something that is already done.
    return Response.json({ status: result.status });
  } catch (error) {
    // The event is stored with its error, so a 500 asks the provider to retry.
    console.error("[webhook] paystack processing failed:", error);
    return Response.json({ error: "Processing failed." }, { status: 500 });
  }
}

function isValidSignature(raw: string, signature: string, secret: string): boolean {
  if (!signature) return false;

  const expected = createHmac("sha512", secret).update(raw).digest("hex");
  const provided = Buffer.from(signature, "utf8");
  const computed = Buffer.from(expected, "utf8");

  // Length check first: timingSafeEqual throws on a length mismatch.
  if (provided.length !== computed.length) return false;
  return timingSafeEqual(provided, computed);
}
