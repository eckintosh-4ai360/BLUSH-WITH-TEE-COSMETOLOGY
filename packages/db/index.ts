import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ENV } from "@blush/env";
import {
  clinicServices,
  courses,
  InsertUser,
  inventoryItems,
  users,
} from "./schema";
import * as schema from "./schema";

export * from "./schema";

type Database = ReturnType<typeof createDb>;

let _db: Database | null = null;
let _pool: Pool | null = null;

function createDb(connectionString: string) {
  // Neon terminates TLS with a publicly trusted certificate, so the chain is
  // verified in full rather than trusting whatever the connection string says.
  _pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: true },
    max: 10,
  });

  _pool.on("error", error => {
    console.error("[Database] Idle client error:", error);
  });

  return drizzle(_pool, { schema });
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && ENV.databaseUrl) {
    try {
      _db = createDb(ENV.databaseUrl);
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
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
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

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}

export async function initializeFoundationData(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
) {
  const [existingCourse] = await db
    .select({ id: courses.id })
    .from(courses)
    .limit(1);
  if (!existingCourse) {
    await db.insert(courses).values([
      {
        code: "BEAUTY-FOUND",
        title: "Foundations of Beauty",
        summary:
          "A balanced introduction to practical beauty artistry, hygiene, and client care.",
        description:
          "Develop practical confidence across foundational beauty services, professional consultation, hygiene, and salon readiness.",
        durationWeeks: 16,
        tuition: "2400.00",
        schedule: "Weekday mornings",
        certification: "Foundation Certificate",
        requirements: "Open to motivated beginners.",
        isFeatured: true,
      },
      {
        code: "HAIR-PRO",
        title: "Professional Hair Artistry",
        summary:
          "Creative cutting, styling, texture work, and salon service foundations.",
        description:
          "Build a professional hair portfolio through guided practice in styling, treatment, finishing, and client experience.",
        durationWeeks: 24,
        tuition: "3600.00",
        schedule: "Weekday afternoons",
        certification: "Professional Certificate",
        requirements: "Foundations of Beauty or equivalent experience.",
        isFeatured: true,
      },
      {
        code: "NAIL-CRAFT",
        title: "Nail Craft & Design",
        summary:
          "Technique-led manicure, pedicure, extensions, and contemporary nail design.",
        description:
          "Learn refined salon nail services while building the confidence to deliver durable, hygienic, expressive work.",
        durationWeeks: 12,
        tuition: "1800.00",
        schedule: "Weekend studio",
        certification: "Nail Craft Certificate",
        requirements: "Open to motivated beginners.",
        isFeatured: false,
      },
    ]);
  }

  const [existingInventory] = await db
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .limit(1);
  if (!existingInventory) {
    await db.insert(inventoryItems).values([
      {
        sku: "BWT-SERUM-01",
        name: "Lumina Renewal Serum",
        description:
          "A lightweight botanical renewal serum infused with argan and rosehip oils for radiant shine, deep hydration, and smooth finish.",
        category: "Skin & Hair Care",
        imageKey: "/products/lumina-serum.jpg",
        quantityOnHand: 32,
        reorderLevel: 6,
        unitCost: "26.00",
        sellingPrice: "68.00",
        isSellable: true,
      },
      {
        sku: "BWT-KIT-01",
        name: "Student Artistry Essentials Kit",
        description:
          "Professional cosmetology starter kit containing precision shears, sectioning clips, tail combs, makeup brushes, and a luxury case.",
        category: "Tools & Kits",
        imageKey: "/products/student-essentials-kit.jpg",
        quantityOnHand: 22,
        reorderLevel: 5,
        unitCost: "90.00",
        sellingPrice: "210.00",
        isSellable: true,
      },
      {
        sku: "BWT-SHMP-01",
        name: "Hydrating Botanical Shampoo & Mask Duo",
        description:
          "Sulfate-free moisture-rich cleanser and restorative hair mask formulated with shea butter and keratin for revitalized curls and waves.",
        category: "Hair Care",
        imageKey: "/products/hydrating-shampoo-mask.jpg",
        quantityOnHand: 45,
        reorderLevel: 10,
        unitCost: "35.00",
        sellingPrice: "85.00",
        isSellable: true,
      },
      {
        sku: "BWT-GEL-01",
        name: "Sculpting Builder Gel & UV Kit",
        description:
          "Pro-grade builder gel kit with base, builder gel, top coat, dual-form tips, and fine detailer nail brush for salon-grade manicures.",
        category: "Nail Care",
        imageKey: "/products/builder-gel-kit.jpg",
        quantityOnHand: 18,
        reorderLevel: 4,
        unitCost: "48.00",
        sellingPrice: "120.00",
        isSellable: true,
      },
      {
        sku: "BWT-CLNS-01",
        name: "Gentle Radiance Facial Cleanser",
        description:
          "pH-balanced gentle foaming cleanser with chamomile, niacinamide, and rosewater that purifies while preserving the skin moisture barrier.",
        category: "Skin Care",
        imageKey: "/products/facial-cleanser.jpg",
        quantityOnHand: 28,
        reorderLevel: 6,
        unitCost: "18.00",
        sellingPrice: "48.00",
        isSellable: true,
      },
      {
        sku: "BWT-BRUSH-01",
        name: "Master Precision Makeup Brush Set",
        description:
          "12-piece ultra-soft synthetic vegan makeup brush set with ergonomic handles and a chic travel cylinder case.",
        category: "Tools & Kits",
        imageKey: "/products/makeup-brush-set.jpg",
        quantityOnHand: 15,
        reorderLevel: 4,
        unitCost: "55.00",
        sellingPrice: "140.00",
        isSellable: true,
      },
      {
        sku: "BWT-GLOVES-01",
        name: "Professional Nitrile Gloves",
        description:
          "Salon disposable gloves supplied for hygiene-led practical learning.",
        category: "Classroom Supplies",
        imageKey: null,
        quantityOnHand: 100,
        reorderLevel: 25,
        unitCost: "0.20",
        sellingPrice: "0.00",
        isSellable: false,
      },
    ]);
  }

  const [existingService] = await db
    .select({ id: clinicServices.id })
    .from(clinicServices)
    .limit(1);
  if (!existingService) {
    await db.insert(clinicServices).values([
      {
        name: "Student Hair Styling Session",
        description:
          "A supervised student-clinic appointment for wash, styling, and finish work.",
        durationMinutes: 75,
        price: "25.00",
      },
      {
        name: "Student Manicure Session",
        description:
          "A supervised student-clinic manicure focused on care, preparation, and a refined finish.",
        durationMinutes: 60,
        price: "18.00",
      },
    ]);
  }
}
