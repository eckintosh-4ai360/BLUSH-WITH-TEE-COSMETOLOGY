"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  CreditCard,
  GraduationCap,
  Loader2,
  Mail,
  MessageSquare,
  Receipt,
  Save,
  School,
  ScrollText,
  Search,
  Settings,
  ShoppingBag,
  Sliders,
  Sparkles,
} from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { Input } from "@blush/ui/components/ui/input";
import { Label } from "@blush/ui/components/ui/label";
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { toast } from "@blush/ui/components/ui/sonner";
import { Switch } from "@blush/ui/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@blush/ui/components/ui/tabs";
import DashboardLayout from "@/components/DashboardLayout";
import { PermissionGate } from "@/components/PermissionGate";
import { MessagingSettings } from "@/components/settings/MessagingSettings";
import { TermsSettings } from "@/components/settings/TermsSettings";
import { usePermissions } from "@/hooks/usePermissions";
import { trpc } from "@/lib/trpc";

type CategoryMeta = {
  id: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  badge?: string;
};

const CATEGORIES: CategoryMeta[] = [
  {
    id: "school",
    label: "School & Branding",
    shortLabel: "School",
    icon: Building2,
    description: "School name, campus contact details, social links, and public profiles.",
  },
  {
    id: "terms",
    label: "Policies & Terms",
    shortLabel: "Policies",
    icon: ScrollText,
    description: "Official rules governing the school, code of conduct, and refund disclaimers.",
    badge: "Public Policy",
  },
  {
    id: "messaging",
    label: "Messaging & Alerts",
    shortLabel: "Messaging",
    icon: MessageSquare,
    description: "SMS (mNotify), Email (SMTP), broadcast event triggers, and delivery audit logs.",
  },
  {
    id: "academic",
    label: "Academics & Certs",
    shortLabel: "Academics",
    icon: GraduationCap,
    description: "Grading bands, pass mark thresholds, attendance policies, and certificate numbering.",
  },
  {
    id: "financial",
    label: "Finance & Receipts",
    shortLabel: "Finance",
    icon: Receipt,
    description: "Operating currency, tax rates, receipt prefixes, and payment receipt wording.",
  },
  {
    id: "ecommerce",
    label: "Store & Delivery",
    shortLabel: "Store",
    icon: ShoppingBag,
    description: "Beauty store delivery pricing, free shipping thresholds, and checkout notes.",
  },
];

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
  const [activeCategory, setActiveCategory] = useState<string>("school");
  const [searchQuery, setSearchQuery] = useState("");

  const groupsByCategory = (query.data ?? []).reduce(
    (acc, group) => {
      acc[group.category] = group.entries.filter(e => e.key !== "school.terms");
      return acc;
    },
    {} as Record<string, NonNullable<typeof query.data>[number]["entries"]>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Platform Settings
            </h1>
            <Badge variant="outline" className="border-[#8f0d6b]/30 text-[#8f0d6b] text-xs">
              Config Center
            </Badge>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Configure school identity, governing policies, messaging channels, grading rules, and store logistics.
          </p>
        </div>

        {/* Quick Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter settings..."
            className="h-9 pl-9 text-xs bg-card"
          />
        </div>
      </header>

      {/* Main Tabs Container */}
      <Tabs
        value={activeCategory}
        onValueChange={setActiveCategory}
        className="w-full space-y-6"
      >
        {/* Navigation Tabs Bar */}
        <div className="w-full">
          <TabsList className="h-auto w-full flex flex-wrap items-center justify-start gap-2.5 bg-muted/40 p-2 rounded-2xl border border-border/60">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const entriesCount = groupsByCategory[cat.id]?.length;
              return (
                <TabsTrigger
                  key={cat.id}
                  value={cat.id}
                  className="data-[state=active]:bg-white data-[state=active]:text-[#8f0d6b] data-[state=active]:shadow-sm data-[state=active]:border-[#8f0d6b]/25 dark:data-[state=active]:bg-card rounded-xl py-2 px-3.5 text-xs font-semibold transition-all flex items-center justify-center shrink-0 border border-transparent hover:bg-white/50 text-muted-foreground"
                >
                  <Icon className="h-4 w-4 shrink-0 text-[#8f0d6b] mr-2" />
                  <span className="whitespace-nowrap">{cat.label}</span>
                  {cat.badge ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-[#faeaf6] text-[#8f0d6b] px-2 py-0.5 text-[10px] font-bold border border-[#8f0d6b]/20">
                      {cat.badge}
                    </span>
                  ) : entriesCount ? (
                    <span className="ml-2 inline-flex items-center justify-center rounded-full bg-muted-foreground/10 text-muted-foreground px-1.5 py-0.5 text-[10px] font-medium min-w-[18px]">
                      {entriesCount}
                    </span>
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Loading Skeleton */}
        {query.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        ) : null}

        {/* 1. School & Branding Tab */}
        <TabsContent value="school" className="space-y-4 outline-none">
          <CategoryHeader
            icon={Building2}
            title="School &amp; Branding"
            description="School identity used on receipts, public website headers, letters, and certificates."
          />
          <div className="space-y-4">
            {(groupsByCategory["school"] ?? [])
              .filter(entry =>
                !searchQuery.trim() ||
                entry.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (entry.description || "").toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map(entry => (
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
        </TabsContent>

        {/* 2. Policies & Terms Tab */}
        <TabsContent value="terms" className="space-y-4 outline-none">
          <CategoryHeader
            icon={ScrollText}
            title="School Policies &amp; Terms &amp; Conditions"
            description="The 10 official governing rules, dress code, attendance hours, student modeling, and fee refund disclaimers displayed on the public site and admission portal."
          />
          <TermsSettings readOnly={!can("settings.write")} />
        </TabsContent>

        {/* 3. Messaging & Alerts Tab */}
        <TabsContent value="messaging" className="space-y-4 outline-none">
          <CategoryHeader
            icon={MessageSquare}
            title="Messaging Channels &amp; Automated Broadcasts"
            description="Configure mNotify SMS credentials, SMTP email servers, announcement trigger events, and inspect message dispatch logs."
          />
          <MessagingSettings readOnly={!can("settings.write")} />
        </TabsContent>

        {/* 4. Academics & Certs Tab */}
        <TabsContent value="academic" className="space-y-4 outline-none">
          <CategoryHeader
            icon={GraduationCap}
            title="Academic &amp; Certification Rules"
            description="Configure assessment grade bands, passing mark thresholds, minimum attendance requirements, and certificate serial numbering."
          />
          <div className="space-y-4">
            {(groupsByCategory["academic"] ?? [])
              .filter(entry =>
                !searchQuery.trim() ||
                entry.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (entry.description || "").toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map(entry => (
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
        </TabsContent>

        {/* 5. Finance & Receipts Tab */}
        <TabsContent value="financial" className="space-y-4 outline-none">
          <CategoryHeader
            icon={Receipt}
            title="Finance &amp; Receipt Configuration"
            description="Set default transaction currency, tax computation rules, official receipt sequence prefixes, and printed receipt footer notes."
          />
          <div className="space-y-4">
            {(groupsByCategory["financial"] ?? [])
              .filter(entry =>
                !searchQuery.trim() ||
                entry.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (entry.description || "").toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map(entry => (
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
        </TabsContent>

        {/* 6. Store & Delivery Tab */}
        <TabsContent value="ecommerce" className="space-y-4 outline-none">
          <CategoryHeader
            icon={ShoppingBag}
            title="Store &amp; Delivery Logistics"
            description="Manage campus store delivery pricing rules, free shipping order amounts, and delivery notes displayed at checkout."
          />
          <div className="space-y-4">
            {(groupsByCategory["ecommerce"] ?? [])
              .filter(entry =>
                !searchQuery.trim() ||
                entry.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (entry.description || "").toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map(entry => (
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CategoryHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3.5 rounded-2xl border border-border/60 bg-gradient-to-r from-card via-[#fdf2fa]/30 to-card p-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#faeaf6] text-[#8f0d6b]">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

type Primitive = string | number | boolean;

/**
 * Edits one setting card.
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
      entry => typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean"
    );

  const [draft, setDraft] = useState<Record<string, Primitive>>({});
  const [json, setJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (isFlat) setDraft(record as Record<string, Primitive>);
    else setJson(JSON.stringify(value, null, 2));
    setJsonError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value), isFlat]);

  const save = trpc.platform.updateSetting.useMutation({
    onSuccess: () => {
      toast.success(`Saved setting "${settingKey}".`);
      onSaved();
    },
    onError: error => toast.error(error.message),
  });

  return (
    <article className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all hover:border-[#8f0d6b]/25">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/40 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground">
              {settingKey}
            </span>
          </div>
          {description ? (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {!readOnly ? (
          <Button
            size="sm"
            className="gap-1.5 text-xs bg-[#8f0d6b] text-white hover:bg-[#720a55] shadow-sm"
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
            Save Changes
          </Button>
        ) : null}
      </div>

      {isFlat ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {Object.entries(draft).map(([field, fieldValue]) => (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={`${settingKey}-${field}`} className="capitalize text-xs font-semibold text-foreground">
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
                  className="h-9 text-xs bg-background border-border"
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <Label htmlFor={`${settingKey}-json`} className="text-xs font-semibold text-foreground">
            Structured Configuration (JSON)
          </Label>
          <textarea
            id={`${settingKey}-json`}
            value={json}
            disabled={readOnly}
            rows={7}
            onChange={event => {
              setJson(event.target.value);
              setJsonError(null);
            }}
            className="w-full rounded-xl border border-border bg-background p-3 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[#8f0d6b]/30 disabled:opacity-60 leading-relaxed"
          />
          {jsonError ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {jsonError}
            </p>
          ) : null}
        </div>
      )}
    </article>
  );
}
