# Progress Notes — Inventory Reservation API

Handoff doc so we can pick this back up later without re-deriving context. Not part of the
graded deliverables (the README is) — this is just for us.

## Where this came from

Take-home assignment: `Take-Home Assignment Instructions.pdf` (on the Desktop, one level up
from this repo). Build an Inventory Reservation API — Express + TypeScript, Supabase
(Postgres), deployed to Vercel. Full requirements are summarized in the plan file this was
built from: `C:\Users\iamje\.claude\plans\pure-zooming-garden.md`.

Grading criteria (from the PDF), in priority order:
1. **Correctness under concurrency** — no overselling, retry-safe confirm/cancel
2. **Database-driven consistency** — constraints + atomic operations
3. **Design clarity** — clean layering
4. **Reproducibility** — migration runs cleanly, README accurate, easy to run/deploy
5. **Docs/demo quality** — Swagger matches real behavior

## Key architectural decisions (already made, don't redo this discussion)

- **Atomicity lives in Postgres, not Node.** Reserve/confirm/cancel/expire are PL/pgSQL
  functions in `migrations/001_init.sql`, each using `SELECT ... FOR UPDATE` to lock the row
  before checking/mutating it. Called from Node via `supabase.rpc(...)`. This was chosen over
  a raw `pg` connection pool with app-level transactions specifically because Vercel's
  serverless functions don't hold persistent connections well — RPC over Supabase's HTTP API
  (PostgREST) avoids connection-pool exhaustion.
- **`available_quantity` is never stored** — always derived as
  `total_quantity - reserved_quantity - confirmed_quantity`.
- **Idempotency by status check, not idempotency keys.** Confirming an already-CONFIRMED
  reservation (or cancelling an already-CANCELLED/EXPIRED one) just returns the current row
  instead of erroring or double-mutating.
- **Error convention:** Postgres functions `RAISE EXCEPTION 'CODE: message'`; Node's
  `fromDbError()` (`src/utils/AppError.ts`) parses the prefix into the right HTTP status
  (`VALIDATION`→422, `NOT_FOUND`→404, `INSUFFICIENT_STOCK`/`INVALID_STATE`→409). This keeps
  business rules in exactly one place (the DB), per the user's explicit instruction not to
  duplicate DB consistency logic in Node.
- **I (Claude) build all code/migration/docs; the user handles anything needing their own
  accounts** — creating the Supabase project, running the migration, creating the GitHub
  repo, `vercel` deploy, recording the demo video. I don't run `gh`/`vercel`/git-push myself.

## What's built and verified

All code is written. Verified locally (see transcript): `npm run build` compiles clean with
no `any`; server boots; `/health`, `/openapi.json`, `/docs` all serve correctly; Zod
validation and the centralized `{error:{code,message}}` shape work correctly for bad input
and unknown routes. This was all checked **without** a real Supabase project (dummy env vars
just to prove the HTTP/validation/docs layer), since no Supabase credentials exist yet.

**Not yet verified:** actual reserve/confirm/cancel/expire behavior against a real Postgres
instance — needs a live Supabase project. `scripts/concurrency-test.ts` is written and ready
to prove "no overselling" (5-unit item, 10 concurrent 1-unit requests → expects exactly 5
succeed, 5 get 409) the moment it's pointed at a running instance.

### File map
```
migrations/001_init.sql     Schema + all 4 PL/pgSQL functions (the core of the assignment)
src/config/                 env.ts (validates required env vars), supabaseClient.ts
src/middleware/             validate.ts (Zod), asyncHandler.ts, errorHandler.ts
src/validation/schemas.ts   All Zod request/param schemas
src/services/               items.service.ts, reservations.service.ts (calls the RPC functions)
src/controllers/            Thin — read input, call service, respond
src/routes/                 Express routers, wired in src/routes/index.ts
src/docs/openapi.ts         Hand-written OpenAPI 3.0 spec, served at /docs and /openapi.json
src/app.ts / server.ts      App factory / local dev entrypoint
api/index.ts                Vercel serverless entrypoint (exports the Express app directly)
scripts/concurrency-test.ts Fires 10 concurrent reservations at a 5-unit item, asserts no oversell
README.md                   Full setup/deploy/reproduction docs (the graded deliverable)
```

## What's left (all needs the user's own accounts/actions)

1. **Supabase**: create a project, run `migrations/001_init.sql` in the SQL Editor, grab
   `SUPABASE_URL` and the `service_role` key.
2. **Local verification**: `npm install` → copy `.env.example` to `.env` and fill in real
   values → `npm run dev` → `npm run concurrency-test` to actually prove no-oversell against
   a live DB (this hasn't been run yet — do this before recording the demo).
3. **Git/GitHub**: `git init`, commit, create a GitHub repo, push.
4. **Vercel**: `vercel` deploy, add the same env vars in the Vercel dashboard, redeploy.
5. **Demo video** (5–10 min, per PDF section 9): start locally, show `/docs`, create an item
   with qty 5, demonstrate expiration or cancellation freeing up quantity, show the Supabase
   table state.
6. **README top-of-file TODOs**: fill in the GitHub link, Vercel URL, and demo video link
   (currently placeholders).
7. **Submission**: email the GitHub repo link, Vercel URL, and demo video link (per PDF
   section 15).

## Resuming this conversation

Just pick up from step 1 above, or ask me to review/adjust any of the code first. The full
plan is still at `C:\Users\iamje\.claude\plans\pure-zooming-garden.md` if more detail is
needed on the original design rationale.
