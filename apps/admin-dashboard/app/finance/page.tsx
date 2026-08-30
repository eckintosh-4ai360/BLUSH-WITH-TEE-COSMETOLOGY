"use client";

import { FormEvent, useMemo, useState } from "react";
import { Button } from "@blush/ui/components/ui/button";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";

const METHODS = [
  ["cash", "Cash"],
  ["mobile_money", "Mobile Money"],
  ["bank", "Bank"],
  ["card", "Card"],
  ["online", "Online"],
] as const;

type Method = (typeof METHODS)[number][0];

/** The category option that opens the "name your own" field instead of picking. */
const NEW_CATEGORY = "__new__";

const cedis = (value: unknown) => `GHS ${Number(value ?? 0).toFixed(2)}`;

export default function AdminFinancePage() {
  const utils = trpc.useUtils();
  const summary = trpc.admin.financeSummary.useQuery();
  const expenses = trpc.admin.expenses.useQuery();
  const categories = trpc.admin.expenseCategories.useQuery();

  /* ------------------------------------------------------------------ */
  /* Student payment                                                     */
  /* ------------------------------------------------------------------ */

  const [studentQuery, setStudentQuery] = useState("");
  const [studentId, setStudentId] = useState<number | null>(null);
  const [feeChargeId, setFeeChargeId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<Method>("cash");
  const [reference, setReference] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Two characters is enough to be worth a round trip, and short enough that a
  // name starts narrowing the list well before it has been typed out.
  const searchTerm = studentQuery.trim();
  const students = trpc.admin.searchStudents.useQuery(
    { term: searchTerm },
    { enabled: searchTerm.length >= 2 && studentId === null },
  );

  const account = trpc.admin.studentFees.useQuery(
    { studentId: studentId ?? 0 },
    { enabled: studentId !== null },
  );

  const recordPayment = trpc.admin.recordStudentPayment.useMutation({
    onSuccess: () => {
      utils.admin.financeSummary.invalidate();
      if (studentId !== null) utils.admin.studentFees.invalidate({ studentId });
      setFeeChargeId("");
      setAmount("");
      setReference("");
    },
    onError: error => setPaymentError(error.message),
  });

  const outstanding = account.data?.summary.outstanding ?? 0;
  const openCharges = account.data?.charges ?? [];

  function clearStudent() {
    setStudentId(null);
    setStudentQuery("");
    setFeeChargeId("");
    setPaymentError(null);
  }

  async function submitStudentPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaymentError(null);
    if (studentId === null) {
      setPaymentError("Search for a student and choose them from the list.");
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setPaymentError("Enter an amount greater than zero.");
      return;
    }
    await recordPayment.mutateAsync({
      studentId,
      feeChargeId: Number(feeChargeId) || undefined,
      amount: value,
      paymentMethod,
      transactionReference: reference.trim() || undefined,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Expense                                                             */
  /* ------------------------------------------------------------------ */

  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [expenseError, setExpenseError] = useState<string | null>(null);

  const addCategory = trpc.admin.addExpenseCategory.useMutation({
    onSuccess: async created => {
      await utils.admin.expenseCategories.invalidate();
      // Select what was just added, so the person carries straight on with the
      // expense they were part-way through recording.
      setCategory(created.key);
      setNewCategory("");
    },
    onError: error => setExpenseError(error.message),
  });

  const addExpense = trpc.admin.addExpense.useMutation({
    onSuccess: () => {
      utils.admin.expenses.invalidate();
      utils.admin.financeSummary.invalidate();
    },
    onError: error => setExpenseError(error.message),
  });

  // The saved list is the whole truth; the extra entry is only a doorway to
  // creating one, so it never gets mistaken for a category itself.
  const categoryOptions = categories.data ?? [];
  const namingCategory = category === NEW_CATEGORY;

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExpenseError(null);
    const form = event.currentTarget;
    const data = new FormData(form);

    if (!category || namingCategory) {
      setExpenseError(
        namingCategory
          ? "Name the new category and add it before saving the expense."
          : "Choose a category.",
      );
      return;
    }

    await addExpense.mutateAsync({
      title: String(data.get("title")),
      category,
      amount: Number(data.get("amount")),
      expenseDate: new Date(String(data.get("expenseDate"))),
      paymentMethod: data.get("paymentMethod") as Method,
      vendor: String(data.get("vendor") || "") || undefined,
    });
    form.reset();
    setCategory("");
  }

  const cards = useMemo(
    () => [
      ["Income", summary.data?.income],
      ["Expenses", summary.data?.outgoings],
      ["Net", summary.data?.net],
      ["Outstanding fees", summary.data?.outstandingFees],
    ],
    [summary.data],
  );

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl">
        <p className="eyebrow">Finance &amp; billing</p>
        <h1 className="mt-2 font-serif text-4xl text-[#4d4458] dark:text-[#e4f4f7]">
          Clear records, calmer decisions.
        </h1>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-3xl border border-white bg-white/70 p-6 dark:border-white/10 dark:bg-white/5"
            >
              <p className="text-xs uppercase tracking-[.14em] text-[#8a808f] dark:text-[#97b9c2]">
                {label}
              </p>
              <p className="mt-3 font-serif text-3xl text-[#51465c] dark:text-[#e4f4f7]">
                {cedis(value)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-7 grid gap-5 xl:grid-cols-2">
          <form
            onSubmit={submitStudentPayment}
            className="rounded-3xl bg-[#eee7f1] p-6 dark:bg-[#2c2334]"
          >
            <p className="eyebrow">Record tuition payment</p>
            <h2 className="mt-2 font-serif text-2xl text-[#51465c] dark:text-[#e4f4f7]">
              Student payment
            </h2>

            <div className="mt-5 space-y-3">
              {studentId === null ? (
                <div>
                  <input
                    value={studentQuery}
                    onChange={event => setStudentQuery(event.target.value)}
                    placeholder="Search by student name or number"
                    autoComplete="off"
                    className="soft-input"
                  />
                  {searchTerm.length >= 2 ? (
                    <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl bg-white/70 dark:bg-white/5">
                      {students.isLoading ? (
                        <p className="px-4 py-3 text-xs text-[#837a8a] dark:text-[#97b9c2]">
                          Searching...
                        </p>
                      ) : !students.data?.length ? (
                        <p className="px-4 py-3 text-xs text-[#837a8a] dark:text-[#97b9c2]">
                          No student matches that name or number.
                        </p>
                      ) : (
                        students.data.map(student => (
                          <button
                            key={student.id}
                            type="button"
                            onClick={() => {
                              setStudentId(student.id);
                              setPaymentError(null);
                            }}
                            className="block w-full px-4 py-2 text-left hover:bg-[#faf3f8] dark:hover:bg-white/10"
                          >
                            <span className="block text-sm text-[#584f63] dark:text-[#e4f4f7]">
                              {student.fullName}
                            </span>
                            <span className="block text-xs text-[#837a8a] dark:text-[#97b9c2]">
                              {student.studentNumber} &middot; {student.status}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              ) : !account.data ? (
                <p className="rounded-2xl bg-white/70 px-4 py-3 text-xs text-[#837a8a] dark:bg-white/5 dark:text-[#97b9c2]">
                  Loading this account...
                </p>
              ) : (
                <div className="rounded-2xl bg-white/70 px-4 py-3 dark:bg-white/5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#584f63] dark:text-[#e4f4f7]">
                        {account.data.student.fullName}
                      </p>
                      <p className="text-xs text-[#837a8a] dark:text-[#97b9c2]">
                        {account.data.student.studentNumber}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearStudent}
                      className="text-xs text-[#8f0d6b] hover:underline dark:text-[#58d6de]"
                    >
                      Change
                    </button>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-[#837a8a] dark:text-[#97b9c2]">Billed</dt>
                      <dd className="font-semibold text-[#584f63] dark:text-[#e4f4f7]">
                        {cedis(account.data.summary.totalFees)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#837a8a] dark:text-[#97b9c2]">Paid</dt>
                      <dd className="font-semibold text-[#584f63] dark:text-[#e4f4f7]">
                        {cedis(account.data.summary.amountPaid)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#837a8a] dark:text-[#97b9c2]">Outstanding</dt>
                      <dd className="font-semibold text-[#584f63] dark:text-[#e4f4f7]">
                        {cedis(outstanding)}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {studentId !== null ? (
                <select
                  value={feeChargeId}
                  onChange={event => {
                    setFeeChargeId(event.target.value);
                    const charge = openCharges.find(row => String(row.id) === event.target.value);
                    // Picking a fee is usually a statement about the amount as
                    // well, so offer its balance rather than making it be typed.
                    if (charge) setAmount(charge.balance.toFixed(2));
                  }}
                  className="soft-input"
                >
                  <option value="">
                    {openCharges.length
                      ? "Apply to the oldest outstanding fees"
                      : "No outstanding fees on this account"}
                  </option>
                  {openCharges.map(charge => (
                    <option key={charge.id} value={charge.id}>
                      {charge.description} - {cedis(charge.balance)} due
                    </option>
                  ))}
                </select>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                  placeholder="Amount"
                  className="soft-input"
                />
                <select
                  value={paymentMethod}
                  onChange={event => setPaymentMethod(event.target.value as Method)}
                  className="soft-input"
                >
                  {METHODS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  value={reference}
                  onChange={event => setReference(event.target.value)}
                  placeholder="Transaction reference"
                  className="soft-input sm:col-span-2"
                />
              </div>

              {outstanding > 0 ? (
                <button
                  type="button"
                  onClick={() => setAmount(outstanding.toFixed(2))}
                  className="text-xs text-[#8f0d6b] hover:underline dark:text-[#58d6de]"
                >
                  Pay full balance ({cedis(outstanding)})
                </button>
              ) : null}

              {paymentError ? (
                <p role="alert" className="text-xs text-[#b3261e] dark:text-[#ffb4ab]">
                  {paymentError}
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              disabled={recordPayment.isPending}
              className="mt-5 rounded-full bg-[#5f5277] text-white"
            >
              Record payment
            </Button>
          </form>

          <form
            onSubmit={submitExpense}
            className="rounded-3xl border border-white bg-white/70 p-6 dark:border-white/10 dark:bg-white/5"
          >
            <p className="eyebrow">Record expenditure</p>
            <h2 className="mt-2 font-serif text-2xl text-[#51465c] dark:text-[#e4f4f7]">
              New expense
            </h2>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <input required name="title" placeholder="Expense title" className="soft-input" />
              <input
                required
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Amount"
                className="soft-input"
              />
              <select
                value={category}
                onChange={event => {
                  setCategory(event.target.value);
                  setExpenseError(null);
                }}
                className="soft-input"
              >
                <option value="">Category</option>
                {categoryOptions.map(option => (
                  <option key={option.key} value={option.key}>
                    {option.name}
                  </option>
                ))}
                <option value={NEW_CATEGORY}>Other (add a new category)</option>
              </select>
              <input required name="expenseDate" type="date" className="soft-input" />

              {namingCategory ? (
                <div className="flex gap-2 sm:col-span-2">
                  <input
                    value={newCategory}
                    onChange={event => setNewCategory(event.target.value)}
                    placeholder="Name the new category, e.g. Licensing"
                    className="soft-input"
                  />
                  <Button
                    type="button"
                    disabled={newCategory.trim().length < 2 || addCategory.isPending}
                    onClick={() => addCategory.mutate({ name: newCategory.trim() })}
                    className="shrink-0 rounded-full bg-[#5f5277] text-white"
                  >
                    Add
                  </Button>
                </div>
              ) : null}

              <input name="vendor" placeholder="Vendor (optional)" className="soft-input" />
              <select name="paymentMethod" className="soft-input">
                {METHODS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {expenseError ? (
              <p role="alert" className="mt-3 text-xs text-[#b3261e] dark:text-[#ffb4ab]">
                {expenseError}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={addExpense.isPending}
              className="mt-5 rounded-full bg-[#5f5277] text-white"
            >
              Save expense
            </Button>
          </form>
        </div>

        <section className="mt-7 rounded-3xl border border-white bg-white/70 p-6 dark:border-white/10 dark:bg-white/5">
          <h2 className="font-serif text-2xl text-[#51465c] dark:text-[#e4f4f7]">Recent expenses</h2>
          <div className="mt-5 grid gap-3">
            {expenses.data?.length ? (
              expenses.data.map(expense => (
                <div
                  key={expense.id}
                  className="flex items-center justify-between rounded-2xl bg-[#faf8fb] px-4 py-3 dark:bg-[#ffffff0d]"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#584f63] dark:text-[#e4f4f7]">
                      {expense.title}
                    </p>
                    <p className="text-xs text-[#837a8a] dark:text-[#97b9c2]">
                      {expense.categoryName ?? expense.category} &middot;{" "}
                      {expense.vendor || "No vendor"}
                    </p>
                  </div>
                  <p className="font-serif text-lg text-[#5d5268] dark:text-[#e4f4f7]">
                    {cedis(expense.amount)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#817889] dark:text-[#97b9c2]">No expenses recorded.</p>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
