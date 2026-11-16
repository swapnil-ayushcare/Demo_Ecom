# Demo_Ecom

Demo_Ecom is a small, honest Indian shop that lives in one repository. This is
the runnable foundation: a TypeScript Next.js storefront and Node.js route
handlers on top of PostgreSQL, with environment-only configuration, a versioned
migration, an idempotent seed, and a feature registry that discovers a
capability dropped into `src/features/`.

The shop runs locally. The shop itself has no hosted storefront, cloud database
or public URL: you install and run it on your own machine. The release pipeline
publishes one static release marker to Firebase Hosting for verification. That
marker explains the local install path and carries no catalogue, customer or
order data; it is not the shop.

## Prerequisites

- **Node.js 20 LTS** (the `engines` field pins `20.x`).
- **PostgreSQL 15 or later**, running locally or on a machine you control.
- **npm 10+** with the committed `package-lock.json`; `npm ci` is the
  reproducible install.

## 1. Install dependencies

```bash
npm ci
```

## 2. Create the database

Create a PostgreSQL role and database you are happy to use for the shop. For
example, as a PostgreSQL superuser:

```bash
createuser --login --createdb --pwprompt ecom
createdb --owner=ecom demo_ecom
```

The application reaches PostgreSQL only through `DATABASE_URL`, for example:

```
postgresql://ecom:your-password@localhost:5432/demo_ecom
```

## 3. Configure the environment

```bash
cp .env.example .env
```

Fill in every value. The server refuses to start when one is missing and names
the missing variable.

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 15+ connection string used by the server, migration, seed and tests. |
| `SESSION_SECRET` | Random secret of at least 32 characters used to protect sessions. |
| `RAZORPAY_KEY_ID` | Razorpay **test-mode** public key id (`rzp_test_…`). |
| `RAZORPAY_KEY_SECRET` | Razorpay **test-mode** key secret. Never sent to the browser. |

To get Razorpay test keys: sign in at <https://dashboard.razorpay.com>, switch
the dashboard to **Test mode**, open **Settings → API keys**, and generate a
test key. The key id is safe to load on the checkout screen; the key secret is
server-only and must never be committed. Rotating the test key in `.env` is
enough to change checkout configuration — no code change is needed.

No secret or database password is committed to this repository.

## 4. Migrate and seed

```bash
npm run migrate
npm run seed
```

`npm run migrate` applies every file in `db/migrations/` once and records its
checksum in `schema_migrations`. `npm run seed` writes the starting catalogue
from `db/seed-data.json`; it is idempotent and can be run again.

## 5. Run the shop

For local development:

```bash
npm run dev
```

For a production-mode run:

```bash
npm run build
npm start
```

Both commands validate the environment first, then start Next.js. The
storefront is at <http://localhost:3000> and the catalogue API at
<http://localhost:3000/api/catalogue>.

## Tests

Tests use their own PostgreSQL database. They create and migrate that database
themselves, seed it, build the production server and exercise it with
Playwright. They never touch the database in your `.env`.

```bash
npm test
```

`npm test` is the command to report for a change. It runs on Node 20 and uses
the Playwright browsers installed on this machine. A single suite can be run
with `npx playwright test tests/foundation.spec.ts --workers=4`.

## The data layer

- `src/server/env.ts` — `loadEnv` and `getEnv`; a missing variable stops startup.
- `src/server/db.ts` — `openDatabase` and a parameterized query helper.
- `src/server/catalogue/service.ts` — `catalogueService`, the one place that
  reads and writes product content, images, prices and stock. Admin product,
  price and stock screens call this service; they never write their own SQL.
- `src/server/session.ts` — `establishSession` creates a server-side session and
  returns an HTTP-only cookie; only a token hash is stored.
- `src/server/features/registry.ts` — `registerFeature` and filesystem
  discovery for capabilities.
- `src/test/fixtures.ts` — `createFixture`, which creates its own users,
  catalogue and order records for unattended tests.

Money is stored as an integer number of paise in every table. It is formatted as
INR only at the edge, through `src/lib/money.ts`, so `₹1,24,500` reads correctly
with the Indian grouping.

## Adding a capability

A capability gets its own directory. The foundation discovers it; no shared
entry file is edited.

```text
src/features/my-capability/
  feature.json
  page.html
```

```json
{
  "slug": "my-capability",
  "title": "My capability",
  "description": "One plain sentence for the shop.",
  "routes": [{ "path": "/my-capability", "title": "My capability" }],
  "navigation": [{ "label": "My capability", "href": "/my-capability", "area": "shop", "order": 50 }]
}
```

Restart the server and the feature appears in `GET /api/features`, in the shop
navigation, and at its route. `page.html` is served inside the shop shell.
Capabilities with their own Next.js route or React components can add them
under `src/app/` and still use this registry for navigation; the discovery
contract lives in `src/server/features/registry.ts`.

## Project layout

```text
db/                 migration SQL, migration runner, seed and seed data
public/products/    catalogue images shipped with the seed
src/app/            Next.js pages, layout and API route handlers
src/app/(shop)/     the customer-facing shop shell and its routes
src/components/shop/  SiteHeader and CategoryRail shared by the storefront
src/components/ui/  AppShell, PriceTag and ProductCard
src/features/       discovered capabilities (feature.json + page.html)
src/features/catalogue/home/  home catalogue reads and the home composition
src/lib/            shared, framework-free helpers such as INR money
src/server/         environment, database, catalogue, sessions, registry
src/test/           fixture factory for unattended runs
tests/              Playwright specs for the foundation contract
scripts/            environment-checked Next.js runner, test runner and release marker build
orbit/              the release pipeline's static marker deploy script
```

## Distribution

The shippable form is this repository revision plus the lockfile-pinned
dependency tree and the build output produced by that revision. There is no
hosted deployment of the shop to configure. A person receiving the source
follows the steps above and runs the tests to prove the package starts and the
shop works locally.

The only published page is the static release marker built by
`npm run build:hosting` into `hosting-dist/`. It is not the shop and holds no
product, customer or order data.
