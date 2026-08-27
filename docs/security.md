# Security

## Authorisation

Roles come from the brief (§33) and live in `packages/shared/permissions.ts`,
shared by the API and the dashboards so there is one vocabulary.

| Role | Reach |
|---|---|
| Super Admin | Everything, including permissions added later |
| Administrator | Students, applications, courses, attendance, content, reports |
| Instructor | Assigned classes and students, attendance, results |
| Accountant | Fees, payments, expenses, revenue, financial reports, salaries |
| Storekeeper | Inventory, purchases, suppliers, stock movement |
| E-Commerce Manager | Products, orders, customers, sales, inventory |
| Student / Customer | Portal access only, no back-office permissions |

Super Admin is a wildcard rather than a list, so a permission added next month
is never silently withheld from the owner.

### How it is enforced

```ts
// The procedure refuses before it queries anything.
recordStudentPayment: permissionProcedure("payments.write")
```

Three layers, only one of which is a control:

1. `NAV_SECTIONS` hides menu items — **presentation**.
2. `<PermissionGate>` hides pages — **presentation**.
3. `permissionProcedure` refuses the call — **the control**.

A caller who forges the UI reaches an empty page and a string of `FORBIDDEN`
responses. Tests assert that every permission-gated endpoint rejects an
anonymous caller before doing any work.

Grants are read from the database, so an owner can retune a role without a
deploy; the static catalogue is the seed and the fallback for a cold database.

### Salary

`staffProfiles.salary` requires `staff.salary.read`, which only the accountant
and ownership roles carry. A test asserts the other roles do not have it.

## Payments

The rule from §49 is that a payment is only successful once the server has
asked the provider. `packages/api/services/gateway.ts` is the only place that
may say so.

```mermaid
sequenceDiagram
    participant S as Student
    participant A as API
    participant G as Provider

    S->>A: initiate(amount, idempotencyKey)
    A->>A: check outstanding balance
    A->>G: open charge
    A-->>S: checkout URL
    Note over A: intent = pending. No payment. No balance change.

    S->>G: pays
    S->>A: verify(reference)
    A->>G: verify server-to-server
    G-->>A: status, amount, currency
    A->>A: assertVerificationMatches
    A->>A: BEGIN lock intent, capture, allocate, ledger, audit COMMIT
    A-->>S: receipt
```

`assertVerificationMatches` rejects a charge that is not succeeded, whose
amount differs by a single pesewa, or whose currency differs. The attack it
blocks is paying GHS 1 and claiming a GHS 500 intent is settled.

In production a gateway must be configured. `getGateway()` throws rather than
falling back to a stub that could be coaxed into approving a payment. The
development stand-in never reports success on its own — a developer confirms
through an endpoint that refuses to run in production.

### Webhooks

`/api/webhooks/paystack` verifies an HMAC-SHA512 over the **raw request body**
with a length-checked `timingSafeEqual`. It is a route handler rather than a
tRPC procedure precisely because the signature covers the exact bytes sent.

Even a correctly signed body is not believed: the handler still re-verifies the
charge with the provider. Delivery is deduplicated by a unique
`(provider, eventId)`, and a handled duplicate returns 200 so the provider
stops retrying.

## Uploads

`validateDocumentUpload` checks three things (§58):

1. The declared MIME type is on the allow-list.
2. The decoded size is between 1 byte and 8 MB.
3. **The bytes match the declared type** — `%PDF`, the PNG signature, the JPEG
   marker, `RIFF`/`WEBP`.

The third is what stops a renamed executable being accepted as a transcript.
Filenames are stripped of everything outside `[a-zA-Z0-9._-]`, so path
separators cannot survive.

Student documents are stored as authenticated Cloudinary resources and served
through `/api/manus-storage/[...key]`, which is the only route to the bytes and
so is where access is decided. `storageAccessPolicy` classifies the key:

| Key | Who may fetch it |
|---|---|
| `media/product`, `media/gallery`, `media/brochure` | Anyone — these are on the public site |
| `applications/…` | `admissions.read`, or the applicant themselves |
| Anything else | Any signed-in account |

