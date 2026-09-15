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
import { trpc } from "@/lib/trpc";
import { StatusField, type PublishStatus } from "./ContentStatus";
import { ImageUploadField, type UploadedImage } from "./ImageUploadField";
import { MarkdownEditor } from "./MarkdownEditor";
import { SeoFields, SlugField, finishSlug, slugFromTitle } from "./PublishingFields";

export type PageEntry = {
  id: number;
  slug: string;
  title: string;
  content: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageKey: string | null;
  ogImageUrl: string | null;
  status: PublishStatus;
};

// Writes a standalone website page, such as scholarships or a refund policy.
export function PageDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: PageEntry | null;
  onSaved: (saved: { slug: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [content, setContent] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [image, setImage] = useState<UploadedImage | null>(null);
  const [status, setStatus] = useState<PublishStatus>("draft");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setSlug(editing?.slug ?? "");
    setSlugTouched(Boolean(editing));
    setContent(editing?.content ?? "");
    setSeoTitle(editing?.seoTitle ?? "");
    setSeoDescription(editing?.seoDescription ?? "");
    setImage(editing?.ogImageKey ? { key: editing.ogImageKey, url: editing.ogImageUrl } : null);
    setStatus(editing?.status ?? "draft");
    setError(null);
  }, [open, editing]);

  const save = trpc.cms.savePage.useMutation({
    onSuccess: saved => {
      onOpenChange(false);
      onSaved(saved);
    },
    onError: mutationError => setError(mutationError.message),
  });

  const submit = () => {
    setError(null);
    if (title.trim().length < 2) return setError("Give the page a title.");
    if (status === "published" && !content.trim()) return setError("Write the page before publishing it.");
    save.mutate({
      id: editing?.id,
      title: title.trim(),
      slug: finishSlug(slug),
      content,
      seoTitle: seoTitle.trim() || undefined,
      seoDescription: seoDescription.trim() || undefined,
      ogImageKey: image?.key ?? null,
      status,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit page" : "New page"}</DialogTitle>
          <DialogDescription>
            A page of its own on the website. Published pages are listed in the website footer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="page-title">Title</Label>
            <Input
              id="page-title"
              value={title}
              onChange={event => {
                setTitle(event.target.value);
                if (!slugTouched) setSlug(slugFromTitle(event.target.value));
              }}
              placeholder="e.g. Scholarships and payment plans"
            />
          </div>

          <SlugField
            id="page-slug"
            prefix="/pages/"
            value={slug}
            onChange={value => {
              setSlug(value);
              setSlugTouched(true);
            }}
          />

          <MarkdownEditor id="page-content" label="Page content" value={content} onChange={setContent} rows={16} />

          <SeoFields
            title={seoTitle}
            description={seoDescription}
            onTitleChange={setSeoTitle}
            onDescriptionChange={setSeoDescription}
          />

          <ImageUploadField label="Link preview photo" area="site" value={image} onChange={setImage} />

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
            {editing ? "Save changes" : "Create page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
