import { eq } from "drizzle-orm";
import { appointments, clinicServices, systemSettings } from "@blush/db/schema";
import type { Database, DbExecutor } from "../dbOrThrow";
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

// When the website takes bookings. Staff booking at the desk are not held to these rules.
export type BookingRules = {
  // 0 is Sunday, 6 is Saturday.
  openDays: number[];
  // "HH:MM", Ghana time.
  opensAt: string;
  closesAt: string;
  // How far ahead of the appointment a booking must arrive.
  minNoticeMinutes: number;
  maxDaysAhead: number;
  // Overlapping website bookings allowed for one service before a time counts as taken.
  bookingsPerSlot: number;
};

export const BOOKING_RULES_KEY = "appointments.schedule";

// Monday to Saturday, 8 AM to 5 PM: the school's published hours.
export const DEFAULT_BOOKING_RULES: BookingRules = {
  openDays: [1, 2, 3, 4, 5, 6],
  opensAt: "08:00",
  closesAt: "17:00",
  minNoticeMinutes: 60,
  maxDaysAhead: 90,
  bookingsPerSlot: 1,
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function minutesOfDay(time: string): number | null {
  const match = TIME.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function wholeNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

// Reads stored rules, falling back field by field to the defaults for anything missing or unusable.
export function toBookingRules(stored: unknown): BookingRules {
  const record =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};

  const openDays = Array.isArray(record.openDays)
    ? Array.from(
        new Set(record.openDays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)),
      ).sort((a, b) => a - b)
    : DEFAULT_BOOKING_RULES.openDays;

  const opensAt = typeof record.opensAt === "string" && TIME.test(record.opensAt) ? record.opensAt : null;
  const closesAt = typeof record.closesAt === "string" && TIME.test(record.closesAt) ? record.closesAt : null;
  const hoursUsable = opensAt && closesAt && minutesOfDay(closesAt)! > minutesOfDay(opensAt)!;

  return {
    openDays,
    opensAt: hoursUsable ? opensAt : DEFAULT_BOOKING_RULES.opensAt,
    closesAt: hoursUsable ? closesAt : DEFAULT_BOOKING_RULES.closesAt,
    minNoticeMinutes: wholeNumber(record.minNoticeMinutes, 0, 7 * 24 * 60, DEFAULT_BOOKING_RULES.minNoticeMinutes),
    maxDaysAhead: wholeNumber(record.maxDaysAhead, 1, 365, DEFAULT_BOOKING_RULES.maxDaysAhead),
    bookingsPerSlot: wholeNumber(record.bookingsPerSlot, 1, 50, DEFAULT_BOOKING_RULES.bookingsPerSlot),
  };
}

export async function readBookingRules(db: DbExecutor): Promise<BookingRules> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, BOOKING_RULES_KEY))
    .limit(1);
  return toBookingRules(row?.value);
}

function clockLabel(time: string): string {
  const minutes = minutesOfDay(time) ?? 0;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

// "Monday to Saturday, 8:00 AM to 5:00 PM", as the booking page and its errors say it.
export function describeOpeningHours(rules: BookingRules): string {
  const days = [...rules.openDays].sort((a, b) => a - b);
  if (!days.length) return "Online booking is closed at the moment";

  const consecutive = days.every((day, index) => index === 0 || day === days[index - 1]! + 1);
  const dayText =
    days.length === 7
      ? "Every day"
      : consecutive && days.length > 2
        ? `${DAY_NAMES[days[0]!]} to ${DAY_NAMES[days[days.length - 1]!]}`
        : days.length === 1
          ? DAY_NAMES[days[0]!]!
          : `${days.slice(0, -1).map(day => DAY_NAMES[day]).join(", ")} and ${DAY_NAMES[days[days.length - 1]!]}`;

  return `${dayText}, ${clockLabel(rules.opensAt)} to ${clockLabel(rules.closesAt)}`;
}

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Accra",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The weekday and minute of the day in Ghana time.
function ghanaClock(date: Date): { day: number; minutes: number } {
  const parts = CLOCK.formatToParts(date);
  const part = (type: string) => parts.find(entry => entry.type === type)?.value ?? "";
  return {
    day: SHORT_DAYS.indexOf(part("weekday")),
    minutes: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

// Why the website cannot take a booking at this time, or null when it can.
export function bookingTimeProblem(
  rules: BookingRules,
  input: { startsAt: Date; durationMinutes: number; now: Date },
): string | null {
  const { startsAt, durationMinutes, now } = input;
  if (Number.isNaN(startsAt.getTime())) return "Choose a date and time for your appointment.";

  const earliest = now.getTime() + rules.minNoticeMinutes * 60_000;
  if (startsAt.getTime() < earliest) {
    if (startsAt.getTime() < now.getTime()) return "That time has already passed. Please choose a later time.";
    const hours = rules.minNoticeMinutes / 60;
    const notice = Number.isInteger(hours)
      ? `${hours} hour${hours === 1 ? "" : "s"}`
      : `${rules.minNoticeMinutes} minutes`;
    return `Please book at least ${notice} ahead.`;
  }

  if (startsAt.getTime() > now.getTime() + rules.maxDaysAhead * 24 * 60 * 60_000) {
    return `Bookings open up to ${rules.maxDaysAhead} days ahead. Please choose an earlier date.`;
  }

  const hours = describeOpeningHours(rules);
  const { day, minutes } = ghanaClock(startsAt);
  if (!rules.openDays.includes(day)) {
    return `The salon does not take bookings on ${DAY_NAMES[day]}s. We are open ${hours.charAt(0).toLowerCase()}${hours.slice(1)}.`;
  }

  const opens = minutesOfDay(rules.opensAt)!;
  const closes = minutesOfDay(rules.closesAt)!;
  if (minutes < opens || minutes >= closes) {
    return `Please choose a time within opening hours: ${hours}.`;
  }
  if (minutes + durationMinutes > closes) {
    return `This service takes ${durationMinutes} minutes and would run past closing at ${clockLabel(rules.closesAt)}. Please choose an earlier time.`;
  }

  return null;
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
