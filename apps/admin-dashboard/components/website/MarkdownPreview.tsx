"use client";

import { Fragment, useMemo } from "react";
import { parseMarkdown, parseMarkdownInline } from "@blush/shared/markdown";

// How a page or post will read on the website, in the dashboard's own colours.
export function MarkdownPreview({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);

  if (!blocks.length) {
    return <p className="text-sm text-muted-foreground">Nothing written yet.</p>;
  }

  return (
    <div className="space-y-3 text-sm leading-7">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading":
            return block.level <= 2 ? (
              <h2 key={index} className="pt-2 text-lg font-semibold">
                <Inline text={block.text} />
              </h2>
            ) : (
              <h3 key={index} className="pt-1 text-base font-semibold">
                <Inline text={block.text} />
              </h3>
            );
          case "image":
            return (
              <img
                key={index}
                src={block.src}
                alt={block.alt}
                className="max-h-72 rounded-lg border border-border/60 object-cover"
              />
            );
          case "list": {
            const ListTag = block.ordered ? "ol" : "ul";
            return (
              <ListTag key={index} className={`ml-5 space-y-1 ${block.ordered ? "list-decimal" : "list-disc"}`}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline text={item} />
                  </li>
                ))}
              </ListTag>
            );
          }
          case "table":
            return (
              <div key={index} className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      {block.head.map((cell, cellIndex) => (
                        <th key={cellIndex} className="border-b border-border px-2 py-1.5 text-left font-semibold">
                          <Inline text={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-border/50 last:border-0">
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
          default:
            return (
              <p key={index} className="whitespace-pre-wrap">
                <Inline text={block.text} />
              </p>
            );
        }
      })}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  const parts = useMemo(() => parseMarkdownInline(text), [text]);
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "bold") return <strong key={index}>{part.text}</strong>;
        if (part.kind === "code") {
          return (
            <code key={index} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
              {part.text}
            </code>
          );
        }
        if (part.kind === "link") {
          return (
            <span key={index} className="font-medium text-primary underline underline-offset-2" title={part.href}>
              {part.text}
            </span>
          );
        }
        return <Fragment key={index}>{part.text}</Fragment>;
      })}
    </>
  );
}
