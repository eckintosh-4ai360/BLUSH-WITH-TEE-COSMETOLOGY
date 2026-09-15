import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOOKING_RULES,
  bookingTimeProblem,
  clientMessageFor,
  describeAppointmentTime,
  describeOpeningHours,
  toBookingRules,
} from "./appointments";

describe("clientMessageFor", () => {
  it("tells the client when a booking is confirmed or cancelled", () => {
    expect(clientMessageFor("requested", "confirmed")).toBe("appointment_confirmed");
    expect(clientMessageFor("requested", "cancelled")).toBe("appointment_cancelled");
    expect(clientMessageFor("confirmed", "cancelled")).toBe("appointment_cancelled");
    // Reopening a cancelled booking is a confirmation from the client's point of view.
    expect(clientMessageFor("cancelled", "confirmed")).toBe("appointment_confirmed");
  });

  it("keeps the desk's own bookkeeping quiet", () => {
    expect(clientMessageFor("confirmed", "completed")).toBeNull();
    expect(clientMessageFor("confirmed", "no_show")).toBeNull();
    expect(clientMessageFor("completed", "requested")).toBeNull();
  });

  it("sends nothing when the status has not changed", () => {
    expect(clientMessageFor("confirmed", "confirmed")).toBeNull();
    expect(clientMessageFor("cancelled", "cancelled")).toBeNull();
  });
});

describe("describeAppointmentTime", () => {
  it("reads in Ghana time whatever timezone the server runs in", () => {
    // 14:30 UTC is 14:30 in Accra, which keeps GMT all year.
    const text = describeAppointmentTime(new Date("2026-09-15T14:30:00Z"));
    expect(text).toMatch(/15/);
    expect(text).toMatch(/Sep/);
    expect(text).toMatch(/2:30/);
    expect(text.toLowerCase()).toMatch(/pm/);
  });
});

describe("bookingTimeProblem", () => {
  // Tuesday 15 September 2026, 9 AM in Accra (GMT all year).
  const now = new Date("2026-09-15T09:00:00Z");
  const rules = DEFAULT_BOOKING_RULES;
  const check = (startsAt: string, durationMinutes = 60) =>
    bookingTimeProblem(rules, { startsAt: new Date(startsAt), durationMinutes, now });

  it("takes a booking inside opening hours", () => {
    expect(check("2026-09-16T10:00:00Z")).toBeNull();
    // Finishing exactly at closing is fine.
    expect(check("2026-09-16T16:00:00Z")).toBeNull();
  });

  it("refuses times that have passed or are too soon", () => {
    expect(check("2026-09-14T10:00:00Z")).toMatch(/already passed/);
    expect(check("2026-09-15T09:30:00Z")).toMatch(/at least 1 hour ahead/);
  });

  it("refuses dates too far ahead", () => {
    expect(check("2027-01-05T10:00:00Z")).toMatch(/90 days ahead/);
  });

  it("refuses closed days and hours", () => {
    expect(check("2026-09-20T10:00:00Z")).toMatch(/Sundays/);
    expect(check("2026-09-16T07:30:00Z")).toMatch(/opening hours/);
    expect(check("2026-09-16T17:00:00Z")).toMatch(/opening hours/);
  });

  it("refuses a service that would run past closing", () => {
    expect(check("2026-09-16T16:30:00Z", 90)).toMatch(/past closing at 5:00 PM/);
  });

  it("reads the clock in Ghana time", () => {
    // 23:30 UTC on Saturday is still Saturday night in Accra, not Sunday.
    expect(check("2026-09-19T23:30:00Z")).toMatch(/opening hours/);
  });
});

describe("toBookingRules", () => {
  it("falls back to the defaults for anything missing or unusable", () => {
    expect(toBookingRules(null)).toEqual(DEFAULT_BOOKING_RULES);
    expect(
      toBookingRules({ openDays: [5, 1, 9, 1], opensAt: "18:00", closesAt: "09:00", bookingsPerSlot: 0 }),
    ).toEqual({ ...DEFAULT_BOOKING_RULES, openDays: [1, 5] });
  });
});

describe("describeOpeningHours", () => {
  it("says the hours the way a client reads them", () => {
    expect(describeOpeningHours(DEFAULT_BOOKING_RULES)).toBe("Monday to Saturday, 8:00 AM to 5:00 PM");
    expect(
      describeOpeningHours({ ...DEFAULT_BOOKING_RULES, openDays: [2, 4], opensAt: "09:30", closesAt: "13:00" }),
    ).toBe("Tuesday and Thursday, 9:30 AM to 1:00 PM");
    expect(describeOpeningHours({ ...DEFAULT_BOOKING_RULES, openDays: [] })).toMatch(/closed/);
  });
});
