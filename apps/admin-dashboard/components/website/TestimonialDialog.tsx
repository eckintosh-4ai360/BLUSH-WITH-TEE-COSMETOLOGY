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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import { Textarea } from "@blush/ui/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { StatusField, type PublishStatus } from "./ContentStatus";
import { ImageUploadField, type UploadedImage } from "./ImageUploadField";

export type TestimonialEntry = {
  id: number;
  authorName: string;
  authorRole: string | null;
  quote: string;
  photoKey: string | null;
  photoUrl: string | null;
  rating: number | null;
  sortOrder: number;
  status: PublishStatus;
};

const NO_RATING = "none";

export function TestimonialDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: TestimonialEntry | null;
  onSaved: () => void;
}) {
  const [authorName, setAuthorName] = useState("");
  const [authorRole, setAuthorRole] = useState("");
  const [quote, setQuote] = useState("");
  const [rating, setRating] = useState(NO_RATING);
  const [photo, setPhoto] = useState<UploadedImage | null>(null);
  const [sortOrder, setSortOrder] = useState("0");
  const [status, setStatus] = useState<PublishStatus>("published");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAuthorName(editing?.authorName ?? "");
    setAuthorRole(editing?.authorRole ?? "");
    setQuote(editing?.quote ?? "");
    setRating(editing?.rating ? String(editing.rating) : NO_RATING);
    setPhoto(editing?.photoKey ? { key: editing.photoKey, url: editing.photoUrl } : null);
    setSortOrder(String(editing?.sortOrder ?? 0));
    setStatus(editing?.status ?? "published");
    setError(null);
  }, [open, editing]);

  const save = trpc.cms.saveTestimonial.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const submit = () => {
    setError(null);
    if (authorName.trim().length < 2) return setError("Say who said it.");
    if (quote.trim().length < 10) return setError("The quote needs at least a sentence.");
    save.mutate({
      id: editing?.id,
      authorName: authorName.trim(),
      authorRole: authorRole.trim() || undefined,
      quote: quote.trim(),
      rating: rating === NO_RATING ? null : Number(rating),
      photoKey: photo?.key ?? null,
      sortOrder: Number(sortOrder) || 0,
      status,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit testimonial" : "Add a testimonial"}</DialogTitle>
          <DialogDescription>
            Use real words from a real student or client, with their permission. Published testimonials show
            on the homepage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="testimonial-name">Name</Label>
              <Input
                id="testimonial-name"
                value={authorName}
                onChange={event => setAuthorName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="testimonial-role">Programme or role (optional)</Label>
              <Input
                id="testimonial-role"
                value={authorRole}
                onChange={event => setAuthorRole(event.target.value)}
                placeholder="e.g. Makeup Artistry, 2025"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="testimonial-quote">What they said</Label>
            <Textarea
              id="testimonial-quote"
              value={quote}
              onChange={event => setQuote(event.target.value)}
              rows={4}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Star rating</Label>
              <Select value={rating} onValueChange={setRating}>
                <SelectTrigger aria-label="Star rating">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_RATING}>No rating</SelectItem>
                  {[5, 4, 3, 2, 1].map(value => (
                    <SelectItem key={value} value={String(value)}>
                      {value} star{value === 1 ? "" : "s"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="testimonial-order">Order</Label>
              <Input
                id="testimonial-order"
                type="number"
                min={0}
                value={sortOrder}
                onChange={event => setSortOrder(event.target.value)}
              />
            </div>
          </div>

          <ImageUploadField label="Photo" area="site" value={photo} onChange={setPhoto} />

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
            {editing ? "Save changes" : "Add testimonial"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
