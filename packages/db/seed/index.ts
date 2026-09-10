// Database seeding entry point for foundational and demo records.

import "dotenv/config";
import { eq } from "drizzle-orm";
import {
  clinicServices,
  closeDb,
  courses,
  getDb,
  initializeFoundationData,
  inventoryItems,
  studentProfiles,
  users,
} from "../index";
import { DEMO_STUDENT_PASSWORD, seedDemoData } from "./demo";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const db = await getDb();
  if (!db) throw new Error("Could not connect to the database");

  await initializeFoundationData(db);

  const wantsDemo = process.argv.includes("--demo");

  if (wantsDemo) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Refusing to seed demo data into a production environment.");
    }
    console.log("Seeding demo data...");
    const counts = await seedDemoData(db);
    if (counts.skipped) {
      console.log("Demo data is already present - nothing to do.");
    } else {
      for (const [key, value] of Object.entries(counts)) console.log(`  ${key}: ${value}`);
    }

    // Output sample student credentials for portal login verification.
    const [student] = await db
      .select({ email: studentProfiles.email })
      .from(studentProfiles)
      .innerJoin(users, eq(studentProfiles.userId, users.id))
      .limit(1);

    if (student) {
      console.log(`\nStudent portal:  http://localhost:3001/portal`);
      console.log(`  Email:     ${student.email}`);
      console.log(`  Password:  ${DEMO_STUDENT_PASSWORD}`);
    }
  }

  const [courseRows, inventoryRows, serviceRows] = await Promise.all([
    db.select({ code: courses.code, title: courses.title }).from(courses),
    db.select({ sku: inventoryItems.sku, name: inventoryItems.name }).from(inventoryItems),
    db.select({ name: clinicServices.name }).from(clinicServices),
  ]);

  console.log(
    `\ncourses: ${courseRows.length}  inventory items: ${inventoryRows.length}  clinic services: ${serviceRows.length}`,
  );
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
