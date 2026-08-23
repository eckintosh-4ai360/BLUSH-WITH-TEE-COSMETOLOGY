import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing.
 *
 * scrypt from Node's own crypto, so there is no native dependency to build and
 * nothing to keep patched. It is memory-hard, which is what makes a stolen
 * table expensive to attack with GPUs.
 *
 * The stored format carries its own parameters:
 *
 *   scrypt$N$r$p$<salt base64url>$<hash base64url>
 *
 * so the cost can be raised later without invalidating existing hashes - an
 * old digest still verifies against the parameters it was written with.
 */

/**
 * Promisified scrypt. Written out rather than `promisify`d because the overload
 * that takes options does not survive the generic wrapper.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

const PARAMS = { N: 16384, r: 8, p: 1, keyLength: 64 } as const;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

export async function hashPassword(password: string): Promise<string> {
  assertHashable(password);

  const salt = randomBytes(16);
  const derived = (await scryptAsync(password.normalize("NFKC"), salt, PARAMS.keyLength, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    // scrypt needs roughly 128 * N * r bytes; Node's default cap is lower.
    maxmem: 256 * PARAMS.N * PARAMS.r,
  })) as Buffer;

  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

/**
 * Checks a password against a stored digest.
 *
 * Returns false rather than throwing for every failure mode - a malformed
 * digest, a missing hash, the wrong password - so a caller cannot accidentally
 * tell the difference between "no such account" and "wrong password".
 */
export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (!storedHash || !password) return false;

  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(rawHash!, "base64url");
  } catch {
    return false;
  }
  if (!expected.length) return false;

  try {
    const derived = (await scryptAsync(
      password.normalize("NFKC"),
      Buffer.from(rawSalt!, "base64url"),
      expected.length,
      { N, r, p, maxmem: 256 * N * r },
    )) as Buffer;

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export type PasswordProblem = { ok: false; message: string };
export type PasswordOk = { ok: true };

/**
 * Password rules. Deliberately about length rather than character classes:
 * forced symbols push people towards `Passw0rd!` and nothing else.
 */
export function checkPasswordStrength(
  password: string,
  context: { email?: string | null; name?: string | null } = {},
): PasswordOk | PasswordProblem {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be under ${MAX_PASSWORD_LENGTH} characters.` };
  }

  const lowered = password.toLowerCase();

  const localPart = context.email?.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 3 && lowered.includes(localPart)) {
    return { ok: false, message: "Password must not contain your email address." };
  }

  const OBVIOUS = ["password", "12345678", "qwerty", "letmein", "admin123", "blushwithtee"];
  if (OBVIOUS.some(entry => lowered.includes(entry))) {
    return { ok: false, message: "Password is too easy to guess. Choose something less common." };
  }

  return { ok: true };
}

function assertHashable(password: string): void {
  if (typeof password !== "string" || !password.length) {
    throw new Error("A password is required.");
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    // Long inputs are refused before hashing: scrypt cost scales with them.
    throw new Error("Password is too long.");
  }
}
