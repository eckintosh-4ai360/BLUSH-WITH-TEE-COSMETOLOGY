# Blush With Tee

One platform for a cosmetology school: admissions, students, academics, fees,
a storefront, shared inventory, procurement and the back office that runs them.

The organising principle is that there is **one backend and one database**. The
public website, the admin system and the portals are three interfaces over the
same tables, so a product edited in the admin appears on the website, an order
placed on the website appears in the admin, and stock sold online comes off the
same shelf the classroom draws from.

```
                        ONE PLATFORM
                    Shared backend / API
                            │
                     Central database
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
     Website             Admin              Portals
   (marketing,        (back office)      (student, staff)
    store, apply)
```

---

## Quick start

```bash
pnpm install                 # Node 20+, pnpm 10+
cp apps/admin-dashboard/.env.example apps/admin-dashboard/.env
cp apps/beauty-client-app/.env.example apps/beauty-client-app/.env
cp apps/admin-dashboard/.env  packages/db/.env      # drizzle reads this one

pnpm db:push                 # generate + apply migrations
pnpm db:seed                 # courses, stock, clinic services
pnpm db:seed:demo            # a full demo school (development only)

pnpm dev                     # admin on :3000, website on :3001
```

| Command | What it does |
|---|---|
| `pnpm dev` | Runs both apps |
| `pnpm dev:admin` / `pnpm dev:client` | Runs one app |
| `pnpm check` | Type checks every package |
| `pnpm test` | Unit tests |
| `pnpm build` | Production build |
| `pnpm db:push` | Generate and apply migrations |
| `pnpm db:seed` | Foundation data (safe everywhere) |
| `pnpm db:seed:demo` | Realistic demo school (refuses in production) |
| `pnpm db:reconcile` | Repair derived values from their ledgers |
| `pnpm --filter @blush/api smoke` | Run every read endpoint against the real database |

---

## Layout

```
apps/
  admin-dashboard/     Back office (Next.js, port 3000)
  beauty-client-app/   Public website, store, portals (port 3001)
packages/
  api/                 tRPC routers + business services
  db/                  Drizzle schema, migrations, seeds
  auth/                OAuth, sessions
  ui/                  Design system, charts
  shared/              Permission catalogue, constants
  storage/             Cloudinary file storage
  env/                 Environment access
```

`packages/api` is deliberately split:

- **`routers/`** validate input, check permissions, and call services.
- **`services/`** hold the business rules — allocation, the revenue ledger,
  stock movement, the order state machine, payment verification. This is where
  the logic that must be correct lives, and it is what the tests exercise.

---

## Documentation

| Document | Covers |
|---|---|
| [Architecture](docs/architecture.md) | How the pieces fit, request flow, key invariants |
| [Database](docs/database.md) | Entity relationships, table map, migrations |
| [API](docs/api.md) | The full procedure surface and how to call it |
| [Security](docs/security.md) | RBAC, payment verification, uploads, audit |
| [Operations](docs/operations.md) | Environments, deployment, backups, monitoring |
| [Admin guide](docs/admin-guide.md) | Day-to-day use of the back office |

---

## The rules the system will not bend on

These are enforced in code, not by convention. Each has a test.

- **Money is never a stored total.** Income is the sum of the revenue ledger,
  and every line points at the transaction that produced it.
- **Balances are never edited by hand.** A payment allocates across charges
  inside one transaction; that allocation is the only writer of `amountPaid`.
- **Refunds reverse, they do not rewrite.** A refund writes a negative
  counter-entry so history stays intact.
- **A frontend cannot confirm a payment.** The server re-verifies every charge
  with the provider and matches the amount before a cedi moves.
- **Stock cannot go negative** except through an explicit, permissioned
  adjustment, and every change writes a ledger row in the same transaction.
- **An order cannot skip its lifecycle.** Delivered has to be earned by
  confirming and processing first.
- **Authorisation is server-side.** Hiding a menu item is presentation; the
  procedure refuses the call regardless of what the browser rendered.

---

## Status

Built and verified:

- Central schema (68 tables) with foreign keys, indexes and constraints
- Role-based access control, enforced per procedure
- Audit logging on every sensitive action
- Revenue ledger, fee accounts, payment allocation, refunds
- Expenses with approval, suppliers, purchase orders, stock receiving
- Store orders with a status machine, refunds and stock rules
- Verified online payments with idempotent capture and a signed webhook
- Certificates with a public verification page
- Dashboard: all metric groups plus six analytics charts
- Global search, notification centre, quick actions
- 92 unit tests, plus a smoke run covering 29 endpoints against real data

Not yet built — see [docs/roadmap.md](docs/roadmap.md) for the detail:

- CMS screens for pages, banners, blog, gallery, testimonials, FAQs and events
- PDF and Excel report exports, printable receipts and admission letters
- Student and instructor portal screens for the newer modules
- Timetable, class scheduling and the customer CRM screens
