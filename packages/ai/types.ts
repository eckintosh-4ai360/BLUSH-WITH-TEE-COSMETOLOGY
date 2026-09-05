/**
 * The wire vocabulary of a chat completion.
 *
 * Groq speaks the OpenAI chat-completions dialect, so these mirror it rather
 * than inventing a house format - a model swap is then a change of string,
 * not a change of shape.
 */

export type ChatRole = "system" | "user" | "assistant" | "tool";

/** A function the model may ask us to run. */
export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content?: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string; name?: string };

/**
 * A tool as the model sees it: a name, a sentence saying when to reach for it,
 * and a JSON Schema for its arguments.
 */
export type ToolSchema = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
};

export type ChatRequest = {
  messages: ChatMessage[];
  tools?: ToolSchema[];
  /** Ceiling on the reply, not on the conversation. */
  maxTokens?: number;
  temperature?: number;
  model?: string;
  /** Trades depth of deliberation against latency on reasoning models. */
  reasoningEffort?: "low" | "medium" | "high";
  signal?: AbortSignal;
};

export type ChatUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ChatResult = {
  content: string;
  toolCalls: ToolCall[];
  finishReason: string;
  usage: ChatUsage;
  model: string;
};
