import { describe, expect, it } from "vitest";
import { notificationDestination } from "./notificationDestination";

// Notifications are addressed to whoever an event concerns, not to whoever is reading them.

const row = (overrides: Partial<Parameters<typeof notificationDestination>[0]> = {}) => ({
  type: "general",
  entityType: null,
  entityId: null,
  link: null,
  ...overrides,
});

describe("notificationDestination", () => {
  it("keeps a link that names a section this dashboard serves", () => {
    expect(notificationDestination(row({ link: "/finance/expenses" }))).toBe(
      "/finance/expenses",
    );
  });

  it("keeps the query string on a link that filters a page", () => {
    expect(notificationDestination(row({ link: "/inventory?filter=low" }))).toBe(
      "/inventory?filter=low",
    );
  });

  it("sends a portal link to the back-office screen for the same record", () => {
    expect(
      notificationDestination(
        row({ link: "/portal", entityType: "application", entityId: 42 }),
      ),
    ).toBe("/admissions");
  });

  it("opens the order behind a store link rather than the storefront", () => {
    expect(
      notificationDestination(
        row({ link: "/store", entityType: "storeOrder", entityId: 7 }),
      ),
    ).toBe("/orders/7");
  });

  it("falls back to the list when a store notification names no order", () => {
    expect(
      notificationDestination(row({ link: "/store", entityType: "storeOrder" })),
    ).toBe("/orders");
  });

  it("uses the notification type when there is no entity to point at", () => {
    expect(notificationDestination(row({ link: "/portal", type: "payment_received" })))
      .toBe("/finance/payments");
  });

  it("navigates nowhere when nothing here shows the record", () => {
    expect(notificationDestination(row({ link: "/portal" }))).toBeNull();
    expect(notificationDestination(row())).toBeNull();
  });

  it("ignores an absolute URL rather than treating its host as a section", () => {
    expect(
      notificationDestination(
        row({ link: "https://example.com/orders", entityType: "expense" }),
      ),
    ).toBe("/finance/expenses");
  });
});
