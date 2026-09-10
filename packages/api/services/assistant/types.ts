import type { z } from "zod";
import type { ToolSchema } from "@blush/ai";
import type { PermissionKey } from "@blush/shared/permissions";
import type { Database } from "../../dbOrThrow";
import type { AccessContext } from "../access";

// What a tool is handed when it runs.
export type ToolContext = {
  db: Database;
  // The caller's permissions, or null on the public website where nobody is signed in.
  access: AccessContext | null;
  // Resolves "this month", "today" and friends against one fixed instant.
  now: Date;
};

// One thing the assistant can find out.
export type AssistantTool<TInput = unknown> = {
  name: string;
  // Written for the model.
  description: string;
  input: z.ZodType<TInput>;
  // The caller needs at least one of these.
  permissions: PermissionKey[];
  run(args: TInput, ctx: ToolContext): Promise<unknown>;
};

// Builds a tool without losing the argument type on the way through.
export function defineTool<TInput>(tool: AssistantTool<TInput>): AssistantTool<TInput> {
  return tool;
}

export type ToolResult = {
  name: string;
  // JSON handed back to the model, already trimmed to a sane size.
  output: string;
  ok: boolean;
};

export type { ToolSchema };
