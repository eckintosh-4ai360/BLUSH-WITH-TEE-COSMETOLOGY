import { eq } from "drizzle-orm";
import { appointments, clinicServices } from "@blush/db/schema";
import type { Database } from "../dbOrThrow";
import { announce } from "./messaging/announce";
import { flushInBackground } from "./messaging/dispatch";
import { notify, recipientsWithPermission } from "./notify";

export const APPOINTMENT_STATUSES = [
  "requested",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

// The school keeps Ghana time, so a text reads the same as the desk calendar whatever
// timezone the server runs in.
const WHEN = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Accra",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function describeAppointmentTime(startsAt: Date): string {
  return WHEN.format(startsAt);
}

// The status changes a client is told about. Completed and no-show are the desk's own record.
export function clientMessageFor(
  from: AppointmentStatus,
  to: AppointmentStatus,
): "appointment_confirmed" | "appointment_cancelled" | null {
  if (from === to) return null;
  if (to === "confirmed") return "appointment_confirmed";
  if (to === "cancelled") return "appointment_cancelled";
  return null;
}

async function loadAppointment(db: Database, appointmentId: number) {
  const [row] = await db
    .select({ appointment: appointments, serviceName: clinicServices.name })
    .from(appointments)
    .innerJoin(clinicServices, eq(appointments.serviceId, clinicServices.id))
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  return row ?? null;
}

// Tells the client about their booking, on the channels the school has switched on.
export async function messageClient(
  db: Database,
  appointmentId: number,
  type: "appointment_requested" | "appointment_confirmed" | "appointment_cancelled",
): Promise<void> {
  const row = await loadAppointment(db, appointmentId);
  if (!row) return;

  const { appointment, serviceName } = row;
  const when = describeAppointmentTime(appointment.startsAt);

  await announce(db, {
    type,
    recipient: {
      name: appointment.customerName,
      email: appointment.customerEmail,
      phone: appointment.customerPhone,
    },
    title:
      type === "appointment_confirmed"
        ? "Your appointment is confirmed"
        : type === "appointment_cancelled"
          ? "Your appointment has been cancelled"
          : "We have your booking request",
    facts: {
      service: serviceName,
      when,
      reference: appointment.reference,
      location:
        appointment.location === "home"
          ? `Home service at ${appointment.locationDetails ?? "the address you gave"}.`
          : "At the salon.",
    },
    entityType: "appointment",
    entityId: appointment.id,
  });
  flushInBackground(db);
}

// Puts a new website booking in front of the people who handle bookings.
export async function alertStaffToBooking(db: Database, appointmentId: number): Promise<void> {
  const row = await loadAppointment(db, appointmentId);
  if (!row) return;

  const { appointment, serviceName } = row;
  await notify(db, {
    userIds: await recipientsWithPermission(db, "appointments.read"),
    type: "appointment_requested",
    title: `New booking request: ${serviceName}`,
    body: `${appointment.customerName} · ${describeAppointmentTime(appointment.startsAt)} · ${
      appointment.location === "home" ? "Home service" : "Salon"
    }`,
    entityType: "appointment",
    entityId: appointment.id,
    link: "/appointments",
    inAppOnly: true,
  });
}
