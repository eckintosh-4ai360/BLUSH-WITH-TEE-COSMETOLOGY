/** CLI wrapper for `reconcileDerivedData`. Run with: pnpm db:reconcile */

import "dotenv/config";
import { closeDb, getDb } from "./index";
import { reconcileDerivedData } from "./reconcile";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const db = await getDb();
  if (!db) throw new Error("Could not connect to the database");

  const report = await reconcileDerivedData(db);

  console.log(`revenue lines created:    ${report.revenueLinesCreated}`);
  console.log(`fee charges corrected:    ${report.chargesCorrected}`);
  console.log(`stock movements written:  ${report.stockMovementsCreated}`);

  if (report.details.length) {
    console.log("\ndetails:");
    for (const line of report.details) console.log(`  - ${line}`);
  } else {
    console.log("\nNothing to reconcile - derived values already agree with their ledgers.");
  }
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async error => {
    console.error("Reconcile failed:", error);
    await closeDb().catch(() => {});
    process.exit(1);
  });
