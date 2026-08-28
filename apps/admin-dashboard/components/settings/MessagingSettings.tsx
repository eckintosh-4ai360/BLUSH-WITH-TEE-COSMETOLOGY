"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Save,
  Send,
  X,
} from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import { Input } from "@blush/ui/components/ui/input";
import { Label } from "@blush/ui/components/ui/label";
import { Skeleton } from "@blush/ui/components/ui/skeleton";
import { toast } from "@blush/ui/components/ui/sonner";
import { Switch } from "@blush/ui/components/ui/switch";
import { Textarea } from "@blush/ui/components/ui/textarea";
import { trpc } from "@/lib/trpc";

/** Matches the server's mask; an untouched field sends this straight back. */
const SECRET_MASK = "********";

type ChannelRule = { email: boolean; sms: boolean };
type Template = { subject: string; email: string; sms: string };

/**
 * Messaging setup: the credentials, what gets sent, and in what words.
 *
 * Kept apart from the generic settings editor because these rows hold
 * secrets. Nothing here ever receives the real API key or app password - the
 * server sends a mask, and a field left untouched sends the mask back, which
 * the server reads as "leave it alone".
 */
export function MessagingSettings({ readOnly }: { readOnly: boolean }) {
  const config = trpc.messaging.config.useQuery();

  if (config.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (config.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {config.error.message}
      </p>
    );
  }

  if (!config.data) return null;

  return (
    <div className="space-y-4">
      <SmsCard data={config.data.sms} readOnly={readOnly} onSaved={() => config.refetch()} />
      <EmailCard data={config.data.email} readOnly={readOnly} onSaved={() => config.refetch()} />
      <EventsCard
        data={config.data.events}
        meta={config.data.events_meta}
        readOnly={readOnly}
        onSaved={() => config.refetch()}
      />
      <DeliveryLog readOnly={readOnly} />
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  description,
  status,
  children,
  footer,
}: {
  icon: typeof Mail;
  title: string;
  description: string;
  status?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {status}
      </div>
      <div className="mt-5 space-y-4">{children}</div>
      {footer ? <div className="mt-5 flex flex-wrap gap-2">{footer}</div> : null}
    </article>
  );
}

function ConfiguredBadge({ set, fromEnv }: { set: boolean; fromEnv: boolean }) {
  if (fromEnv) {
    return (
      <Badge className="bg-sky-500/15 text-sky-800 hover:bg-sky-500/15 dark:text-sky-300">
        Set by environment
      </Badge>
    );
  }
  return set ? (
    <Badge className="bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-300">
      Configured
    </Badge>
  ) : (
    <Badge className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300">
      Not set up
    </Badge>
  );
}

