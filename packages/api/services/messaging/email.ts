import nodemailer, { type Transporter } from "nodemailer";
import type { EmailConfig } from "./config";
import type { SendResult } from "./sms";

/**
 * Gmail, over SMTP, using an app password.
 *
 * An app password rather than the account password because Google refuses
 * plain password SMTP on any account with two-step verification, which is
 * every account worth using. The school generates one at
 * myaccount.google.com/apppasswords and pastes it into the settings page.
 *
 * Nothing here is Gmail-specific beyond the default host, so a school on
 * another provider only has to change the host and port.
 */

let cached: { key: string; transporter: Transporter } | null = null;

/** Changing any connection field must produce a new transport, not reuse the old one. */
function configKey(config: EmailConfig): string {
  return [config.host, config.port, config.secure, config.user, config.appPassword].join("|");
}

function buildTransport(config: EmailConfig): Transporter {
  const key = configKey(config);
  if (cached?.key === key) return cached.transporter;

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // Port 465 is implicit TLS; 587 starts plaintext and upgrades. Getting
    // this pair wrong is the usual cause of a connection that hangs.
    secure: config.secure || config.port === 465,
    auth: { user: config.user, pass: config.appPassword },
  });

  cached = { key, transporter };
  return transporter;
}

/** Dropped so the next send rebuilds with whatever was just saved. */
export function resetEmailTransport(): void {
  cached = null;
}

export function describeEmailConfig(config: EmailConfig): string | null {
  if (!config.host) return "No SMTP host has been saved.";
  if (!config.fromAddress) return "No sending address has been saved.";
  if (!config.user) return "No SMTP username has been saved.";
  if (!config.appPassword) return "No app password has been saved.";
  return null;
}

export async function sendEmail(
  config: EmailConfig,
  to: string,
  subject: string,
  body: string,
): Promise<SendResult> {
  const problem = describeEmailConfig(config);
  if (problem) return { ok: false, error: problem };
  if (!to.includes("@")) return { ok: false, error: `"${to}" is not an email address.` };

  try {
    const info = await buildTransport(config).sendMail({
      from: config.fromName ? `"${config.fromName}" <${config.fromAddress}>` : config.fromAddress,
      to,
      subject,
      text: body,
      html: toHtml(body),
    });
    return { ok: true, detail: info.messageId };
  } catch (error) {
    return {
      ok: false,
      error: (error instanceof Error ? error.message : "Unknown email error.").slice(0, 300),
    };
  }
}

/** Proves the credentials before anyone relies on them for a real message. */
export async function verifyEmail(config: EmailConfig): Promise<SendResult> {
  const problem = describeEmailConfig(config);
  if (problem) return { ok: false, error: problem };

  try {
    await buildTransport(config).verify();
    return { ok: true, detail: `Connected to ${config.host}:${config.port}.` };
  } catch (error) {
    return {
      ok: false,
      error: (error instanceof Error ? error.message : "Could not connect.").slice(0, 300),
    };
  }
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * The plain-text body, wrapped for mail clients that prefer HTML.
 *
 * Templates are written as prose by school staff, so the text version is the
 * real one and this is a faithful rendering of it - escaped, with paragraphs
 * where the blank lines are. Nothing is interpreted as markup, because a
 * student's name is allowed to contain an ampersand.
 */
function toHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map(block =>
      block
        .split("\n")
        .map(line => line.replace(/[&<>"']/g, character => ESCAPES[character] ?? character))
        .join("<br />"),
    )
    .filter(Boolean)
    .map(block => `<p style="margin:0 0 16px">${block}</p>`)
    .join("");

  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#263746">${paragraphs}</div>`;
}
