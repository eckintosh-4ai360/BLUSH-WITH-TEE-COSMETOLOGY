"use client";

import { Badge } from "@blush/ui/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import { toast } from "@blush/ui/components/ui/sonner";
import { trpc } from "@/lib/trpc";

export type PublishStatus = "draft" | "published" | "archived";
export type ContentKind = "banner" | "event" | "gallery" | "testimonial" | "faq" | "page" | "blogPost";

export const STATUS_LABELS: Record<PublishStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

const TONE: Record<PublishStatus, string> = {
  draft: "bg-amber-500/15 text-amber-800 dark:text-amber-300 hover:bg-amber-500/15",
  published: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/15",
  archived: "bg-muted text-muted-foreground hover:bg-muted",
};

export function StatusBadge({ status }: { status: PublishStatus }) {
  return <Badge className={TONE[status]}>{STATUS_LABELS[status]}</Badge>;
}

// Publishing, unpublishing or archiving an entry without reopening its form. Archiving is how
// something leaves the site: nothing here is deleted.
export function StatusControl({
  kind,
  id,
  status,
  writable,
  onChanged,
}: {
  kind: ContentKind;
  id: number;
  status: PublishStatus;
  writable: boolean;
  onChanged: () => void;
}) {
  const setStatus = trpc.cms.setStatus.useMutation({
    onSuccess: result => {
      toast.success(
        result.status === "published"
          ? "Published on the website."
          : result.status === "archived"
            ? "Archived and taken off the website."
            : "Saved as a draft and taken off the website.",
      );
      onChanged();
    },
    onError: error => toast.error(error.message),
  });

  if (!writable) return <StatusBadge status={status} />;

  return (
    <Select
      value={status}
      disabled={setStatus.isPending}
      onValueChange={value => setStatus.mutate({ kind, id, status: value as PublishStatus })}
    >
      <SelectTrigger className="h-8 w-[8.5rem] text-xs" aria-label="Where this entry shows">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(STATUS_LABELS) as PublishStatus[]).map(value => (
          <SelectItem key={value} value={value}>
            {STATUS_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// The status picker inside each form.
export function StatusField({
  value,
  onChange,
}: {
  value: PublishStatus;
  onChange: (value: PublishStatus) => void;
}) {
  return (
    <Select value={value} onValueChange={next => onChange(next as PublishStatus)}>
      <SelectTrigger aria-label="Status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="published">Published: shows on the website</SelectItem>
        <SelectItem value="draft">Draft: saved, not shown</SelectItem>
        <SelectItem value="archived">Archived: kept, not shown</SelectItem>
      </SelectContent>
    </Select>
  );
}
