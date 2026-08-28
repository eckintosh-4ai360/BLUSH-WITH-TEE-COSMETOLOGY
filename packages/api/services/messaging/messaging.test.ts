import { describe, expect, it } from "vitest";
import { keepSecret, SECRET_MASK } from "./config";
import { render } from "./dispatch";
import { normaliseMsisdn, smsSegments } from "./sms";

describe("phone numbers for mNotify", () => {
  it("turns the ways a Ghanaian number gets written into one international form", () => {
    // The register holds all of these, and they are the same phone.
    expect(normaliseMsisdn("0241234567")).toBe("233241234567");
    expect(normaliseMsisdn("024 123 4567")).toBe("233241234567");
    expect(normaliseMsisdn("+233 24 123 4567")).toBe("233241234567");
    expect(normaliseMsisdn("233241234567")).toBe("233241234567");
    expect(normaliseMsisdn("00233241234567")).toBe("233241234567");
    expect(normaliseMsisdn("241234567")).toBe("233241234567");
    expect(normaliseMsisdn("(024) 123-4567")).toBe("233241234567");
  });

  it("refuses what cannot be dialled, so a bad record is skipped rather than sent", () => {
    expect(normaliseMsisdn("")).toBeNull();
    expect(normaliseMsisdn(null)).toBeNull();
    expect(normaliseMsisdn(undefined)).toBeNull();
    expect(normaliseMsisdn("n/a")).toBeNull();
    expect(normaliseMsisdn("12345")).toBeNull();
    expect(normaliseMsisdn("1234567890123456789")).toBeNull();
  });

  it("leaves a number that is already international alone", () => {
    // A +44 number must not be mangled into a Ghanaian one.
    expect(normaliseMsisdn("+447700900123")).toBe("447700900123");
  });

  it("counts what a message will actually cost to send", () => {
    expect(smsSegments("short")).toBe(1);
    expect(smsSegments("x".repeat(160))).toBe(1);
    expect(smsSegments("x".repeat(161))).toBe(2);
    expect(smsSegments("")).toBe(1);
  });
});

describe("message templates", () => {
  const facts = {
    school: "Blush With Tee",
    name: "Ama",
    course: "Professional Cosmetology",
    reference: "APP-4F2K9C",
  };

  it("fills the placeholders a template asks for", () => {
    expect(render("Hi {{name}}, welcome to {{school}}.", facts)).toBe(
      "Hi Ama, welcome to Blush With Tee.",
    );
    expect(render("{{ name }} and {{  school  }}", facts)).toBe("Ama and Blush With Tee");
  });

  it("drops a placeholder the event does not carry rather than showing braces", () => {
    // Every event shares the template set, so most carry only some of the
    // facts. A student must never receive a message containing "{{balance}}".
    expect(render("Paid. {{balance}}", facts)).toBe("Paid.");
    expect(render("Hi {{name}}.{{missing}}", facts)).toBe("Hi Ama.");
  });

  it("closes the gap an absent optional line leaves behind", () => {
    const template = "Hello {{name}},\n\n{{note}}\n\nThanks.";
    expect(render(template, facts)).toBe("Hello Ama,\n\nThanks.");
    expect(render(template, { ...facts, note: "Send your certificate." })).toBe(
      "Hello Ama,\n\nSend your certificate.\n\nThanks.",
    );
  });

  it("treats an explicit null the same as a missing fact", () => {
    expect(render("Balance: {{balance}}", { ...facts, balance: null })).toBe("Balance:");
    expect(render("Balance: {{balance}}", { ...facts, balance: undefined })).toBe("Balance:");
  });

  it("renders numbers", () => {
    expect(render("You owe {{amount}}", { amount: 0 })).toBe("You owe 0");
  });
});

describe("secret handling", () => {
  it("keeps the stored secret when the form sends the mask back untouched", () => {
    // The settings page never holds the real value, so an untouched password
    // field returns exactly the mask it was rendered with. Writing that
    // through would replace a working credential with asterisks.
    expect(keepSecret(SECRET_MASK, "real-api-key")).toBe("real-api-key");
    expect(keepSecret(undefined, "real-api-key")).toBe("real-api-key");
  });

  it("takes a genuinely new secret", () => {
    expect(keepSecret("new-key", "old-key")).toBe("new-key");
  });

  it("allows a secret to be cleared deliberately", () => {
    expect(keepSecret("", "old-key")).toBe("");
  });
});
