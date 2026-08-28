import { inArray } from "drizzle-orm";
import { systemSettings } from "@blush/db/schema";
import type { DbExecutor } from "../../dbOrThrow";
import type { NotificationType } from "../notify";

/**
 * Messaging configuration: what the school sends, over which channels, using
 * whose credentials.
 *
 * Two sources, in that order of precedence. An environment variable always
 * wins, so a production deployment can keep its credentials out of the
 * database entirely; otherwise the values saved on the settings page are used,
 * which is what makes this configurable by an administrator rather than by a
 * redeploy.
 */

export const MESSAGING_KEYS = ["messaging.sms", "messaging.email", "messaging.events"] as const;

/** Stands in for a stored secret everywhere one would otherwise be returned. */
export const SECRET_MASK = "********";

export type SmsConfig = {
  enabled: boolean;
  /** Left configurable so a provider URL change does not need a deploy. */
  baseUrl: string;
  senderId: string;
  apiKey: string;
};

export type EmailConfig = {
  enabled: boolean;
  host: string;
  port: number;
  /** Gmail wants 587 with STARTTLS; 465 is implicit TLS. */
  secure: boolean;
  fromName: string;
  fromAddress: string;
  /** The SMTP username. Gmail uses the address itself. */
  user: string;
  /** A Google app password, not the account password. */
  appPassword: string;
};

export type ChannelRule = { email: boolean; sms: boolean };

export type EventsConfig = {
  /** Off by default, so wiring the credentials up does not start a send. */
  masterEnabled: boolean;
  events: Record<string, ChannelRule>;
  templates: Record<string, { subject: string; email: string; sms: string }>;
};

export type MessagingConfig = {
  sms: SmsConfig;
  email: EmailConfig;
  events: EventsConfig;
};

/** The events a student or applicant is actually told about. */
export const MESSAGED_EVENTS: Array<{
  type: NotificationType;
  label: string;
  description: string;
}> = [
  {
    type: "application_submitted",
    label: "Application received",
    description: "Sent the moment an application is submitted, from the website or the desk.",
  },
  {
    type: "application_approved",
    label: "Application approved",
    description: "Sent when an application is accepted and a student record is opened.",
  },
  {
    type: "application_rejected",
    label: "Application declined",
    description: "Sent when an application is turned down.",
  },
  {
    type: "missing_document",
    label: "More information needed",
    description: "Sent when a reviewer asks the applicant for something further.",
  },
  {
    type: "payment_received",
    label: "Payment received",
    description: "Sent for every fee payment, whether taken at the desk or paid online.",
  },
  {
    type: "outstanding_fee",
    label: "Fee reminder",
    description: "Sent when a balance is chased.",
  },
  {
    type: "certificate_issued",
    label: "Certificate issued",
    description: "Sent when a certificate is awarded.",
  },
];

const DEFAULT_SMS: SmsConfig = {
  enabled: false,
  baseUrl: "https://api.mnotify.com/api/sms/quick",
  senderId: "",
  apiKey: "",
};

const DEFAULT_EMAIL: EmailConfig = {
  enabled: false,
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  fromName: "",
  fromAddress: "",
  user: "",
  appPassword: "",
};

/**
 * Wording for each event.
 *
 * `{{placeholders}}` are filled from the event's own facts. A template that
 * asks for something the event does not carry renders as an empty string
 * rather than leaving the braces in the message.
 */
export const DEFAULT_TEMPLATES: EventsConfig["templates"] = {
  application_submitted: {
    subject: "We have your application, {{name}}",
    email:
      "Hello {{name}},\n\nThank you for applying to {{school}} for {{course}}. Your reference is {{reference}}.\n\nWe will review your application and be in touch. Keep this reference safe - you will need it to check your progress.\n\n{{school}}",
    sms: "{{school}}: Hi {{name}}, we have received your application for {{course}}. Reference {{reference}}. We will be in touch.",
  },
  application_approved: {
    subject: "Your application has been accepted",
    email:
      "Hello {{name}},\n\nCongratulations - your application for {{course}} has been accepted. Your student number is {{reference}}.\n\nWe will contact you shortly with what happens next.\n\n{{school}}",
    sms: "{{school}}: Congratulations {{name}}, your application for {{course}} is approved. Student number {{reference}}.",
  },
  application_rejected: {
    subject: "About your application",
    email:
      "Hello {{name}},\n\nThank you for your interest in {{course}}. On this occasion we are not able to offer you a place.\n\n{{note}}\n\nYou are welcome to apply again.\n\n{{school}}",
    sms: "{{school}}: Hi {{name}}, thank you for applying for {{course}}. We are unable to offer a place this time.",
  },
  missing_document: {
    subject: "We need a little more for your application",
    email:
      "Hello {{name}},\n\nWe need some more information before we can finish reviewing your application {{reference}}.\n\n{{note}}\n\n{{school}}",
    sms: "{{school}}: Hi {{name}}, we need more information for application {{reference}}. Please get in touch.",
  },
  payment_received: {
    subject: "Payment received - {{amount}}",
    email:
      "Hello {{name}},\n\nWe have received your payment of {{amount}}. Receipt reference {{reference}}.\n\n{{balance}}\n\nThank you.\n\n{{school}}",
    sms: "{{school}}: Payment of {{amount}} received. Ref {{reference}}. {{balance}}",
  },
  outstanding_fee: {
    subject: "A reminder about your fees",
    email:
      "Hello {{name}},\n\nOur records show an outstanding balance of {{amount}} on your account.\n\nPlease get in touch if you would like to arrange a payment plan.\n\n{{school}}",
    sms: "{{school}}: Hi {{name}}, your outstanding fee balance is {{amount}}. Please contact us to arrange payment.",
  },
  certificate_issued: {
    subject: "Your certificate is ready",
    email:
      "Hello {{name}},\n\nYour certificate for {{course}} has been issued. Certificate number {{reference}}.\n\nCongratulations on completing your programme.\n\n{{school}}",
    sms: "{{school}}: Congratulations {{name}}, your certificate for {{course}} is ready. Number {{reference}}.",
  },
};

