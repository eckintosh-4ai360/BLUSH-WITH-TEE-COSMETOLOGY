/**
 * Seeds the foundation rows (courses, inventory, clinic services) that the
 * public site needs in order to render anything.
 *
 * `initializeFoundationData` also runs lazily on the first storefront query,
 * so this script exists mainly to seed a fresh database up front and to give
 * a straight answer about whether the configured DATABASE_URL actually works.
 *
 * Run with: pnpm --filter @blush/db db:seed
 */

import "dotenv/config";
import { clinicServices, closeDb, courses, getDb, initializeFoundationData, inventoryItems } from "./index";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Could not connect to the database");
  }

  await initializeFoundationData(db);

  const [courseRows, inventoryRows, serviceRows] = await Promise.all([
    db.select({ code: courses.code, title: courses.title }).from(courses),
    db.select({ sku: inventoryItems.sku, name: inventoryItems.name }).from(inventoryItems),
    db.select({ name: clinicServices.name }).from(clinicServices),
  ]);

  console.log(`courses (${courseRows.length}):`);
  courseRows.forEach(row => console.log(`  ${row.code}  ${row.title}`));
  console.log(`inventory items (${inventoryRows.length}):`);
  inventoryRows.forEach(row => console.log(`  ${row.sku}  ${row.name}`));
  console.log(`clinic services (${serviceRows.length}):`);
  serviceRows.forEach(row => console.log(`  ${row.name}`));
}

main()
  .then(() => closeDb())
  .then(() => {
    console.log("Seed complete.");
    process.exit(0);
  })
  .catch(async error => {
    console.error("Seed failed:", error);
    await closeDb().catch(() => {});
    process.exit(1);
  });
