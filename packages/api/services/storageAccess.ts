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

export type StorageKeyClass = "public" | "application" | "internal";

/**
 * Sorts a key into what it is, kept pure so the classification can be tested
 * without a database. Anything unrecognised is `internal`, not `public` — a
 * new upload path added later is private until somebody says otherwise.
 */
export function classifyStorageKey(key: string): StorageKeyClass {
  if (APPLICATION_KEY.test(key)) return "application";
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
  // is enough. Only admissions documents carry identity papers.
  if (kind !== "application") return "allow";

  const db = await dbOrThrow();
  const access = await resolveAccess(db, user);
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
