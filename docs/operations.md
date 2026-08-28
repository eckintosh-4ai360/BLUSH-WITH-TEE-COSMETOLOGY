# Operations

## Environments

| Environment | Database | Gateway | Demo data |
|---|---|---|---|
| Development | Neon branch | Manual stand-in | Yes |
| Staging | Neon branch | Provider test keys | Yes |
| Production | Neon primary | Provider live keys | **Never** |

The demo seed refuses to run when `NODE_ENV=production`, and `getGateway()`
throws in production rather than falling back to the stand-in.

## Environment variables

Each app reads its own `.env`; `packages/db/.env` is what drizzle-kit uses.

### Database
| Variable | Notes |
|---|---|
| `DATABASE_URL` | Pooled endpoint. What the apps use |
| `DIRECT_DATABASE_URL` | Direct endpoint. Migrations only |

Both need `sslmode=require`; the pool verifies the full certificate chain.

### Authentication
Sign-in is email and password against the platform's own `users` table. There is
no external identity provider.

| Variable | Notes |
|---|---|
| `JWT_SECRET` | Session signing. Independent per app, different per environment |

Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Rotating `JWT_SECRET` invalidates every session immediately, which is the
intended lever if a token is ever believed to have leaked.

#### First sign-in
The owner account is created on the first sign-in attempt against an empty
system, or ahead of time with:

```bash
pnpm --filter @blush/auth ensure-admin
```

| | |
|---|---|
| Dashboard | <http://localhost:3000> |
| Email | `admin@bwtee.com` |
| Password | `blush@2026` |

The account is flagged `mustChangePassword`, so the first sign-in lands on
`/account/password` and a banner stays up until it is changed. **Change it
before the system is reachable from anywhere but your machine** — this password
is in the repository and is therefore public.

Every other account is created under **Operations → Access**, which sets the
password (hashed with scrypt) and grants the role in one step.

### Payments
| Variable | Notes |
|---|---|
| `PAYSTACK_SECRET_KEY` | Verification and webhook signatures. **Required in production** |

### Storage
| Variable | Notes |
|---|---|
| `CLOUDINARY_CLOUD_NAME` / `API_KEY` / `API_SECRET` | Assets stored as authenticated resources |
| `CLOUDINARY_FOLDER` | Defaults to `blush-with-tee` |

### Messaging
Email and SMS are configured from **Settings → Messaging** in the dashboard, and
what is typed there is stored in the database. These variables are for
deployments that would rather not keep credentials in the database: any one of
them overrides the saved value, and the settings page then shows that field as
read-only.

| Variable | Notes |
|---|---|
| `MNOTIFY_API_KEY` / `MNOTIFY_SENDER_ID` | mNotify credentials. The sender ID must be approved by mNotify |
| `MNOTIFY_BASE_URL` | Defaults to `https://api.mnotify.com/api/sms/quick` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Gmail wants an app password, not the account password |
| `MESSAGING_CRON_SECRET` | Guards `/api/messaging/flush`. Without it that route refuses everything |

Messages are queued in the same transaction as the event that caused them and
sent immediately afterwards. Anything that fails is retried up to three times.
Point a scheduler at `/api/messaging/flush` every five or ten minutes, sending
the secret as a bearer token, so a message that was queued while the provider
was down still goes out:

```bash
curl -H "Authorization: Bearer $MESSAGING_CRON_SECRET" https://your-dashboard/api/messaging/flush
```

Nothing is sent to anybody until **Automatic messages** is switched on in
Settings, whatever else is configured. Every attempt, successful or not, is
listed under **Recent messages** with the reason it did not go.

### Site
| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public site origin, used for certificate verification links |

Only `NEXT_PUBLIC_*` reaches the browser. Everything else stays server-side.

## Deploying

```bash
pnpm install --frozen-lockfile
pnpm check          # types
pnpm test           # unit tests
pnpm build          # both apps
pnpm db:push        # migrations, over the direct endpoint
```

Order matters: migrate before the new code serves traffic. Every migration is
additive-first, so an old build tolerates a migrated database for the length of
a rollout.

### Domains

| Host | Serves |
|---|---|
| `www.example.com` | Public website and store |
| `admin.example.com` | Admin dashboard |
| `portal.example.com` | Student and instructor portals |

All three share one backend and one database. The portals are routes on the
client app, so `portal.` can be a rewrite rather than a fourth deployment.

Production requires HTTPS. Session cookies are `HttpOnly` and `SameSite=Lax`,
and carry `Secure` whenever the request arrives over TLS — so localhost works
over plain http while production is protected. `SameSite=Lax` is sufficient
because sign-in is same-origin: there is no cross-site redirect to accommodate.

## Backups

Neon provides continuous backup with point-in-time restore. Set retention to
match the school's obligations — 30 days is a reasonable floor for financial
records, and Ghanaian tax records generally need longer.

Recommended:

| What | Frequency | Retention |
|---|---|---|
| Point-in-time restore | Continuous | 30 days |
| Logical dump (`pg_dump`) to object storage | Nightly | 90 days |
| Monthly archive | Monthly | 7 years |
| Cloudinary assets | Weekly sync | 90 days |

A nightly dump matters even with PITR: it protects against the account itself
being lost, which PITR does not.

### Restore drill

Restoring is not proven until it has been done:

1. Restore the latest dump into a scratch database.
2. Point `DATABASE_URL` at it and run `pnpm --filter @blush/api smoke`.
3. Run `pnpm db:reconcile` and confirm it reports nothing to repair.
4. Check that revenue equals completed payments.

Run this quarterly. Step 3 is the one that catches a partial restore.

## Monitoring

Worth alerting on:

| Signal | Why |
|---|---|
| `webhookEvents` with a non-null `error` | Payments the provider confirmed but we failed to record |
| `paymentIntents` stuck in `pending` over 24h | Abandoned checkouts, or a broken verify path |
| `pnpm db:reconcile` reporting repairs | Something wrote outside the intended path |
| Items at or below reorder level | Stock about to run out |
| 5xx rate on `/api/trpc` | The obvious one |

The first is the most important: a payment taken but not recorded is money the
school has received and cannot see.

## Scheduled work

Not yet wired, but the procedures exist:

| Job | Frequency | Calls |
|---|---|---|
| Low-stock alerts | Daily | `inventory.notifyLowStock` |
| Outstanding fee reminders | Weekly | Fee reminder notifications |
| Notification delivery | Every few minutes | Drains queued `notificationDeliveries` |
| Reconciliation check | Nightly | `pnpm db:reconcile`, alert if it repairs anything |

## Performance

Already in place: server-side pagination everywhere, indexes on every foreign
key and filter column, joined queries rather than N+1 loops, a bounded
connection pool, and batched seeding.

Worth doing as volume grows: caching the dashboard aggregates for a minute or
two, moving notification delivery to a queue, and adding a read replica for
reporting.
