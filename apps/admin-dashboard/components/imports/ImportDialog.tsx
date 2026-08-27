"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  MinusCircle,
  PlusCircle,
  RefreshCw,
} from "lucide-react";
import { MAX_IMPORT_ROWS, type ImportColumn } from "@blush/shared/imports";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@blush/ui/components/ui/dialog";
import { Label } from "@blush/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@blush/ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@blush/ui/components/ui/table";
import { downloadTemplate, mapRows, parseCsv } from "@/lib/csv";

export type RowOutcome = {
  line: number;
  label: string;
  action: "create" | "update" | "skip" | "error";
  message: string;
};

export type ImportResult = {
  outcomes: RowOutcome[];
  counts: { total: number; create: number; update: number; skip: number; error: number };
  newCategories?: string[];
};

type Stage = "choose" | "preview" | "done";

const ACTION_STYLE: Record<RowOutcome["action"], { icon: typeof PlusCircle; tone: string }> = {
  create: { icon: PlusCircle, tone: "text-emerald-700 dark:text-emerald-400" },
  update: { icon: RefreshCw, tone: "text-sky-700 dark:text-sky-400" },
  skip: { icon: MinusCircle, tone: "text-muted-foreground" },
  error: { icon: AlertTriangle, tone: "text-destructive" },
};

/**
 * Import a spreadsheet, in three steps: choose a file, read what will happen,
 * then commit.
 *
 * The preview is not a courtesy — it runs the identical server-side validation
 * the commit runs, with `dryRun` set, so what it lists is what will happen
 * rather than a client-side guess at it. Nothing is written until the second
 * button is pressed.
 */
