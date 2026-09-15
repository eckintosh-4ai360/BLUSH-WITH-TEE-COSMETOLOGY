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
import { trpc } from "@/lib/trpc";
import { StatusField, type PublishStatus } from "./ContentStatus";
import { ImageUploadField, type UploadedImage } from "./ImageUploadField";

export const GALLERY_CATEGORY_LABELS = {
  student_work: "Student work",
  hair: "Hair",
  makeup: "Makeup",
  nails: "Nails",
  training: "Training",
  graduation: "Graduation",
  events: "Events",
  facilities: "Facilities",
} as const;

export type GalleryCategory = keyof typeof GALLERY_CATEGORY_LABELS;

export type GalleryEntry = {
  id: number;
  title: string | null;
  caption: string | null;
  category: GalleryCategory;
  storageKey: string;
  imageUrl: string | null;
  altText: string | null;
  sortOrder: number;
  status: PublishStatus;
};

export function GalleryDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: GalleryEntry | null;
  onSaved: () => void;
}) {
  const [image, setImage] = useState<UploadedImage | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState<GalleryCategory>("student_work");
  const [altText, setAltText] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [status, setStatus] = useState<PublishStatus>("published");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setImage(editing ? { key: editing.storageKey, url: editing.imageUrl } : null);
    setTitle(editing?.title ?? "");
    setCaption(editing?.caption ?? "");
    setCategory(editing?.category ?? "student_work");
    setAltText(editing?.altText ?? "");
    setSortOrder(String(editing?.sortOrder ?? 0));
    setStatus(editing?.status ?? "published");
    setError(null);
  }, [open, editing]);

  const save = trpc.cms.saveGalleryItem.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const submit = () => {
    setError(null);
    if (!image) return setError("Choose the photo to show.");
    save.mutate({
      id: editing?.id,
      storageKey: image.key,
      title: title.trim() || undefined,
      caption: caption.trim() || undefined,
      category,
      altText: altText.trim() || undefined,
      sortOrder: Number(sortOrder) || 0,
      status,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit gallery photo" : "Add a gallery photo"}</DialogTitle>
          <DialogDescription>
            Published photos replace the placeholder pictures on the website&apos;s gallery page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ImageUploadField label="Photo" area="gallery" value={image} onChange={setImage} required />

          <div className="space-y-2">
            <Label htmlFor="gallery-title">Title (optional)</Label>
            <Input
              id="gallery-title"
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder="e.g. Bridal glam by our advanced class"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gallery-caption">Caption (optional)</Label>
            <Input id="gallery-caption" value={caption} onChange={event => setCaption(event.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={value => setCategory(value as GalleryCategory)}>
                <SelectTrigger aria-label="Gallery category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(GALLERY_CATEGORY_LABELS) as GalleryCategory[]).map(value => (
                    <SelectItem key={value} value={value}>
                      {GALLERY_CATEGORY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gallery-order">Order</Label>
              <Input
                id="gallery-order"
                type="number"
                min={0}
                value={sortOrder}
                onChange={event => setSortOrder(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gallery-alt">Describe the photo (optional)</Label>
            <Input
              id="gallery-alt"
              value={altText}
              onChange={event => setAltText(event.target.value)}
              placeholder="Read aloud to visitors who cannot see it"
            />
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
            {editing ? "Save changes" : "Add photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
