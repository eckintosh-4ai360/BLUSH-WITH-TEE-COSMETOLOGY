import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { clinicServices, appointments } from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { buildReference } from "../platform.utils";
import { router, throttledPublicProcedure } from "../trpc";

const bookLimit = throttledPublicProcedure({ bucket: "appointments.book", limit: 10, windowMs: 60 * 60_000 });

export const appointmentsRouter = router({
  book: bookLimit.input(z.object({
    serviceId: z.number().int().positive(),
    customerName: z.string().min(2).max(160),
    customerEmail: z.string().email(),
    customerPhone: z.string().min(7).max(40),
    startsAt: z.coerce.date(),
    note: z.string().max(1200).optional(),
  })).mutation(async ({ input }) => {
    const db = await dbOrThrow();
    const [service] = await db.select().from(clinicServices).where(and(eq(clinicServices.id, input.serviceId), eq(clinicServices.isActive, true))).limit(1);
    if (!service) throw new TRPCError({ code: "NOT_FOUND", message: "Clinic service is unavailable." });
    const reference = buildReference("CLN");
    await db.insert(appointments).values({ ...input, reference, status: "requested" });
    return { reference, status: "requested" as const };
  }),
});
