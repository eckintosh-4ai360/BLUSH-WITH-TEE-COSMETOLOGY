import { eq, isNull, sql } from "drizzle-orm";
import {
  expenseCategories,
  expenses,
  payments,
  revenueTransactions,
  systemSettings,
} from "@blush/db/schema";
import type { Database } from "../dbOrThrow";
import { toMinor } from "./money";

const EXPENSE_CATEGORY_SEED: Array<{ key: string; name: string }> = [
  { key: "rent", name: "Rent" },
  { key: "utilities", name: "Utilities (electricity, water, internet)" },
  { key: "salaries", name: "Salaries" },
  { key: "transport", name: "Transportation" },
  { key: "equipment", name: "Equipment" },
  { key: "beauty_products", name: "Beauty products" },
  { key: "maintenance", name: "Maintenance" },
  { key: "marketing", name: "Marketing" },
  { key: "stationery", name: "Stationery" },
  { key: "cleaning", name: "Cleaning" },
  { key: "other", name: "Miscellaneous" },
];

const DEFAULT_SETTINGS: Array<{
  key: string;
  category: string;
  value: unknown;
  description: string;
}> = [
  {
    key: "school.profile",
    category: "school",
    value: {
      name: "Blush With Tee",
      tagline: "Cosmetology school, studio and store",
      address: "Accra, Ghana",
      phone: "",
      whatsapp: "",
      email: "",
      website: "",
      registrationNumber: "",
    },
    description: "School identity used on receipts, letters and certificates.",
  },
  {
    key: "school.social",
    category: "school",
    value: { instagram: "", facebook: "", tiktok: "", youtube: "" },
    description: "Social links shown on the public website.",
  },
  {
    key: "school.terms",
    category: "school",
    value: {
      sections: [
        {
          title: "Discipline and Personal Hygiene",
          body: "Discipline and personal hygiene is of utmost importance to the school, therefore all students must look very neat and smart always. Indecently dressed students will not be allowed inside the school premises.",
        },
        {
          title: "Student to Model for Each Other",
          body: "During practical sessions, student are expected to model for each other. If for any reason a student cannot do so, by reason of any medical condition, he or she must notify the school on enrollment with necessary evidence. Students shall provide models for practicals from outside when needed.",
        },
        {
          title: "Prescribed Dress Code Appearance",
          body: "In a bid to inculcate a Professional appearance in students, they are to be in the prescribed uniforms at all times. All students must wear the prescribed school uniform.\n\n• Uniforms: School t-shirt and Lacoste from Tuesday to Thursday. Mufti on Friday.\n• Footwear (loafers/flat shoes/Crocs/sandals): No talking shoes or high heeled foot-wears are allowed.\n• Accessories: With the exception of wedding rings and earrings, no other form of accessories or body jewelries are allowed during and around classes' hours.",
        },
        {
          title: "Class Attendance",
          body: "Punctuality and regularity to class must be ensured. The instructor reserves every right to sanction late comers accordingly. Reporting time for school is 8am.",
        },
        {
          title: "Appearance During Practical",
          body: "Students must ensure that during practical hours, they wear their protective cloth (overalls or aprons/therapy shoes/gloves and others). No student will be permitted to work without it, hence, will not be allowed in class.",
        },
        {
          title: "School Property",
          body: "Students are expected to handle all school properties including tools and equipment with a sense of responsibility or else damages caused to any school property is payable.",
        },
        {
          title: "Compliance with School Rules and Regulation",
          body: "Every student is entitled to the acquaintance with the rules and regulations governing the school and is expected to comply by them accordingly. Breach of the rules shall warrant sanctions like warnings or suspension.",
        },
        {
          title: "Good Behavior",
          body: "Every student is expected to put up a good and accommodating behavior with a high level of comportment, courtesy, discipline, and good moral values.",
        },
        {
          title: "Respect for Student Leadership",
          body: "Every student must be ready to accord the student leadership (seniors), the respect due it. They must also comply with bye-laws which would emerge from their end to help ensure sanity in school.",
        },
        {
          title: "Graduation Requirement",
          body: "All students are to note that, if you do not meet your requirements for the end of a course, you are not graduating but rather re-sit and perfect without any cost involved. Students are requested to do all final project works before having access to graduate. Full payment of school fees and graduation fees are to be settled before a certificate will be given.",
        },
      ],
      footer: "FEES PAID IS STRICTLY NON REFUNDABLE",
    },
    description: "Official Terms and Conditions governing the school, displayed on the public site and admission portal.",
  },
  {
    key: "finance.currency",
    category: "financial",
    value: { code: "GHS", symbol: "GHS", taxEnabled: false, taxPercent: 0 },
    description: "Currency and tax configuration.",
  },
  {
    key: "finance.receipt",
    category: "financial",
    value: { prefix: "RCP", footerNote: "Thank you for your payment." },
    description: "Receipt numbering and footer text.",
  },
  {
    key: "ecommerce.delivery",
    category: "ecommerce",
    value: { flatFee: 0, freeOver: 0, note: "Delivery within Accra." },
    description: "Delivery pricing rules applied at checkout.",
  },
  {
    key: "academic.grading",
    category: "academic",
    value: {
      bands: [
        { grade: "A", min: 80 },
        { grade: "B", min: 70 },
        { grade: "C", min: 60 },
        { grade: "D", min: 50 },
        { grade: "F", min: 0 },
      ],
      passMark: 50,
    },
    description: "Grade bands applied to assessment scores.",
  },
  {
    key: "academic.attendance",
    category: "academic",
    value: { minimumAttendancePercent: 75, lateCountsAsPresent: true },
    description: "Attendance rules used for progress and certification.",
  },
  {
    key: "certificate.settings",
    category: "academic",
    value: { prefix: "COS", signatureName: "Principal", signatureTitle: "Principal" },
    description: "Certificate numbering and signature block.",
  },
  // Messaging is seeded empty and switched off. Credentials are typed in on
  // the settings page, and nothing is sent to anybody until somebody turns it
  // on deliberately - a half-configured install must not start emailing
  // students the moment it boots.
  {
    key: "messaging.sms",
    category: "messaging",
    value: {
      enabled: false,
      baseUrl: "https://api.mnotify.com/api/sms/quick",
      senderId: "",
      apiKey: "",
    },
    description: "mNotify credentials used to send text messages.",
  },
  {
    key: "messaging.email",
    category: "messaging",
    value: {
      enabled: false,
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      fromName: "",
      fromAddress: "",
      user: "",
      appPassword: "",
    },
    description: "Mailbox used to send email, over SMTP.",
  },
  {
    key: "messaging.events",
    category: "messaging",
    value: { masterEnabled: false, events: {}, templates: {} },
    description: "Which events are announced, over which channels, and in what words.",
  },
];

