import { z } from "zod";
import type { ToolSchema } from "@blush/ai";
import type { AssistantTool, ToolContext, ToolResult } from "./types";
import { academicTools, admissionTools, studentTools } from "./tools/school";
import { financeTools } from "./tools/money";
import { commerceTools, inventoryTools, peopleTools } from "./tools/operations";
import { overviewTools } from "./tools/overview";
import { publicTools } from "./tools/publicSite";

/** Which surface the assistant is answering on. */
export type Audience = "staff" | "public";

const STAFF_TOOLS: AssistantTool<never>[] = [
  ...overviewTools,
  ...studentTools,
  ...academicTools,
  ...admissionTools,
  ...financeTools,
  ...inventoryTools,
  ...commerceTools,
  ...peopleTools,
] as AssistantTool<never>[];

const PUBLIC_TOOLS = publicTools as unknown as AssistantTool<never>[];

/**
 * A tool result over this many characters is truncated before it reaches the
 * model. A single query cannot then crowd the conversation out of the context
 * window, and the limits on each tool keep every honest answer well inside it.
 */
const MAX_RESULT_CHARS = 12_000;

/**
 * The tools this caller may actually use.
 *
 * Permission filtering happens here rather than in the prompt, so a model that
 * hallucinates a tool name gets an error instead of an answer: what the
 * assistant can see is exactly what the person asking can see.
 */
export function availableTools(audience: Audience, ctx: ToolContext): AssistantTool<never>[] {
  if (audience === "public") return PUBLIC_TOOLS;

  const access = ctx.access;
  if (!access) return [];

  return STAFF_TOOLS.filter(
    tool => tool.permissions.length === 0 || access.canAny(...tool.permissions),
  );
}

/**
 * Keys that describe a bound rather than a choice.
 *
 * The catalogue is resent in full on every turn, so its size is paid for
 * repeatedly - and on a metered plan that is the difference between answering
 * and being throttled. These tell the model nothing it needs: `zod` validates
 * the same bounds when the call comes back, and clamping an over-large limit
 * is better handled there than explained here.
 */
const UNINFORMATIVE_KEYS = ["default", "minimum", "maximum", "minLength", "maxLength", "exclusiveMinimum", "exclusiveMaximum"];

/** Renders the catalogue in the shape the model expects, as tersely as it can. */
export function toolSchemas(tools: AssistantTool<never>[]): ToolSchema[] {
  return tools.map(tool => {
    const schema = z.toJSONSchema(tool.input, { io: "input" }) as Record<string, unknown>;

    const properties = Object.fromEntries(
      Object.entries((schema.properties as Record<string, Record<string, unknown>>) ?? {}).map(
        ([name, definition]) => [name, trim(definition)],
      ),
    );

    return {
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object" as const,
          properties,
          required: (schema.required as string[]) ?? [],
          additionalProperties: false,
        },
      },
    };
  });
}

function trim(definition: Record<string, unknown>): Record<string, unknown> {
  const trimmed = { ...definition };
  for (const key of UNINFORMATIVE_KEYS) delete trimmed[key];
  return trimmed;
}

/**
 * Runs one tool call and returns what should be shown to the model.
 *
 * Every failure comes back as an ordinary result rather than an exception: a
 * bad argument or an unknown name is something the model can correct on its
 * next turn, and killing the whole conversation over it would leave the person
 * asking with nothing.
 */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  tools: AssistantTool<never>[],
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = tools.find(candidate => candidate.name === name);

  if (!tool) {
    return {
      name,
      ok: false,
      output: JSON.stringify({
        error: `There is no tool called ${name}, or this account is not allowed to use it.`,
        availableTools: tools.map(candidate => candidate.name),
      }),
    };
  }

  // Checked again at the point of use. The list was filtered already, but this
  // is the line that actually holds if that filtering is ever changed.
  if (tool.permissions.length && !ctx.access?.canAny(...tool.permissions)) {
    return {
      name,
      ok: false,
      output: JSON.stringify({ error: "This account does not have permission to read that." }),
    };
  }

  const parsed = tool.input.safeParse(args);
  if (!parsed.success) {
    return {
      name,
      ok: false,
      output: JSON.stringify({
        error: "Those arguments are not valid for this tool.",
        problems: parsed.error.issues.map(issue => ({
          field: issue.path.join(".") || "(root)",
          message: issue.message,
        })),
      }),
    };
  }

  try {
    const result = await tool.run(parsed.data as never, ctx);
    return { name, ok: true, output: truncate(JSON.stringify(result ?? null)) };
  } catch (error) {
    console.error(`[Assistant] Tool ${name} failed:`, error);
    return {
      name,
      ok: false,
      output: JSON.stringify({
        error: "That lookup failed. Say so plainly rather than guessing at the answer.",
      }),
    };
  }
}

function truncate(payload: string): string {
  if (payload.length <= MAX_RESULT_CHARS) return payload;
  return `${payload.slice(0, MAX_RESULT_CHARS)}\n\n[truncated - narrow the question or ask for fewer rows]`;
}

export { STAFF_TOOLS, PUBLIC_TOOLS };
