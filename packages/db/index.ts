import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { ENV } from "@blush/env";
import { clinicServices, courses, InsertUser, inventoryItems, users } from "./schema";

export * from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function initializeFoundationData(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const [existingCourse] = await db.select({ id: courses.id }).from(courses).limit(1);
  if (!existingCourse) {
    await db.insert(courses).values([
      { code: "BEAUTY-FOUND", title: "Foundations of Beauty", summary: "A balanced introduction to practical beauty artistry, hygiene, and client care.", description: "Develop practical confidence across foundational beauty services, professional consultation, hygiene, and salon readiness.", durationWeeks: 16, tuition: "2400.00", schedule: "Weekday mornings", certification: "Foundation Certificate", requirements: "Open to motivated beginners.", isFeatured: true },
      { code: "HAIR-PRO", title: "Professional Hair Artistry", summary: "Creative cutting, styling, texture work, and salon service foundations.", description: "Build a professional hair portfolio through guided practice in styling, treatment, finishing, and client experience.", durationWeeks: 24, tuition: "3600.00", schedule: "Weekday afternoons", certification: "Professional Certificate", requirements: "Foundations of Beauty or equivalent experience.", isFeatured: true },
      { code: "NAIL-CRAFT", title: "Nail Craft & Design", summary: "Technique-led manicure, pedicure, extensions, and contemporary nail design.", description: "Learn refined salon nail services while building the confidence to deliver durable, hygienic, expressive work.", durationWeeks: 12, tuition: "1800.00", schedule: "Weekend studio", certification: "Nail Craft Certificate", requirements: "Open to motivated beginners.", isFeatured: false },
    ]);
  }

  const [existingInventory] = await db.select({ id: inventoryItems.id }).from(inventoryItems).limit(1);
  if (!existingInventory) {
    await db.insert(inventoryItems).values([
      { sku: "GC-SERUM-01", name: "Lumina Renewal Serum", description: "A lightweight finishing serum for shine, softness, and a polished professional finish.", category: "Hair Care", imageKey: "/manus-storage/lumina-serum_f9bc3627.png", quantityOnHand: 24, reorderLevel: 6, unitCost: "12.00", sellingPrice: "32.00", isSellable: true },
      { sku: "GC-KIT-01", name: "Glow Student Essentials Kit", description: "A curated beauty-tools kit for practical sessions and personal artistry.", category: "Training Materials", imageKey: "/manus-storage/glow-kit_6e09e927.png", quantityOnHand: 18, reorderLevel: 5, unitCost: "18.00", sellingPrice: "48.00", isSellable: true },
      { sku: "GC-GLOVES-01", name: "Professional Nitrile Gloves", description: "Salon disposable gloves supplied for hygiene-led practical learning.", category: "Classroom Supplies", quantityOnHand: 100, reorderLevel: 25, unitCost: "0.20", sellingPrice: "0.00", isSellable: false },
    ]);
  }

  const [existingService] = await db.select({ id: clinicServices.id }).from(clinicServices).limit(1);
  if (!existingService) {
    await db.insert(clinicServices).values([
      { name: "Student Hair Styling Session", description: "A supervised student-clinic appointment for wash, styling, and finish work.", durationMinutes: 75, price: "25.00" },
      { name: "Student Manicure Session", description: "A supervised student-clinic manicure focused on care, preparation, and a refined finish.", durationMinutes: 60, price: "18.00" },
    ]);
  }
}
