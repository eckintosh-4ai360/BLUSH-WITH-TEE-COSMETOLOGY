"use client";

import { Fragment, useMemo } from "react";

/**
 * Renders the small slice of markdown the assistant actually produces:
 * paragraphs, bullet and numbered lists, tables, and inline bold and code.
 *
 * A markdown library would be a heavier dependency than the job needs, and
 * this one is deliberately narrow - anything it does not recognise is shown
 * as the plain text it is, which is the right failure for a chat reply.
 */
export function AssistantMarkdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((block, index) => {
        if (block.kind === "table") {
          return (
            <div key={index} className="-mx-1 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    {block.head.map((cell, cellIndex) => (
                      <th
                        key={cellIndex}
                        className="border-b border-border/70 px-2 py-1.5 text-left font-semibold"
                      >
                        <Inline text={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-border/40 last:border-0">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-2 py-1.5 align-top">
                          <Inline text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.kind === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={index}
              className={`ml-4 space-y-1 ${block.ordered ? "list-decimal" : "list-disc"}`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="pl-0.5">
                  <Inline text={item} />
                </li>
              ))}
            </ListTag>
          );
        }

        if (block.kind === "heading") {
          return (
            <p key={index} className="pt-1 text-xs font-semibold uppercase tracking-wide opacity-70">
              <Inline text={block.text} />
            </p>
          );
        }

        return (
          <p key={index} className="whitespace-pre-wrap">
            <Inline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}

/** Bold and inline code, which is as far as the inline grammar goes. */
function Inline({ text }: { text: string }) {
  const parts = useMemo(() => text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean), [text]);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={index} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code key={index} className="rounded bg-black/8 px-1 py-0.5 text-[0.9em] dark:bg-white/12">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] };

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (!paragraph.length) return;
    blocks.push({ kind: "paragraph", text: paragraph.join("\n").trim() });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      flush();
      continue;
    }

    // A table is a pipe row followed by a divider row of dashes.
    if (trimmed.startsWith("|") && isDivider(lines[index + 1])) {
      flush();
      const head = splitRow(trimmed);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
        rows.push(splitRow((lines[index] ?? "").trim()));
        index++;
      }
      index--;
      blocks.push({ kind: "table", head, rows });
      continue;
    }

    const heading = /^#{1,6}\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", text: heading[1] ?? "" });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);

    if (bullet || numbered) {
      flush();
      const ordered = Boolean(numbered);
      const items: string[] = [(bullet ?? numbered)?.[1] ?? ""];

      while (index + 1 < lines.length) {
        const next = (lines[index + 1] ?? "").trim();
        const nextItem = ordered ? /^\d+[.)]\s+(.*)$/.exec(next) : /^[-*]\s+(.*)$/.exec(next);
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

function isDivider(line: string | undefined): boolean {
  const trimmed = line?.trim() ?? "";
  return trimmed.startsWith("|") && /^\|[\s:|-]+\|?$/.test(trimmed) && trimmed.includes("-");
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(cell => cell.trim());
}
