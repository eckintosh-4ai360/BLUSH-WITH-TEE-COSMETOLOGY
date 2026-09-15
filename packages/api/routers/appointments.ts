import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { clinicServices, appointments } from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { buildReference } from "../platform.utils";
import { alertStaffToBooking, messageClient } from "../services/appointments";
import { bestEffort } from "../services/notify";
import { router, throttledPublicProcedure } from "../trpc";

const bookLimit = throttledPublicProcedure({
  bucket: "appointments.book",
  limit: 10,
  windowMs: 60 * 60_000,
});

export const appointmentsRouter = router({
  book: bookLimit
    .input(
      z
        .object({
          serviceId: z.number().int().positive(),
          customerName: z.string().min(2).max(160),
          customerPhone: z.string().min(7).max(40),
          startsAt: z.coerce.date(),
          location: z.enum(["salon", "home"]).default("salon"),
          locationDetails: z.string().max(500).optional(),
          note: z.string().max(1200).optional(),
        })
        .superRefine((input, ctx) => {
          if (input.location === "home" && !input.locationDetails?.trim()) {
            ctx.addIssue({
              code: "custom",
              path: ["locationDetails"],
              message: "A home-service address is required.",
            });
          }
        })
    )
    .mutation(async ({ input }) => {
      const db = await dbOrThrow();
      const [service] = await db
        .select()
        .from(clinicServices)
        .where(
          and(
            eq(clinicServices.id, input.serviceId),
            eq(clinicServices.isActive, true),
            eq(clinicServices.isBookable, true)
          )
        )
        .limit(1);
      if (!service)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clinic service is unavailable.",
        });
      const reference = buildReference("CLN");
      const [created] = await db
        .insert(appointments)
        .values({ ...input, reference, status: "requested" })
        .returning({ id: appointments.id });

      if (created) {
        await bestEffort("booking alert", () => alertStaffToBooking(db, created.id));
        await bestEffort("booking acknowledgement", () =>
          messageClient(db, created.id, "appointment_requested"),
        );
      }

      return { reference, status: "requested" as const };
    }),
});
