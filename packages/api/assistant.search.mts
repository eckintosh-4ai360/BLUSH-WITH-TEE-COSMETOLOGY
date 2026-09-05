/**
 * Checks the search behaviour of the catalogue directly, without the model.
 *
 *   pnpm --filter @blush/api assistant-search
 *
 * Kept apart from the model smoke run because it costs nothing and answers a
 * different question: not "did it phrase that well" but "did the query find
 * the row". Every case here is a phrasing that a straight phrase match gets
 * wrong.
 */
import { getDb } from "@blush/db";
import { PERMISSION_KEYS } from "@blush/shared/permissions";
import { runTool, availableTools } from "./services/assistant/registry";
import type { AccessContext } from "./services/access";

const OWNER: AccessContext = {
  userId: 0,
  roles: ["super_admin"],
  permissions: new Set(PERMISSION_KEYS),
  can: () => true,
  canAny: () => true,
  assert: () => {},
};

const db = await getDb();
if (!db) {
  console.error("No database. Set DATABASE_URL in packages/db/.env.");
  process.exit(1);
}

const ctx = { db, access: OWNER, now: new Date() };
const staff = availableTools("staff", ctx);
const publicSurface = availableTools("public", { ...ctx, access: null });

type Case = {
  label: string;
  tool: string;
  args: Record<string, unknown>;
  surface?: "staff" | "public";
  /** The check that has to pass for this to count. */
  expect: (result: any) => boolean;
};

const CASES: Case[] = [
  {
    label: "words out of order, with a word between them",
    tool: "list_courses",
    args: { search: "ultimate cosmetology" },
    expect: r => r.courses?.some((c: any) => c.title === "Ultimate Full Cosmetology Course"),
  },
  {
    label: "reversed word order",
    tool: "list_courses",
    args: { search: "cosmetology basic" },
    expect: r => r.courses?.some((c: any) => c.title === "Basic Cosmetology Course"),
  },
  {
    label: "one word only",
    tool: "list_courses",
    args: { search: "nails" },
    expect: r => r.courses?.length > 0,
  },
  {
    label: "different case and stray spacing",
    tool: "list_courses",
    args: { search: "  OMBRE   brows " },
    expect: r => r.courses?.some((c: any) => c.title === "Ombre Brows"),
  },
  {
    label: "public site: same phrasing works for a visitor",
    tool: "browse_courses",
    args: { search: "ultimate cosmetology", includeModules: false },
    surface: "public",
    expect: r => r.courses?.some((c: any) => c.title === "Ultimate Full Cosmetology Course"),
  },
  {
    // Every product in this database is currently withdrawn - soft-deleted,
    // inactive and not sellable. The visitor-facing tool must honour that and
    // offer nothing, rather than advertising stock the store will not sell.
    label: "public site: withdrawn products are not offered to visitors",
    tool: "browse_products",
    args: { search: "gel kit" },
    surface: "public",
    expect: r => r.products?.length === 0,
  },
  {
    label: "a term that genuinely matches nothing still returns nothing",
    tool: "list_courses",
    args: { search: "underwater welding" },
    expect: r => r.courses?.length === 0,
  },
  {
    label: "a wildcard in the term is treated as text, not a pattern",
    tool: "list_courses",
    args: { search: "%" },
    expect: r => r.courses?.length === 0,
  },
];

let failures = 0;

for (const testCase of CASES) {
  const tools = testCase.surface === "public" ? publicSurface : staff;
  const outcome = await runTool(testCase.tool, testCase.args, tools, {
    ...ctx,
    access: testCase.surface === "public" ? null : OWNER,
  });

  const parsed = outcome.ok ? JSON.parse(outcome.output) : null;
  const passed = outcome.ok && testCase.expect(parsed);
  if (!passed) failures++;

  console.log(`${passed ? "PASS" : "FAIL"}  ${testCase.label}`);
  if (!passed) console.log(`      ${outcome.output.slice(0, 300)}`);
}

console.log(`\n${CASES.length - failures}/${CASES.length} search cases passed.`);
process.exit(failures ? 1 : 0);
