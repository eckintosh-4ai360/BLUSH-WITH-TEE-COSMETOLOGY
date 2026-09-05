import type { z } from "zod";
import type { ToolSchema } from "@blush/ai";
import type { PermissionKey } from "@blush/shared/permissions";
import type { Database } from "../../dbOrThrow";
import type { AccessContext } from "../access";

/** What a tool is handed when it runs. */
export type ToolContext = {
  db: Database;
  /**
   * The caller's permissions, or null on the public website where nobody is
   * signed in. Tools that read anything private require this to be present.
   */
  access: AccessContext | null;
  /** Resolves "this month", "today" and friends against one fixed instant. */
  now: Date;
};

/**
 * One thing the assistant can find out.
 *
 * A tool is a read. Nothing in this catalogue writes, cancels, refunds or
 * deletes: the assistant answers questions, and every action that changes the
 * school stays behind the screens that audit it. That is a deliberate limit,
 * not a gap - a model that misreads a question should cost a wrong sentence,
 * never a wrong payment.
 */
export type AssistantTool<TInput = unknown> = {
  name: string;
  /** Written for the model: when to reach for this, and what comes back. */
  description: string;
  input: z.ZodType<TInput>;
  /**
   * The caller needs at least one of these. An empty list means the tool is
   * safe for anyone who can see the surface it is mounted on - public site
   * content, say.
   */
  permissions: PermissionKey[];
  run(args: TInput, ctx: ToolContext): Promise<unknown>;
};

/** Builds a tool without losing the argument type on the way through. */
export function defineTool<TInput>(tool: AssistantTool<TInput>): AssistantTool<TInput> {
  return tool;
}

export type ToolResult = {
  name: string;
  /** JSON handed back to the model, already trimmed to a sane size. */
  output: string;
  ok: boolean;
};

export type { ToolSchema };
