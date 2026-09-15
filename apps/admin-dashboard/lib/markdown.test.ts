import { describe, expect, it } from "vitest";
import { parseMarkdown, parseMarkdownInline } from "@blush/shared/markdown";

describe("parseMarkdown", () => {
  it("reads the programme table the public assistant writes", () => {
    const answer = [
      "Here is an overview:",
      "",
      "| Programme / Course | Duration | Tuition (GHS) | Certification |",
      "|---|---|---|---|",
      "| **Basic Cosmetology Course** | 12 weeks | 5,000.00 | Basic Cosmetology Certificate |",
      "| **Bridal Hairstyling** (short course) | 2 weeks | 2,000.00 + 1,000.00 product |",
      "",
      "Apply at /apply.",
    ].join("\n");

    const blocks = parseMarkdown(answer);
    expect(blocks.map(block => block.kind)).toEqual(["paragraph", "table", "paragraph"]);

    const table = blocks[1];
    if (table?.kind !== "table") throw new Error("expected a table");
    expect(table.head).toEqual(["Programme / Course", "Duration", "Tuition (GHS)", "Certification"]);
    expect(table.rows[0]).toEqual([
      "**Basic Cosmetology Course**",
      "12 weeks",
      "5,000.00",
      "Basic Cosmetology Certificate",
    ]);
    // A short row is padded to the header's width.
    expect(table.rows[1]).toHaveLength(4);
    expect(table.rows[1]?.[3]).toBe("");
  });

  it("accepts dividers with alignment colons and spaces, and rows without outer pipes", () => {
    const blocks = parseMarkdown("Name | Price |\n| :--- | ---: |\n| Kit | 50 |");
    expect(blocks).toEqual([{ kind: "table", head: ["Name", "Price"], rows: [["Kit", "50"]] }]);
  });

  it("reads headings, bullet and numbered lists", () => {
    expect(parseMarkdown("### **Fees**\n- One\n* Two\n\n1. First\n2) Second")).toEqual([
      { kind: "heading", level: 3, text: "Fees" },
      { kind: "list", ordered: false, items: ["One", "Two"] },
      { kind: "list", ordered: true, items: ["First", "Second"] },
    ]);
  });

  it("reads a picture on its own line", () => {
    expect(parseMarkdown("Before\n\n![Braids at graduation](/api/storage/media/site/1.jpg)")).toEqual([
      { kind: "paragraph", text: "Before" },
      { kind: "image", alt: "Braids at graduation", src: "/api/storage/media/site/1.jpg" },
    ]);
  });

  it("does not mistake a bold line for a bullet", () => {
    expect(parseMarkdown("**Basic** course")).toEqual([
      { kind: "paragraph", text: "**Basic** course" },
    ]);
  });
});

describe("parseMarkdownInline", () => {
  it("splits bold, code and links, leaving unbalanced marks alone", () => {
    expect(parseMarkdownInline("**Bold** and `code`, see [apply](/apply), 5 * 2 **open")).toEqual([
      { kind: "bold", text: "Bold" },
      { kind: "text", text: " and " },
      { kind: "code", text: "code" },
      { kind: "text", text: ", see " },
      { kind: "link", text: "apply", href: "/apply" },
      { kind: "text", text: ", 5 * 2 **open" },
    ]);
  });
});
