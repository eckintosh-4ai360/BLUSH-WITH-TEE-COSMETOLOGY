"use client";

import { Fragment, useMemo } from "react";
import { parseMarkdown, parseMarkdownInline } from "@blush/shared/markdown";

// Renders the small slice of markdown the assistant actually produces.
export function AssistantMarkdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((block, index) => {
        // The assistant has no pictures to show; a stray image line is left out.
        if (block.kind === "image") return null;

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

// Bold, inline code and links, which is as far as the inline grammar goes.
function Inline({ text }: { text: string }) {
  const parts = useMemo(() => parseMarkdownInline(text), [text]);

  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "bold") {
          return (
            <strong key={index} className="font-semibold">
              {part.text}
            </strong>
          );
        }
        if (part.kind === "code") {
          return (
            <code key={index} className="rounded bg-black/8 px-1 py-0.5 text-[0.9em] dark:bg-white/12">
              {part.text}
            </code>
          );
        }
        if (part.kind === "link" && part.href.startsWith("/")) {
          return (
            <a key={index} href={part.href} className="font-medium underline underline-offset-2">
              {part.text}
            </a>
          );
        }
        return <Fragment key={index}>{part.text}</Fragment>;
      })}
    </>
  );
}