export function ImportDialog({
  open,
  onOpenChange,
  onImported,
  title,
  description,
  columns,
  templateName,
  noun,
  runImport,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  title: string;
  description: string;
  columns: ImportColumn[];
  templateName: string;
  /** Plural, lower case, e.g. "students". */
  noun: string;
  runImport: (args: {
    rows: Array<Record<string, string>>;
    dryRun: boolean;
    onDuplicate: "skip" | "update";
  }) => Promise<ImportResult>;
  isPending: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [onDuplicate, setOnDuplicate] = useState<"skip" | "update">("skip");
  const [stage, setStage] = useState<Stage>("choose");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [reading, setReading] = useState(false);

  const reset = () => {
    setFileName(null);
    setRows([]);
    setWarnings([]);
    setError(null);
    setOnDuplicate("skip");
    setStage("choose");
    setResult(null);
    setReading(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  useEffect(() => {
    reset();
    // Reset on open as well as close: the caller may reopen straight after a
    // run, and the previous file's outcomes must not be mistaken for this one's.
  }, [open]);

  const required = useMemo(() => columns.filter(column => column.required), [columns]);

  const readFile = async (file: File) => {
    setReading(true);
    setError(null);
    setWarnings([]);
    setResult(null);

    try {
      const parsed = parseCsv(await file.text());

      if (!parsed.headers.length) {
        setError("That file has no heading row.");
        return;
      }

      const mapped = mapRows(parsed, columns);

      if (mapped.missingColumns.length) {
        setError(
          `The file is missing ${mapped.missingColumns.length === 1 ? "a required column" : "required columns"}: ${mapped.missingColumns.join(", ")}. Download the template to see the expected headings.`,
        );
        return;
      }

      if (!mapped.rows.length) {
        setError("That file has headings but no rows.");
        return;
      }

      if (mapped.rows.length > MAX_IMPORT_ROWS) {
        setError(
          `That file has ${mapped.rows.length} rows. Import up to ${MAX_IMPORT_ROWS} at a time.`,
        );
        return;
      }

      // Not fatal: an extra column is usually a working note, and refusing the
      // file over it would be unhelpful. Worth saying so it is not silent.
      if (mapped.unknownColumns.length) {
        setWarnings([
          `Ignoring ${mapped.unknownColumns.length === 1 ? "a column" : "columns"} not in the template: ${mapped.unknownColumns.join(", ")}.`,
        ]);
      }

      setFileName(file.name);
      setRows(mapped.rows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That file could not be read.");
    } finally {
      setReading(false);
    }
  };

  const preview = async () => {
    setError(null);
    try {
      setResult(await runImport({ rows, dryRun: true, onDuplicate }));
      setStage("preview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be checked.");
    }
  };

  const commit = async () => {
    setError(null);
    try {
      setResult(await runImport({ rows, dryRun: false, onDuplicate }));
      setStage("done");
      onImported();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The import could not be completed.");
    }
  };

  const counts = result?.counts;
  const willWrite = (counts?.create ?? 0) + (counts?.update ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {stage === "choose" ? (
            <>
              <div className="rounded-xl border border-border/60 bg-muted/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Start from the template
                    </p>
                    <p className="text-xs text-muted-foreground">
                      It has the exact headings, and one example row to edit.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => downloadTemplate(templateName, columns)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download template
                  </Button>
                </div>

                <dl className="mt-4 space-y-1.5 border-t border-border/60 pt-3">
                  {columns.map(column => (
                    <div key={column.key} className="flex flex-wrap gap-x-2 text-xs">
                      <dt className="font-medium text-foreground">
                        {column.header}
                        {column.required ? (
                          <span className="text-destructive"> *</span>
                        ) : null}
                      </dt>
                      <dd className="text-muted-foreground">{column.hint}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  <span className="text-destructive">*</span> required · up to{" "}
                  {MAX_IMPORT_ROWS} rows per file
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-file">Your file</Label>
                <input
                  ref={fileInput}
                  id="import-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) void readFile(file);
                  }}
                  className="block w-full cursor-pointer rounded-lg border border-border/60 bg-background px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
                />
                {fileName ? (
                  <p className="text-xs text-muted-foreground">
                    Read <span className="font-medium text-foreground">{fileName}</span> —{" "}
                    {rows.length} row{rows.length === 1 ? "" : "s"} found.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    CSV only. Save a spreadsheet as CSV before uploading.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-duplicates">
                  When a {noun.replace(/s$/, "")} is already on file
                </Label>
                <Select
                  value={onDuplicate}
                  onValueChange={value => setOnDuplicate(value as typeof onDuplicate)}
                >
                  <SelectTrigger id="import-duplicates">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Leave it alone</SelectItem>
                    <SelectItem value="update">Update it from the file</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          {stage !== "choose" && counts ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="gap-1">
                  <PlusCircle className="h-3 w-3" />
                  {counts.create} to add
                </Badge>
                {counts.update > 0 ? (
                  <Badge variant="secondary" className="gap-1">
                    <RefreshCw className="h-3 w-3" />
                    {counts.update} to update
                  </Badge>
                ) : null}
                {counts.skip > 0 ? (
                  <Badge variant="outline" className="gap-1">
                    <MinusCircle className="h-3 w-3" />
                    {counts.skip} skipped
                  </Badge>
                ) : null}
                {counts.error > 0 ? (
                  <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    {counts.error} with problems
                  </Badge>
                ) : null}
              </div>

              {stage === "preview" && counts.error > 0 ? (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                  Rows with problems are left out. The other {willWrite} will still be
                  imported — fix those rows and import them again afterwards.
                </p>
              ) : null}

              {stage === "done" ? (
                <p className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Imported. {counts.create} added
                  {counts.update > 0 ? `, ${counts.update} updated` : ""}
                  {counts.error > 0 ? `, ${counts.error} left out` : ""}.
                </p>
              ) : null}

              {result?.newCategories?.length ? (
                <p className="text-xs text-muted-foreground">
                  {stage === "done" ? "Created" : "Will create"}{" "}
                  {result.newCategories.length} new categor
                  {result.newCategories.length === 1 ? "y" : "ies"}:{" "}
                  {result.newCategories.join(", ")}.
                </p>
              ) : null}

              <div className="max-h-72 overflow-y-auto rounded-xl border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Row</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-28">Action</TableHead>
                      <TableHead>Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result?.outcomes.map(outcome => {
                      const style = ACTION_STYLE[outcome.action];
                      const Icon = style.icon;
                      return (
                        <TableRow key={outcome.line}>
                          <TableCell className="text-xs text-muted-foreground tabular-nums">
                            {outcome.line}
                          </TableCell>
                          <TableCell className="text-sm font-medium">{outcome.label}</TableCell>
                          <TableCell>
                            <span className={`flex items-center gap-1 text-xs ${style.tone}`}>
                              <Icon className="h-3 w-3 shrink-0" />
                              <span className="capitalize">{outcome.action}</span>
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {outcome.message}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}

          {warnings.map(warning => (
            <p
              key={warning}
              className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
            >
              {warning}
            </p>
          ))}

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          {stage === "done" ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => (stage === "preview" ? reset() : onOpenChange(false))}
              >
                {stage === "preview" ? "Choose another file" : "Cancel"}
              </Button>

              {stage === "choose" ? (
                <Button
                  className="gap-2"
                  disabled={!rows.length || reading || isPending}
                  onClick={preview}
                >
                  {reading || isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileUp className="h-4 w-4" />
                  )}
                  Check {rows.length || ""} row{rows.length === 1 ? "" : "s"}
                </Button>
              ) : (
                <Button className="gap-2" disabled={isPending || willWrite === 0} onClick={commit}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {willWrite === 0
                    ? "Nothing to import"
                    : `Import ${willWrite} ${willWrite === 1 ? noun.replace(/s$/, "") : noun}`}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
