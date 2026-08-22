import { and, eq, isNull, sql } from "drizzle-orm";
import { customers, people, users } from "@blush/db/schema";
import type { DbExecutor } from "../dbOrThrow";

export type PersonInput = {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  birthDate?: Date | null;
  gender?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
};

/**
 * Finds the existing person behind a contact detail, or creates one.
 *
 * This is what stops a shopper who later applies to the school from becoming
 * two records (§34). Email is the strong key; phone is the fallback for
 * walk-ins who never gave one.
 */
export async function resolvePerson(db: DbExecutor, input: PersonInput): Promise<number> {
  const email = normaliseEmail(input.email);
  const phone = normalisePhone(input.phone);

  const existing = await findPerson(db, { email, phone });

  if (existing) {
    // Fill in blanks from the newer submission without overwriting good data.
    const patch = pruneEmpty({
      email: existing.email ?? email,
      phone: existing.phone ?? phone,
      whatsapp: existing.whatsapp ?? normalisePhone(input.whatsapp),
      birthDate: existing.birthDate ?? input.birthDate ?? null,
      gender: existing.gender ?? input.gender ?? null,
      address: existing.address ?? input.address ?? null,
      emergencyContactName: existing.emergencyContactName ?? input.emergencyContactName ?? null,
      emergencyContactPhone: existing.emergencyContactPhone ?? input.emergencyContactPhone ?? null,
    });

    if (Object.keys(patch).length) {
      await db.update(people).set(patch).where(eq(people.id, existing.id));
    }
    return existing.id;
  }

  const [created] = await db
    .insert(people)
    .values({
      fullName: input.fullName.trim(),
      email,
      phone,
      whatsapp: normalisePhone(input.whatsapp),
      birthDate: input.birthDate ?? null,
      gender: input.gender ?? null,
      address: input.address ?? null,
      emergencyContactName: input.emergencyContactName ?? null,
      emergencyContactPhone: input.emergencyContactPhone ?? null,
    })
    .returning({ id: people.id });

  if (!created?.id) throw new Error("Person record could not be created.");
  return created.id;
}

async function findPerson(
  db: DbExecutor,
  keys: { email: string | null; phone: string | null },
) {
  if (keys.email) {
    const [byEmail] = await db
      .select()
      .from(people)
      .where(and(sql`lower(${people.email}) = ${keys.email}`, isNull(people.deletedAt)))
      .limit(1);
    if (byEmail) return byEmail;
  }

  if (keys.phone) {
    const [byPhone] = await db
      .select()
      .from(people)
      .where(and(eq(people.phone, keys.phone), isNull(people.deletedAt)))
      .limit(1);
    if (byPhone) return byPhone;
  }

  return undefined;
}

/** Ensures the commerce facet exists for a person, without duplicating them. */
export async function ensureCustomer(
  db: DbExecutor,
  input: { personId: number; userId?: number | null },
): Promise<number> {
  const [existing] = await db
    .select({ id: customers.id, userId: customers.userId })
    .from(customers)
    .where(eq(customers.personId, input.personId))
    .limit(1);

  if (existing) {
    if (input.userId && !existing.userId) {
      await db.update(customers).set({ userId: input.userId }).where(eq(customers.id, existing.id));
    }
    return existing.id;
  }

  const [created] = await db
    .insert(customers)
    .values({ personId: input.personId, userId: input.userId ?? null })
    .returning({ id: customers.id });

  if (!created?.id) throw new Error("Customer record could not be created.");
  return created.id;
}

/** Links a signed-in account to its person record, creating one if needed. */
export async function linkUserToPerson(
  db: DbExecutor,
  user: { id: number; name?: string | null; email?: string | null },
): Promise<number | null> {
  const [row] = await db
    .select({ personId: users.personId })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (row?.personId) return row.personId;
  if (!user.email && !user.name) return null;

  const personId = await resolvePerson(db, {
    fullName: user.name?.trim() || user.email || "Account holder",
    email: user.email ?? null,
  });

  await db.update(users).set({ personId }).where(eq(users.id, user.id));
  return personId;
}

function normaliseEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function normalisePhone(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/[\s()-]/g, "").trim();
  return trimmed ? trimmed : null;
}

function pruneEmpty<T extends Record<string, unknown>>(input: T): Partial<T> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== null && value !== undefined) output[key] = value;
  }
  return output as Partial<T>;
}
