# MCM Manager

Booking and back-office system for the Leasio / MCM Racing School paddock: track-day
reservations, Ohvale fleet management, championship packages, tariffs and academy lessons.

Built with React Router 7 (SSR), Prisma + PostgreSQL, Tailwind 4 and Resend.

## Getting started

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env
```

`SESSION_SECRET` is required — the app refuses to start without it, so that a
predictable signing key can never reach production. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Push the schema and seed the database:

```bash
npx prisma db push
npm run seed
```

Start the dev server at `http://localhost:5173`:

```bash
npm run dev
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build into `build/` |
| `npm run start` | Serve the production build |
| `npm run typecheck` | Route typegen + `tsc` |
| `npm test` | Run the unit tests |
| `npm run seed` | **Destroys all data** and reseeds. Requires `SEED_CONFIRM=wipe`. |

## Application structure

- `app/routes/` — public pages: home, login, signup, booking flow, dashboard, order pass, academy
- `app/routes/admin/` — back office behind `requireAdmin`: bookings, fleet, tariffs, calendar, championships, lessons, settings
- `app/utils/` — server-side helpers: auth/sessions, Prisma client, email, QR codes, locale, translations
- `prisma/schema.prisma` — data model

### Booking lifecycle

A customer booking is created with status `PENDING`. The back office confirms or
cancels it from `/admin/bookings` or the order page, and each transition emails
both the customer and every admin account.

Availability and pricing are resolved entirely on the server inside a single
`Serializable` transaction, so concurrent requests cannot overbook a slot or be
assigned the same bike. Prices submitted by the client are ignored.

### Password reset

`/forgot-password` issues a single-use link valid for 60 minutes. Only the
SHA-256 digest of the token is stored, requesting a new link invalidates any
outstanding one, and the response is identical whether or not the address is
registered — so the endpoint cannot be used to discover who has an account.

Completing a reset stamps `User.passwordChangedAt`, which invalidates every
session issued before that moment. Sessions created before this mechanism
existed carry no issued-at marker and are grandfathered in; they expire
naturally within the 30-day cookie lifetime.

Spent and long-expired tokens can be cleared with `purgeStaleResetTokens()`
from `app/utils/password-reset.server.ts` if you want to run periodic housekeeping.

## Deployment

### Docker

```bash
docker build -t mcm-manager .
docker run -p 3000:3000 --env-file .env mcm-manager
```

### Manual

Deploy the output of `npm run build` alongside `package.json` and
`package-lock.json`, then run `npm run start`. Provide the environment variables
from `.env.example` through your platform's secret store rather than a committed file.

## Schema changes

The schema is under versioned migrations in `prisma/migrations`. `00000000000000_init`
is a baseline of the database as it stood when migrations were introduced; it is
marked applied and must never be run against the existing database.

Develop a change against a scratch database:

```bash
npx prisma migrate dev --name what_changed
```

Apply pending migrations to a deployed environment:

```bash
npx prisma migrate deploy
```

`migrate deploy` needs no shadow database, so it is the safe command to run
against production. Avoid `prisma db push` from here on — it changes the
database without leaving a migration behind, and the two will drift apart.

## Seeding

`prisma/seed.ts` **deletes every row in every table** before reseeding. It refuses
to run unless you confirm, and refuses outright when `NODE_ENV=production`:

```bash
SEED_CONFIRM=wipe npm run seed
```
