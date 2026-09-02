import { describe, expect, it } from "vitest";
import { checkPasswordStrength, hashPassword, verifyPassword } from "@blush/auth/password";

describe("password hashing", () => {
  it("verifies the password it hashed", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("Correct horse battery staple", hash)).resolves.toBe(false);
    await expect(verifyPassword("", hash)).resolves.toBe(false);
  });

  it("never stores the password in the digest", async () => {
    const hash = await hashPassword("hunter2-is-a-secret");
    expect(hash).not.toContain("hunter2");
  });

  it("salts, so the same password hashes differently every time", async () => {
    const [first, second] = await Promise.all([
      hashPassword("same-password-here"),
      hashPassword("same-password-here"),
    ]);
    expect(first).not.toBe(second);
    // Both still verify - the salt travels with the digest.
    await expect(verifyPassword("same-password-here", first)).resolves.toBe(true);
    await expect(verifyPassword("same-password-here", second)).resolves.toBe(true);
  });

  it("records its parameters, so the cost can be raised later", async () => {
    const hash = await hashPassword("parameterised");
    const [algorithm, N, r, p] = hash.split("$");
    expect(algorithm).toBe("scrypt");
    expect(Number(N)).toBeGreaterThanOrEqual(16384);
    expect(Number(r)).toBeGreaterThan(0);
    expect(Number(p)).toBeGreaterThan(0);
  });

  it("returns false rather than throwing on a malformed digest", async () => {
    for (const bad of ["", "not-a-hash", "scrypt$1$2$3", "bcrypt$16384$8$1$aa$bb", "$$$$$"]) {
      await expect(verifyPassword("anything", bad)).resolves.toBe(false);
    }
    await expect(verifyPassword("anything", null)).resolves.toBe(false);
    await expect(verifyPassword("anything", undefined)).resolves.toBe(false);
  });

  it("refuses an over-long password instead of hashing it", async () => {
    // scrypt cost scales with input, so this would be a denial-of-service path.
    await expect(hashPassword("x".repeat(5000))).rejects.toThrow(/too long/i);
  });
});

describe("password strength", () => {
  it("accepts a reasonable password", () => {
    expect(checkPasswordStrength("Kente-Weaver-41").ok).toBe(true);
  });

  it("accepts a short one", () => {
    // The eight-character floor was removed on request. An administrator
    // setting a colleague up decides what the temporary password is.
    expect(checkPasswordStrength("abc").ok).toBe(true);
    expect(checkPasswordStrength("1").ok).toBe(true);
  });

  it("accepts a password containing the account's own email address", () => {
    expect(checkPasswordStrength("akosua-2026-ok", { email: "akosua@bwtee.com" }).ok).toBe(true);
  });

  it("accepts choices it used to call obvious", () => {
    for (const previouslyRefused of ["password123", "12345678", "letmein-now", "admin123456"]) {
      expect(checkPasswordStrength(previouslyRefused).ok).toBe(true);
    }
  });

  it("still insists on there being a password at all", () => {
    const result = checkPasswordStrength("");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/enter a password/i);
  });

  it("still refuses one long enough to be a denial-of-service", () => {
    // Not a strength rule: scrypt's cost scales with the input, so this limit
    // protects the server rather than the account.
    const result = checkPasswordStrength("x".repeat(5000));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/under 200/i);
  });

  it("accepts the seeded owner password, which the system must be able to set", () => {
    // If this ever fails, a fresh install cannot be signed into at all.
    expect(checkPasswordStrength("blush@2026", { email: "admin@bwtee.com" }).ok).toBe(true);
  });
});
