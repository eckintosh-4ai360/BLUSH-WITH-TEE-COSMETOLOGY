import { describe, expect, it } from "vitest";
import { dataUrlBytes, dataUrlMimeType, fitWithin, uploadErrorMessage } from "@blush/shared/image-upload";

describe("fitWithin", () => {
  it("leaves a photo that already fits alone", () => {
    expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800 });
    expect(fitWithin(2000, 2000)).toEqual({ width: 2000, height: 2000 });
  });

  it("scales the longest edge down and keeps the shape", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 6000)).toEqual({ width: 1000, height: 2000 });
  });
});

describe("dataUrlBytes", () => {
  it("measures the file behind a data URL", () => {
    const bytes = Buffer.from("hello world, this is a photo");
    expect(dataUrlBytes(`data:image/jpeg;base64,${bytes.toString("base64")}`)).toBe(bytes.length);
  });
});

describe("dataUrlMimeType", () => {
  it("reads the format the browser actually produced", () => {
    expect(dataUrlMimeType("data:image/png;base64,AAAA")).toBe("image/png");
    expect(dataUrlMimeType("data:image/jpeg;base64,AAAA")).toBe("image/jpeg");
  });
});

describe("uploadErrorMessage", () => {
  it("explains the host's refusal in place of a parser error", () => {
    expect(uploadErrorMessage(new Error(`Unexpected token 'R', "Request En"... is not valid JSON`))).toMatch(
      /too large/,
    );
  });

  it("passes a real message through", () => {
    expect(uploadErrorMessage(new Error("Only PDF, JPEG, PNG, and WEBP documents are accepted."))).toMatch(
      /Only PDF/,
    );
    expect(uploadErrorMessage(null)).toBe("The file could not be uploaded.");
  });
});
