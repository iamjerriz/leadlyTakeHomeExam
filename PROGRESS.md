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

Everything is built, deployed, and verified end-to-end against a real Supabase project:

- GitHub repo: https://github.com/iamjerriz/leadlyTakeHomeExam (pushed, main branch)
- Supabase project created, migration run, service_role grants applied
- Deployed to Vercel: https://inventory-reservation-api-zeta.vercel.app (auto-deploys on
  push to `main` — Vercel connected the GitHub repo directly)
- Verified locally AND against the deployed URL: create item, reserve, confirm (idempotent),
  cancel (idempotent), cancel-after-confirm rejected (409), lazy + explicit expiration both
  release quantity correctly, `npm run concurrency-test` passes against both localhost and
  the live deployment (5-unit item, 10 concurrent 1-unit reservations → exactly 5 succeed, 5
  get 409, zero overselling)

**Bug found and fixed during verification:** `fn_confirm_reservation`'s lazy-expiry branch
used to `UPDATE` (release the hold) and then `RAISE EXCEPTION`. In Postgres, an uncaught
exception rolls back the whole transaction, including updates that ran earlier in the same
function call — so the release was silently undone every time. Fixed by having that branch
return the row normally (status `EXPIRED`, no exception) and having the Node service layer
(`src/services/reservations.service.ts`) translate a non-`CONFIRMED` result into the 409.
Same fix pattern `fn_cancel_reservation` already used correctly. Verified fixed by manually
backdating a reservation's `expires_at` via a throwaway script and confirming release now
sticks. Commit: "Fix confirm-on-expired rollback bug and fold in service_role grants".

**Also hit and fixed:** Supabase project was created with "Automatically expose new tables"
disabled (which the user followed on my advice, since it seemed related only to
anon/authenticated exposure) — this also skips granting `service_role` privileges on new
tables, causing "permission denied for table items". Fixed by folding explicit
`GRANT ... TO service_role` + `ALTER DEFAULT PRIVILEGES` statements into `001_init.sql`
itself, so the single migration file is self-contained regardless of that dashboard toggle.

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

## What's left

1. ~~Supabase, Local verification, Git/GitHub, Vercel~~ — all done.
2. **Demo video** (5–10 min, per PDF section 9): start locally, show `/docs`, create an item
   with qty 5, demonstrate expiration or cancellation freeing up quantity, show the Supabase
   table state. This is the only remaining deliverable.
3. **README**: add the demo video link once recorded (still a TODO at the top of the file).
4. **Submission**: email the GitHub repo link, Vercel URL, and demo video link (per PDF
   section 15).

## Resuming this conversation

Just pick up from step 1 above, or ask me to review/adjust any of the code first. The full
plan is still at `C:\Users\iamje\.claude\plans\pure-zooming-garden.md` if more detail is
needed on the original design rationale.
