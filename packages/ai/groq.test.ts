import { describe, expect, it } from "vitest";
import { parseDuration, parseToolArguments, retryAfterFrom } from "./groq";

describe("parseToolArguments", () => {
  it("reads a normal argument object", () => {
    expect(parseToolArguments('{"limit":5,"status":"active"}')).toEqual({
      limit: 5,
      status: "active",
    });
  });

  it("treats an empty or absent payload as no arguments", () => {
    expect(parseToolArguments("")).toEqual({});
    expect(parseToolArguments("   ")).toEqual({});
  });

  // What Groq actually sends for a tool that declares no parameters.
  it("unwraps arguments nested under an empty key", () => {
    expect(parseToolArguments('{"":{}}')).toEqual({});
    expect(parseToolArguments('{"":{"limit":3}}')).toEqual({ limit: 3 });
  });

  it("falls back to no arguments rather than throwing on malformed JSON", () => {
    expect(parseToolArguments("{not json")).toEqual({});
    expect(parseToolArguments("[1,2,3]")).toEqual({});
    expect(parseToolArguments("null")).toEqual({});
  });
});

describe("parseDuration", () => {
  it("reads the Go duration notation the reset headers use", () => {
    expect(parseDuration("25.672s")).toBe(25672);
    expect(parseDuration("1m30s")).toBe(90_000);
    expect(parseDuration("10m4.8s")).toBe(604_800);
    expect(parseDuration("500ms")).toBe(500);
    expect(parseDuration("2h")).toBe(7_200_000);
  });

  it("returns nothing for a value it cannot read", () => {
    expect(parseDuration(null)).toBeUndefined();
    expect(parseDuration("")).toBeUndefined();
    expect(parseDuration("soon")).toBeUndefined();
  });
});

describe("retryAfterFrom", () => {
  it("prefers an explicit retry-after, in seconds", () => {
    const headers = new Headers({ "retry-after": "12" });
    expect(retryAfterFrom(headers)).toBe(12_000);
  });

  // Falls back to soonest budget reset when retry-after is absent.
  it("falls back to the soonest budget reset", () => {
    const headers = new Headers({
      "x-ratelimit-reset-tokens": "25.672s",
      "x-ratelimit-reset-requests": "10m4.8s",
    });
    expect(retryAfterFrom(headers)).toBe(25_672);
  });

  it("returns nothing when the response says nothing about waiting", () => {
    expect(retryAfterFrom(new Headers())).toBeUndefined();
  });
});
