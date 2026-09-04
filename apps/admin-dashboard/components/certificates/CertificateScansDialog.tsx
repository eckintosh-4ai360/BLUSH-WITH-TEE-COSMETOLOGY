"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, FileUp, Loader2, Trash2 } from "lucide-react";
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
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

type ScannedCertificate = {
  id: number;
  certificateNumber: string;
  studentName: string;
  studentNumber: string;
  courseTitle: string;
};

/** Mirrors the server's own ceiling, so an oversized file fails before upload. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED = "application/pdf,image/jpeg,image/png,image/webp";

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The scanned copies filed against one certificate.
 *
 * What the app prints is generated from the record; what the school hands over
 * is paper that was signed and stamped, and often signed back by the student
 * on collection. This is where those scans are filed and read back, so the
 * office copy is reachable from the certificate itself.
 */
export function CertificateScansDialog({
  certificate,
  onOpenChange,
  onChanged,
}: {
  certificate: ScannedCertificate | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const { can } = usePermissions();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canWrite = can("certificates.write");
  const certificateId = certificate?.id ?? 0;

  const scans = trpc.certificates.scans.useQuery(
    { certificateId },
    { enabled: certificateId > 0 },
  );

  useEffect(() => {
    if (certificate) {
      setFile(null);
      setNote("");
      setError(null);
    }
  }, [certificate]);

  const clearPicker = () => {
    setFile(null);
    setNote("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const upload = trpc.certificates.uploadScan.useMutation({
    onSuccess: () => {
      clearPicker();
      scans.refetch();
      // The table shows how many copies are on file, so it has to hear too.
      onChanged();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const remove = trpc.certificates.deleteScan.useMutation({
    onSuccess: () => {
      scans.refetch();
      onChanged();
    },
    onError: mutationError => setError(mutationError.message),
  });

  const submit = async () => {
    if (!file || !certificate) return;
    setError(null);

    if (file.size > MAX_UPLOAD_BYTES) {
      setError("That file is larger than 8 MB. Scan at a lower resolution and try again.");
      return;
    }

    let base64Data: string;
    try {
      base64Data = await fileToDataUrl(file);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "The file could not be read.");
      return;
    }

    upload.mutate({
      certificateId: certificate.id,
      fileName: file.name,
      mimeType: file.type,
      base64Data,
      note: note.trim() || undefined,
    });
  };

  const rows = scans.data ?? [];
  const busy = upload.isPending || remove.isPending;

  return (
    <Dialog open={Boolean(certificate)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scanned copies · {certificate?.certificateNumber}</DialogTitle>
          <DialogDescription>
            The signed and stamped certificate as it was issued, kept on the record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="font-medium text-foreground">{certificate?.studentName}</span>
            <span className="block text-xs text-muted-foreground">
              {certificate?.studentNumber} · {certificate?.courseTitle}
            </span>
          </div>

          {scans.isLoading ? (
            <div className="space-y-2">
              {[0, 1].map(index => (
                <Skeleton key={index} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : scans.error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {scans.error.message}
            </p>
          ) : !rows.length ? (
            <p className="rounded-lg bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
              No scanned copy is on file for this certificate yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map(scan => (
                <li
                  key={scan.id}
                  className="flex items-center gap-3 rounded-lg border border-border/60 p-2"
                >
                  {scan.mimeType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={scan.url}
                      alt={scan.fileName}
                      className="h-14 w-14 shrink-0 rounded-md border border-border/60 object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/50">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {scan.note || scan.fileName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatSize(scan.sizeBytes)} ·{" "}
                      {new Date(scan.createdAt).toLocaleDateString("en-GB")}
                      {scan.uploadedBy ? ` · ${scan.uploadedBy}` : ""}
                    </span>
                  </span>

                  <Button variant="ghost" size="sm" className="gap-1.5" asChild>
                    <a href={scan.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </a>
                  </Button>

                  {canWrite ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${scan.fileName}`}
                      className="text-destructive"
                      disabled={busy}
                      onClick={() => {
                        setError(null);
                        remove.mutate({ scanId: scan.id });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canWrite ? (
            <div className="space-y-3 border-t border-border/60 pt-4">
              <div className="space-y-2">
                <Label htmlFor="scan-file">Add a scan</Label>
                <Input
                  id="scan-file"
                  ref={fileInput}
                  type="file"
                  accept={ACCEPTED}
                  onChange={event => {
                    setError(null);
                    setFile(event.target.files?.[0] ?? null);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  PDF, JPG, PNG or WEBP · up to 8 MB
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scan-note">What this copy is (optional)</Label>
                <Input
                  id="scan-note"
                  value={note}
                  onChange={event => setNote(event.target.value)}
                  placeholder="Signed original, collection slip..."
                  maxLength={255}
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canWrite ? (
            <Button className="gap-2" disabled={!file || busy} onClick={submit}>
              {upload.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              Save scan
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
