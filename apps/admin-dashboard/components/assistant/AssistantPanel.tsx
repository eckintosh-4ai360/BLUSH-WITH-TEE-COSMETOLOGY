"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, RotateCcw, Send, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@blush/ui/components/ui/sheet";
import { Textarea } from "@blush/ui/components/ui/textarea";
import { Kbd } from "@blush/ui/components/ui/kbd";
import { trpc } from "@/lib/trpc";
import { AssistantMarkdown } from "./AssistantMarkdown";

type Turn = {
  role: "user" | "assistant";
  content: string;
  // Tools the answer was built from, shown so a figure can be traced.
  consulted?: string[];
  failed?: boolean;
};

const SUGGESTIONS = [
  "How is the school doing this month?",
  "Which students still owe fees?",
  "What stock is running low?",
  "How many students are active right now?",
];

// The assistant, as a panel over the dashboard.
export function AssistantPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const status = trpc.assistant.status.useQuery(undefined, {
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const ask = trpc.assistant.ask.useMutation({
    onSuccess: result => {
      setTurns(current => [
        ...current,
        { role: "assistant", content: result.answer, consulted: result.consulted },
      ]);
    },
    onError: error => {
      setTurns(current => [
        ...current,
        { role: "assistant", content: error.message, failed: true },
      ]);
    },
  });

  // Follow the conversation as it grows, including while an answer is pending.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, ask.isPending]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  const send = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || ask.isPending) return;

    // Only the exchanges so far are sent as history.
    const history = turns
      .filter(turn => !turn.failed)
      .map(turn => ({ role: turn.role, content: turn.content }));

    setTurns(current => [...current, { role: "user", content: trimmed }]);
    setDraft("");
    ask.mutate({ question: trimmed, history });
  };

  const disabled = status.data?.enabled === false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-lg"
        aria-describedby={undefined}
      >
        <SheetHeader className="shrink-0 border-b border-border/60 px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <span className="grid size-7 place-items-center rounded-lg bg-[#22b8bd] text-white dark:bg-[#3fd0d8] dark:text-[#04252a]">
              <Sparkles className="size-4" />
            </span>
            Assistant
          </SheetTitle>
          <SheetDescription className="text-xs">
            Ask about students, fees, stock, orders or anything else on the system. Answers come
            from the live database, limited to what your account can see.
          </SheetDescription>
        </SheetHeader>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {disabled ? (
            <NotConfigured />
          ) : !turns.length ? (
            <Empty onPick={send} />
          ) : (
            turns.map((turn, index) => <Message key={index} turn={turn} />)
          )}

          {ask.isPending ? <Thinking /> : null}
        </div>

        <div className="shrink-0 border-t border-border/60 bg-background/80 px-5 py-3">
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(draft);
                }
              }}
              placeholder={disabled ? "The assistant is not configured." : "Ask a question..."}
              disabled={disabled || ask.isPending}
              rows={1}
              className="max-h-32 min-h-10 resize-none rounded-xl"
            />
            <Button
              type="button"
              size="icon"
              onClick={() => send(draft)}
              disabled={disabled || ask.isPending || !draft.trim()}
              className="size-10 shrink-0 rounded-xl"
              aria-label="Send"
            >
              <Send className="size-4" />
            </Button>
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              <Kbd>Enter</Kbd> to send, <Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> for a new line
            </span>
            {turns.length ? (
              <button
                type="button"
                onClick={() => setTurns([])}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <RotateCcw className="size-3" />
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Message({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#22b8bd] px-3.5 py-2 text-sm text-white dark:bg-[#3fd0d8] dark:text-[#04252a]">
          {turn.content}
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-black/5 dark:bg-white/10">
        <Bot className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        {turn.failed ? (
          <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {turn.content}
          </p>
        ) : (
          <AssistantMarkdown text={turn.content} />
        )}

        {turn.consulted?.length ? (
          <p className="mt-2 flex flex-wrap gap-1">
            {[...new Set(turn.consulted)].map(tool => (
              <span
                key={tool}
                className="rounded-md bg-black/5 px-1.5 py-0.5 text-[10px] text-muted-foreground dark:bg-white/8"
              >
                {tool.replace(/_/g, " ")}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-black/5 dark:bg-white/10">
        <Bot className="size-4" />
      </span>
      <span className="flex gap-1">
        {[0, 1, 2].map(dot => (
          <span
            key={dot}
            className="size-1.5 animate-bounce rounded-full bg-current"
            style={{ animationDelay: `${dot * 120}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

function Empty({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="pt-6">
      <p className="text-sm text-muted-foreground">
        Ask anything about the school. Try one of these:
      </p>
      <div className="mt-3 space-y-1.5">
        {SUGGESTIONS.map(suggestion => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="block w-full rounded-xl border border-border/60 px-3 py-2 text-left text-sm transition-colors hover:bg-black/4 dark:hover:bg-white/6"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
      <p className="flex items-center gap-2 font-medium">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        The assistant is not switched on
      </p>
      <p className="mt-1.5 text-xs">
        Set <code className="font-mono">GROQ_API_KEY</code> in the dashboard environment and
        restart it. Until then this panel has nothing to answer with.
      </p>
    </div>
  );
}
