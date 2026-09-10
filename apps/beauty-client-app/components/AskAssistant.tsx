"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Turn = { role: "user" | "assistant"; content: string; failed?: boolean };

const OPENING =
  "Hi! I am the BWT assistant. Ask me about our courses, fees, start dates, the student clinic, or anything in the store.";

const SUGGESTIONS = [
  "What courses do you offer?",
  "How much is the makeup course?",
  "When does the next class start?",
  "Can I book a hair appointment?",
];

// Public assistant chat bubble answering from live school data.
export function AskAssistant() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const available = trpc.assistant.available.useQuery(undefined, { staleTime: 10 * 60_000 });

  const chat = trpc.assistant.chat.useMutation({
    onSuccess: result => {
      setTurns(current => [...current, { role: "assistant", content: result.answer }]);
    },
    onError: () => {
      setTurns(current => [
        ...current,
        {
          role: "assistant",
          failed: true,
          content:
            "Sorry, I could not answer that just now. Please try again, or use the contact page and someone will get back to you.",
        },
      ]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, chat.isPending]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const send = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || chat.isPending) return;

    const history = turns
      .filter(turn => !turn.failed)
      .map(turn => ({ role: turn.role, content: turn.content }));

    setTurns(current => [...current, { role: "user", content: trimmed }]);
    setDraft("");
    chat.mutate({ question: trimmed, history });
  };

  // Hide assistant when AI service is unconfigured.
  if (available.data?.enabled === false) return null;

  return (
    <>
      {open ? (
        <div className="fixed bottom-4 right-4 z-[60] flex h-[min(32rem,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-3xl border border-[#8f0d6b]/12 bg-white shadow-[0_24px_70px_rgba(143,13,107,0.28)] sm:bottom-6 sm:right-6">
          <div className="flex shrink-0 items-center justify-between gap-3 bg-gradient-to-r from-[#8f0d6b] to-[#fe00b6] px-4 py-3.5 text-white">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/20">
                <Sparkles className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold leading-tight">
                  Ask BWT
                </span>
                <span className="block truncate text-[11px] text-white/80">
                  Courses, prices and bookings
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close the assistant"
              className="grid size-8 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/20"
            >
              <X className="size-4" />
            </button>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#fdf8fc] px-4 py-4">
            <Bubble role="assistant">{OPENING}</Bubble>

            {turns.map((turn, index) => (
              <Bubble key={index} role={turn.role}>
                {turn.content}
              </Bubble>
            ))}

            {chat.isPending ? (
              <div className="flex w-fit gap-1 rounded-2xl rounded-bl-sm bg-white px-3.5 py-3 shadow-sm">
                {[0, 1, 2].map(dot => (
                  <span
                    key={dot}
                    className="size-1.5 animate-bounce rounded-full bg-[#fe00b6]"
                    style={{ animationDelay: `${dot * 120}ms` }}
                  />
                ))}
              </div>
            ) : null}

            {!turns.length ? (
              <div className="space-y-1.5 pt-1">
                {SUGGESTIONS.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    className="block w-full rounded-xl border border-[#8f0d6b]/12 bg-white px-3 py-2 text-left text-xs font-medium text-[#692156] transition-colors hover:border-[#fe00b6]/40 hover:text-[#8f0d6b]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <form
            onSubmit={event => {
              event.preventDefault();
              send(draft);
            }}
            className="flex shrink-0 items-center gap-2 border-t border-[#8f0d6b]/10 bg-white px-3 py-3"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder="Ask a question..."
              disabled={chat.isPending}
              className="min-w-0 flex-1 rounded-full border border-[#8f0d6b]/15 bg-[#fdf8fc] px-4 py-2.5 text-sm text-[#2d0423] outline-none placeholder:text-[#8f0d6b]/45 focus:border-[#fe00b6]/50"
            />
            <button
              type="submit"
              disabled={chat.isPending || !draft.trim()}
              aria-label="Send"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-[#fe00b6] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-full bg-gradient-to-r from-[#8f0d6b] to-[#fe00b6] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_38px_rgba(254,0,182,0.35)] transition-transform hover:scale-105 sm:bottom-6 sm:right-6"
        >
          <MessageCircle className="size-5" />
          <span className="hidden sm:inline">Ask BWT</span>
        </button>
      )}
    </>
  );
}

// Formats text responses and parses internal site links.
function Bubble({ role, children }: { role: "user" | "assistant"; children: string }) {
  if (role === "user") {
    return (
      <p className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#8f0d6b] px-3.5 py-2.5 text-sm text-white">
        {children}
      </p>
    );
  }

  return (
    <p className="w-fit max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 text-sm leading-relaxed text-[#2d0423] shadow-sm">
      {withLinks(children)}
    </p>
  );
}

// Converts relative path references into router links.
function withLinks(text: string) {
  return text.split(/(\/(?:programs|store|appointments|apply|contact|gallery|about)(?:\/[\w-]+)?)/g)
    .map((part, index) =>
      /^\/(programs|store|appointments|apply|contact|gallery|about)(\/|$)/.test(part) ? (
        <Link
          key={index}
          href={part}
          className="font-semibold text-[#fe00b6] underline underline-offset-2"
        >
          {part}
        </Link>
      ) : (
        part
      ),
    );
}
