/**
 * Creates the owner account if the system has no administrator yet, and
 * verifies the credentials round-trip.
 *
 * The same routine runs automatically on the first sign-in attempt, so this
 * script exists to set the account up ahead of time and to give a straight
 * answer about whether the database and hashing are working.
 *
 *   pnpm --filter @blush/auth ensure-admin
 */

import { closeDb } from "@blush/db";
import { DEFAULT_ADMIN, ensureDefaultAdmin, signInWithPassword } from "./credentials";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const { created } = await ensureDefaultAdmin();
  console.log(
    created
      ? `Created the owner account ${DEFAULT_ADMIN.email}`
      : `Owner account ${DEFAULT_ADMIN.email} already exists`,
  );

  // Prove the stored hash actually verifies, rather than assuming it does.
  const check = await signInWithPassword(DEFAULT_ADMIN.email, DEFAULT_ADMIN.password);

  if (check.ok) {
    console.log(
      `Sign-in verified. role=${check.user.role} mustChangePassword=${check.user.mustChangePassword}`,
    );
    console.log(`\n  Dashboard:  http://localhost:3000`);
    console.log(`  Email:      ${DEFAULT_ADMIN.email}`);
    console.log(`  Password:   ${DEFAULT_ADMIN.password}`);
    console.log("\nChange this password after the first sign-in.");
  } else {
    console.log(
      `Sign-in with the default password did not succeed (${check.reason}). ` +
        "This is expected if the password has already been changed.",
    );
  }
}

main()
  .catch(error => {
    console.error("Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