const DEFAULT_EVENTS: EventsConfig = {
  masterEnabled: false,
  events: Object.fromEntries(
    MESSAGED_EVENTS.map(event => [event.type, { email: true, sms: false }]),
  ),
  templates: DEFAULT_TEMPLATES,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Reads the whole messaging configuration, secrets included.
 *
 * Server-side only. Nothing that returns to a browser may call this without
 * going through `redact` first.
 */
export async function readMessagingConfig(db: DbExecutor): Promise<MessagingConfig> {
  const rows = await db
    .select({ key: systemSettings.key, value: systemSettings.value })
    .from(systemSettings)
    .where(inArray(systemSettings.key, [...MESSAGING_KEYS]));

  const byKey = new Map(rows.map(row => [row.key, row.value]));

  const smsStored = asRecord(byKey.get("messaging.sms"));
  const emailStored = asRecord(byKey.get("messaging.email"));
  const eventsStored = asRecord(byKey.get("messaging.events"));

  const sms: SmsConfig = {
    enabled: bool(smsStored.enabled, DEFAULT_SMS.enabled),
    baseUrl: process.env.MNOTIFY_BASE_URL ?? str(smsStored.baseUrl, DEFAULT_SMS.baseUrl),
    senderId: process.env.MNOTIFY_SENDER_ID ?? str(smsStored.senderId, ""),
    apiKey: process.env.MNOTIFY_API_KEY ?? str(smsStored.apiKey, ""),
  };

  const port = Number(emailStored.port);
  const email: EmailConfig = {
    enabled: bool(emailStored.enabled, DEFAULT_EMAIL.enabled),
    host: process.env.SMTP_HOST ?? str(emailStored.host, DEFAULT_EMAIL.host),
    port: Number(process.env.SMTP_PORT) || (Number.isFinite(port) && port > 0 ? port : 587),
    secure: bool(emailStored.secure, DEFAULT_EMAIL.secure),
    fromName: str(emailStored.fromName, ""),
    fromAddress: process.env.SMTP_FROM ?? str(emailStored.fromAddress, ""),
    user: process.env.SMTP_USER ?? str(emailStored.user, str(emailStored.fromAddress, "")),
    appPassword: process.env.SMTP_PASSWORD ?? str(emailStored.appPassword, ""),
  };

  const storedEvents = asRecord(eventsStored.events);
  const storedTemplates = asRecord(eventsStored.templates);

  const events: EventsConfig = {
    masterEnabled: bool(eventsStored.masterEnabled, DEFAULT_EVENTS.masterEnabled),
    events: Object.fromEntries(
      MESSAGED_EVENTS.map(event => {
        const rule = asRecord(storedEvents[event.type]);
        const fallback = DEFAULT_EVENTS.events[event.type] ?? { email: true, sms: false };
        return [
          event.type,
          { email: bool(rule.email, fallback.email), sms: bool(rule.sms, fallback.sms) },
        ];
      }),
    ),
    templates: Object.fromEntries(
      MESSAGED_EVENTS.map(event => {
        const stored = asRecord(storedTemplates[event.type]);
        const fallback = DEFAULT_TEMPLATES[event.type] ?? { subject: "", email: "", sms: "" };
        return [
          event.type,
          {
            subject: str(stored.subject, fallback.subject),
            email: str(stored.email, fallback.email),
            sms: str(stored.sms, fallback.sms),
          },
        ];
      }),
    ),
  };

  return { sms, email, events };
}

/**
 * The same configuration, safe to hand to a browser.
 *
 * A stored secret becomes a fixed mask, and a secret supplied by the
 * environment is reported as such and cannot be edited from the settings page
 * - it is not the settings page's to change.
 */
export function redact(config: MessagingConfig) {
  return {
    sms: {
      enabled: config.sms.enabled,
      baseUrl: config.sms.baseUrl,
      senderId: config.sms.senderId,
      apiKeySet: Boolean(config.sms.apiKey),
      apiKey: config.sms.apiKey ? SECRET_MASK : "",
      apiKeyFromEnv: Boolean(process.env.MNOTIFY_API_KEY),
    },
    email: {
      enabled: config.email.enabled,
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      fromName: config.email.fromName,
      fromAddress: config.email.fromAddress,
      user: config.email.user,
      appPasswordSet: Boolean(config.email.appPassword),
      appPassword: config.email.appPassword ? SECRET_MASK : "",
      appPasswordFromEnv: Boolean(process.env.SMTP_PASSWORD),
    },
    events: config.events,
  };
}

/**
 * Keeps the stored secret when the form sends the mask back.
 *
 * The settings page never receives the real value, so an untouched password
 * field returns exactly the mask it was given. Writing that through would
 * replace a working credential with eight asterisks the first time somebody
 * saved an unrelated field on the same card.
 */
export function keepSecret(incoming: string | undefined, stored: string): string {
  if (incoming === undefined) return stored;
  if (incoming === SECRET_MASK) return stored;
  return incoming;
}
