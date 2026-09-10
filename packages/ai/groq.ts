import { ENV } from "@blush/env";
import type { ChatRequest, ChatResult, ToolCall } from "./types";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

// Default request timeout for Groq API calls.
const REQUEST_TIMEOUT_MS = 60_000;

// Maximum retry attempts and backoff delays for 429 and 5xx errors.
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [400, 1200];

// Maximum allowed wait time when handling rate limits before failing.
const MAX_RATE_LIMIT_WAIT_MS = 30_000;

export class AiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
    // Delay duration recommended by provider headers.
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}

// Checks if the Groq API key is present in the environment.
export function isAiConfigured(): boolean {
  return Boolean(ENV.groqApiKey);
}

export function activeModel(): string {
  return ENV.groqModel;
}

// Executes a single turn of chat completion against Groq API.
export async function chatCompletion(request: ChatRequest): Promise<ChatResult> {
  if (!ENV.groqApiKey) {
    throw new AiError("The assistant is not configured. Set GROQ_API_KEY to enable it.");
  }

  const body: Record<string, unknown> = {
    model: request.model ?? ENV.groqModel,
    messages: request.messages,
    temperature: request.temperature ?? 0.2,
    max_completion_tokens: request.maxTokens ?? 1600,
    // Hide reasoning scratchpad to prevent exposing thought tokens.
    reasoning_format: "hidden",
    reasoning_effort: request.reasoningEffort ?? "low",
  };

  if (request.tools?.length) {
    body.tools = request.tools;
    body.tool_choice = "auto";
  }

  let lastError: AiError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return parseResponse(await send(body, request.signal));
    } catch (error) {
      const failure =
        error instanceof AiError ? error : new AiError((error as Error).message, undefined, true);
      if (!failure.retryable || attempt === MAX_ATTEMPTS - 1) throw failure;

      // Honor rate limit reset window provided by the API.
      const wait = failure.retryAfterMs ?? BACKOFF_MS[attempt] ?? 1200;
      if (wait > MAX_RATE_LIMIT_WAIT_MS) {
        throw new AiError(
          `The assistant has used up its allowance for the moment. Try again in about ${Math.ceil(wait / 1000)} seconds.`,
          failure.status,
          false,
          wait,
        );
      }

      lastError = failure;
      await delay(wait);
    }
  }

  throw lastError ?? new AiError("The assistant did not respond.");
}

async function send(body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  // Combine caller cancellation and timeout deadline into one abort signal.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AiError(
        describeFailure(response.status, detail),
        response.status,
        response.status === 429 || response.status >= 500,
        response.status === 429 ? retryAfterFrom(response.headers) : undefined,
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AiError) throw error;
    if ((error as Error).name === "AbortError") {
      // Return clear message depending on whether request was cancelled or timed out.
      if (signal?.aborted) throw new AiError("The request was cancelled.");
      throw new AiError("The assistant took too long to reply.", 408, true);
    }
    throw new AiError(`Could not reach the assistant: ${(error as Error).message}`, undefined, true);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// Computes retry delay from retry-after or rate-limit reset headers.
export function retryAfterFrom(headers: Headers): number | undefined {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.ceil(seconds * 1000);
  }

  const resets = [
    headers.get("x-ratelimit-reset-tokens"),
    headers.get("x-ratelimit-reset-requests"),
  ]
    .map(parseDuration)
    .filter((value): value is number => value !== undefined);

  // Return the shortest reset duration among rate-limit headers.
  return resets.length ? Math.min(...resets) : undefined;
}

// Parses duration strings like 1m30s or 500ms into milliseconds.
export function parseDuration(value: string | null): number | undefined {
  if (!value) return undefined;

  const pattern = /(\d+(?:\.\d+)?)(ms|[hms])/g;
  const unitMs: Record<string, number> = { h: 3_600_000, m: 60_000, s: 1000, ms: 1 };

  let total = 0;
  let matched = false;

  for (const [, amount, unit] of value.matchAll(pattern)) {
    total += Number(amount) * (unitMs[unit ?? "s"] ?? 1000);
    matched = true;
  }

  return matched ? Math.ceil(total) : undefined;
}

// Translates HTTP status and response payload into user-facing errors.
function describeFailure(status: number, detail: string): string {
  const provider = extractMessage(detail);

  if (status === 401 || status === 403) {
    return "The assistant's API key was rejected. Check GROQ_API_KEY.";
  }
  if (status === 429) return "The assistant is rate limited right now. Try again in a moment.";
  if (status === 404) {
    return `The configured model is not available${provider ? `: ${provider}` : "."}`;
  }
  if (status >= 500) return "The assistant's provider is having trouble. Try again shortly.";
  return provider || `The assistant returned an error (${status}).`;
}

function extractMessage(detail: string): string {
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string } };
    return parsed.error?.message ?? "";
  } catch {
    return detail.slice(0, 200);
  }
}

function parseResponse(payload: unknown): ChatResult {
  const data = payload as {
    model?: string;
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: string | null; tool_calls?: ToolCall[] };
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const choice = data.choices?.[0];
  if (!choice) throw new AiError("The assistant returned an empty response.", undefined, true);

  return {
    content: choice.message?.content ?? "",
    toolCalls: (choice.message?.tool_calls ?? []).filter(call => call?.function?.name),
    finishReason: choice.finish_reason ?? "stop",
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    },
    model: data.model ?? ENV.groqModel,
  };
}

// Parses tool call arguments defensively to handle variations in formatting.
export function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw?.trim()) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const record = parsed as Record<string, unknown>;
    const keys = Object.keys(record);

    // Handle nested empty key wrapping emitted by some models.
    if (keys.length === 1 && keys[0] === "") {
      const inner = record[""];
      return inner && typeof inner === "object" && !Array.isArray(inner)
        ? (inner as Record<string, unknown>)
        : {};
    }

    return record;
  } catch {
    return {};
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
