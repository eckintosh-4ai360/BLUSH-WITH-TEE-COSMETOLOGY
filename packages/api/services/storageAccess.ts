import { and, eq, or } from "drizzle-orm";
import { sdk } from "@blush/auth";
import { applicationDocuments, applications, studentProfiles } from "@blush/db/schema";
import type { StorageAccessCheck, StorageAccessDecision } from "@blush/storage/proxy-route";
import { dbOrThrow } from "../dbOrThrow";
import { resolveAccess } from "./access";

/**
 * Who may fetch a stored file.
 *
 * Cloudinary holds everything as an `authenticated` resource, so the storage
 * proxy is the only route to the bytes. That makes this the control described
 * in docs/security.md — until this existed, knowing a key was enough, and a
 * key reaches the browser every time an admissions document is listed.
 *
 * A storage key looks like `image/blush-with-tee/applications/12/1712-id_ab12`:
 * the resource type, the configured Cloudinary folder, then the path the
 * uploader asked for. The rules below match on that trailing path.
 */

/** Marketing assets. Published on the public site by definition. */
const PUBLIC_KEY = /(^|\/)media\/(product|gallery|brochure)\//;

/** Admissions documents: transcripts, government IDs, passport photos. */
const APPLICATION_KEY = /(^|\/)applications\//;

/**
 * Back-office reports the app generates and then links to from a message.
 *
 * These need their own class because `internal` is satisfied by a session
 * alone, and a storefront customer or a student portal account is a session.
 * The low-stock report carries supplier names and unit costs — what the school
 * pays for its stock — and its address travels by email and SMS, so the bar
 * has to be a back-office permission rather than merely being signed in.
 */
const REPORT_KEY = /(^|\/)reports\//;

export type StorageKeyClass = "public" | "application" | "report" | "internal";

/**
 * Sorts a key into what it is, kept pure so the classification can be tested
 * without a database. Anything unrecognised is `internal`, not `public` — a
 * new upload path added later is private until somebody says otherwise.
 */
export function classifyStorageKey(key: string): StorageKeyClass {
  if (APPLICATION_KEY.test(key)) return "application";
  if (REPORT_KEY.test(key)) return "report";
  if (PUBLIC_KEY.test(key)) return "public";
  return "internal";
}

export const storageAccessPolicy: StorageAccessCheck = async (
  request,
  key,
): Promise<StorageAccessDecision> => {
  const kind = classifyStorageKey(key);
  if (kind === "public") return "allow";

  let user;
  try {
    user = await sdk.authenticateRequest(request);
  } catch {
    return "unauthenticated";
  }

  // Receipts, profile photos and anything not otherwise classified: signing in
  // is enough, and these are fetched often enough that it is worth answering
  // before resolving a permission set. Reports and admissions documents are
  // the two that need more than a session.
  if (kind === "internal") return "allow";

  const db = await dbOrThrow();
  const access = await resolveAccess(db, user);

  // A report is for the people who act on it. Either permission is enough:
  // whoever the alert is addressed to holds one of them, and neither a
  // storefront customer nor a student portal account holds any permission at
  // all. A report that needs a different bar belongs under its own prefix and
  // its own branch here, not on this one.
  if (kind === "report") {
    return access.canAny("reports.read", "inventory.read") ? "allow" : "forbidden";
  }

  // Only admissions documents carry identity papers.
  if (access.can("admissions.read")) return "allow";

  // The applicant may see their own papers, whether the row is linked through
  // the account that submitted it or through the student profile it became.
  const [owned] = await db
    .select({ id: applicationDocuments.id })
    .from(applicationDocuments)
    .innerJoin(applications, eq(applicationDocuments.applicationId, applications.id))
    .leftJoin(studentProfiles, eq(studentProfiles.applicationId, applications.id))
    .where(
      and(
        eq(applicationDocuments.storageKey, key),
        or(eq(applications.userId, user.id), eq(studentProfiles.userId, user.id)),
      ),
    )
    .limit(1);

  return owned ? "allow" : "forbidden";
};
