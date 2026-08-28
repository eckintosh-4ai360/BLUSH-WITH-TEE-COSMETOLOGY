import type { SmsConfig } from "./config";

export type SendResult = { ok: true; detail?: string } | { ok: false; error: string };

/**
 * Ghanaian numbers, in the form mNotify expects.
 *
 * The register holds numbers as people write them - "024 123 4567",
 * "+233 24 123 4567", "233241234567". The provider wants digits in
 * international form, so the local trunk zero is swapped for the country code
 * and everything else is thrown away.
 *
 * Returns null when what is left cannot be a phone number, which is how a bad
 * contact detail becomes a skipped delivery with a reason rather than a failed
 * request.
 */
export function normaliseMsisdn(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (!hasPlus && digits.startsWith("0")) digits = `233${digits.slice(1)}`;

  // A bare nine-digit local number ("241234567") is still a Ghanaian mobile.
  if (digits.length === 9 && !digits.startsWith("233")) digits = `233${digits}`;

  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** What a text message costs is measured in segments, so length is worth knowing. */
export function smsSegments(message: string): number {
  return Math.max(1, Math.ceil(message.length / 160));
}

export function describeSmsConfig(config: SmsConfig): string | null {
  if (!config.apiKey) return "No mNotify API key has been saved.";
  if (!config.senderId) return "No mNotify sender ID has been saved.";
  return null;
}

/**
 * Sends one message through mNotify's quick SMS endpoint.
 *
 * The endpoint and request shape are the documented ones:
 * `POST {baseUrl}?key=API_KEY` with a JSON body carrying `recipient`,
 * `sender`, `message` and the scheduling pair.
 *
 * The response is read defensively on purpose. mNotify answers 200 with a
 * status body rather than using HTTP codes for application failures, and the
 * published code list is not something this can verify at build time - so
 * anything that does not clearly say success is treated as a failure and the
 * provider's own words are stored on the delivery row. A mismatch therefore
 * shows up as a readable error in the send log instead of a message that
 * silently never arrives.
 */
export async function sendSms(
  config: SmsConfig,
  to: string,
  message: string,
  timeoutMs = 15_000,
): Promise<SendResult> {
  const problem = describeSmsConfig(config);
  if (problem) return { ok: false, error: problem };

  const recipient = normaliseMsisdn(to);
  if (!recipient) return { ok: false, error: `"${to}" is not a usable phone number.` };

  const url = `${config.baseUrl}?key=${encodeURIComponent(config.apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        recipient: [recipient],
        sender: config.senderId,
        message,
        is_schedule: false,
        schedule_date: "",
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      // Left empty: the raw text is reported below, which is more useful than
      // "invalid JSON" when a provider returns an HTML error page.
    }

    if (!response.ok) {
      return {
        ok: false,
        error: `mNotify returned HTTP ${response.status}: ${summarise(parsed, raw)}`,
      };
    }

    const status = String(parsed.status ?? "").toLowerCase();
    const code = String(parsed.code ?? "");
    if (status === "success" || code === "2000") {
      return { ok: true, detail: summarise(parsed, raw) };
    }

    return { ok: false, error: `mNotify refused the message: ${summarise(parsed, raw)}` };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: `mNotify did not answer within ${timeoutMs / 1000}s.` };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Unknown SMS error." };
  } finally {
    clearTimeout(timer);
  }
}

/** A short, loggable version of whatever the provider said. */
function summarise(parsed: Record<string, unknown>, raw: string): string {
  const message = parsed.message ?? parsed.error ?? parsed.status;
  const text = typeof message === "string" && message ? message : raw;
  return (text || "no response body").slice(0, 300);
}
