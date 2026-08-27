import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { MAX_IMPORT_ROWS } from "@blush/shared/imports";
import {
  inventoryItems,
  productCategories,
  studentProfiles,
  suppliers,
} from "@blush/db/schema";
import { dbOrThrow } from "../dbOrThrow";
import { buildReference, slugify } from "../platform.utils";
import { recordAudit } from "../services/audit";
import { toAmountString, toMinor } from "../services/money";
import { resolvePerson } from "../services/people";
import { applyStockMovement } from "../services/stock";
import { permissionProcedure, router } from "../trpc";

/**
 * Bulk import from a spreadsheet.
 *
 * Three things shape the design:
 *
 *   The same procedure previews and commits, switched by `dryRun`. Two
 *   procedures would mean two copies of the validation, and the preview would
 *   eventually promise something the commit did not do.
 *
 *   A row that fails validation is reported and skipped; it does not abort the
 *   file. Someone importing two hundred students should not lose the other
 *   hundred and ninety-nine to one missing phone number — and because the
 *   preview reports exactly what the commit will do, nothing is a surprise.
 *
 *   The commit is one transaction. Validation failures are decided before it
 *   opens, so anything that goes wrong inside it is unexpected, and a
 *   half-imported file is worse than none.
 */

/** What will happen, or did happen, to one row. */
export type RowOutcome = {
  /** 1-based position in the file, counting the header as row 1. */
  line: number;
  label: string;
  action: "create" | "update" | "skip" | "error";
  message: string;
};

const importOptions = {
  dryRun: z.boolean().default(true),
  /** Whether a row matching an existing record updates it or is left alone. */
  onDuplicate: z.enum(["skip", "update"]).default("skip"),
};

function summarise(outcomes: RowOutcome[]) {
  return {
    outcomes,
    counts: {
      total: outcomes.length,
      create: outcomes.filter(row => row.action === "create").length,
      update: outcomes.filter(row => row.action === "update").length,
      skip: outcomes.filter(row => row.action === "skip").length,
      error: outcomes.filter(row => row.action === "error").length,
    },
  };
}

/**
 * One spreadsheet row, as loose key/value text.
 *
 * Deliberately not a zod object with required fields. A schema that demanded
 * `fullName` would reject the entire request when a single row was missing it,
 * which is exactly the behaviour the per-row reporting below exists to avoid —
 * one incomplete line must cost that line, not the file. Every field is
 * checked individually further down, where a failure has a row number attached
 * to it.
 */
const importRow = z.record(z.string().max(64), z.string().max(1000));

type ImportRow = z.infer<typeof importRow>;

/** Reads a field as trimmed text, treating absent and blank as the same. */
function field(row: ImportRow, key: string): string {
  return (row[key] ?? "").trim();
}

/* -------------------------------------------------------------------------- */
/* Students                                                                   */
/* -------------------------------------------------------------------------- */

const STUDENT_STATUS = [
  "active",
  "suspended",
  "completed",
  "graduated",
  "withdrawn",
] as const;

