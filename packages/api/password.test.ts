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

  it("requires at least eight characters", () => {
    const result = checkPasswordStrength("short1");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/at least 8/i);
  });

  it("refuses a password containing the email address", () => {
    const result = checkPasswordStrength("akosua-2026-ok", { email: "akosua@bwtee.com" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/email/i);
  });

  it("refuses obvious choices", () => {
    for (const bad of ["password123", "12345678", "letmein-now", "admin123456"]) {
      expect(checkPasswordStrength(bad).ok).toBe(false);
    }
  });

  it("accepts the seeded owner password, which the system must be able to set", () => {
    // If this ever fails, a fresh install cannot be signed into at all.
    expect(checkPasswordStrength("blush@2026", { email: "admin@bwtee.com" }).ok).toBe(true);
  });
});
