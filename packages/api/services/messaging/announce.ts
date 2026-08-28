import { eq } from "drizzle-orm";
import { notifications, systemSettings } from "@blush/db/schema";
import type { DbExecutor } from "../../dbOrThrow";
import type { NotificationType } from "../notify";
import { readMessagingConfig, type MessagingConfig } from "./config";
import { queueMessages } from "./dispatch";

export type AnnounceInput = {
  type: NotificationType;
  recipient: {
    name: string;
    email?: string | null;
    phone?: string | null;
    /** Present only when this person has a sign-in. */
    userId?: number | null;
  };
  /** In-app heading. The email subject comes from the template instead. */
  title: string;
  body?: string;
  /** Fills the `{{placeholders}}` in the email and SMS templates. */
  facts?: Record<string, string | number | null | undefined>;
  entityType?: string;
  entityId?: number;
  link?: string;
};

/**
 * Tells one person that something happened, on every channel they are due.
 *
 * The distinction this exists to handle is that most people the school writes
 * to have no account. An applicant is told their application arrived and
 * whether it was accepted long before there is a student record, let alone a
 * sign-in - so the in-app notification is the optional part here, and the
 * email and text are the parts that always apply.
 *
 * Call it inside the transaction that caused the event. Nothing is sent from
 * here; `flushInBackground` does that once the transaction has committed.
 */
export async function announce(
  db: DbExecutor,
  input: AnnounceInput,
  config?: MessagingConfig,
): Promise<void> {
  const resolved = config ?? (await readMessagingConfig(db));

  let notificationId: number | undefined;

  if (input.recipient.userId) {
    const [created] = await db
      .insert(notifications)
      .values({
        userId: input.recipient.userId,
        type: input.type,
        title: input.title.slice(0, 180),
        body: input.body ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        link: input.link ?? null,
      })
      .returning({ id: notifications.id });
    notificationId = created?.id;
  }

  await queueMessages(db, resolved, {
    type: input.type,
    recipient: {
      name: input.recipient.name,
      email: input.recipient.email,
      phone: input.recipient.phone,
    },
    facts: {
      school: await schoolName(db),
      name: firstName(input.recipient.name),
      fullName: input.recipient.name,
      ...input.facts,
    },
    notificationId,
  });
}

/**
 * "Hello Ama," rather than "Hello Ama Serwaa Mensah,".
 *
 * Messages are addressed the way a person at the desk would say it. The full
 * name stays available as `{{fullName}}` for the templates that want it.
 */
function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first || fullName.trim();
}

// Cached for the life of the process: the school's name is read on every
// message and changes about once.
let cachedSchoolName: string | null = null;

export function resetSchoolNameCache(): void {
  cachedSchoolName = null;
}

async function schoolName(db: DbExecutor): Promise<string> {
  if (cachedSchoolName) return cachedSchoolName;

  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, "school.profile"))
    .limit(1);

  const profile = (row?.value ?? {}) as Record<string, unknown>;
  const name = typeof profile.name === "string" && profile.name.trim() ? profile.name : "The school";
  cachedSchoolName = name;
  return name;
}
