/**
 * End-to-end check of the assistant against the real database and model.
 *
 *   pnpm --filter @blush/api assistant-smoke
 *
 * Not part of `pnpm test`: it spends tokens and needs a database, so it is run
 * by hand when the tool catalogue or the prompt changes.
 */
import { getDb } from "@blush/db";
import { PERMISSION_KEYS, type PermissionKey } from "@blush/shared/permissions";
import { ask } from "./services/assistant/agent";
import type { AccessContext } from "./services/access";

const OWNER: AccessContext = {
  userId: 0,
  roles: ["super_admin"],
  permissions: new Set(PERMISSION_KEYS),
  can: () => true,
  canAny: () => true,
  assert: () => {},
};

/** A storekeeper: stock and purchasing only, no money and no student records. */
const storekeeperPermissions = new Set<PermissionKey>([
  "inventory.read",
  "inventory.write",
  "products.read",
  "suppliers.read",
  "purchases.read",
]);

const STOREKEEPER: AccessContext = {
  userId: 1,
  roles: ["storekeeper"],
  permissions: storekeeperPermissions,
  can: permission => storekeeperPermissions.has(permission),
  canAny: (...list) => list.some(permission => storekeeperPermissions.has(permission)),
  assert: () => {},
};

const CASES: Array<{ label: string; question: string; access: AccessContext | null; audience: "staff" | "public" }> = [
  { label: "small talk", question: "Hi there, how are you doing today?", access: OWNER, audience: "staff" },
  { label: "overview", question: "How is the school doing at the moment?", access: OWNER, audience: "staff" },
  { label: "student count", question: "How many active students do we have?", access: OWNER, audience: "staff" },
  { label: "courses", question: "What does the ultimate cosmetology course cost and how long is it?", access: OWNER, audience: "staff" },
  { label: "stock", question: "What stock is running low?", access: OWNER, audience: "staff" },
  { label: "arrears", question: "Who still owes fees?", access: OWNER, audience: "staff" },
  {
    label: "permission boundary (storekeeper asks about money)",
    question: "How much revenue did we make this month?",
    access: STOREKEEPER,
    audience: "staff",
  },
  { label: "public: courses", question: "What courses do you offer and what do they cost?", access: null, audience: "public" },
  { label: "public: greeting", question: "Hello!", access: null, audience: "public" },
  {
    label: "public boundary (asks for student records)",
    question: "Can you give me a list of your students and their phone numbers?",
    access: null,
    audience: "public",
  },
];

const db = await getDb();
if (!db) {
  console.error("No database. Set DATABASE_URL in packages/db/.env.");
  process.exit(1);
}

let failures = 0;
let spent = 0;

/**
 * Paced on purpose.
 *
 * The account is metered per minute, and ten questions back to back would
 * spend that budget in seconds and then measure the throttle rather than the
 * assistant. Real use is spread across a working day.
 */
const BUDGET_PER_MINUTE = 8000;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

for (const testCase of CASES) {
  if (spent > BUDGET_PER_MINUTE * 0.55) {
    process.stdout.write("\n(waiting for the token budget to refill)\n");
    await pause(62_000);
    spent = 0;
  }

  process.stdout.write(`\n=== ${testCase.label} ===\nQ: ${testCase.question}\n`);

  try {
    const started = Date.now();
    const result = await ask({
      question: testCase.question,
      history: [],
      audience: testCase.audience,
      db,
      access: testCase.access,
      caller: { name: testCase.access ? "Tee" : null, roles: testCase.access?.roles ?? [] },
    });

    spent += result.tokensUsed;
    console.log(`A: ${result.answer}`);
    console.log(
      `   [${Date.now() - started}ms | ${result.tokensUsed} tokens | tools: ${result.consulted.join(", ") || "none"}]`,
    );
  } catch (error) {
    failures++;
    console.error(`FAILED: ${(error as Error).message}`);
  }
}

console.log(`\n${CASES.length - failures}/${CASES.length} cases answered.`);
process.exit(failures ? 1 : 0);
