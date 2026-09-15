"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import { Label } from "@blush/ui/components/ui/label";
import { Textarea } from "@blush/ui/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { MarkdownPreview } from "./MarkdownPreview";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED = "image/jpeg,image/png,image/webp";

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

// The body of a page or post, written with light formatting, with a preview and photo insert.
export function MarkdownEditor({
  id,
  label,
  value,
  onChange,
  rows = 14,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const upload = trpc.cms.uploadImage.useMutation();

  const insertAtCursor = (snippet: string) => {
    const element = area.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    // A picture sits on a line of its own, so it is padded with blank lines.
    const lead = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const tail = after.startsWith("\n") ? "\n" : "\n\n";
    onChange(`${before}${lead}${snippet}${tail}${after}`);
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!ACCEPTED.split(",").includes(file.type)) return setError("Use a JPEG, PNG or WEBP photo.");
    if (file.size > MAX_UPLOAD_BYTES) return setError("That photo is larger than 8 MB. Resize it and try again.");
    try {
      const uploaded = await upload.mutateAsync({
        area: "site",
        fileName: file.name,
        mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
        base64Data: await fileToDataUrl(file),
      });
      const alt = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/[[\]]/g, "");
      insertAtCursor(`![${alt}](${uploaded.url})`);
      setMode("write");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The photo could not be uploaded.");
    } finally {
      if (picker.current) picker.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={upload.isPending}
            onClick={() => picker.current?.click()}
          >
            {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            Insert photo
          </Button>
          <div className="flex rounded-md border border-border/70 p-0.5 text-xs">
            {(["write", "preview"] as const).map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={`rounded px-2 py-0.5 capitalize ${mode === option ? "bg-muted font-medium text-foreground" : "text-muted-foreground"}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      <input
        ref={picker}
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        onChange={event => void pick(event.target.files?.[0])}
      />

      {mode === "write" ? (
        <Textarea
          ref={area}
          id={id}
          value={value}
          onChange={event => onChange(event.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="font-mono text-[13px] leading-6"
        />
      ) : (
        <div className="min-h-[12rem] rounded-md border border-border/70 bg-background px-4 py-3">
          <MarkdownPreview text={value} />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Leave a blank line between paragraphs. <code>## Heading</code>, <code>**bold**</code>,{" "}
        <code>- list item</code>, <code>[link text](/apply)</code>.
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
