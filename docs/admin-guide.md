# Admin guide

Written for the people running the school, not for developers.

## Signing in

The dashboard is at **<http://localhost:3000>** in development, and at
`admin.yourdomain.com` once deployed.

Sign in with your email and password. What you see depends on the role you have
been given — an accountant sees money, a storekeeper sees stock. If a section is
missing, ask an administrator to grant you the role rather than looking for a
different link.

**The very first sign-in** uses the account the system ships with:

| | |
|---|---|
| Email | `admin@bwtee.com` |
| Password | `blush@2026` |

You are taken straight to a password change, and a banner stays up until it is
done. This password is published in the project documentation, so it protects
nothing until you replace it.

**Forgotten password.** There is no self-service reset. Ask another
administrator to reset it under Operations → Access; you will choose your own on
the next sign-in.

## Adding people

**Operations → Access → Create account.** Enter a name and email, pick a role,
and either keep the generated password or type one. Give the password to the
person directly — they are asked to choose their own the first time they sign
in, so what you set is never the password in use for long.

The same screen grants and removes roles, resets a forgotten password, and
deactivates someone who has left. Deactivating takes effect immediately, on
their very next click, rather than whenever their session would have expired.

A role is not optional: an account without one can sign in and see nothing,
which looks like a broken system rather than a permissions problem.

## The dashboard

Answers the daily questions at a glance: how many students, who applied, who
owes fees, what came in today, what was spent, what sold, which orders are
waiting, what stock is low.

Every figure is calculated from real transactions. Nothing on this page is a
number somebody typed in, which is why it can be trusted and why it cannot be
corrected directly — a wrong figure means a wrong transaction, and that is what
needs fixing.

**Charts.** Each has a *Show table* button giving the same numbers as text —
useful for reading exact values, and for anyone who finds the colours hard to
separate.

**Search** (top bar, or `Ctrl`/`⌘ K`) finds a student number, order number,
certificate number, product SKU, or a person by name, email or phone.

**The bell** collects new applications, orders, payments and low-stock alerts.
Clicking one opens the record.

## Money

### Recording a payment

*Finance → Payments → Record payment*, or the **Record** button beside a
student on *Fees owed*.

Search the student, and their balance appears. The amount is allocated to the
oldest unpaid charge first, then the next, automatically. A non-cash payment
needs a transaction reference — the MoMo or bank reference — and the same one
cannot be recorded twice.

### Refunds

*Refund* beside a payment. The original payment is left exactly as it was and a
reversing entry is written beside it, so the history of what was received stays
intact and the reports still add up. Refunding more than was paid is refused.

### Fees owed

*Finance → Fees owed* lists everyone carrying a balance, largest first. Export
gives you a CSV for follow-up calls.

### Expenses

*Finance → Expenses → Add expense*. If you do not have approval permission the
expense is held as pending and finance is notified. Approvers see Approve and
Reject beside pending rows. Rejected expenses are excluded from reports but not
deleted.

## Orders

*Orders* lists everything from the storefront. Click a row to open it.

The order page shows the customer, the items, the totals, the payment history
and a timeline of everything that has happened.

**Moving an order on.** Only the valid next steps are offered. An order has to
be confirmed and processed before it can be delivered — this is deliberate, and
the buttons will not offer a shortcut.

**Recording payment** deducts the ordered stock and books the sale as revenue.
That is the moment inventory moves, and the dialog says so.

**Cancelling** returns any reserved stock to the shelf.

**Refunding** asks whether the goods came back. Leave *Return goods to stock*
off if they were not returned or cannot be resold.

## Stock

*Stock* is one shared pool. The storefront, the classroom and the salon all
draw from it, so a sale online reduces what the classroom can use.

**Movement** beside an item records a change. Pick why stock is moving and
enter a plain positive number — the reason decides the direction, so you cannot
accidentally add when you meant to remove.

**Stock count adjustment** is the exception: enter what you actually counted
and the difference is recorded. This is the only movement that can take stock
below zero, and it requires an explicit tick.

*Stock movements* is the full history — every unit in and out, what caused it,
and the balance it left behind.

## Certificates

*Certificates → Issue certificate* offers students who have completed a course
and do not already hold one for it. The grade is calculated from their results
unless you type one.

Each certificate gets a number (`COS-2026-00124`) and a private verification
link. **Verify** opens the public page an employer would see.

**Revoke** marks a certificate withdrawn. The record is kept and the public
page shows it as withdrawn rather than pretending it never existed.

## Access

*Operations → Access* shows every account and its roles. Grant a role from the
dropdown; remove one with the × on the badge.

The cards below explain what each role can do, and the catalogue lists every
permission. You cannot remove your own access — ask another administrator.

## Audit log

*Operations → Audit log* records who changed what and when: payments, refunds,
discounts, expense approvals, stock adjustments, order changes, certificates,
role grants and settings changes. Filter by record type or action, and export.

Entries cannot be edited or deleted, by anyone. That is the point of them.

## Settings

*Operations → Settings* holds the school's identity, currency and receipt
configuration, delivery rules, grading bands, attendance rules and certificate
numbering. These feed receipts, letters, certificates and the rules the system
applies, so a change here changes behaviour everywhere.

## When something looks wrong

**A balance looks wrong.** Open the student's account and check the charges and
payments. The balance is calculated from them, so the error is in a
transaction, not the total.

**Stock does not match the shelf.** Check *Stock movements* for that item. If
the ledger does not explain the count, record a stock count adjustment — that
is what it is for.

**A payment is missing.** Search the transaction reference. If the student paid
online and it is not there, the provider may not have confirmed it; the
technical team can check the webhook log.

**Numbers disagree between two screens.** Report it. The screens read the same
tables, so a genuine disagreement is a bug worth knowing about.
