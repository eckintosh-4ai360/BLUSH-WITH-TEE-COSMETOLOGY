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

export type BannerEntry = {
  id: number;
  title: string;
  subtitle: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  placement: string;
  sortOrder: number;
  status: PublishStatus;
};

export function BannerDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: BannerEntry | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [placement, setPlacement] = useState<"homepage" | "announcement">("homepage");
  const [image, setImage] = useState<UploadedImage | null>(null);
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [status, setStatus] = useState<PublishStatus>("published");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setSubtitle(editing?.subtitle ?? "");
    setPlacement(editing?.placement === "announcement" ? "announcement" : "homepage");
    setImage(editing?.imageKey ? { key: editing.imageKey, url: editing.imageUrl } : null);
    setCtaLabel(editing?.ctaLabel ?? "");
    setCtaHref(editing?.ctaHref ?? "");
    setSortOrder(String(editing?.sortOrder ?? 0));
    setStatus(editing?.status ?? "published");
    setError(null);
  }, [open, editing]);

  const save = trpc.cms.saveBanner.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const submit = () => {
    setError(null);
    if (title.trim().length < 2) return setError("Give the banner a headline.");
    save.mutate({
      id: editing?.id,
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      imageKey: image?.key ?? null,
      ctaLabel: ctaLabel.trim() || undefined,
      ctaHref: ctaHref.trim() || undefined,
      placement,
      sortOrder: Number(sortOrder) || 0,
      status,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit banner" : "Add a banner"}</DialogTitle>
          <DialogDescription>
            A homepage banner sits under the opening photo. An announcement is the thin strip across the top
            of every page, and only the first published one shows.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Where it shows</Label>
            <Select value={placement} onValueChange={value => setPlacement(value as typeof placement)}>
              <SelectTrigger aria-label="Where the banner shows">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="homepage">Homepage banner</SelectItem>
                <SelectItem value="announcement">Announcement strip on every page</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="banner-title">Headline</Label>
            <Input
              id="banner-title"
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder="e.g. September admissions are open"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="banner-subtitle">Supporting line (optional)</Label>
            <Input
              id="banner-subtitle"
              value={subtitle}
              onChange={event => setSubtitle(event.target.value)}
              placeholder="e.g. Classes start on 5 October"
            />
          </div>

          {placement === "homepage" ? (
            <ImageUploadField label="Background photo" area="site" value={image} onChange={setImage} />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="banner-cta-label">Button wording (optional)</Label>
              <Input
                id="banner-cta-label"
                value={ctaLabel}
                onChange={event => setCtaLabel(event.target.value)}
                placeholder="Apply now"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="banner-cta-href">Button goes to</Label>
              <Input
                id="banner-cta-href"
                value={ctaHref}
                onChange={event => setCtaHref(event.target.value)}
                placeholder="/apply"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="banner-order">Order</Label>
              <Input
                id="banner-order"
                type="number"
                min={0}
                value={sortOrder}
                onChange={event => setSortOrder(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <StatusField value={status} onChange={setStatus} />
            </div>
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
            {editing ? "Save changes" : "Add banner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
