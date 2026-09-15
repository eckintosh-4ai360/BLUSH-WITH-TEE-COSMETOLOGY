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
import { ImageUploadField, type UploadedImage } from "./ImageUploadField";

export type EventEntry = {
  id: number;
  title: string;
  summary: string | null;
  description: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  location: string | null;
  startsAt: Date | string;
  endsAt: Date | string | null;
  status: PublishStatus;
};

// A date-time input reads and writes local wall-clock time, not UTC.
function toLocalInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function EventDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: EventEntry | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<UploadedImage | null>(null);
  const [status, setStatus] = useState<PublishStatus>("published");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setStartsAt(toLocalInput(editing?.startsAt));
    setEndsAt(toLocalInput(editing?.endsAt));
    setLocation(editing?.location ?? "");
    setSummary(editing?.summary ?? "");
    setDescription(editing?.description ?? "");
    setImage(editing?.imageKey ? { key: editing.imageKey, url: editing.imageUrl } : null);
    setStatus(editing?.status ?? "published");
    setError(null);
  }, [open, editing]);

  const save = trpc.cms.saveEvent.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const submit = () => {
    setError(null);
    if (title.trim().length < 2) return setError("Name the event.");
    if (!startsAt) return setError("Choose when the event starts.");
    if (endsAt && new Date(endsAt) < new Date(startsAt)) {
      return setError("The event cannot end before it starts.");
    }
    save.mutate({
      id: editing?.id,
      title: title.trim(),
      startsAt: new Date(startsAt),
      endsAt: endsAt ? new Date(endsAt) : null,
      location: location.trim() || undefined,
      summary: summary.trim() || undefined,
      description: description.trim() || undefined,
      imageKey: image?.key ?? null,
      status,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit event" : "Add an event"}</DialogTitle>
          <DialogDescription>
            Published events show on the homepage until they are over.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="event-title">Event</Label>
            <Input
              id="event-title"
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder="e.g. Bridal makeup masterclass"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="event-starts">Starts</Label>
              <Input
                id="event-starts"
                type="datetime-local"
                value={startsAt}
                onChange={event => setStartsAt(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-ends">Ends (optional)</Label>
              <Input
                id="event-ends"
                type="datetime-local"
                value={endsAt}
                onChange={event => setEndsAt(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-location">Where (optional)</Label>
            <Input
              id="event-location"
              value={location}
              onChange={event => setLocation(event.target.value)}
              placeholder="e.g. Tarkwa campus"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-summary">Short summary (optional)</Label>
            <Input id="event-summary" value={summary} onChange={event => setSummary(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-description">Details (optional)</Label>
            <Textarea
              id="event-description"
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={4}
            />
          </div>

          <ImageUploadField label="Photo" area="site" value={image} onChange={setImage} />

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
            {editing ? "Save changes" : "Add event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