Unrecognised paths fall to the private side, so an upload route added later is
closed until somebody opens it. The `authorize` argument is required rather
than optional: a proxy cannot be mounted without a policy.

## Audit

Every sensitive action writes an immutable row inside the same transaction as
the change, so the log cannot record something that rolled back.

```
user · action · entity · entityId · oldValue · newValue · IP · agent · timestamp
```

Covered: payments and refunds, fee charges, discounts and surcharges, expense
approval, stock movements, purchase orders and receiving, order status changes,
certificates issued and revoked, role grants and revocations, setting changes.

`diffFields` reduces a change to only what actually differed, so the log stays
readable instead of storing two full records.

## Input and output

- **Every procedure validates with zod**, with bounded string lengths and
  integer checks.
- **Page size is capped at 100**, so no client can ask for the whole table.
- **Search terms are escaped** before becoming a `LIKE` pattern — typing `50%`
  searches for the literal text rather than matching every row.
- **Queries are parameterised** through Drizzle; the one place a list of ids is
  needed uses `inArray`, not string interpolation.
- **CSV exports prefix formula characters**, so a cell beginning `=` opens as
  text rather than executing in a spreadsheet.
- **Base64 uploads are length-capped before decoding.** The size check alone ran
  after `Buffer.from` had already allocated, which on an endpoint reachable
  without a session was a way to exhaust memory in one request.

## Response headers

Both apps send `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, a `Permissions-Policy` denying camera,
microphone, geolocation and payment, HSTS, and `frame-ancestors` — `DENY` on
the dashboard, `SAMEORIGIN` on the public site.

A full `script-src` policy is not set: Next emits inline bootstrap scripts, so
one would need a nonce pipeline to be anything other than decorative.

## Secrets

Never in frontend code. Only `NEXT_PUBLIC_*` reaches the browser, and that is
limited to the app id and the public site URL. Everything else — database
credentials, the payment secret, Cloudinary keys, the JWT secret — is read
server-side through `packages/env`.

## Passwords and sessions

- **Hashed with scrypt**, per-user salt, parameters stored alongside the digest
  so the cost can be raised later without invalidating existing hashes. A plain
  password is never written anywhere, including logs.
- **Comparison is timing-safe**, and an unknown email still runs a hash against
  a dummy digest, so response time does not reveal whether an account exists.
- **The failure message is identical** for an unknown email and a wrong
  password, so the form cannot be used to enumerate accounts.
- **Lockout after 8 failed attempts** for 15 minutes, tracked per account.
- **Sessions carry only a user id.** Role, permissions and whether the account
  is still active are re-read from the database on every request, so
  deactivating someone takes effect on their next request rather than when a
  token expires.
- **`passwordHash` is stripped** from `auth.me` before it leaves the server.

The seeded owner password (`blush@2026`) is public — it is in this repository.
It exists so a fresh install can be signed into, is flagged
`mustChangePassword`, and must be changed before the system is exposed.

## Known gaps

Worth stating plainly rather than leaving to be discovered:

- **Two-factor authentication** is modelled (`users.twoFactorEnabled`) but not
  implemented. No secret is stored yet.
- **Rate limiting** is a fixed window held in process memory
  (`services/rateLimit.ts`), applied to sign-in, admissions, clinic bookings,
  order lookup, checkout and certificate verification. It protects one instance
  and resets on deploy, and it identifies callers by `X-Forwarded-For`, which a
  client not behind a trusted proxy can rewrite. The durable answer is still a
  limiter at the edge.
- **Password reset by email** is not implemented. An administrator resets a
  password under Operations → Access, which is workable for a school of this
  size but means the owner account has no self-service recovery.
- **Notification delivery** writes queued rows; the transport that drains them
  is not built, so email, SMS and WhatsApp are recorded rather than sent.
- **Field-level encryption** is not applied to student documents beyond
  Cloudinary's authenticated delivery.
