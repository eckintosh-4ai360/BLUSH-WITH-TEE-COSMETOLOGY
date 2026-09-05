import { describe, expect, it } from "vitest";
import { parseToolArguments } from "./groq";

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
