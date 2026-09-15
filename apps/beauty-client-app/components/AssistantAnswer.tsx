"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import { parseMarkdown, parseMarkdownInline, type MarkdownBlock } from "@blush/shared/markdown";

const SITE_PATH = /(\/(?:programs|store|appointments|apply|contact|gallery|about)(?:\/[\w-]+)?)/g;
const IS_SITE_PATH = /^\/(programs|store|appointments|apply|contact|gallery|about)(\/|$)/;

// An assistant reply, formatted for the chat bubble.
export function AssistantAnswer({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);

  return (
    <div className="space-y-2.5">
      {blocks.map((block, index) => (
        <AnswerBlock key={index} block={block} />
      ))}
    </div>
  );
}

function AnswerBlock({ block }: { block: MarkdownBlock }) {
  // The assistant has no pictures to show; a stray image line is left out of the bubble.
  if (block.kind === "image") return null;

  if (block.kind === "heading") {
    return (
      <p className="pt-1 font-semibold text-[#8f0d6b]">
        <Inline text={block.text} />
      </p>
    );
  }

  if (block.kind === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag
        className={`ml-4 space-y-1 marker:text-[#fe00b6] ${block.ordered ? "list-decimal" : "list-disc"}`}
      >
        {block.items.map((item, index) => (
          <li key={index} className="pl-0.5">
            <Inline text={item} />
          </li>
        ))}
      </ListTag>
    );
  }

  if (block.kind === "table") {
    // Two columns fit the bubble as a table. Wider tables become one card per row, with the
    // first column as its title, because a phone-width bubble cannot show four columns.
    if (block.head.length <= 2) {
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {block.head.map((cell, index) => (
                  <th
                    key={index}
                    className="border-b border-[#8f0d6b]/15 px-2 py-1.5 text-left font-semibold text-[#8f0d6b]"
                  >
                    <Inline text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-[#8f0d6b]/8 last:border-0">
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

    return (
      <div className="space-y-2">
        {block.rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="rounded-xl border border-[#8f0d6b]/12 bg-[#fdf8fc] px-3 py-2"
          >
            <p className="font-semibold text-[#8f0d6b]">
              <Inline text={stripBold(row[0] ?? "")} />
            </p>
            <dl className="mt-1 space-y-0.5 text-xs">
              {row.slice(1).map((cell, cellIndex) =>
                cell ? (
                  <div key={cellIndex} className="flex flex-wrap gap-x-1.5">
                    <dt className="text-[#692156]/75">{stripBold(block.head[cellIndex + 1] ?? "")}:</dt>
                    <dd className="font-medium text-[#2d0423]">
                      <Inline text={cell} />
                    </dd>
                  </div>
                ) : null,
              )}
            </dl>
          </div>
        ))}
      </div>
    );
  }

  return (
    <p className="whitespace-pre-wrap">
      <Inline text={block.text} />
    </p>
  );
}

function Inline({ text }: { text: string }) {
  const parts = useMemo(() => parseMarkdownInline(text), [text]);

  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "bold") {
          return (
            <strong key={index} className="font-semibold">
              {withSiteLinks(part.text)}
            </strong>
          );
        }
        if (part.kind === "code") {
          return (
            <code key={index} className="rounded bg-[#8f0d6b]/8 px-1 py-0.5 text-[0.9em]">
              {part.text}
            </code>
          );
        }
        if (part.kind === "link") {
          if (part.href.startsWith("/")) {
            return (
              <Link key={index} href={part.href} className={LINK_CLASS}>
                {part.text}
              </Link>
            );
          }
          if (/^https?:\/\//.test(part.href)) {
            return (
              <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                {part.text}
              </a>
            );
          }
          return <Fragment key={index}>{part.text}</Fragment>;
        }
        return <Fragment key={index}>{withSiteLinks(part.text)}</Fragment>;
      })}
    </>
  );
}

const LINK_CLASS = "font-semibold text-[#fe00b6] underline underline-offset-2";

// Page paths the assistant mentions in plain text, such as /apply, become links.
function withSiteLinks(text: string) {
  return text.split(SITE_PATH).map((part, index) =>
    IS_SITE_PATH.test(part) ? (
      <Link key={index} href={part} className={LINK_CLASS}>
        {part}
      </Link>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

function stripBold(text: string): string {
  const match = /^\*\*(.+)\*\*$/.exec(text.trim());
  return match ? (match[1] ?? "") : text;
}
