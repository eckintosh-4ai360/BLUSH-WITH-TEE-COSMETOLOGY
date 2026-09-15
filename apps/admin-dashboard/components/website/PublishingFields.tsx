"use client";

import { Input } from "@blush/ui/components/ui/input";
import { Label } from "@blush/ui/components/ui/label";
import { Textarea } from "@blush/ui/components/ui/textarea";

// The web address a title suggests, in the form the server accepts.
export function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001").replace(/\/+$/, "");

// A typed slug as the server accepts it.
export function finishSlug(value: string): string | undefined {
  return value.replace(/-+$/, "") || undefined;
}

// The address a page or post is published at.
export function SlugField({
  id,
  prefix,
  value,
  onChange,
}: {
  id: string;
  prefix: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Web address</Label>
      <div className="flex items-center overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring/40">
        <span className="shrink-0 border-r border-input bg-muted px-3 py-2 text-xs text-muted-foreground">
          {prefix}
        </span>
        <input
          id={id}
          value={value}
          // Spaces and symbols become hyphens as they are typed; a trailing one is dropped on save.
          onChange={event =>
            onChange(
              event.target.value
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, "-")
                .replace(/-{2,}/g, "-")
                .replace(/^-/, "")
                .slice(0, 120),
            )
          }
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          placeholder="made-from-the-title"
          autoComplete="off"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Changing it later breaks links people have already shared.
      </p>
    </div>
  );
}

// What search engines and link previews show.
export function SeoFields({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
}: {
  title: string;
  description: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}) {
  return (
    <details className="rounded-lg border border-border/60 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">Search and link previews (optional)</summary>
      <div className="mt-3 space-y-3 pb-1">
        <div className="space-y-2">
          <Label htmlFor="seo-title">Search title</Label>
          <Input
            id="seo-title"
            value={title}
            maxLength={180}
            onChange={event => onTitleChange(event.target.value)}
            placeholder="Uses the title when left blank"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="seo-description">Search description</Label>
          <Textarea
            id="seo-description"
            value={description}
            maxLength={320}
            rows={2}
            onChange={event => onDescriptionChange(event.target.value)}
            placeholder="One or two sentences shown under the link in search results"
          />
          <p className="text-right text-xs text-muted-foreground">{description.length}/320</p>
        </div>
      </div>
    </details>
  );
}
