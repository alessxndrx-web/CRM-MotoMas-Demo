# Verification harness

**Patch V1.0.** How `npm run verify` works, what each check can and cannot
catch, and what to do when one fails.

---

## 1. Why this exists

A technical audit found **6,891 lines (7.0% of `src/`) unreachable from any
route** — among them a complete 1,760-line Accounts Receivable subsystem with
zero importers, and a 690-line document-numbering service with zero callers.

The shape is always the same: **a complete lower layer with no upper layer on
top of it.**

It kept happening because nothing broke. `tsc --noEmit` passed. `next build`
passed. Every review saw well-written, well-tested, well-commented code. To
every tool in the repository, a file nobody imports was indistinguishable from
one on the hot path.

`verify` exists to make that difference visible, and to make it a build failure.

---

## 2. What runs, and what each check actually catches

    npm run verify
    → tsc --noEmit && eslint . && next build && knip --no-config-hints

Ordered cheapest-first, so the fastest check reports the most common failure.

| Check | ~Time | Catches | Blind to |
|---|---|---|---|
| `tsc --noEmit` | 20 s | Type errors across every file, including unimported ones | Whether anything imports the file |
| `eslint .` | 60 s | Lint rules, React hook misuse, unused bindings | Reachability |
| `next build` | 90 s | Route-level failures, prerender errors, bundler resolution | Any module outside the route graph |
| `knip` | 30 s | **Files unreachable from an entry point**, unused and unlisted dependencies | Whether reachable code is *correct* |

Only the last row is new information. The first three all pass on a file nobody
imports — that is precisely the hole knip closes.

**Knip cannot tell you code is used *well*.** A file imported once by a
component that never renders is "reachable". Reachability is a floor, not proof
of value.

---

## 3. Reading knip output

    npm run knip

Clean run prints nothing and exits 0. When something is wrong:

**`Unused files`** — the important one. A file no entry point reaches, directly
or transitively. Three things cause it:

1. *You built bottom-up.* The service is finished and nothing calls it. Wire it
   to a route, or delete it. Do not baseline it — see §4.
2. *You added an entry point Next loads by convention* (a new `page.tsx`
   pattern, a new root-level config). Add it to `entry` in `knip.json`. This is
   a config fix, not a baseline entry.
3. *The file is genuinely obsolete.* Delete it. That is the whole point.

**`Unlisted dependencies`** — imported but not in `package.json`. Add it.

**`Unused dependencies`** — in `package.json`, imported nowhere. Remove it,
unless it is loaded by a runner rather than an import (Tailwind's PostCSS
pipeline is the existing case — see `ignoreDependencies`).

### Configuration is load-bearing

Next's App Router loads `page.tsx`, `layout.tsx`, `route.ts` and friends **by
convention** — no import points at them. `knip.json` declares them explicitly.

The one to never break is **`src/proxy.ts`**: Next 16's renamed middleware, which
guards every `/panel/*` route. Nothing in the codebase imports it. Remove its
entry line and knip reports the application's edge authorization as dead code —
and the obvious "cleanup" deletes it.

`npm run knip` passes `--no-config-hints`. Several entries deliberately duplicate
what knip's Next plugin already infers; the redundancy is defensive, and the
hints about it are noise.

### Why `exports` analysis is off

`include` selects `files`, `dependencies`, `unlisted`, `unresolved`, `binaries`
— **not `exports`**. Enabling export-level analysis today reports 325 unused
exports, nearly all design-system primitives and type guards kept as a
deliberate palette.

Baselining 325 entries would make the ignore list meaningless, and that volume of
noise is exactly what teaches people to stop reading output. File-level
reachability is the signal with teeth. Turning `exports` on is worth doing after
the DELETE-PENDING backlog is cleared and the number is small enough to act on.

---

## 4. The ignore list is a baseline, not an amnesty

Every path in `knip.json`'s `ignore` was **already** unreachable when the check
was introduced. They are listed so the harness could ship green without deleting
6,891 lines in the same patch — two changes that must stay separately
reviewable.

**New dead code is not covered by any of it and will fail the build.**

### The three categories

Every entry carries an inline comment naming one:

**`CONTRACT`** — intentionally uncalled, and *documented as such in the source*.
Legitimate only when the source file itself says so and a design document
specifies the interface.
Current: `src/server/finance/numbering/*`, whose `service.ts:68` carries an
explicit "It is NOT dead code … Do not delete it as unused" comment, specified in
[FINANCIAL_FOUNDATION.md](FINANCIAL_FOUNDATION.md) §4.

