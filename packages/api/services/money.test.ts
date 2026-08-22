import { describe, expect, it } from "vitest";
import { amountString, fromMinor, money, sumMinor, toAmountString, toMinor } from "./money";

describe("currency arithmetic", () => {
  it("converts database numerics and form numbers to whole pesewas", () => {
    expect(toMinor("1234.56")).toBe(123456);
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor(null)).toBe(0);
    expect(toMinor("")).toBe(0);
    expect(toMinor("not a number")).toBe(0);
  });

  it("adds money without the drift a float sum would introduce", () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; in minor units it is exact.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMinor(["0.10", "0.20"])).toBe(30);
    expect(fromMinor(sumMinor(["0.10", "0.20"]))).toBe(0.3);
  });

  it("keeps a long run of instalments exact", () => {
    const instalments = Array.from({ length: 100 }, () => "33.33");
    expect(sumMinor(instalments)).toBe(333300);
    expect(fromMinor(sumMinor(instalments))).toBe(3333);
  });

  it("formats to the fixed scale the numeric columns expect", () => {
    expect(toAmountString(123456)).toBe("1234.56");
    expect(toAmountString(5)).toBe("0.05");
    expect(amountString(19.999)).toBe("20.00");
    expect(amountString("7")).toBe("7.00");
  });

  it("parses decimal strings exactly, without going through a float", () => {
    // Number("0.07") * 100 is 7.000000000000001, so the string path parses
    // digits instead of multiplying.
    expect(toMinor("0.07")).toBe(7);
    expect(toMinor("1.005")).toBe(101);
    expect(toMinor("10.006")).toBe(1001);
    expect(toMinor("-45.50")).toBe(-4550);
    expect(toMinor("99999999.99")).toBe(9999999999);
  });

  it("rounds a third decimal place up on the string path", () => {
    expect(toMinor("2.344")).toBe(234);
    expect(toMinor("2.345")).toBe(235);
  });

  it("treats a missing or malformed value as zero rather than NaN", () => {
    expect(toMinor(undefined)).toBe(0);
    expect(toMinor("abc")).toBe(0);
    expect(money(null)).toBe(0);
  });
});
