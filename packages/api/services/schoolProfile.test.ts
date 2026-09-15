import { describe, expect, it } from "vitest";
import { paymentInstructions } from "./orderAlerts";
import { toPublicSchoolProfile } from "./schoolProfile";

describe("toPublicSchoolProfile", () => {
  it("passes the contact details the website shows", () => {
    const profile = toPublicSchoolProfile(
      {
        name: "Blush With Tee",
        phone: " 0545563536 ",
        whatsapp: "0545563536",
        email: "hello@example.com",
        address: "Tarkwa, Ghana",
        registrationNumber: "REG-1",
      },
      { instagram: "https://www.instagram.com/blush_with_tee", tiktok: "" },
    );
    expect(profile.phone).toBe("0545563536");
    expect(profile.email).toBe("hello@example.com");
    expect(profile.social.instagram).toBe("https://www.instagram.com/blush_with_tee");
    expect(profile.social.tiktok).toBeNull();
    // Internal fields never reach the public site.
    expect(profile).not.toHaveProperty("registrationNumber");
  });

  it("drops a social link that is not a web address", () => {
    const profile = toPublicSchoolProfile(
      {},
      { instagram: "javascript:alert(1)", facebook: "not a url", youtube: "data:text/html,x" },
    );
    expect(profile.social).toEqual({
      instagram: null,
      facebook: null,
      tiktok: null,
      youtube: null,
    });
  });

  it("falls back sensibly when nothing has been saved", () => {
    const profile = toPublicSchoolProfile(undefined, null);
    expect(profile.name).toBe("Blush With Tee");
    expect(profile.phone).toBeNull();
    expect(profile.address).toBeNull();
  });
});

describe("paymentInstructions", () => {
  it("offers online payment only when it is available", () => {
    expect(paymentInstructions({ online: true, phone: "0545563536" })).toMatch(/pay online/i);
    expect(paymentInstructions({ online: false, phone: "0545563536" })).not.toMatch(/online/i);
  });

  it("always says how to pay at the school, with a number to call when there is one", () => {
    const text = paymentInstructions({ online: false, phone: "0545563536" });
    expect(text).toMatch(/cash or mobile money/);
    expect(text).toMatch(/0545563536/);
    expect(paymentInstructions({ online: false, phone: null })).not.toMatch(/call/i);
  });
});
