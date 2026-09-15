import { Fragment } from "react";
import Link from "next/link";
import { parseMarkdown, parseMarkdownInline } from "@blush/shared/markdown";

// The body of a website page or blog post, written by staff in the dashboard.
export function ArticleBody({ text }: { text: string }) {
  const blocks = parseMarkdown(text);

  return (
    <div className="space-y-5 text-base leading-8 text-[#3d1030]">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading":
            return block.level <= 2 ? (
              <h2 key={index} className="pt-4 font-serif text-2xl font-bold leading-tight text-[#8f0d6b] sm:text-3xl">
                <Inline text={block.text} />
              </h2>
            ) : (
              <h3 key={index} className="pt-2 font-serif text-xl font-bold leading-snug text-[#8f0d6b]">
                <Inline text={block.text} />
              </h3>
            );
          case "image":
            return (
              <img
                key={index}
                src={block.src}
                alt={block.alt}
                loading="lazy"
                className="w-full rounded-3xl border border-[#8f0d6b]/10 object-cover shadow-[0_12px_36px_rgba(143,13,107,.08)]"
              />
            );
          case "list": {
            const ListTag = block.ordered ? "ol" : "ul";
            return (
              <ListTag
                key={index}
                className={`ml-6 space-y-2 marker:text-[#fe00b6] ${block.ordered ? "list-decimal" : "list-disc"}`}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="pl-1">
                    <Inline text={item} />
                  </li>
                ))}
              </ListTag>
            );
          }
          case "table":
            return (
              <div key={index} className="overflow-x-auto rounded-2xl border border-[#8f0d6b]/12 bg-white">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-[#faeaf6]">
                    <tr>
                      {block.head.map((cell, cellIndex) => (
                        <th key={cellIndex} className="px-4 py-3 text-left font-semibold text-[#8f0d6b]">
                          <Inline text={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t border-[#8f0d6b]/8">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="px-4 py-3 align-top">
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
              <p key={index} className="whitespace-pre-line">
                <Inline text={block.text} />
              </p>
            );
        }
      })}
    </div>
  );
}

const LINK_CLASS = "font-semibold text-[#fe00b6] underline underline-offset-4 hover:text-[#8f0d6b]";

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseMarkdownInline(text).map((part, index) => {
        if (part.kind === "bold") {
          return (
            <strong key={index} className="font-semibold text-[#2d0423]">
              {part.text}
            </strong>
          );
        }
        if (part.kind === "code") {
          return (
            <code key={index} className="rounded bg-[#8f0d6b]/8 px-1.5 py-0.5 text-[0.9em]">
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
          if (/^(https?:|mailto:|tel:)/.test(part.href)) {
            return (
              <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                {part.text}
              </a>
            );
          }
          return <Fragment key={index}>{part.text}</Fragment>;
        }
        return <Fragment key={index}>{part.text}</Fragment>;
      })}
    </>
  );
}
