"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import { Label } from "@blush/ui/components/ui/label";
import { ACCEPTED_IMAGE_TYPES, prepareImageUpload, uploadErrorMessage } from "@blush/shared/image-upload";
import { trpc } from "@/lib/trpc";

export type UploadedImage = { key: string; url: string | null };

// Picks a photo, uploads it straight away, and hands back the stored key for the entry.
export function ImageUploadField({
  label,
  area,
  value,
  onChange,
  required,
}: {
  label: string;
  // Product photos are stored by the stock screen, under its own permission.
  area: "gallery" | "site" | "product";
  value: UploadedImage | null;
  onChange: (image: UploadedImage | null) => void;
  required?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const siteUpload = trpc.cms.uploadImage.useMutation();
  const productUpload = trpc.inventory.uploadProductImage.useMutation();
  const upload = area === "product" ? productUpload : siteUpload;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      // Scaled down here, so a camera original is not sent whole.
      const prepared = await prepareImageUpload(file);
      const payload = {
        fileName: file.name,
        mimeType: prepared.mimeType,
        base64Data: prepared.dataUrl,
      };
      const uploaded =
        area === "product"
          ? await productUpload.mutateAsync(payload)
          : await siteUpload.mutateAsync({ ...payload, area });
      onChange(uploaded);
    } catch (reason) {
      setError(uploadErrorMessage(reason));
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? null : <span className="font-normal text-muted-foreground"> (optional)</span>}
      </Label>
      {value?.url ? (
        <div className="relative overflow-hidden rounded-lg border border-border/60">
          <img src={value.url} alt="" className="h-40 w-full object-cover" />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-2 top-2 h-7 w-7"
            aria-label="Remove this photo"
            onClick={() => onChange(null)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="sr-only"
        onChange={event => void pick(event.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        {upload.isPending ? "Uploading…" : value ? "Replace photo" : "Choose a photo"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
