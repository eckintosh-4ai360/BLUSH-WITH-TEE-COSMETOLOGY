import { describe, expect, it } from "vitest";
import { formatPhone, telHref, websiteHref, whatsappHref } from "@blush/shared/contact";

// The website shows the numbers the school keeps in Settings, however they were typed.
describe("contact formatting", () => {
  it("writes a Ghanaian number the local way", () => {
    expect(formatPhone("0545563536")).toBe("054 556 3536");
    expect(formatPhone("+233 54 556 3536")).toBe("054 556 3536");
    expect(formatPhone("233545563536")).toBe("054 556 3536");
  });

  it("leaves a number it does not recognise as typed", () => {
    expect(formatPhone(" +44 20 7946 0958 ")).toBe("+44 20 7946 0958");
  });

  it("dials and chats on the international number", () => {
    expect(telHref("054 556 3536")).toBe("tel:+233545563536");
    expect(whatsappHref("0545563536")).toBe("https://wa.me/233545563536");
    expect(whatsappHref("+44 20 7946 0958")).toBeNull();
    expect(telHref("+44 20 7946 0958")).toBe("tel:+442079460958");
  });

  it("adds the scheme a typed website is missing", () => {
    expect(websiteHref("blushwithtee.com")).toBe("https://blushwithtee.com/");
    expect(websiteHref("https://blushwithtee.com/about")).toBe("https://blushwithtee.com/about");
    expect(websiteHref("")).toBeNull();
  });
});
