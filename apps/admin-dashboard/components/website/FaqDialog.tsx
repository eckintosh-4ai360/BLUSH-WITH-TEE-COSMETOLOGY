"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blush/ui/components/ui/dialog";
import { Input } from "@blush/ui/components/ui/input";
import { Label } from "@blush/ui/components/ui/label";
import { Textarea } from "@blush/ui/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { StatusField, type PublishStatus } from "./ContentStatus";

export type FaqEntry = {
  id: number;
  question: string;
  answer: string;
  category: string | null;
  sortOrder: number;
  status: PublishStatus;
};

export function FaqDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: FaqEntry | null;
  onSaved: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [category, setCategory] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [status, setStatus] = useState<PublishStatus>("published");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuestion(editing?.question ?? "");
    setAnswer(editing?.answer ?? "");
    setCategory(editing?.category ?? "");
    setSortOrder(String(editing?.sortOrder ?? 0));
    setStatus(editing?.status ?? "published");
    setError(null);
  }, [open, editing]);

  const save = trpc.cms.saveFaq.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const submit = () => {
    setError(null);
    if (question.trim().length < 5) return setError("Write the question as a visitor would ask it.");
    if (answer.trim().length < 2) return setError("Write the answer.");
    save.mutate({
      id: editing?.id,
      question: question.trim(),
      answer: answer.trim(),
      category: category.trim() || undefined,
      sortOrder: Number(sortOrder) || 0,
      status,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit question" : "Add a question"}</DialogTitle>
          <DialogDescription>
            Published questions show on the website&apos;s contact page, and the website assistant uses them to
            answer visitors.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="faq-question">Question</Label>
            <Input
              id="faq-question"
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder="e.g. Do you offer weekend classes?"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="faq-answer">Answer</Label>
            <Textarea
              id="faq-answer"
              value={answer}
              onChange={event => setAnswer(event.target.value)}
              rows={5}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="faq-category">Topic (optional)</Label>
              <Input
                id="faq-category"
                value={category}
                onChange={event => setCategory(event.target.value)}
                placeholder="e.g. Admissions"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="faq-order">Order</Label>
              <Input
                id="faq-order"
                type="number"
                min={0}
                value={sortOrder}
                onChange={event => setSortOrder(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <StatusField value={status} onChange={setStatus} />
          </div>

          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button className="gap-2" onClick={submit} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Save changes" : "Add question"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
