import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ENV } from "@blush/env";
import {
  clinicServices,
  courseModules,
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

/**
 * The syllabus of the three main programmes, as the school advertises it.
 *
 * Kept as rows rather than folded into `description`, so the office can edit a
 * single line from the Programmes screen and both the public site and the
 * application form show the change. Migration 0007 installs the same list into
 * databases seeded before this existed.
 */
const FOUNDATION_OUTLINES: Record<string, string[]> = {
  "COSM-BASIC": [
    "Makeup",
    "Wigmaking and styling (machine)",
    "Installation",
    "Frontal pony",
  ],
  "COSM-MINI": [
    "Professional Makeup",
    "Wigmaking and styling",
    "Wig Installations",
    "Frontal pony",
    "Bridal hairstyling",
    "Nails",
    "Pedicure",
  ],
  "COSM-ULTIMATE": [
    "Professional Makeup",
    "Wigmaking and styling",
    "Wig Installations",
    "Frontal Pony",
    "Bridal hairstyling",
    "Nails",
    "Pedicure",
    "Lash extensions",
    "Cluster lashes",
    "Ombre brows",
  ],
};

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
        code: "COSM-BASIC",
        slug: "basic-cosmetology-course",
        title: "Basic Cosmetology Course",
        category: "General",
        summary: "Makeup, Wigmaking and styling (machine), Installation, Frontal pony.",
        description:
          "Develop practical confidence in fundamental beauty artistry: professional makeup, machine-assisted wigmaking, wig styling, installations, and frontal pony styling.",
        durationWeeks: 12,
        tuition: "5000.00",
        schedule: "Monday - Saturday (8am - 5pm)",
        certification: "Basic Cosmetology Certificate",
        requirements: "Open to motivated beginners. Bring required toiletries on day one.",
        toiletries: "One big size Omo, One big size Dettol, One big size paper roll, 2 big wet wipes, 1 full pack of blade",
        isFeatured: true,
      },
      {
        code: "COSM-MINI",
        slug: "mini-full-cosmetology-course",
        title: "Mini Full Cosmetology Course",
        category: "General",
        summary:
          "Professional Makeup, Wigmaking and styling, Wig Installations, Frontal pony, Bridal hairstyling, Nails, Pedicure.",
        description:
          "Intensive 6-month cosmetology program covering advanced makeup, salon wigmaking, lace installations, bridal hair design, nail sculpting, and professional pedicures.",
        durationWeeks: 24,
        tuition: "8500.00",
        schedule: "Monday - Saturday (8am - 5pm)",
        certification: "Mini Full Cosmetology Diploma",
        requirements: "Open to motivated beginners and aspiring beauty salon specialists.",
        toiletries: "One big size Omo, One big size Dettol, One big size paper roll, 2 big wet wipes, 1 full pack of blade",
        isFeatured: true,
      },
      {
        code: "COSM-ULTIMATE",
        slug: "ultimate-full-cosmetology-course",
        title: "Ultimate Full Cosmetology Course",
        category: "General",
        summary:
          "Professional Makeup, Wigmaking & styling, Wig Installations, Frontal Pony, Bridal hairstyling, Nails, Pedicure, Lash extensions, Cluster lashes, Ombre brows.",
        description:
          "Our definitive one-year master cosmetology training covering all specialized disciplines: high-glam makeup, full wig artistry, bridal styling, nail enhancements, lash extensions, cluster lashes, and ombre brows.",
        durationWeeks: 48,
        tuition: "13000.00",
        schedule: "Monday - Saturday (8am - 5pm)",
        certification: "Ultimate Cosmetology Master Diploma",
        requirements: "Open to passionate individuals seeking full professional mastery.",
        toiletries: "One big size Omo, One big size Dettol, One big size paper roll, 2 big wet wipes, 1 full pack of blade",
        isFeatured: true,
      },
      {
        code: "IND-MAKEUP-PERS",
        slug: "personal-makeup",
        title: "Personal Makeup",
        category: "Individual Courses",
        summary: "Learn day, evening, and flawless personal glam techniques for yourself.",
        description: "Master personal skincare prep, foundation matching, brow sculpting, eyeshadow blending, and everyday beauty application.",
        durationWeeks: 1,
        tuition: "1000.00",
        schedule: "Monday - Saturday (8am - 5pm)",
        certification: "Personal Makeup Certificate",
        requirements: "No prior experience required.",
        isFeatured: false,
      },
      {
        code: "IND-MAKEUP-BEG",
        slug: "professional-makeup-beginner",
        title: "Professional Makeup (Beginner)",
        category: "Individual Courses",
        summary: "Comprehensive 2-month foundations for aspiring professional makeup artists.",
        description: "Covers skin science, color theory, bridal glam, editorial looks, client consultation, contouring, and camera-ready finishing.",
        durationWeeks: 8,
        tuition: "2500.00",
        productFee: "2500.00",
        schedule: "Monday - Saturday (8am - 5pm)",
        certification: "Professional Makeup Certificate",
        requirements: "Open to beginners. Training products to be purchased at school store.",
        isFeatured: true,
      },
      {
        code: "IND-MAKEUP-UPG",
        slug: "professional-makeup-upgrade",
        title: "Professional Makeup (Upgrade)",
        category: "Individual Courses",
        summary: "Advanced masterclass upgrade for practicing makeup artists.",
        description: "Sharpen precision blending, high-definition bridal techniques, cut-crease trends, and luxury client finishes.",
        durationWeeks: 1,
        tuition: "1500.00",
        schedule: "Monday - Saturday (8am - 5pm)",
        certification: "Master Makeup Artistry Certificate",
        requirements: "Basic makeup background required.",
        isFeatured: false,
      },
      {
        code: "IND-WIG-STYLE",
        slug: "wigmaking-and-styling",
        title: "Wigmaking & Styling",
        category: "Individual Courses",
        summary: "Machine and hand wig construction, ventilation, bleaching knots, and custom styling.",
        description: "Learn cap sizing, machine track stitching, lace customization, plucking, knot bleaching, and salon heat styling.",
        durationWeeks: 4,
        tuition: "2000.00",
        productFee: "1800.00",
        schedule: "Monday - Saturday (8am - 5pm)",
        certification: "Wigmaking & Styling Certificate",
        requirements: "Open to motivated beginners.",
        isFeatured: false,
      },
      {
        code: "IND-INST-STYLE",
        slug: "installation-and-styling-only",
        title: "Installation & Styling Only",
        category: "Individual Courses",
        summary: "Seamless lace front, closure, and frontal installs with precision melts.",
        description: "Master skin tone lace blending, glueless and adhesive applications, baby hair crafting, and longevity maintenance.",
        durationWeeks: 2,
        tuition: "1500.00",
        schedule: "Monday - Saturday (8am - 5pm)",
        certification: "Lace Installation Certificate",
        requirements: "Open to beginners.",
        isFeatured: false,
      },
      {
        code: "IND-INST-HAIRLINE",
        slug: "installation-styling-customised-hairline",
        title: "Installation & Styling, Customised Hairline",
        category: "Individual Courses",
        summary: "Advanced hairline customization, natural density plucking, and invisible melts.",
        description: "Specialized training in creating ultra-realistic hairlines, ear-tab tailoring, adhesive chemistry, and modern finishes.",
        durationWeeks: 2,
        tuition: "2000.00",
        schedule: "Monday - Saturday (8am - 5pm)",
        certification: "Advanced Hairline & Lace Certificate",
        requirements: "Basic wig experience recommended.",
        isFeatured: false,
      },
      {
        code: "IND-BRIDAL-HAIR",
        slug: "bridal-hairstyling",
        title: "Bridal Hairstyling",
        category: "Individual Courses",
        summary: "High-end bridal updos, romantic waves, veil placement, and hair accessory design.",
        description: "Create classic and modern bridal updos, textured ponytails, accessory placement, and long-lasting hold techniques for wedding parties.",
        durationWeeks: 2,
        tuition: "2000.00",
        productFee: "1000.00",
        schedule: "Monday - Saturday (8am - 5pm)",
        certification: "Bridal Hair Artistry Certificate",
        requirements: "Open to all students.",
        isFeatured: false,
      },
      {
        code: "IND-NAILS",
        slug: "nails-technology-design",
        title: "Nails (Manicure, Pedicure & Extensions)",
        category: "Individual Courses",
        summary: "Full nail technology: acrylic, builder gel, Russian manicures, nail art, and luxury pedicures.",
        description: "Hands-on nail anatomy, hygienic cuticle prep, tips, forms, acrylic sculpting, gel polish application, and spa pedicure routines.",
        durationWeeks: 8,
        tuition: "2000.00",
        productFee: "2000.00",
        schedule: "Monday - Saturday (8am - 5pm)",
        certification: "Nail Technology Certificate",
        requirements: "Open to beginners.",
        isFeatured: true,
      },
      {
        code: "IND-LASH-EXT",
        slug: "lash-extension",
        title: "Lash Extension",
        category: "Individual Courses",
        summary: "Classic, hybrid, and volume eyelash extensions with safe adhesive isolation.",
        description: "Learn eye mapping, lash health, isolation techniques, weight calculation, fills, and gentle removal procedures.",
        durationWeeks: 2,
        tuition: "2000.00",
        productFee: "2000.00",
        schedule: "Monday - Saturday (8am - 5pm)",
        certification: "Eyelash Extension Certificate",
        requirements: "Steady hand and good vision.",
        isFeatured: false,
      },
      {
        code: "IND-OMBRE-BROWS",
        slug: "ombre-powder-brows",
        title: "Ombre Brows",
        category: "Individual Courses",
        summary: "Semi-permanent makeup brow shading, mapping, color theory, and sterilization.",
        description: "Master facial symmetry mapping, skin undertones, needle configurations, machine shading, ombre gradients, and aftercare.",
        durationWeeks: 4,
        tuition: "2000.00",
        productFee: "2500.00",
        schedule: "Monday - Saturday (8am - 5pm)",
        certification: "Ombre Brow Artistry Certificate",
        requirements: "Open to motivated beauty practitioners.",
        isFeatured: true,
      },
    ]);

    const seeded = await db
      .select({ id: courses.id, code: courses.code })
      .from(courses);

    const outlineRows = seeded.flatMap(course =>
      (FOUNDATION_OUTLINES[course.code] ?? []).map((title, index) => ({
        courseId: course.id,
        code: `M${String(index + 1).padStart(2, "0")}`,
        title,
        sequence: index + 1,
      })),
    );

    if (outlineRows.length) await db.insert(courseModules).values(outlineRows);
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
