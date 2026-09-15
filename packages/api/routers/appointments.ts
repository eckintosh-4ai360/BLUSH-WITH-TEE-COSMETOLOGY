import { and, count, eq, gt, inArray, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { clinicServices, appointments } from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { buildReference } from "../platform.utils";
import {
  alertStaffToBooking,
  bookingTimeProblem,
  describeOpeningHours,
  messageClient,
  readBookingRules,
} from "../services/appointments";
import { bestEffort } from "../services/notify";
import { publicProcedure, router, throttledPublicProcedure } from "../trpc";

const bookLimit = throttledPublicProcedure({
  bucket: "appointments.book",
  limit: 10,
  windowMs: 60 * 60_000,
});

export const appointmentsRouter = router({
  // When the website takes bookings, so the booking form can say so before a client picks a time.
  rules: publicProcedure.query(async () => {
    const db = await dbOrThrow();
    const rules = await readBookingRules(db);
    return { ...rules, summary: describeOpeningHours(rules) };
  }),

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
      const reference = buildReference("CLN");

      const created = await db.transaction(async tx => {
        // Locking the service row queues two bookings for the same service, so both cannot
        // pass the clash check before either is written.
        const [service] = await tx
          .select()
          .from(clinicServices)
          .where(
            and(
              eq(clinicServices.id, input.serviceId),
              eq(clinicServices.isActive, true),
              eq(clinicServices.isBookable, true)
            )
          )
          .limit(1)
          .for("update");
        if (!service)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Clinic service is unavailable.",
          });

        const rules = await readBookingRules(tx);
        const problem = bookingTimeProblem(rules, {
          startsAt: input.startsAt,
          durationMinutes: service.durationMinutes,
          now: new Date(),
        });
        if (problem) throw new TRPCError({ code: "BAD_REQUEST", message: problem });

        const endsAt = new Date(input.startsAt.getTime() + service.durationMinutes * 60_000);
        const earliestOverlappingStart = new Date(
          input.startsAt.getTime() - service.durationMinutes * 60_000
        );
        const [taken] = await tx
          .select({ total: count() })
          .from(appointments)
          .where(
            and(
              eq(appointments.serviceId, service.id),
              inArray(appointments.status, ["requested", "confirmed"]),
              lt(appointments.startsAt, endsAt),
              gt(appointments.startsAt, earliestOverlappingStart)
            )
          );
        if ((taken?.total ?? 0) >= rules.bookingsPerSlot) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `That time is already booked for ${service.name}. Please choose another time.`,
          });
        }

        const [row] = await tx
          .insert(appointments)
          .values({ ...input, reference, status: "requested" })
          .returning({ id: appointments.id });
        return row;
      });

      if (created) {
        await bestEffort("booking alert", () => alertStaffToBooking(db, created.id));
        await bestEffort("booking acknowledgement", () =>
          messageClient(db, created.id, "appointment_requested"),
        );
      }

      return { reference, status: "requested" as const };
    }),
});