**`WIRING-PENDING`** — complete, not yet connected, and **confirmed to be
connected rather than deleted**. Legitimate only when someone has actually
decided it will be wired. "We might use it later" is not this category; that is
DELETE-PENDING.
Current: `src/server/finance/receivables/*`.

**`DELETE-PENDING`** — verified dead, scheduled for removal in the cleanup patch.
The honest default. If you cannot name the decision that makes something
CONTRACT or WIRING-PENDING, it belongs here.

### Adding an entry should feel expensive

Adding one means writing down that you produced code no user can reach, and
choosing which of the three admissions applies. That friction is the feature. If
it feels like paperwork, that is the signal working: **wire it to a route
instead.**

Before adding one, in order:

1. Can it reach a route today? Do that.
2. Is it an entry point Next loads by convention? Fix `entry`, not `ignore`.
3. Is anyone actually committed to wiring it? Then `WIRING-PENDING`, and say who
   and when in the comment.
4. Otherwise `DELETE-PENDING` — or just delete it now.

**Removing an entry needs nobody's approval.** Wire it or delete it and take the
line out. The list should only ever shrink.

---

## 5. The eslint baseline

`eslint.config.mjs` carries a parallel, file-scoped baseline for
`react-hooks/set-state-in-effect`: eleven legacy `localStorage` panels that
already violated the rule when it began being enforced.

Same contract as knip's list. Same reason. Two properties matter:

- It names **exact files**, so a twelfth file still fails the build. (Verified:
  a new violation outside the list errors and exits 1.)
- It is `warn`, not `off` — the count stays visible in `npm run lint`.

These are **not** silenced with inline `eslint-disable` comments. An inline
disable hides the problem at the site, never expires, and cannot be counted. A
single enumerated block can be read, counted, and deleted wholesale.

The violations are mount hydration from `localStorage`, prop-change resync, and
selection-validity effects. None has a local fix: they need
`useSyncExternalStore`, a parent-driven `key` remount, or render-time derivation
respectively — state-management rewrites across ~7,000 untested lines that are
scheduled for deletion.

**Do not add an inline disable for this rule.** If you have a genuine new case,
fix it, or argue for the file in the baseline block.

---

## 6. What is deliberately NOT in verify

- **Playwright** (`npm run e2e:*`) — serial by design (`workers: 1`), drives a
  real PostgreSQL instance with fixtures from `e2e/global-setup.ts`. Standing up
  a database in CI is separate work. Run locally before merging anything
  touching authorization or accounting.
- **Smoke scripts** (`npm run smoke:*`) — 27 hand-run domain scripts, same
  reason. There is no `smoke:all`; that is a known gap.
- **`prisma migrate status`** — needs a reachable database.

So: **a green CI does not mean the accounting engine is correct.** It means the
code typechecks, lints, builds, and is reachable.

---

## 7. CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs `npm ci` →
`npx prisma generate` → `npm run verify` on every push and pull request, Node 20.

`DATABASE_URL` is set to a deliberately unreachable address (`127.0.0.1:1`).
`next build` never queries — `getPrisma()` is a lazy singleton — but the variable
must be *present*, because `isDatabaseConfigured()` is `Boolean(process.env.DATABASE_URL)`
and page components branch on it while prerendering. If a future change makes
the build actually connect, it fails loudly here instead of quietly depending on
a database CI does not have.

`SESSION_SECRET` is set because `src/server/auth/session.ts` throws without it
under `NODE_ENV=production`. It signs nothing real.

---

## 8. When verify fails

| Failure | Do this |
|---|---|
| `tsc` error | Fix the type. Never `@ts-ignore` — there are 6 `any` in 98k lines; keep it that way. |
| `eslint` error | Fix it. Do not add an inline disable. For `set-state-in-effect`, see §5. |
| `next build` error | Usually a server import pulled into a client component, or a prerender touching a request-time API. |
| `knip` unused file | §3. Wire it, delete it, or fix `entry`. Baseline is the last resort. |
| `knip` unlisted dependency | Add it to `package.json`. |

If you are about to make a check pass by weakening it, stop and say so in the
pull request instead. A harness nobody trusts is worse than no harness, because
it still costs the time.
