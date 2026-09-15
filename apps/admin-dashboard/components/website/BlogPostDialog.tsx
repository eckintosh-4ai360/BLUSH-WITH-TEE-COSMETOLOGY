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
import { MarkdownEditor } from "./MarkdownEditor";
import { SeoFields, SlugField, finishSlug, slugFromTitle } from "./PublishingFields";

const NONE = "none";

export type BlogPostEntry = {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  featuredImageKey: string | null;
  featuredImageUrl: string | null;
  authorName: string | null;
  categoryId: number | null;
  tags: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: Date | string | null;
  status: PublishStatus;
};

// A calendar date as YYYY-MM-DD, read in UTC because Ghana keeps GMT.
function toDateInput(value: Date | string | null | undefined): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

// Writes or edits a blog post.
export function BlogPostDialog({
  open,
  onOpenChange,
  editing,
  defaultAuthor,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: BlogPostEntry | null;
  defaultAuthor?: string | null;
  onSaved: (saved: { slug: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [image, setImage] = useState<UploadedImage | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [categoryId, setCategoryId] = useState(NONE);
  const [tags, setTags] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [status, setStatus] = useState<PublishStatus>("draft");
  const [error, setError] = useState<string | null>(null);

  const categories = trpc.cms.blogCategories.useQuery(undefined, { enabled: open });

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setSlug(editing?.slug ?? "");
    setSlugTouched(Boolean(editing));
    setExcerpt(editing?.excerpt ?? "");
    setContent(editing?.content ?? "");
    setImage(editing?.featuredImageKey ? { key: editing.featuredImageKey, url: editing.featuredImageUrl } : null);
    setAuthorName(editing ? (editing.authorName ?? "") : (defaultAuthor ?? ""));
    setCategoryId(editing?.categoryId ? String(editing.categoryId) : NONE);
    setTags(editing?.tags ?? "");
    setPublishedAt(toDateInput(editing?.publishedAt));
    setSeoTitle(editing?.seoTitle ?? "");
    setSeoDescription(editing?.seoDescription ?? "");
    setStatus(editing?.status ?? "draft");
    setError(null);
  }, [open, editing, defaultAuthor]);

  const save = trpc.cms.saveBlogPost.useMutation({
    onSuccess: saved => {
      onOpenChange(false);
      onSaved(saved);
    },
    onError: mutationError => setError(mutationError.message),
  });

  const submit = () => {
    setError(null);
    if (title.trim().length < 2) return setError("Give the post a title.");
    if (!content.trim()) return setError("Write the post before saving it.");
    save.mutate({
      id: editing?.id,
      title: title.trim(),
      slug: finishSlug(slug),
      excerpt: excerpt.trim() || undefined,
      content,
      featuredImageKey: image?.key ?? null,
      authorName: authorName.trim() || undefined,
      categoryId: categoryId === NONE ? null : Number(categoryId),
      tags: tags.trim() || undefined,
      publishedAt: publishedAt || null,
      seoTitle: seoTitle.trim() || undefined,
      seoDescription: seoDescription.trim() || undefined,
      status,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit post" : "New blog post"}</DialogTitle>
          <DialogDescription>
            Published posts appear on the website blog from their publish date, newest first.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="post-title">Title</Label>
            <Input
              id="post-title"
              value={title}
              onChange={event => {
                setTitle(event.target.value);
                if (!slugTouched) setSlug(slugFromTitle(event.target.value));
              }}
              placeholder="e.g. Five tips for your first bridal client"
            />
          </div>

          <SlugField
            id="post-slug"
            prefix="/blog/"
            value={slug}
            onChange={value => {
              setSlug(value);
              setSlugTouched(true);
            }}
          />

          <div className="space-y-2">
            <Label htmlFor="post-excerpt">Summary (optional)</Label>
            <Textarea
              id="post-excerpt"
              value={excerpt}
              maxLength={400}
              rows={2}
              onChange={event => setExcerpt(event.target.value)}
              placeholder="A sentence or two shown on the blog list"
            />
          </div>

          <MarkdownEditor id="post-content" label="Post" value={content} onChange={setContent} rows={18} />

          <ImageUploadField label="Cover photo" area="site" value={image} onChange={setImage} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="post-category">Category (optional)</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="post-category">
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No category</SelectItem>
                  {(categories.data ?? []).map(category => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="post-author">Author (optional)</Label>
              <Input id="post-author" value={authorName} onChange={event => setAuthorName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="post-date">Publish date</Label>
              <Input
                id="post-date"
                type="date"
                value={publishedAt}
                onChange={event => setPublishedAt(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Blank uses the day it is published. A future date keeps it hidden until then.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="post-tags">Tags (optional)</Label>
              <Input
                id="post-tags"
                value={tags}
                maxLength={320}
                onChange={event => setTags(event.target.value)}
                placeholder="bridal, makeup, careers"
              />
            </div>
          </div>

          <SeoFields
            title={seoTitle}
            description={seoDescription}
            onTitleChange={setSeoTitle}
            onDescriptionChange={setSeoDescription}
          />

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
            {editing ? "Save changes" : "Save post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
