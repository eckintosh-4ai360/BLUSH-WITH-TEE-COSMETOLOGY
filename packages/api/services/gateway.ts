import { TRPCError } from "@trpc/server";
import { ENV } from "@blush/env";

/**
 * Payment gateway boundary.
 *
 * The rule this file exists to enforce (§49): a payment is only ever marked
 * successful after the server has asked the provider what happened and matched
 * the amount and reference. A browser saying "it worked" proves nothing, so no
 * code path outside this module may move a payment to succeeded.
 */

export type GatewayVerification = {
  /** What the provider says the state of the charge is. */
  status: "succeeded" | "pending" | "failed";
  /** Amount the provider actually captured, in minor units. */
  amountMinor: number;
  currency: string;
  providerReference: string;
  /** Reference we sent when the charge was initiated, echoed back. */
  merchantReference: string | null;
  raw: unknown;
};

export interface PaymentGateway {
  readonly name: string;
  /** Returns whatever the client needs to open the provider checkout. */
  initiate(input: {
    reference: string;
    amountMinor: number;
    currency: string;
    email: string;
    callbackUrl?: string;
  }): Promise<{ providerReference: string | null; checkoutUrl: string | null }>;
  /** Asks the provider, server to server, what really happened. */
  verify(providerReference: string): Promise<GatewayVerification>;
}

/**
 * Paystack is the usual choice for Ghana. Only the verify call matters for
 * correctness, and it is a plain server-to-server GET with the secret key.
 */
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

/**
 * Development stand-in. It never reports success on its own: a developer has
 * to confirm the charge through the admin API, which keeps the local flow
 * shaped exactly like the real one instead of auto-approving.
 */
class ManualGateway implements PaymentGateway {
  readonly name = "manual";
  private readonly confirmed = new Map<string, number>();

  async initiate(input: { reference: string; amountMinor: number }) {
    return { providerReference: input.reference, checkoutUrl: null };
  }

  /** Test hook used by the development confirm endpoint. */
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
    // Refusing here is deliberate: a production deployment with no gateway
    // configured must fail loudly rather than fall back to a stub that could
    // be coaxed into approving a payment.
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No payment gateway is configured for this environment.",
    });
  }

  return manualGateway;
}

/** Development-only: mark a simulated charge as paid. */
export function confirmManualPayment(providerReference: string, amountMinor: number) {
  if (ENV.isProduction) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Simulated payments are not available in production.",
    });
  }
  manualGateway.confirm(providerReference, amountMinor);
}

/**
 * Checks a provider response against what we asked for. Both the state and the
 * amount have to line up, so a smaller-than-expected capture cannot clear a
 * larger balance.
 */
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