let bootstrapPromise: Promise<void> | null = null;

/**
 * One-time platform data that must exist for the system to behave correctly:
 * the configurable expense categories, default settings, and a revenue ledger
 * that already accounts for any payments taken before the ledger existed.
 */
export async function ensurePlatformBootstrapped(db: Database): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap(db).catch(error => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
}

async function runBootstrap(db: Database): Promise<void> {
  await db
    .insert(expenseCategories)
    .values(EXPENSE_CATEGORY_SEED.map(row => ({ key: row.key, name: row.name })))
    .onConflictDoNothing({ target: expenseCategories.key });

  await db
    .insert(systemSettings)
    .values(
      DEFAULT_SETTINGS.map(setting => ({
        key: setting.key,
        category: setting.category,
        value: setting.value as never,
        description: setting.description,
      })),
    )
    .onConflictDoNothing({ target: systemSettings.key });

  await linkExpenseCategories(db);
  await backfillRevenueLedger(db);
}

/** Points legacy expense rows at the matching configurable category. */
async function linkExpenseCategories(db: Database): Promise<void> {
  const categories = await db
    .select({ id: expenseCategories.id, key: expenseCategories.key })
    .from(expenseCategories);

  for (const category of categories) {
    await db
      .update(expenses)
      .set({ categoryId: category.id })
      .where(sql`${expenses.categoryId} is null and ${expenses.category}::text = ${category.key}`);
  }
}

/**
 * Writes a revenue line for every completed payment that predates the ledger,
 * so income reported on the dashboard equals money actually received (§28).
 * Idempotent: a payment that already has a line is skipped.
 */
async function backfillRevenueLedger(db: Database): Promise<number> {
  const missing = await db
    .select({
      id: payments.id,
      reference: payments.reference,
      amount: payments.amount,
      studentId: payments.studentId,
      storeOrderId: payments.storeOrderId,
      paidAt: payments.paidAt,
      recordedByUserId: payments.recordedByUserId,
    })
    .from(payments)
    .leftJoin(revenueTransactions, eq(revenueTransactions.paymentId, payments.id))
    .where(sql`${payments.status} = 'completed' and ${revenueTransactions.id} is null`)
    .limit(500);

  if (!missing.length) return 0;

  await db.insert(revenueTransactions).values(
    missing.map(payment => ({
      source: payment.storeOrderId ? ("product_sale" as const) : ("student_fee" as const),
      sourceType: "payment",
      sourceId: payment.id,
      paymentId: payment.id,
      studentId: payment.studentId,
      storeOrderId: payment.storeOrderId,
      amount: payment.amount,
      description: payment.storeOrderId
        ? `Store sale ${payment.reference}`
        : `Student payment ${payment.reference}`,
      occurredAt: payment.paidAt,
      recordedByUserId: payment.recordedByUserId,
    })),
  );

  return missing.length;
}

/** Exposed for the seeding script and tests. */
export const bootstrapFixtures = { EXPENSE_CATEGORY_SEED, DEFAULT_SETTINGS };
