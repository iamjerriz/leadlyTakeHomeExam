# Inventory Reservation API

- **GitHub repo:** https://github.com/iamjerriz/leadlyTakeHomeExam
- **Deployed Vercel URL:** https://inventory-reservation-api-zeta.vercel.app
- **Demo video:** _TODO: add link after recording_

## 1. Overview

A small backend API that lets a store hold ("reserve"), confirm, and cancel inventory for
customers without overselling. Built with Express.js + TypeScript, backed by Supabase
(PostgreSQL).

**Design summary:** all stock-mutating operations (reserve, confirm, cancel, expire) are
implemented as PL/pgSQL functions in the database (see `migrations/001_init.sql`), each
using `SELECT ... FOR UPDATE` to lock the relevant row before reading and writing it. Every
function call runs inside a single implicit Postgres transaction, so the
"check availability, then update" sequence can never race across two concurrent requests —
Postgres itself serializes them. The Node/Express layer is a thin wrapper: routes validate
input, controllers call services, and services call these database functions via
`supabase.rpc(...)`. `available_quantity` is never stored — it is always derived as
`total_quantity - reserved_quantity - confirmed_quantity`.

### Assumptions made
- `customer_id` is a free-text string (no customer/user table or auth — out of scope per the
  assignment).
- One reservation always refers to exactly one item and one customer.
- A customer can hold multiple concurrent reservations (no per-customer limit specified).
- Default reservation TTL is 10 minutes (`RESERVATION_TTL_MINUTES`), matching the example in
  the spec.
- Expiration is handled two ways: (1) explicitly via `POST /v1/maintenance/expire-reservations`
  (call it from a cron job, or by hand for the demo — no background worker is required per the
  spec), and (2) lazily — `confirm`/`cancel` on a reservation whose `expires_at` has passed
  will first flip it to `EXPIRED` and release its hold, so stale PENDING rows never block
  inventory even if the maintenance endpoint hasn't run yet.
- Deleting items/reservations is out of scope; only status transitions are supported.

## 2. Project structure

```
migrations/001_init.sql   Full schema: tables, constraints, indexes, FKs, and the
                           reserve/confirm/cancel/expire PL/pgSQL functions.
src/
  config/                 Env loading, Supabase client
  middleware/             validate (Zod), asyncHandler, centralized errorHandler
  validation/             Zod schemas for all request bodies/params
  services/               Business logic + Supabase/RPC calls
  controllers/            Thin HTTP glue: read input -> call service -> respond
  routes/                 Express routers
  docs/openapi.ts         Hand-written OpenAPI 3.0 spec, served at /docs and /openapi.json
  app.ts / server.ts      Express app factory / local dev listener
api/index.ts              Vercel serverless entry point (exports the Express app)
scripts/concurrency-test.ts  Fires concurrent reservation requests to prove no overselling
```

## 3. Supabase setup

1. Create a new project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** in the Supabase dashboard, paste the entire contents of
   [`migrations/001_init.sql`](migrations/001_init.sql), and run it. It creates the `items`
   and `reservations` tables, all constraints/indexes/foreign keys, and the four
   PL/pgSQL functions. It is idempotent and requires no manual follow-up steps.
3. In **Project Settings -> API**, copy:
   - **Project URL** -> `SUPABASE_URL`
   - **service_role key** (not the anon key) -> `SUPABASE_SERVICE_ROLE_KEY`

## 4. Environment variables

Copy `.env.example` to `.env` and fill in the values.

| Variable                     | Required | Description                                              |
|-------------------------------|:--------:|------------------------------------------------------------|
| `SUPABASE_URL`                | yes      | Supabase project URL                                      |
| `SUPABASE_SERVICE_ROLE_KEY`   | yes      | Supabase service-role key (server-side only, never expose) |
| `RESERVATION_TTL_MINUTES`     | no       | Reservation hold duration in minutes (default `10`)        |
| `PORT`                        | no       | Local dev server port (default `3000`, unused on Vercel)   |

## 5. Run locally

```bash
npm install
cp .env.example .env   # then fill in your Supabase values
npm run dev
```

The API listens on `http://localhost:3000` (or your `PORT`).

- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/openapi.json`
- Health check: `http://localhost:3000/health`

Production build:

```bash
npm run build
npm start
```

## 6. Deploy to Vercel

1. `npm install -g vercel` (if you don't already have it), then `vercel login`.
2. From the project root: `vercel` (first deploy) or `vercel --prod` (production).
3. In the Vercel project dashboard, add the same environment variables from section 4
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESERVATION_TTL_MINUTES`) under
   **Settings -> Environment Variables**, then redeploy.
4. The API is served from the root of your Vercel deployment URL, e.g.
   `https://your-project.vercel.app/v1/items`, with docs at
   `https://your-project.vercel.app/docs`.

## 7. API reference

Full request/response schemas are in Swagger (`/docs`) and `openapi.json`. Summary:

| Method | Path                                      | Purpose                                    |
|--------|--------------------------------------------|---------------------------------------------|
| POST   | `/v1/items`                                | Create an item with an initial quantity     |
| GET    | `/v1/items/:id`                            | Get total/available/held/confirmed quantity |
| POST   | `/v1/reservations`                         | Create a temporary hold on stock            |
| GET    | `/v1/reservations/:id`                     | Get a reservation's current state           |
| POST   | `/v1/reservations/:id/confirm`             | Confirm a reservation (retry-safe)          |
| POST   | `/v1/reservations/:id/cancel`              | Cancel a pending reservation (retry-safe)   |
| POST   | `/v1/maintenance/expire-reservations`      | Sweep expired PENDING reservations          |

All errors share one shape:

```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "only 2 unit(s) available for item ..." } }
```

Status codes used: `201` created, `200` ok, `404` not found, `409` conflict (insufficient
stock / invalid state transition), `422` validation error.

## 8. Reproducing the concurrency scenarios

### A. No overselling under concurrent requests

```bash
npm run concurrency-test
# or against a deployed instance:
BASE_URL=https://your-project.vercel.app npm run concurrency-test
```

This creates an item with 5 units, fires 10 concurrent 1-unit reservation requests, and
asserts exactly 5 succeed (`201`) and 5 are rejected (`409 INSUFFICIENT_STOCK`), then
re-fetches the item to confirm `available_quantity` is `0` (never negative, never
over-allocated). The script exits non-zero if the invariant is broken.

### B. Retry-safe confirm / cancel

```bash
# create an item and a reservation first, then:
curl -X POST http://localhost:3000/v1/reservations/<id>/confirm
curl -X POST http://localhost:3000/v1/reservations/<id>/confirm   # second call: same result, no double-deduct
curl -X POST http://localhost:3000/v1/reservations/<id>/cancel    # confirmed reservation: 409, availability unchanged
```

```bash
curl -X POST http://localhost:3000/v1/reservations/<other-id>/cancel
curl -X POST http://localhost:3000/v1/reservations/<other-id>/cancel  # second call: same result, no double-release
```

### C. Expiration

Create a reservation, wait past `RESERVATION_TTL_MINUTES` (or temporarily set it to a small
value, e.g. `1`), then:

```bash
curl -X POST http://localhost:3000/v1/maintenance/expire-reservations
curl http://localhost:3000/v1/items/<item-id>   # available_quantity is back to its pre-reservation value
```

Or skip the wait: try to confirm a reservation after its `expires_at` has passed — it will be
lazily marked `EXPIRED` and rejected with `409`, and the held quantity is released
immediately.

## 9. Known limitations / trade-offs

- No authentication/authorization on any endpoint — out of scope per the assignment, but a
  real deployment would need it before being public.
- No pagination/listing endpoints (e.g. list items, list a customer's reservations) — only
  the required single-resource endpoints were built.
- Expiration relies on either an explicit call to `/v1/maintenance/expire-reservations` (e.g.
  from an external cron/scheduler) or the lazy check inside `confirm`/`cancel`; there is no
  background worker, per the assignment's "no background queues/workers required".
- `customer_id` is unvalidated free text; there's no customers table, so a typo'd customer id
  is silently accepted.
- The service-role Supabase key is used directly from the API layer (no RLS policies), which
  is appropriate for a trusted backend-only service but would need row-level security if any
  client ever called Supabase directly.
