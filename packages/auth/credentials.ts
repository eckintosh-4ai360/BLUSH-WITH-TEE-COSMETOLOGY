import { eq, sql } from "drizzle-orm";
import { getDb, users, type User } from "@blush/db";
import { checkPasswordStrength, hashPassword, verifyPassword } from "./password";

/**
 * Email and password sign-in.
 *
 * Two behaviours here are deliberate and worth not "tidying up" later:
 *
 *   The failure message never distinguishes an unknown email from a wrong
 *   password, so the form cannot be used to enumerate who has an account.
 *
 *   A missing account still runs a hash comparison against a dummy digest, so
 *   the response takes the same time either way and timing does not leak what
 *   the message refuses to say.
 */

const MAX_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;

/** Compared against when no account matches, purely to burn the same time. */
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export type SignInResult =
  | { ok: true; user: User }
  | { ok: false; reason: "invalid" | "locked" | "inactive"; message: string };

const GENERIC_FAILURE = "Invalid email or password.";

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<SignInResult> {
  const db = await getDb();
  if (!db) {
    return { ok: false, reason: "invalid", message: "The service is unavailable right now." };
  }

  const normalised = email.trim().toLowerCase();

  const [account] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalised}`)
    .limit(1);

  if (!account) {
    await verifyPassword(password, DUMMY_HASH);
    return { ok: false, reason: "invalid", message: GENERIC_FAILURE };
  }

  if (account.lockedUntil && account.lockedUntil > new Date()) {
    const minutes = Math.max(
      1,
      Math.ceil((account.lockedUntil.getTime() - Date.now()) / 60000),
    );
    return {
      ok: false,
      reason: "locked",
      message: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const matches = await verifyPassword(password, account.passwordHash);

  if (!matches) {
    const attempts = account.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_ATTEMPTS;

    await db
      .update(users)
      .set({
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60000) : null,
      })
      .where(eq(users.id, account.id));

    return { ok: false, reason: "invalid", message: GENERIC_FAILURE };
  }

  // Checked after the password so a disabled account cannot be probed.
  if (!account.isActive) {
    return {
      ok: false,
      reason: "inactive",
      message: "This account has been deactivated. Contact an administrator.",
    };
  }

  const signedInAt = new Date();
  await db
    .update(users)
    .set({ failedLoginAttempts: 0, lockedUntil: null, lastSignedIn: signedInAt })
    .where(eq(users.id, account.id));

  return { ok: true, user: { ...account, lastSignedIn: signedInAt } };
}

/** Sets a password after checking it is strong enough. */
export async function setPassword(
  userId: number,
  password: string,
  options: { mustChange?: boolean } = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = await getDb();
  if (!db) return { ok: false, message: "The service is unavailable right now." };

  const [account] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const strength = checkPasswordStrength(password, account ?? {});
  if (!strength.ok) return { ok: false, message: strength.message };

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      passwordUpdatedAt: new Date(),
      mustChangePassword: options.mustChange ?? false,
      failedLoginAttempts: 0,
      lockedUntil: null,
    })
    .where(eq(users.id, userId));

  return { ok: true };
}

/** Changes a password after confirming the current one. */
export async function changePassword(
  userId: number,
  currentPassword: string,
  nextPassword: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = await getDb();
  if (!db) return { ok: false, message: "The service is unavailable right now." };

  const [account] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!account || !(await verifyPassword(currentPassword, account.passwordHash))) {
    return { ok: false, message: "Your current password is not correct." };
  }
  if (currentPassword === nextPassword) {
    return { ok: false, message: "Choose a password you have not used here before." };
  }

  return setPassword(userId, nextPassword, { mustChange: false });
}

export type CreateAccountInput = {
  email: string;
  password: string;
  name: string;
  role: "user" | "student" | "staff" | "admin";
  personId?: number | null;
  mustChangePassword?: boolean;
};

/** Creates a sign-in account. Callers must have checked authorisation first. */
export async function createAccount(
  input: CreateAccountInput,
): Promise<{ ok: true; userId: number } | { ok: false; message: string }> {
  const db = await getDb();
  if (!db) return { ok: false, message: "The service is unavailable right now." };

  const email = input.email.trim().toLowerCase();

  const strength = checkPasswordStrength(input.password, { email, name: input.name });
  if (!strength.ok) return { ok: false, message: strength.message };

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  if (existing) return { ok: false, message: "An account with that email already exists." };

  const [created] = await db
    .insert(users)
    .values({
      openId: `local:${email}`,
      email,
      name: input.name.trim(),
      role: input.role,
      loginMethod: "password",
      personId: input.personId ?? null,
      passwordHash: await hashPassword(input.password),
      passwordUpdatedAt: new Date(),
      mustChangePassword: input.mustChangePassword ?? true,
    })
    .returning({ id: users.id });

  if (!created?.id) return { ok: false, message: "The account could not be created." };
  return { ok: true, userId: created.id };
}

/**
 * The credentials the system ships with, so a fresh install can be signed into
 * before any account exists. Seeded with `mustChangePassword` set, and the
 * dashboard says so until it is changed.
 */
export const DEFAULT_ADMIN = {
  email: "admin@bwtee.com",
  password: "blush@2026",
  name: "Blush With Tee Owner",
} as const;

/** Creates the owner account if the system has no administrator yet. */
export async function ensureDefaultAdmin(): Promise<{ created: boolean }> {
  const db = await getDb();
  if (!db) return { created: false };

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${DEFAULT_ADMIN.email}`)
    .limit(1);

  if (existing) return { created: false };

  const result = await createAccount({
    email: DEFAULT_ADMIN.email,
    password: DEFAULT_ADMIN.password,
    name: DEFAULT_ADMIN.name,
    role: "admin",
    mustChangePassword: true,
  });

  return { created: result.ok };
}
