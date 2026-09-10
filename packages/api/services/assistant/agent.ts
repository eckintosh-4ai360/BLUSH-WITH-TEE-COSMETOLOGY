import { AiError, chatCompletion, parseToolArguments, type ChatMessage } from "@blush/ai";
import type { RoleKey } from "@blush/shared/permissions";
import type { Database } from "../../dbOrThrow";
import type { AccessContext } from "../access";
import { availableTools, runTool, toolSchemas, type Audience } from "./registry";
import { systemPrompt } from "./prompt";
import type { ToolContext } from "./types";

// How many times the model may call tools before it has to answer.
const MAX_TOOL_ROUNDS = 3;

// Turns kept from the conversation, newest last.
const MAX_HISTORY_TURNS = 12;

export type AssistantTurn = {
  role: "user" | "assistant";
  content: string;
};

export type AskInput = {
  question: string;
  history: AssistantTurn[];
  audience: Audience;
  db: Database;
  access: AccessContext | null;
  caller: { name: string | null; roles: RoleKey[] };
  now?: Date;
  signal?: AbortSignal;
};

export type AskResult = {
  answer: string;
  // Which tools ran, in order, so the panel can show its working.
  consulted: string[];
  model: string;
  tokensUsed: number;
};

// One question, answered.
export async function ask(input: AskInput): Promise<AskResult> {
  const now = input.now ?? new Date();
  const ctx: ToolContext = { db: input.db, access: input.access, now };

  const tools = availableTools(input.audience, ctx);
  const schemas = toolSchemas(tools);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemPrompt(
        input.audience,
        { ...input.caller, toolNames: tools.map(tool => tool.name) },
        now,
      ),
    },
    ...input.history.slice(-MAX_HISTORY_TURNS).map(turn => ({
      role: turn.role,
      content: turn.content,
    })),
    { role: "user", content: input.question },
  ];

  const consulted: string[] = [];
  let tokensUsed = 0;
  let model = "";

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    // On the last round the tools are withheld.
    const exhausted = round === MAX_TOOL_ROUNDS;

    const result = await chatCompletion({
      messages,
      tools: exhausted || !schemas.length ? undefined : schemas,
      signal: input.signal,
      // Deliberately low.
      temperature: 0.2,
    });

    tokensUsed += result.usage.totalTokens;
    model = result.model;

    if (!result.toolCalls.length) {
      return {
        answer: result.content.trim() || fallbackAnswer(consulted),
        consulted,
        model,
        tokensUsed,
      };
    }

    messages.push({
      role: "assistant",
      content: result.content ?? "",
      tool_calls: result.toolCalls,
    });

    // Independent lookups, so they go together rather than one after another.
    const outcomes = await Promise.all(
      result.toolCalls.map(call =>
        runTool(call.function.name, parseToolArguments(call.function.arguments), tools, ctx),
      ),
    );

    outcomes.forEach((outcome, index) => {
      if (outcome.ok) consulted.push(outcome.name);
      messages.push({
        role: "tool",
        tool_call_id: result.toolCalls[index]!.id,
        name: outcome.name,
        content: outcome.output,
      });
    });
  }

  return { answer: fallbackAnswer(consulted), consulted, model, tokensUsed };
}

function fallbackAnswer(consulted: string[]): string {
  return consulted.length
    ? "I looked that up but could not put together a clear answer. Try asking for one thing at a time."
    : "I could not work out an answer to that. Try rephrasing it, or ask about something more specific.";
}

export { AiError };
