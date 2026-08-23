import { z } from "zod";
import { dbOrThrow } from "../dbOrThrow";
import { notify, staffRecipients } from "../services/notify";
import { adminProcedure, publicProcedure, router } from "../trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(z.object({ timestamp: z.number().min(0, "timestamp cannot be negative") }))
    .query(() => ({ ok: true })),

  /**
   * Broadcasts a message to every administrator through the platform's own
   * notification centre. This used to post to an external service; it now
   * stays inside the system, where the recipient can act on it.
   */
  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required").max(180),
        content: z.string().min(1, "content is required").max(2000),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const recipients = await staffRecipients(db, ["admin"]);

      await notify(db, {
        userIds: recipients,
        type: "general",
        title: input.title,
        body: input.content,
      });

      return { success: true, recipients: recipients.length } as const;
    }),
});
