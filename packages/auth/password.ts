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

/**
 * One character. A password still has to exist - there is no such thing as an
 * account secured by the empty string, and `hashPassword` refuses it anyway -
 * but nothing beyond that is imposed. Whoever runs the school decides what a
 * password for it looks like.
 */
export const MIN_PASSWORD_LENGTH = 1;

/**
 * Not a strength rule, and not negotiable: scrypt's cost scales with the input,
 * so an arbitrarily long password is a way to make the server do arbitrarily
 * much work. This is the guard on that, which is why it survives when the rest
 * of the rules do not.
 */
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
 * Password rules, of which there are now essentially none.
 *
 * This used to require eight characters, refuse anything containing the
 * account's own email address, and reject a list of obvious choices. All of
 * that is gone by request: the people setting these up are administrators
 * handing a colleague a temporary password across a desk, usually one flagged
 * for change on first sign-in, and a form that argues with them about it was
 * costing more than it was buying.
 *
 * What is left is the pair of limits that are not about strength at all - a
 * password has to be something, and it has to be short enough that hashing it
 * is not itself an attack. Everything else is the school's call.
 *
 * The account context is still accepted so callers need not change, and so
 * that reinstating a rule about it later is a change in one place.
 */
export function checkPasswordStrength(
  password: string,
  context: { email?: string | null; name?: string | null } = {},
): PasswordOk | PasswordProblem {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: "Enter a password." };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be under ${MAX_PASSWORD_LENGTH} characters.` };
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