/** Sends one message to an address the operator types, and shows the answer. */
function TestSend({ channel, disabled }: { channel: "email" | "sms"; disabled: boolean }) {
  const [to, setTo] = useState("");
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const test = trpc.messaging.test.useMutation({
    onSuccess: setResult,
    onError: error => setResult({ ok: false, detail: error.message }),
  });

  return (
    <div className="w-full space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
      <Label htmlFor={`test-${channel}`} className="text-xs">
        {channel === "sms" ? "Send a test text to" : "Send a test email to"}
      </Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={`test-${channel}`}
          value={to}
          onChange={event => setTo(event.target.value)}
          placeholder={channel === "sms" ? "024 000 0000" : "you@example.com"}
          className="h-9 max-w-xs flex-1"
        />
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={disabled || !to.trim() || test.isPending}
          onClick={() => {
            setResult(null);
            test.mutate({ channel, to: to.trim() });
          }}
        >
          {test.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
          Test
        </Button>
      </div>
      {result ? (
        <p
          role="status"
          className={`flex items-start gap-1.5 text-xs ${
            result.ok ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"
          }`}
        >
          {result.ok ? (
            <Check className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <X className="mt-0.5 size-3.5 shrink-0" />
          )}
          <span>{result.detail}</span>
        </p>
      ) : null}
    </div>
  );
}

function SmsCard({
  data,
  readOnly,
  onSaved,
}: {
  data: { enabled: boolean; baseUrl: string; senderId: string; apiKey: string; apiKeySet: boolean; apiKeyFromEnv: boolean };
  readOnly: boolean;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(data.enabled);
  const [senderId, setSenderId] = useState(data.senderId);
  const [baseUrl, setBaseUrl] = useState(data.baseUrl);
  const [apiKey, setApiKey] = useState(data.apiKey);

  useEffect(() => {
    setEnabled(data.enabled);
    setSenderId(data.senderId);
    setBaseUrl(data.baseUrl);
    setApiKey(data.apiKey);
  }, [data]);

  const save = trpc.messaging.saveSms.useMutation({
    onSuccess: () => {
      toast.success("SMS settings saved.");
      onSaved();
    },
    onError: error => toast.error(error.message),
  });

  return (
    <Card
      icon={MessageSquare}
      title="Text messages (mNotify)"
      description="The API key and sender ID from your mNotify account. The sender ID is the name recipients see, and mNotify has to approve it before it will send."
      status={<ConfiguredBadge set={data.apiKeySet} fromEnv={data.apiKeyFromEnv} />}
      footer={
        <>
          {!readOnly ? (
            <Button
              size="sm"
              className="gap-2"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  enabled,
                  baseUrl,
                  senderId,
                  // Untouched, so the mask goes back and the stored key stands.
                  apiKey,
                })
              }
            >
              {save.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Save
            </Button>
          ) : null}
          <TestSend channel="sms" disabled={readOnly} />
        </>
      }
    >
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Send text messages</p>
          <p className="text-xs text-muted-foreground">
            Off means every SMS is logged as skipped rather than sent.
          </p>
        </div>
        <Switch checked={enabled} disabled={readOnly} onCheckedChange={setEnabled} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sms-sender">Sender ID</Label>
          <Input
            id="sms-sender"
            value={senderId}
            disabled={readOnly}
            maxLength={11}
            onChange={event => setSenderId(event.target.value)}
            placeholder="BlushTee"
          />
          <p className="text-xs text-muted-foreground">
            Up to 11 characters, and approved on your mNotify account.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sms-key">API key</Label>
          <Input
            id="sms-key"
            type="password"
            value={apiKey}
            disabled={readOnly || data.apiKeyFromEnv}
            autoComplete="off"
            onChange={event => setApiKey(event.target.value)}
            placeholder="Paste your mNotify API key"
          />
          <p className="text-xs text-muted-foreground">
            {data.apiKeyFromEnv
              ? "Supplied by MNOTIFY_API_KEY, so it cannot be changed here."
              : data.apiKeySet
                ? "A key is saved. Leave this alone unless you are replacing it."
                : "From mNotify: Dashboard, then API settings."}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sms-url">Endpoint</Label>
        <Input
          id="sms-url"
          value={baseUrl}
          disabled={readOnly}
          onChange={event => setBaseUrl(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Only change this if mNotify tells you the address has moved.
        </p>
      </div>
    </Card>
  );
}

function EmailCard({
  data,
  readOnly,
  onSaved,
}: {
  data: {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    fromName: string;
    fromAddress: string;
    user: string;
    appPassword: string;
    appPasswordSet: boolean;
    appPasswordFromEnv: boolean;
  };
  readOnly: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(data);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; detail: string } | null>(null);

  useEffect(() => setForm(data), [data]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(current => ({ ...current, [key]: value }));

  const save = trpc.messaging.saveEmail.useMutation({
    onSuccess: () => {
      toast.success("Email settings saved.");
      onSaved();
    },
    onError: error => toast.error(error.message),
  });

  const verify = trpc.messaging.verifyEmail.useMutation({
    onSuccess: setVerifyResult,
    onError: error => setVerifyResult({ ok: false, detail: error.message }),
  });

  return (
    <Card
      icon={Mail}
      title="Email (Gmail or any SMTP)"
      description="Gmail needs an app password, not your account password - generate one at myaccount.google.com/apppasswords with two-step verification switched on."
      status={<ConfiguredBadge set={data.appPasswordSet} fromEnv={data.appPasswordFromEnv} />}
      footer={
        <>
          {!readOnly ? (
            <>
              <Button
                size="sm"
                className="gap-2"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({
                    enabled: form.enabled,
                    host: form.host,
                    port: form.port,
                    secure: form.secure,
                    fromName: form.fromName,
                    fromAddress: form.fromAddress,
                    user: form.user,
                    appPassword: form.appPassword,
                  })
                }
              >
                {save.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={verify.isPending}
                onClick={() => {
                  setVerifyResult(null);
                  verify.mutate();
                }}
              >
                {verify.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Check connection
              </Button>
            </>
          ) : null}
          {verifyResult ? (
            <p
              role="status"
              className={`flex w-full items-start gap-1.5 text-xs ${
                verifyResult.ok ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"
              }`}
            >
              {verifyResult.ok ? (
                <Check className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <X className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span>{verifyResult.detail}</span>
            </p>
          ) : null}
          <TestSend channel="email" disabled={readOnly} />
        </>
      }
    >
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Send email</p>
          <p className="text-xs text-muted-foreground">
            Off means every email is logged as skipped rather than sent.
          </p>
        </div>
        <Switch
          checked={form.enabled}
          disabled={readOnly}
          onCheckedChange={value => set("enabled", value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="mail-from-name">Sender name</Label>
          <Input
            id="mail-from-name"
            value={form.fromName}
            disabled={readOnly}
            onChange={event => set("fromName", event.target.value)}
            placeholder="Blush With Tee"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mail-from">Sending address</Label>
          <Input
            id="mail-from"
            type="email"
            value={form.fromAddress}
            disabled={readOnly}
            autoComplete="off"
            onChange={event => {
              set("fromAddress", event.target.value);
              // The Gmail username is the address; filled in so nobody has to
              // type it twice, and still editable for other providers.
              if (!form.user || form.user === form.fromAddress) {
                set("user", event.target.value);
              }
            }}
            placeholder="school@gmail.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mail-user">SMTP username</Label>
          <Input
            id="mail-user"
            value={form.user}
            disabled={readOnly}
            autoComplete="off"
            onChange={event => set("user", event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mail-password">App password</Label>
          <Input
            id="mail-password"
            type="password"
            value={form.appPassword}
            disabled={readOnly || data.appPasswordFromEnv}
            autoComplete="off"
            onChange={event => set("appPassword", event.target.value)}
            placeholder="16 characters from Google"
          />
          <p className="text-xs text-muted-foreground">
            {data.appPasswordFromEnv
              ? "Supplied by SMTP_PASSWORD, so it cannot be changed here."
              : data.appPasswordSet
                ? "A password is saved. Leave this alone unless you are replacing it."
                : "Spaces are fine - paste it exactly as Google shows it."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mail-host">SMTP host</Label>
          <Input
            id="mail-host"
            value={form.host}
            disabled={readOnly}
            onChange={event => set("host", event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="mail-port">Port</Label>
          <Input
            id="mail-port"
            inputMode="numeric"
            value={String(form.port)}
            disabled={readOnly}
            onChange={event => set("port", Number(event.target.value) || 0)}
          />
          <p className="text-xs text-muted-foreground">
            587 for Gmail. Use 465 only with TLS switched on below.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Implicit TLS</p>
          <p className="text-xs text-muted-foreground">
            On for port 465. Leave off for 587, which upgrades the connection itself.
          </p>
        </div>
        <Switch
          checked={form.secure}
          disabled={readOnly}
          onCheckedChange={value => set("secure", value)}
        />
      </div>
    </Card>
  );
}

function EventsCard({
  data,
  meta,
  readOnly,
  onSaved,
}: {
  data: {
    masterEnabled: boolean;
    events: Record<string, ChannelRule>;
    templates: Record<string, Template>;
  };
  meta: Array<{ type: string; label: string; description: string }>;
  readOnly: boolean;
  onSaved: () => void;
}) {
  const [master, setMaster] = useState(data.masterEnabled);
  const [events, setEvents] = useState(data.events);
  const [templates, setTemplates] = useState(data.templates);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    setMaster(data.masterEnabled);
    setEvents(data.events);
    setTemplates(data.templates);
  }, [data]);

  const save = trpc.messaging.saveEvents.useMutation({
    onSuccess: () => {
      toast.success("Notification rules saved.");
      onSaved();
    },
    onError: error => toast.error(error.message),
  });

  return (
    <Card
      icon={Send}
      title="What gets sent, and when"
      description="Each event below can go out by email, by text, or both. The wording is yours to change - {{placeholders}} are filled in from the event itself."
      status={
        master ? (
          <Badge className="bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-300">
            Sending
          </Badge>
        ) : (
          <Badge className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300">
            Paused
          </Badge>
        )
      }
      footer={
        !readOnly ? (
          <Button
            size="sm"
            className="gap-2"
            disabled={save.isPending}
            onClick={() => save.mutate({ masterEnabled: master, events, templates })}
          >
            {save.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Save
          </Button>
        ) : null
      }
    >
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Automatic messages</p>
          <p className="text-xs text-muted-foreground">
            The one switch that stops everything. Nothing goes out to anybody while this is off.
          </p>
        </div>
        <Switch checked={master} disabled={readOnly} onCheckedChange={setMaster} />
      </div>

      <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
        {meta.map(event => {
          const rule = events[event.type] ?? { email: false, sms: false };
          const template = templates[event.type] ?? { subject: "", email: "", sms: "" };
          const isOpen = open === event.type;

          return (
            <div key={event.type}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : event.type)}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  aria-expanded={isOpen}
                >
                  <ChevronDown
                    className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{event.label}</span>
                    <span className="block text-xs text-muted-foreground">{event.description}</span>
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-4">
                  {(["email", "sms"] as const).map(channel => (
                    <label key={channel} className="flex items-center gap-2 text-xs">
                      <span className="uppercase tracking-wide text-muted-foreground">
                        {channel}
                      </span>
                      <Switch
                        checked={rule[channel]}
                        disabled={readOnly}
                        aria-label={`${event.label} by ${channel}`}
                        onCheckedChange={value =>
                          setEvents(current => ({
                            ...current,
                            [event.type]: { ...rule, [channel]: value },
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>

              {isOpen ? (
                <div className="space-y-4 border-t border-border/60 bg-muted/20 px-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${event.type}-subject`} className="text-xs">
                      Email subject
                    </Label>
                    <Input
                      id={`${event.type}-subject`}
                      value={template.subject}
                      disabled={readOnly}
                      onChange={changeTemplate(setTemplates, event.type, template, "subject")}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${event.type}-email`} className="text-xs">
                      Email body
                    </Label>
                    <Textarea
                      id={`${event.type}-email`}
                      value={template.email}
                      disabled={readOnly}
                      rows={7}
                      onChange={changeTemplate(setTemplates, event.type, template, "email")}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${event.type}-sms`} className="text-xs">
                      Text message
                    </Label>
                    <Textarea
                      id={`${event.type}-sms`}
                      value={template.sms}
                      disabled={readOnly}
                      rows={3}
                      onChange={changeTemplate(setTemplates, event.type, template, "sms")}
                    />
                    <p className="text-xs text-muted-foreground">
                      {template.sms.length} characters
                      {template.sms.length > 160
                        ? ` - charged as ${Math.ceil(template.sms.length / 160)} messages`
                        : ""}
                      . Placeholders grow when they are filled in, so leave some room.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Available placeholders: <code>{"{{name}}"}</code>, <code>{"{{fullName}}"}</code>,{" "}
        <code>{"{{school}}"}</code>, <code>{"{{course}}"}</code>, <code>{"{{reference}}"}</code>,{" "}
        <code>{"{{amount}}"}</code>, <code>{"{{balance}}"}</code>, <code>{"{{note}}"}</code>. One
        that the event does not carry simply disappears from the message.
      </p>
    </Card>
  );
}

function changeTemplate(
  setTemplates: React.Dispatch<React.SetStateAction<Record<string, Template>>>,
  type: string,
  template: Template,
  field: keyof Template,
) {
  return (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setTemplates(current => ({
      ...current,
      [type]: { ...template, [field]: event.target.value },
    }));
}

const STATUS_TONE: Record<string, string> = {
  sent: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/15",
  queued: "bg-sky-500/15 text-sky-800 dark:text-sky-300 hover:bg-sky-500/15",
  failed: "bg-rose-500/15 text-rose-800 dark:text-rose-300 hover:bg-rose-500/15",
  skipped: "bg-muted text-muted-foreground hover:bg-muted",
};

/** The send log: what went out, what did not, and why not. */
function DeliveryLog({ readOnly }: { readOnly: boolean }) {
  const deliveries = trpc.messaging.deliveries.useQuery();

  const flushQueue = trpc.messaging.flushQueue.useMutation({
    onSuccess: result => {
      toast.success(`${result.sent} sent, ${result.failed} failed.`);
      deliveries.refetch();
    },
    onError: error => toast.error(error.message),
  });

  const retry = trpc.messaging.retry.useMutation({
    onSuccess: () => {
      toast.success("Sent for another try.");
      deliveries.refetch();
    },
    onError: error => toast.error(error.message),
  });

  return (
    <Card
      icon={AlertTriangle}
      title="Recent messages"
      description="Every email and text the system has tried to send, with the reason for anything that did not go out."
      footer={
        !readOnly ? (
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={flushQueue.isPending}
            onClick={() => flushQueue.mutate()}
          >
            {flushQueue.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Send anything waiting
          </Button>
        ) : null
      }
    >
      {deliveries.isLoading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : !deliveries.data?.length ? (
        <p className="rounded-xl bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing has been sent yet.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
          {deliveries.data.map(row => (
            <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {row.recipientName ?? "Unknown"}{" "}
                  <span className="text-muted-foreground">- {row.destination ?? "no address"}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.channel.toUpperCase()} - {row.subject || row.type || "message"} -{" "}
                  {new Date(row.createdAt).toLocaleString("en-GB")}
                </p>
                {row.error ? (
                  <p className="mt-1 text-xs text-muted-foreground">{row.error}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge className={`capitalize ${STATUS_TONE[row.status] ?? ""}`}>{row.status}</Badge>
                {row.status === "failed" && !readOnly ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate({ id: row.id })}
                  >
                    <RefreshCw className="size-3" />
                    Retry
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export { SECRET_MASK };
