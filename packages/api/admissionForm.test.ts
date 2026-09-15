import { describe, expect, it } from "vitest";
import { buildAdmissionFormHtml } from "@blush/shared/admission-form";

const application = (overrides: Record<string, unknown> = {}) =>
  ({
    reference: "APP-2026-ABC123",
    fullName: "Ama Mensah",
    phone: "0240000000",
    status: "submitted",
    createdAt: new Date("2026-09-01T10:00:00Z"),
    ...overrides,
  }) as never;

// The printable form is opened in a window that shares the page's origin, so anything an
// applicant typed must arrive as text.
describe("buildAdmissionFormHtml", () => {
  it("escapes what an applicant typed", () => {
    const html = buildAdmissionFormHtml(
      application({
        fullName: `<img src=x onerror="fetch('/api/trpc')">`,
        address: "<script>alert(1)</script>",
        decisionNote: "</div><script>steal()</script>",
      }),
      "Makeup <b>Artistry</b>",
      "https://example.test/logo.png",
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<script>steal()</script>");
    expect(html).not.toContain(`<img src=x`);
    expect(html).not.toContain("<b>Artistry</b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
