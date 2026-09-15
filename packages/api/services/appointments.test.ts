import { describe, expect, it } from "vitest";
import { clientMessageFor, describeAppointmentTime } from "./appointments";

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
