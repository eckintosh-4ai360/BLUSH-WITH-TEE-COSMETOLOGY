import { describe, expect, it } from "vitest";
import { planCharges, type ExistingCharge, type StructureRow } from "./billing";

const registration: StructureRow = {
  id: 1,
  feeType: "registration",
  label: "Registration Form",
  amount: "150.00",
  dueOffsetDays: 0,
};

const tuitionStructure: StructureRow = {
  id: 2,
  feeType: "tuition",
  label: "Basic Cosmetology tuition",
  amount: "4500.00",
  dueOffsetDays: 30,
};

const placeholder: ExistingCharge = {
  id: 10,
  feeStructureId: null,
  feeType: "tuition",
  amountDue: "0.00",
};

const base = {
  courseTuition: "5000.00",
  courseTitle: "Basic Cosmetology Course",
};

describe("planCharges", () => {
  it("bills the programme price when no tuition structure is configured", () => {
    const plan = planCharges({ ...base, structures: [], existing: [] });
    expect(plan.create).toEqual([
      {
        feeStructureId: null,
        feeType: "tuition",
        description: "Basic Cosmetology Course tuition",
        amount: "5000.00",
        dueOffsetDays: 0,
      },
    ]);
  });

  it("bills a structure that names no course, which is how 'all programmes' is written", () => {
    const plan = planCharges({ ...base, structures: [registration], existing: [] });
    expect(plan.create).toHaveLength(2);
    expect(plan.create.map(charge => charge.description)).toContain("Registration Form");
  });

  it("prefers a configured tuition structure over the programme price", () => {
    // Otherwise the course price and its own fee-structure entry both land.
    const plan = planCharges({ ...base, structures: [tuitionStructure], existing: [] });
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]?.amount).toBe("4500.00");
  });

  it("fills in the zero-amount placeholder rather than adding a second tuition charge", () => {
    const plan = planCharges({ ...base, structures: [], existing: [placeholder] });
    expect(plan.create).toEqual([]);
    expect(plan.repair).toEqual([
      { id: 10, amount: "5000.00", description: "Basic Cosmetology Course tuition" },
    ]);
  });

  it("leaves a tuition charge that already has a real amount alone", () => {
    // Somebody may have part-paid it; changing the figure is an edit, not a sync.
    const plan = planCharges({
      ...base,
      structures: [],
      existing: [{ id: 11, feeStructureId: null, feeType: "tuition", amountDue: "5000.00" }],
    });
    expect(plan).toEqual({ create: [], repair: [] });
  });

  it("does not bill the same structure twice", () => {
    const plan = planCharges({
      ...base,
      structures: [registration],
      existing: [
        { id: 12, feeStructureId: 1, feeType: "registration", amountDue: "150.00" },
        { id: 13, feeStructureId: null, feeType: "tuition", amountDue: "5000.00" },
      ],
    });
    expect(plan).toEqual({ create: [], repair: [] });
  });

  it("is idempotent: replanning after applying its own output raises nothing", () => {
    const first = planCharges({ ...base, structures: [registration], existing: [] });
    const applied: ExistingCharge[] = first.create.map((charge, index) => ({
      id: 100 + index,
      feeStructureId: charge.feeStructureId,
      feeType: charge.feeType,
      amountDue: charge.amount,
    }));

    expect(planCharges({ ...base, structures: [registration], existing: applied })).toEqual({
      create: [],
      repair: [],
    });
  });

  it("raises a newly added structure against an account already billed", () => {
    // The case that made a new mandatory fee never reach existing students.
    const plan = planCharges({
      ...base,
      structures: [registration],
      existing: [{ id: 14, feeStructureId: null, feeType: "tuition", amountDue: "5000.00" }],
    });
    expect(plan.create).toEqual([
      {
        feeStructureId: 1,
        feeType: "registration",
        description: "Registration Form",
        amount: "150.00",
        dueOffsetDays: 0,
      },
    ]);
  });

  it("bills nothing for a free programme", () => {
    const plan = planCharges({
      structures: [],
      courseTuition: "0.00",
      courseTitle: "Taster Session",
      existing: [],
    });
    expect(plan).toEqual({ create: [], repair: [] });
  });

  it("survives a programme with no price recorded", () => {
    const plan = planCharges({
      structures: [],
      courseTuition: null,
      courseTitle: "Unpriced",
      existing: [],
    });
    expect(plan).toEqual({ create: [], repair: [] });
  });
});
