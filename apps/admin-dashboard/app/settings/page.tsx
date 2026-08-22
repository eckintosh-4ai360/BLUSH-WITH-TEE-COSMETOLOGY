"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@blush/ui/components/ui/button";
import { Input } from "@blush/ui/components/ui/input";
import { Label } from "@blush/ui/components/ui/label";
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { toast } from "@blush/ui/components/ui/sonner";
import { Switch } from "@blush/ui/components/ui/switch";
import DashboardLayout from "@/components/DashboardLayout";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

const CATEGORY_LABELS: Record<string, { title: string; description: string }> = {
  school: {
    title: "School",
    description: "Identity used on receipts, letters and certificates.",
  },
  financial: {
    title: "Financial",
    description: "Currency, tax and receipt configuration.",
  },
  ecommerce: {
    title: "E-commerce",
    description: "Delivery and store rules applied at checkout.",
  },
  academic: {
    title: "Academic",
    description: "Grading bands, attendance rules and certificate settings.",
  },
};

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <PermissionGate anyOf={["settings.read"]}>
        <SettingsContent />
      </PermissionGate>
    </DashboardLayout>
  );
}

function SettingsContent() {
  const { can } = usePermissions();
  const query = trpc.platform.settings.useQuery();

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          These values feed the whole platform - the public site, receipts, certificates and the
          rules the system applies.
        </p>
      </header>

      {query.isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map(index => (
            <Skeleton key={index} className="h-52 w-full rounded-2xl" />
          ))}
        </div>
      ) : !query.data?.length ? (
        <p className="rounded-2xl bg-muted/40 px-6 py-16 text-center text-sm text-muted-foreground">
          No settings have been initialised yet.
        </p>
      ) : (
        query.data.map(group => (
          <section key={group.category} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                {CATEGORY_LABELS[group.category]?.title ?? group.category}
              </h2>
              <p className="text-xs text-muted-foreground">
                {CATEGORY_LABELS[group.category]?.description ?? ""}
              </p>
            </div>

            <div className="space-y-3">
              {group.entries.map(entry => (
                <SettingCard
                  key={entry.key}
                  settingKey={entry.key}
                  description={entry.description}
                  value={entry.value}
                  readOnly={!can("settings.write")}
                  onSaved={() => query.refetch()}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

type Primitive = string | number | boolean;

/**
 * Edits one setting.
 *
 * Flat string, number and boolean fields get proper inputs. Anything nested -
 * the grading bands, for instance - is edited as JSON with validation, rather
 * than pretending a generic form can express it.
 */
function SettingCard({
  settingKey,
  description,
  value,
  readOnly,
  onSaved,
}: {
  settingKey: string;
  description: string | null;
  value: unknown;
  readOnly: boolean;
  onSaved: () => void;
}) {
  const record = (value ?? {}) as Record<string, unknown>;
  const isFlat =
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(record).every(
      entry => typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean",
    );

  const [draft, setDraft] = useState<Record<string, Primitive>>({});
  const [json, setJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (isFlat) setDraft(record as Record<string, Primitive>);
    else setJson(JSON.stringify(value, null, 2));
    setJsonError(null);
    // The stored value is the only input that should reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value), isFlat]);

  const save = trpc.platform.updateSetting.useMutation({
    onSuccess: () => {
      toast.success("Setting saved.");
      onSaved();
    },
    onError: error => toast.error(error.message),
  });

  return (
    <article className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-mono text-xs text-muted-foreground">{settingKey}</h3>
          {description ? (
            <p className="mt-1 text-sm text-foreground">{description}</p>
          ) : null}
        </div>
        {!readOnly ? (
          <Button
            size="sm"
            className="gap-2"
            disabled={save.isPending || Boolean(jsonError)}
            onClick={() => {
              if (isFlat) {
                save.mutate({ key: settingKey, value: draft });
                return;
              }
              try {
                save.mutate({ key: settingKey, value: JSON.parse(json) });
                setJsonError(null);
              } catch {
                setJsonError("That is not valid JSON.");
              }
            }}
          >
            {save.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        ) : null}
      </div>

      {isFlat ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {Object.entries(draft).map(([field, fieldValue]) => (
            <div key={field} className="space-y-2">
              <Label htmlFor={`${settingKey}-${field}`} className="capitalize">
                {field.replace(/([A-Z])/g, " $1").toLowerCase()}
              </Label>
              {typeof fieldValue === "boolean" ? (
                <div className="flex h-9 items-center">
                  <Switch
                    id={`${settingKey}-${field}`}
                    checked={fieldValue}
                    disabled={readOnly}
                    onCheckedChange={checked =>
                      setDraft(current => ({ ...current, [field]: checked }))
                    }
                  />
                </div>
              ) : (
                <Input
                  id={`${settingKey}-${field}`}
                  value={String(fieldValue)}
                  disabled={readOnly}
                  inputMode={typeof fieldValue === "number" ? "decimal" : undefined}
                  onChange={event =>
                    setDraft(current => ({
                      ...current,
                      [field]:
                        typeof fieldValue === "number"
                          ? Number(event.target.value) || 0
                          : event.target.value,
                    }))
                  }
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <Label htmlFor={`${settingKey}-json`} className="text-xs">
            Value (JSON)
          </Label>
          <textarea
            id={`${settingKey}-json`}
            value={json}
            disabled={readOnly}
            rows={8}
            onChange={event => {
              setJson(event.target.value);
              setJsonError(null);
            }}
            className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          {jsonError ? (
            <p role="alert" className="text-xs text-destructive">
              {jsonError}
            </p>
          ) : null}
        </div>
      )}
    </article>
  );
}
