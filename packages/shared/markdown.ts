// The small slice of markdown the assistant writes and staff use for website pages and blog
// posts: paragraphs, headings, lists, tables, images, bold, inline code and links. Each app
// parses with this and styles the result itself.

export type MarkdownBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "image"; alt: string; src: string };

export type MarkdownInline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

const BULLET = /^[-*•]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;

export function parseMarkdown(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (!paragraph.length) return;
    blocks.push({ kind: "paragraph", text: paragraph.join("\n").trim() });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index++) {
    const trimmed = (lines[index] ?? "").trim();

    if (!trimmed) {
      flush();
      continue;
    }

    // A table is a pipe row followed by a divider row of dashes.
    if (trimmed.includes("|") && isDivider(lines[index + 1])) {
      flush();
      const head = splitRow(trimmed);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && isRow(lines[index])) {
        const cells = splitRow((lines[index] ?? "").trim());
        // Rows the model wrote short are padded, so every row lines up with the header.
        rows.push(head.map((_, cellIndex) => cells[cellIndex] ?? ""));
        index++;
      }
      index--;
      blocks.push({ kind: "table", head, rows });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({
        kind: "heading",
        level: heading[1]?.length ?? 1,
        text: stripWrappingBold(heading[2] ?? ""),
      });
      continue;
    }

    // A picture on a line of its own.
    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(trimmed);
    if (image) {
      flush();
      blocks.push({ kind: "image", alt: image[1] ?? "", src: image[2] ?? "" });
      continue;
    }

    const bullet = BULLET.exec(trimmed);
    const numbered = NUMBERED.exec(trimmed);
    if (bullet || numbered) {
      flush();
      const ordered = Boolean(numbered);
      const items: string[] = [(bullet ?? numbered)?.[1] ?? ""];

      while (index + 1 < lines.length) {
        const next = (lines[index + 1] ?? "").trim();
        const nextItem = (ordered ? NUMBERED : BULLET).exec(next);
        if (!nextItem) break;
        items.push(nextItem[1] ?? "");
        index++;
      }

      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    paragraph.push(trimmed);
  }

  flush();
  return blocks;
}

// Bold, inline code and [text](link). Anything unbalanced stays as it was written.
export function parseMarkdownInline(text: string): MarkdownInline[] {
  return text
    .split(/(\*\*[^*\n]+?\*\*|__[^_\n]+?__|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g)
    .filter(Boolean)
    .map((part): MarkdownInline => {
      if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
        if (part.length > 4) return { kind: "bold", text: part.slice(2, -2) };
      }
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return { kind: "code", text: part.slice(1, -1) };
      }
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
      if (link) return { kind: "link", text: link[1] ?? "", href: link[2] ?? "" };
      return { kind: "text", text: part };
    });
}

function stripWrappingBold(text: string): string {
  const match = /^\*\*(.+)\*\*$/.exec(text.trim());
  return match ? (match[1] ?? "") : text;
}

function isRow(line: string | undefined): boolean {
  const trimmed = line?.trim() ?? "";
  return trimmed.startsWith("|") || (trimmed.includes("|") && trimmed.endsWith("|"));
}

function isDivider(line: string | undefined): boolean {
  const trimmed = line?.trim() ?? "";
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(trimmed);
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(cell => cell.trim());
}
