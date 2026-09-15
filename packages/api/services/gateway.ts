import { TRPCError } from "@trpc/server";
import { ENV } from "@blush/env";

// Payment gateway boundary.

export type GatewayVerification = {
  // What the provider says the state of the charge is.
  status: "succeeded" | "pending" | "failed";
  // Amount the provider actually captured, in minor units.
  amountMinor: number;
  currency: string;
  providerReference: string;
  // Reference we sent when the charge was initiated, echoed back.
  merchantReference: string | null;
  raw: unknown;
};

export interface PaymentGateway {
  readonly name: string;
  // Returns whatever the client needs to open the provider checkout.
  initiate(input: {
    reference: string;
    amountMinor: number;
    currency: string;
    email: string;
    callbackUrl?: string;
  }): Promise<{ providerReference: string | null; checkoutUrl: string | null }>;
  // Asks the provider, server to server, what really happened.
  verify(providerReference: string): Promise<GatewayVerification>;
}

// Paystack is the usual choice for Ghana.
class PaystackGateway implements PaymentGateway {
  readonly name = "paystack";

  constructor(private readonly secretKey: string) {}

  async initiate(input: {
    reference: string;
    amountMinor: number;
    currency: string;
    email: string;
    callbackUrl?: string;
  }) {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reference: input.reference,
        amount: input.amountMinor,
        currency: input.currency,
        email: input.email,
        callback_url: input.callbackUrl,
      }),
    });

    if (!response.ok) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: "The payment provider could not start this transaction.",
      });
    }

    const body = (await response.json()) as {
      data?: { reference?: string; authorization_url?: string };
    };

    return {
      providerReference: body.data?.reference ?? input.reference,
      checkoutUrl: body.data?.authorization_url ?? null,
    };
  }

  async verify(providerReference: string): Promise<GatewayVerification> {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(providerReference)}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );

    if (!response.ok) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: "The payment provider could not be reached for verification.",
      });
    }

    const body = (await response.json()) as {
      data?: {
        status?: string;
        amount?: number;
        currency?: string;
        reference?: string;
      };
    };

    const providerStatus = body.data?.status;

    return {
      status:
        providerStatus === "success"
          ? "succeeded"
          : providerStatus === "failed" || providerStatus === "abandoned"
            ? "failed"
            : "pending",
      amountMinor: Number(body.data?.amount ?? 0),
      currency: body.data?.currency ?? "GHS",
      providerReference: body.data?.reference ?? providerReference,
      merchantReference: body.data?.reference ?? null,
      raw: body,
    };
  }
}

// Development stand-in.
class ManualGateway implements PaymentGateway {
  readonly name = "manual";
  private readonly confirmed = new Map<string, number>();

  async initiate(input: { reference: string; amountMinor: number }) {
    return { providerReference: input.reference, checkoutUrl: null };
  }

  // Test hook used by the development confirm endpoint.
  confirm(providerReference: string, amountMinor: number) {
    this.confirmed.set(providerReference, amountMinor);
  }

  async verify(providerReference: string): Promise<GatewayVerification> {
    const amountMinor = this.confirmed.get(providerReference);
    return {
      status: amountMinor === undefined ? "pending" : "succeeded",
      amountMinor: amountMinor ?? 0,
      currency: "GHS",
      providerReference,
      merchantReference: providerReference,
      raw: { simulated: true },
    };
  }
}

const manualGateway = new ManualGateway();

export function getGateway(): PaymentGateway {
  const secretKey = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (secretKey) return new PaystackGateway(secretKey);

  if (ENV.isProduction) {
    // Refusing here is deliberate.
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No payment gateway is configured for this environment.",
    });
  }

  return manualGateway;
}

// Whether a payment can be taken online here: a real provider ("live"), the development
// stand-in that a test button confirms ("test"), or neither in a production without keys ("off").
export function onlinePaymentMode(): "live" | "test" | "off" {
  if (process.env.PAYSTACK_SECRET_KEY) return "live";
  return ENV.isProduction ? "off" : "test";
}

// Where the provider sends the payer back to. Built here from the site's own address, never
// taken from the browser, so a crafted request cannot turn the checkout into a redirect.
export function callbackUrlFor(request: Request, path: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const origin = configured ? new URL(configured).origin : new URL(request.url).origin;
  return new URL(path, origin).toString();
}

// Development-only.
export function confirmManualPayment(providerReference: string, amountMinor: number) {
  if (ENV.isProduction) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Simulated payments are not available in production.",
    });
  }
  manualGateway.confirm(providerReference, amountMinor);
}

// Checks a provider response against what we asked for.
export function assertVerificationMatches(
  verification: GatewayVerification,
  expected: { amountMinor: number; currency: string },
): void {
  if (verification.status !== "succeeded") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        verification.status === "pending"
          ? "The provider has not completed this payment yet."
          : "The provider reports that this payment failed.",
    });
  }

  if (verification.amountMinor !== expected.amountMinor) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The amount confirmed by the provider does not match this payment.",
    });
  }

  if (verification.currency.toUpperCase() !== expected.currency.toUpperCase()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The currency confirmed by the provider does not match this payment.",
    });
  }
}
