// OpenAI-compatible chat completion types for Groq.

export type ChatRole = "system" | "user" | "assistant" | "tool";

// Function call request emitted by the model.
export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content?: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string; name?: string };

// Tool definition schema exposed to the model.
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
  // Maximum tokens allowed for response generation.
  maxTokens?: number;
  temperature?: number;
  model?: string;
  // Reasoning effort level for supported models.
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
