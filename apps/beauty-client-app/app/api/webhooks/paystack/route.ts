import { createHmac, timingSafeEqual } from "node:crypto";
import { handleGatewayWebhook } from "@blush/api/payments-webhook";

export const runtime = "nodejs";
// Never cache route because signature covers raw payload bytes.
export const dynamic = "force-dynamic";

// Paystack webhook endpoint with HMAC verification and provider re-check.
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!secret) {
    console.error("[webhook] PAYSTACK_SECRET_KEY is not configured");
    return Response.json({ error: "Webhooks are not configured." }, { status: 503 });
  }

  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";

  if (!isValidSignature(raw, signature, secret)) {
    // Return generic error for invalid signature.
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

    // Acknowledge handled events to prevent provider retries.
    return Response.json({ status: result.status });
  } catch (error) {
    // Return 500 so provider retries on processing failure.
    console.error("[webhook] paystack processing failed:", error);
    return Response.json({ error: "Processing failed." }, { status: 500 });
  }
}

function isValidSignature(raw: string, signature: string, secret: string): boolean {
  if (!signature) return false;

  const expected = createHmac("sha512", secret).update(raw).digest("hex");
  const provided = Buffer.from(signature, "utf8");
  const computed = Buffer.from(expected, "utf8");

  // Length check prevents timingSafeEqual mismatch throw.
  if (provided.length !== computed.length) return false;
  return timingSafeEqual(provided, computed);
}
