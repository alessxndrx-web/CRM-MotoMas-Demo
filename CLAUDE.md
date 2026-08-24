# Working rules — MotoMas ERP

Next.js 16 (App Router) · React 19 · TypeScript strict · PostgreSQL + Prisma 6 ·
Tailwind 4 · Playwright. Read this before touching anything.

## Definition of done

A task is done when **a user can reach the change through a route in the running
app** and `npm run verify` passes. Both. Not one.

A module that compiles but is not reachable from a route is not done — it is
maintenance cost with nothing on the other side of it. This repository already
carries 6,891 lines of well-written code nobody can execute, including a complete
Accounts Receivable subsystem, because "the service layer is finished" was once
accepted as done.

If a task genuinely cannot end at a route, **say so before starting**. Do not
ship an unreachable layer and call it progress.

## Build top-down, not bottom-up

The failure mode here is a flawless lower layer with nothing on top of it. Work
in this order:

    route (hardcoded data) → server action → service → repository → schema

Each step replaces a stub with the real thing. Start from the screen, walk down
only as far as the screen needs.

What is left half-finished should be a **visibly incomplete screen**, not an
invisible perfect layer. A screen showing hardcoded totals is honest and gets
fixed. A service nobody calls looks like completed work in every diff, every
build, and every status update — which is exactly why it survives for months.

## `npm run verify`

    tsc --noEmit && eslint . && next build && knip

Cheapest check first. `knip` is the one that catches unreachable code; `tsc` and
`next build` are both perfectly happy with a file nobody imports.

**Never claim a task is done without running it.** Not "it should pass" — run it.
It takes about 7 minutes end to end, most of it `next build`. Run `npm run knip`
alone (~20 s) while you work; run the full chain before you report done.

Its ignore lists are baselines of pre-existing debt, not permission to add more.
Adding an entry needs a reason you would defend out loud: see
[docs/VERIFICATION.md](docs/VERIFICATION.md).

## The accounting enum rule

`AccountingEventType` is a **database enum**. A new member lands together with:

1. its posting strategy (`src/server/finance/posting/strategies/`),
2. its account-mapping rule, and
3. a supported way for an accountant to author that rule,

or it does not land. A migration that adds the member alone leaves the posting
engine resolving nothing at runtime — it will not fail at build time, and it
will not fail in review. It fails when someone tries to post a real transaction.

## Business-line separation

Caja invoices **motorcycles**. The POS sells **spare parts**. These are separate
revenue lines with separate inventories, separate costs and separate income
accounts.

- **Never route a POS transaction through `CashDocument`.**
- `AccountMappingSet` is plural by design — give each line its own rule set.

Collapsing the two produces books that balance and describe a business that does
not exist. That is worse than books that fail to balance, because nothing
detects it.

## Layer boundaries

- Nothing under `src/server/` may be imported from a `"use client"` module.
  One violation exists — `src/features/pos/pos-printer.ts:9` imports
  `src/server/pos/escpos.ts`. It is scheduled separately. **Leave it; add no
  more.**
- Authorization is resolved from the signed session on the server, never from a
  caller-supplied argument. Every server action reaches a module authorizer
  (`authorizePos`, `authorizeContabilidad`, `authorizeFinancialFoundation`, …).
  Add a new action to an existing authorizer rather than inventing a permission.
- Totals and money are derived server-side from persisted lines. Never accept a
  client-supplied total. Money is `Prisma.Decimal`, never a float.

## Comments explain why, not what

Some 98,000 lines carry 4 TODOs and 6 `any`. That discipline is the strongest
property of this codebase — comments here record *why a boundary exists* and
*what was deliberately not done*. Preserve it.

**A comment that contradicts the code is worse than no comment.** When you
change behavior, update the docstring above it **in the same edit**. Three stale
docstrings have already sent readers chasing findings that did not exist.

Write comments in the language of the surrounding file (newer POS and finance
modules are Spanish; older modules are English). Do not translate a file you are
only editing.

## Conventions

- **No API routes.** Mutations are Server Actions in `src/server/**/actions.ts`;
  reads are plain server functions in `queries.ts`. Keep it that way.

  **One named exception: `src/app/api/webhooks/meta/route.ts`.** Meta calls a
  fixed public URL over HTTP and cannot invoke a Server Action — that endpoint
  is compiler-generated, changes between builds and is not a third-party-callable
  contract. The file carries the full rationale at the top. Everything else in
  that integration (mappings, manual resolution) is still a Server Action in
  `src/server/meta/actions.ts`. **Do not "clean it up", and do not treat it as a
  precedent:** a second route needs the same argument, made again.
- `src/proxy.ts` is Next 16's middleware (renamed from `middleware.ts`). It
  guards `/panel/*` at the edge. Nothing imports it — it is declared as a knip
  entry point. Do not "clean it up".
- Modules suffixed `-db` are the migrated, PostgreSQL-backed panels. Bare module
  names are the legacy `localStorage` layer, which renders `null` when a
  database is configured and is scheduled for deletion. **Build in `-db`.**
- One migration per patch, sequentially named. Never edit an applied migration.
- Errors returned from actions are user-facing Spanish strings. Do not leak
  Postgres or Prisma error text into them.

## Before you start

- `npm run dev` → http://localhost:5173
- Requires `DATABASE_URL`; without it the app runs degraded and DB-backed
  sections are disabled.
- `npm run e2e:*` and `npm run smoke:*` need a live database and are run by
  hand. They are not in `verify` and not in CI.
