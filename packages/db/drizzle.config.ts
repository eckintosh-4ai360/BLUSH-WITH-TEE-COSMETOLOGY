import { defineConfig } from "drizzle-kit";

// Migrations run best over the direct (non-pooled) Neon endpoint; fall back to
// the pooled URL when only that one is configured.
const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
    ssl: { rejectUnauthorized: true },
  },
});
