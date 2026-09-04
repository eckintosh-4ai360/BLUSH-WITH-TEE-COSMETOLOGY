# API

tRPC over HTTP, mounted at `/api/trpc` in each app. Types flow from the router
to the client, so a renamed field is a compile error rather than a runtime
surprise.

Two routers, because the public app should not be able to name a back-office
procedure:

| Router | Mounted by | Contains |
|---|---|---|
| `clientAppRouter` | `beauty-client-app` | Public content, store, admissions, student portal, online payments, certificate verification |
| `adminAppRouter` | `admin-dashboard` | Dashboard, finance, inventory, orders, certificates, platform administration |

## Procedure kinds

| Kind | Requires | Use |
|---|---|---|
| `publicProcedure` | Nothing | Course listings, store products, certificate verification |
| `protectedProcedure` | A session | Anything tied to an account |
| `studentProcedure` | Student or admin | Student portal, online fee payment |
| `staffProcedure` | Staff or admin | Staff portal |
| `permissionProcedure(...)` | All listed permissions | Back office |
| `anyPermissionProcedure(...)` | Any listed permission | Shared views such as the dashboard |

`permissionProcedure` attaches `ctx.access` and `ctx.actor`, so a procedure can
check finer-grained permissions and attribute what it writes without the caller
supplying either.

## Conventions

**List queries** take a shared input and return a shared envelope:

```ts
{ page, pageSize, search?, sortBy?, sortDir, dateFrom?, dateTo? }
// →
{ rows, page, pageSize, total, totalPages, hasMore }
```

`pageSize` is capped at 100. Some lists add a `filteredTotal` so a table can
show the sum of what is on screen.

**Money** crosses the wire as a plain number in major units (`1234.56`).
Internally it is integer minor units; the conversion happens at the boundary.

**Errors** use tRPC codes with messages written for the person reading them:

| Code | Means |
|---|---|
| `UNAUTHORIZED` | Not signed in |
| `FORBIDDEN` | Signed in, lacks the permission |
| `NOT_FOUND` | No such record |
| `BAD_REQUEST` | Failed validation or a business rule |
| `CONFLICT` | Duplicate reference, or already in that state |

## Admin surface

### `dashboard`
| Procedure | Permission | Returns |
|---|---|---|
| `overview` | any read | Student, finance, inventory, commerce, admissions metrics |
| `charts` | any read | The six analytics series |
| `activity` | any read | Recent applications, orders, payments, low stock |
| `search` | signed in | Global search across six record types |

Each group is permission-filtered: an accountant gets `finance` and `null` for
`inventory`.

### `finance`
| Procedure | Permission |
|---|---|
| `feeStructures`, `upsertFeeStructure` | `fees.read` / `fees.write` |
| `studentAccount`, `outstanding` | `fees.read` |
| `createCharge`, `adjust` | `fees.write` |
| `payments` | `payments.read` |
| `recordStudentPayment`, `refundPayment` | `payments.write` |
| `expenses`, `expenseCategories` | `expenses.read` |
| `addExpense` | `expenses.write` |
| `reviewExpense` | `expenses.approve` |
| `revenue` | `finance.read` |

### `inventory`
| Procedure | Permission |
|---|---|
| `items`, `movements`, `categories` | `inventory.read` |
| `saveItem`, `recordMovement` | `inventory.write` |
| `suppliers`, `supplierDetail` | `suppliers.read` |
| `saveSupplier` | `suppliers.write` |
| `purchaseOrders`, `purchaseOrderDetail` | `purchases.read` |
| `createPurchaseOrder`, `receivePurchaseOrder`, `paySupplier` | `purchases.write` |

### `orders`
| Procedure | Permission |
|---|---|
| `list`, `detail` | `orders.read` |
| `updateStatus` | `orders.write` |
| `recordPayment`, `refund` | `orders.write` + `payments.write` |

### `certificates`
| Procedure | Permission |
|---|---|
| `list`, `eligible`, `detail`, `verifications`, `scans` | `certificates.read` |
| `issue`, `revoke`, `uploadScan`, `deleteScan` | `certificates.write` |

### `platform`
| Procedure | Permission |
|---|---|
| `auditLog`, `auditFacets` | `audit.read` |
| `roles`, `permissionCatalogue`, `accounts` | `roles.read` |
| `assignRole`, `revokeRole` | `roles.write` |
| `settings` | `settings.read` |
| `updateSetting` | `settings.write` |

### `notifications`
`list`, `unreadCount`, `markRead`, `markAllRead`, `preferences`,
`updatePreference` — all scoped to the caller, who cannot read or dismiss
anybody else's.

## Client surface

### `payments` — online fee payment
| Procedure | Notes |
|---|---|
| `balance` | Outstanding balance, and the ceiling on what may be paid |
| `initiate` | Opens a charge. Writes an intent only — no payment, no balance change |
| `verify` | Verifies with the provider, then captures. Idempotent |
| `history` | The student's own payment attempts |
| `simulateProviderSuccess` | Development only; refuses in production |

### `certificates`
`verify` takes a certificate number or a QR token and returns
`verified` / `revoked` / `not_found` with the minimum an employer needs. Every
lookup is logged, found or not.

### Others
`store` (products, cart, checkout, order lookup), `admissions`, `appointments`,
`portal`, `content`, `auth`.

## Webhook

`POST /api/webhooks/paystack` on the client app. Signed with HMAC-SHA512 over
the raw body; deduplicated by event id; re-verifies with the provider before
recording anything. Returns 200 for duplicates so the provider stops retrying,
500 on a processing failure so it does.

## Calling it

```ts
const payments = trpc.finance.payments.useQuery({
  page: 1,
  pageSize: 25,
  sortDir: "desc",
  search: "MOMO",
});

const record = trpc.finance.recordStudentPayment.useMutation({
  onSuccess: () => toast.success("Payment recorded."),
  onError: error => setError(error.message),
});
```

## Verifying the surface

```bash
pnpm --filter @blush/api smoke
```

Runs every read endpoint against the real database with an owner context and
prints what came back. Type checking cannot catch a malformed query; only
executing it can.