type ValidStudent = {
  line: number;
  fullName: string;
  email: string;
  phone: string;
  studentNumber: string | null;
  status: (typeof STUDENT_STATUS)[number];
  gender: string | null;
  birthDate: Date | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

/** A calendar date with no time, so a birthday cannot shift across a timezone. */
function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects 2026-02-31, which Date would roll forward into March.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export const importsRouter = router({
  students: permissionProcedure("students.write")
    .input(
      z.object({
        rows: z.array(importRow).min(1).max(MAX_IMPORT_ROWS),
        ...importOptions,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const outcomes: RowOutcome[] = [];
      const valid: ValidStudent[] = [];

      // Duplicates within the file itself, which the database cannot catch
      // until the second insert has already been decided on.
      const seenEmails = new Set<string>();
      const seenNumbers = new Set<string>();

      input.rows.forEach((raw, index) => {
        const line = index + 2;
        const row = {
          fullName: field(raw, "fullName"),
          email: field(raw, "email"),
          phone: field(raw, "phone"),
          studentNumber: field(raw, "studentNumber"),
          status: field(raw, "status"),
          gender: field(raw, "gender"),
          birthDate: field(raw, "birthDate"),
          address: field(raw, "address"),
          emergencyContactName: field(raw, "emergencyContactName"),
          emergencyContactPhone: field(raw, "emergencyContactPhone"),
        };
        const label = row.fullName || row.email || `Row ${line}`;
        const fail = (message: string) =>
          outcomes.push({ line, label, action: "error", message });

        if (row.fullName.length < 2) return fail("A full name is required.");
        const email = row.email.toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return fail("That is not a valid email address.");
        }
        if (row.phone.length < 7) return fail("A phone number of at least 7 characters is required.");

        if (seenEmails.has(email)) {
          return fail("The same email appears earlier in this file.");
        }

        const status = (row.status || "active").toLowerCase();
        if (!STUDENT_STATUS.includes(status as (typeof STUDENT_STATUS)[number])) {
          return fail(`Status must be one of: ${STUDENT_STATUS.join(", ")}.`);
        }

        const studentNumber = row.studentNumber || null;
        if (studentNumber) {
          if (seenNumbers.has(studentNumber)) {
            return fail("The same student number appears earlier in this file.");
          }
          seenNumbers.add(studentNumber);
        }

        let birthDate: Date | null = null;
        if (row.birthDate) {
          birthDate = parseDate(row.birthDate);
          if (!birthDate) return fail("Date of birth must be written as YYYY-MM-DD.");
        }

        seenEmails.add(email);
        valid.push({
          line,
          fullName: row.fullName,
          email,
          phone: row.phone,
          studentNumber,
          status: status as (typeof STUDENT_STATUS)[number],
          gender: row.gender || null,
          birthDate,
          address: row.address || null,
          emergencyContactName: row.emergencyContactName || null,
          emergencyContactPhone: row.emergencyContactPhone || null,
        });
      });

      // Looked up in two queries rather than one per row: an import of five
      // hundred students would otherwise be a thousand round trips.
      const emails = valid.map(row => row.email);
      const numbers = valid.map(row => row.studentNumber).filter((n): n is string => Boolean(n));

      const [existingByEmail, existingByNumber] = await Promise.all([
        emails.length
          ? db
              .select({ id: studentProfiles.id, email: studentProfiles.email })
              .from(studentProfiles)
              .where(inArray(sql`lower(${studentProfiles.email})`, emails))
          : [],
        numbers.length
          ? db
              .select({
                id: studentProfiles.id,
                studentNumber: studentProfiles.studentNumber,
              })
              .from(studentProfiles)
              .where(inArray(studentProfiles.studentNumber, numbers))
          : [],
      ]);

      const idByEmail = new Map(existingByEmail.map(row => [row.email.toLowerCase(), row.id]));
      const idByNumber = new Map(existingByNumber.map(row => [row.studentNumber, row.id]));

      const toCreate: ValidStudent[] = [];
      const toUpdate: Array<{ row: ValidStudent; id: number }> = [];

      for (const row of valid) {
        const existingId = idByEmail.get(row.email);

        // A student number already used by somebody else is a collision, not a
        // duplicate: importing it would either fail the unique index or move
        // the number off the student who holds it.
        const numberOwner = row.studentNumber ? idByNumber.get(row.studentNumber) : undefined;
        if (numberOwner !== undefined && numberOwner !== existingId) {
          outcomes.push({
            line: row.line,
            label: row.fullName,
            action: "error",
            message: `Student number ${row.studentNumber} already belongs to another student.`,
          });
          continue;
        }

        if (existingId !== undefined) {
          if (input.onDuplicate === "skip") {
            outcomes.push({
              line: row.line,
              label: row.fullName,
              action: "skip",
              message: "Already on file with this email.",
            });
          } else {
            toUpdate.push({ row, id: existingId });
            outcomes.push({
              line: row.line,
              label: row.fullName,
              action: "update",
              message: "Details will be updated.",
            });
          }
          continue;
        }

        toCreate.push(row);
        outcomes.push({
          line: row.line,
          label: row.fullName,
          action: "create",
          message: row.studentNumber
            ? `Will be added as ${row.studentNumber}.`
            : "Will be added with a generated student number.",
        });
      }

      outcomes.sort((a, b) => a.line - b.line);
      if (input.dryRun) return summarise(outcomes);

      await db.transaction(async tx => {
        for (const row of toCreate) {
          // Routed through resolvePerson so a customer who already shops with
          // the school does not become a second person record (§34).
          const personId = await resolvePerson(tx, {
            fullName: row.fullName,
            email: row.email,
            phone: row.phone,
            birthDate: row.birthDate,
            gender: row.gender,
            address: row.address,
            emergencyContactName: row.emergencyContactName,
            emergencyContactPhone: row.emergencyContactPhone,
          });

          await tx.insert(studentProfiles).values({
            personId,
            studentNumber: row.studentNumber ?? buildReference("STU"),
            fullName: row.fullName,
            email: row.email,
            phone: row.phone,
            status: row.status,
          });
        }

        for (const { row, id } of toUpdate) {
          await tx
            .update(studentProfiles)
            .set({
              fullName: row.fullName,
              phone: row.phone,
              status: row.status,
              ...(row.studentNumber ? { studentNumber: row.studentNumber } : {}),
            })
            .where(eq(studentProfiles.id, id));
        }

        await recordAudit(tx, ctx.actor, {
          action: "import",
          entity: "studentProfile",
          newValue: { created: toCreate.length, updated: toUpdate.length },
          summary: `${ctx.actor.name ?? "Staff"} imported ${toCreate.length} student${toCreate.length === 1 ? "" : "s"}`,
        });
      });

      return summarise(outcomes);
    }),

  /* ------------------------------------------------------------------------ */
  /* Products                                                                 */
  /* ------------------------------------------------------------------------ */

  products: permissionProcedure("inventory.write")
    .input(
      z.object({
        rows: z.array(importRow).min(1).max(MAX_IMPORT_ROWS),
        ...importOptions,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await dbOrThrow();

      const outcomes: RowOutcome[] = [];
      const valid: Array<{
        line: number;
        sku: string;
        name: string;
        category: string;
        unitCost: number;
        sellingPrice: number;
        quantityOnHand: number;
        reorderLevel: number;
        isSellable: boolean;
        supplier: string | null;
        description: string | null;
      }> = [];

      const seenSkus = new Set<string>();

      /** Accepts "1,200.50" and "GHS 45" as well as "45.00". */
      const parseMoney = (value: string): number | null => {
        const cleaned = value.replace(/[^\d.-]/g, "");
        if (!cleaned) return null;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const parseWhole = (value: string): number | null => {
        if (!value) return 0;
        const parsed = Number(value.replace(/[^\d-]/g, ""));
        return Number.isInteger(parsed) ? parsed : null;
      };

      input.rows.forEach((raw, index) => {
        const line = index + 2;
        const row = {
          sku: field(raw, "sku"),
          name: field(raw, "name"),
          category: field(raw, "category"),
          unitCost: field(raw, "unitCost"),
          sellingPrice: field(raw, "sellingPrice"),
          quantityOnHand: field(raw, "quantityOnHand"),
          reorderLevel: field(raw, "reorderLevel"),
          isSellable: field(raw, "isSellable"),
          supplier: field(raw, "supplier"),
          description: field(raw, "description"),
        };
        const label = row.name || row.sku || `Row ${line}`;
        const fail = (message: string) =>
          outcomes.push({ line, label, action: "error", message });

        if (row.sku.length < 2) return fail("A SKU is required.");
        if (row.name.length < 2) return fail("A name is required.");
        if (row.category.length < 2) return fail("A category is required.");

        const sku = row.sku;
        if (seenSkus.has(sku)) return fail("The same SKU appears earlier in this file.");

        const unitCost = parseMoney(row.unitCost);
        if (unitCost === null || unitCost < 0) return fail("Unit cost must be a number, 0 or more.");

        const sellingPrice = parseMoney(row.sellingPrice);
        if (sellingPrice === null || sellingPrice < 0) {
          return fail("Selling price must be a number, 0 or more.");
        }

        const quantityOnHand = parseWhole(row.quantityOnHand);
        if (quantityOnHand === null || quantityOnHand < 0) {
          return fail("Quantity on hand must be a whole number, 0 or more.");
        }

        const reorderLevel = parseWhole(row.reorderLevel);
        if (reorderLevel === null || reorderLevel < 0) {
          return fail("Reorder level must be a whole number, 0 or more.");
        }

        const sellableRaw = row.isSellable.toLowerCase();
        if (sellableRaw && !["yes", "no", "true", "false", "y", "n"].includes(sellableRaw)) {
          return fail("Sold online must be yes or no.");
        }

        seenSkus.add(sku);
        valid.push({
          line,
          sku,
          name: row.name,
          category: row.category,
          unitCost,
          sellingPrice,
          quantityOnHand,
          reorderLevel,
          isSellable: sellableRaw ? ["yes", "true", "y"].includes(sellableRaw) : true,
          supplier: row.supplier || null,
          description: row.description || null,
        });
      });

      const skus = valid.map(row => row.sku);
      const supplierNames = [...new Set(valid.map(row => row.supplier).filter(Boolean))] as string[];

      const [existingItems, categoryRows, supplierRows] = await Promise.all([
        skus.length
          ? db
              .select({ id: inventoryItems.id, sku: inventoryItems.sku })
              .from(inventoryItems)
              .where(inArray(inventoryItems.sku, skus))
          : [],
        db.select({ id: productCategories.id, name: productCategories.name }).from(productCategories),
        supplierNames.length
          ? db
              .select({ id: suppliers.id, name: suppliers.name })
              .from(suppliers)
              .where(inArray(suppliers.name, supplierNames))
          : [],
      ]);

      const idBySku = new Map(existingItems.map(row => [row.sku, row.id]));
      const categoryByName = new Map(
        categoryRows.map(row => [row.name.toLowerCase(), row.id]),
      );
      const supplierByName = new Map(supplierRows.map(row => [row.name.toLowerCase(), row.id]));

      const newCategories = new Set<string>();
      const toCreate: typeof valid = [];
      const toUpdate: Array<{ row: (typeof valid)[number]; id: number }> = [];

      for (const row of valid) {
        if (!categoryByName.has(row.category.toLowerCase())) newCategories.add(row.category);

        const unknownSupplier =
          row.supplier && !supplierByName.has(row.supplier.toLowerCase())
            ? ` Supplier "${row.supplier}" was not found and will be left unlinked.`
            : "";

        const existingId = idBySku.get(row.sku);

        if (existingId !== undefined) {
          if (input.onDuplicate === "skip") {
            outcomes.push({
              line: row.line,
              label: row.name,
              action: "skip",
              message: `SKU ${row.sku} is already in stock.`,
            });
          } else {
            toUpdate.push({ row, id: existingId });
            outcomes.push({
              line: row.line,
              label: row.name,
              action: "update",
              // Said plainly, because it is the one thing an update does not do.
              message: `Details will be updated. Quantity on hand is left alone — change stock through a movement.${unknownSupplier}`,
            });
          }
          continue;
        }

        toCreate.push(row);
        outcomes.push({
          line: row.line,
          label: row.name,
          action: "create",
          message: `Will be added${row.quantityOnHand > 0 ? ` with ${row.quantityOnHand} in stock` : ""}.${unknownSupplier}`,
        });
      }

      outcomes.sort((a, b) => a.line - b.line);

      if (input.dryRun) {
        return {
          ...summarise(outcomes),
          newCategories: [...newCategories],
        };
      }

      await db.transaction(async tx => {
        // Created first so the items below can reference them.
        for (const name of newCategories) {
          const [created] = await tx
            .insert(productCategories)
            .values({ name, slug: slugify(name) })
            .onConflictDoNothing({ target: productCategories.slug })
            .returning({ id: productCategories.id });

          if (created?.id) {
            categoryByName.set(name.toLowerCase(), created.id);
          } else {
            // Lost a race, or the slug collided with a differently-cased name.
            const [found] = await tx
              .select({ id: productCategories.id })
              .from(productCategories)
              .where(eq(productCategories.slug, slugify(name)))
              .limit(1);
            if (found) categoryByName.set(name.toLowerCase(), found.id);
          }
        }

        for (const row of toCreate) {
          const [item] = await tx
            .insert(inventoryItems)
            .values({
              sku: row.sku,
              slug: slugify(row.name),
              name: row.name,
              description: row.description,
              category: row.category,
              categoryId: categoryByName.get(row.category.toLowerCase()),
              supplierId: row.supplier
                ? supplierByName.get(row.supplier.toLowerCase())
                : undefined,
              reorderLevel: row.reorderLevel,
              unitCost: toAmountString(toMinor(row.unitCost)),
              sellingPrice: toAmountString(toMinor(row.sellingPrice)),
              isSellable: row.isSellable,
              quantityOnHand: 0,
            })
            .returning({ id: inventoryItems.id });

          // Opening stock is a movement, not a column write, so the ledger
          // accounts for every unit on the shelf (§48).
          if (item?.id && row.quantityOnHand > 0) {
            await applyStockMovement(tx, {
              inventoryItemId: item.id,
              movementType: "received",
              quantityDelta: row.quantityOnHand,
              referenceType: "opening_balance",
              unitCostMinor: toMinor(row.unitCost),
              note: "Opening balance from import",
              performedByUserId: ctx.user.id,
            });
          }
        }

        for (const { row, id } of toUpdate) {
          await tx
            .update(inventoryItems)
            .set({
              name: row.name,
              description: row.description,
              category: row.category,
              categoryId: categoryByName.get(row.category.toLowerCase()),
              reorderLevel: row.reorderLevel,
              unitCost: toAmountString(toMinor(row.unitCost)),
              sellingPrice: toAmountString(toMinor(row.sellingPrice)),
              isSellable: row.isSellable,
              ...(row.supplier && supplierByName.has(row.supplier.toLowerCase())
                ? { supplierId: supplierByName.get(row.supplier.toLowerCase()) }
                : {}),
            })
            .where(eq(inventoryItems.id, id));
        }

        await recordAudit(tx, ctx.actor, {
          action: "import",
          entity: "inventoryItem",
          newValue: {
            created: toCreate.length,
            updated: toUpdate.length,
            categoriesCreated: newCategories.size,
          },
          summary: `${ctx.actor.name ?? "Staff"} imported ${toCreate.length} stock item${toCreate.length === 1 ? "" : "s"}`,
        });
      });

      return { ...summarise(outcomes), newCategories: [...newCategories] };
    }),
});
