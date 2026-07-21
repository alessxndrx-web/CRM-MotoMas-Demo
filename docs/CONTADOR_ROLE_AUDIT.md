# CONTADOR Role Audit — Patch 3.10A-CONTADOR

**Date:** 2026-07-21
**Scope:** Audit of the CONTADOR role permissions and UI behavior in the
Contabilidad module. **No business logic was changed** — this is an audit patch.

---

## 1. Summary

**Verdict: CONTADOR is a FULL accounting OPERATOR, not a read-only viewer.**

The concern that motivated this patch — *"CONTADOR appears to access Contabilidad
but may only be able to view documents"* — is **not substantiated by the code**.
At every enforcement layer (role definitions, access predicates, server actions,
scoped queries, page context and UI panels), CONTADOR is treated as a global
accounting operator with review/posting authority.

- **Authorization is enforced server-side** in every mutation via
  `authorizeContabilidad(...)`; the UI gating mirrors the same predicates but is
  not the security boundary.
- CONTADOR can **create, edit (drafts), review, post, reconcile, cancel** and
  **close** across every accounting entity.
- CONTADOR reads the **global ledger** and **global costs** (no branch filter).
- No accounting write action is incorrectly Admin-only.
- No panel hides operator controls from CONTADOR by mistake.

**No blocking issues were found. No fix is required before production for the
CONTADOR role.** Two low-severity observations and one environment caveat are
recorded in §7.

---

## 2. Expected vs. Actual behavior

| Expected CONTADOR capability | Actual (code) | Status |
|---|---|---|
| Access `/panel/contabilidad` + subroutes | `canAccessContabilidad` includes CONTADOR; nav + subnav exposed; shell confines CONTADOR to the area | ✅ |
| View accounting dashboard | Dashboard rendered; global scope | ✅ |
| Create accounting documents | `createAccountingDocumentAction` → `operate`; `DocumentForm` rendered when `canOperate` | ✅ |
| Edit draft documents | `updateAccountingDocumentAction` → `operate` (BORRADOR only) | ✅ |
| Review documents | `reviewAccountingDocumentAction` → `review`; "Revisar" button when `canReview` | ✅ |
| Post/account documents | `postAccountingDocumentAction` → `review` (requires REVISADO) | ✅ |
| Journal entries (create/manage/post) | Full CRUD + line ops → `operate`; post/reconcile → `review` | ✅ |
| Vouchers | create/update/cancel → `operate`; reconcile → `review` | ✅ |
| Expenses | create/update → `operate`; review → `review` | ✅ |
| Payroll (planilla) | create/update → `operate`; prepare/markPaid → `review` | ✅ |
| Bank accounts + reconciliation | create/update/deactivate → `operate`; review → `review` | ✅ |
| Accounting closings (cierres) | create → `operate`; review/close/reopen → `review` | ✅ |
| View authorized accounting costs | `canViewAccountingCosts` (= `canViewCosts`) includes CONTADOR, global | ✅ |
| Audit records (who reviewed/posted/etc.) | `reviewedBy/postedBy/reconciledBy/cancelledBy` stamped from `auth.actor.userId` | ✅ |

| Expected CONTADOR restriction | Actual (code) | Status |
|---|---|---|
| NOT operate Caja | `canAccessCaja`/`canOperateCaja` exclude CONTADOR; shell confines to contabilidad | ✅ |
| NOT mutate commercial CRM | `canOperateCrm` excludes CONTADOR | ✅ |
| NOT assign leads | `canAssignLeads` excludes CONTADOR | ✅ |
| NOT operate commercial inventory altas/bajas | `canManageInventory`/ingress/egress exclude CONTADOR | ✅ |
| NOT access Admin user config | `getCreatableRolesForActor(CONTADOR)` = `[]`; `canManageUsers` excludes CONTADOR | ✅ |
| NOT bypass branch/global rules | Scope = `global` per ROLES.md §12 (intended) | ✅ |

---

## 3. Route access matrix (CONTADOR)

`enabled = dbConfigured && canAccess && scope.level !== "none"`. For CONTADOR:
`canAccess = true`, `scope = global`, so `enabled = true` **when `DATABASE_URL`
is configured**.

| Route (task label → actual) | Reachable | Operator UI shown | Notes |
|---|---|---|---|
| `/panel/contabilidad` (Resumen) | ✅ | dashboard (Operación) | `supervision=false` → labeled "Operación" |
| `plan-cuentas` → `/catalogo-cuentas` | ✅ | create/edit/deactivate cuentas | route name differs from task's `plan-cuentas` |
| `/terceros` | ✅ | create/edit/deactivate terceros | |
| `/documentos` | ✅ | create + issue/review/post/reconcile/cancel | |
| `asientos` → `/diarios` | ✅ | create/edit/lines + post/reconcile/cancel | route name differs from task's `asientos` |
| `/comprobantes` | ✅ | create/edit + reconcile/cancel | |
| `/gastos` | ✅ | create/edit + review | |
| `/planilla` | ✅ | create/edit + prepare/markPaid | |
| `/inventario` | ✅ | create/edit costs (gated on `canViewCosts`) | |
| `/bancos` | ✅ | create/edit/deactivate accounts | |
| `conciliaciones` → `/conciliacion` | ✅ | create/edit + review/cancel | route name differs from task's `conciliaciones` |
| `/cierres` | ✅ | create + review/close/reopen | |
| `/reportes` | ✅ | dashboard summary (derived) | |

The task's `plan-cuentas`, `asientos`, `conciliaciones` do **not** exist as routes;
the real routes are `catalogo-cuentas`, `diarios`, `conciliacion`. All subroutes
are exposed via the in-area sub-navigation (`accountingSubnav` in
`accounting-panel.tsx`) and reachable directly.

---

## 4. Action permission matrix (CONTADOR)

Every action calls `authorizeContabilidad(level)` where `level ∈ {access, operate,
review, costs}`. **All four levels include CONTADOR** (`operate`/`review` =
Admin+Contador; `costs` = costs-visibility ∧ operate = Admin+Contador).
Therefore **CONTADOR can call every action below.** Authorization is server-side;
branch is resolved from a validated `branchCode`, never trusted from the client.

| Entity | Action(s) | Auth level | CONTADOR |
|---|---|---|---|
| Chart of accounts | create / update / deactivate | operate | ✅ |
| Third parties | create / update / deactivate | operate | ✅ |
| Documents | create / update / issue / cancel | operate | ✅ |
| Documents | review / post / reconcile | review | ✅ |
| Journal entries | create / update / add-line / update-line / remove-line / cancel | operate | ✅ |
| Journal entries | post (balanced) / reconcile | review | ✅ |
| Vouchers | create / update / cancel | operate | ✅ |
| Vouchers | reconcile | review | ✅ |
| Expenses | create / update | operate | ✅ |
| Expenses | review | review | ✅ |
| Payroll | create / update | operate | ✅ |
| Payroll | prepare / mark-paid | review | ✅ |
| Inventory costs | create / update | costs | ✅ |
| Bank accounts | create / update / deactivate | operate | ✅ |
| Bank reconciliation | create / update / cancel | operate | ✅ |
| Bank reconciliation | review | review | ✅ |
| Closings | create | operate | ✅ |
| Closings | review / close / reopen | review | ✅ |

- Server-side authorization: **Yes** — all actions.
- Branch/global scope correct: **Yes** — CONTADOR resolves to `global`; writes name a validated branch.
- Incorrectly Admin-only: **None found.**
- Relies on UI-only restriction: **No** — every action re-checks role + state.

---

## 5. UI control visibility matrix (CONTADOR)

Panels receive `canOperate`, `canReview`, `canViewLedger`, `canViewCosts` from
`getContabilidadPageContext()`. For CONTADOR all are `true`.

| Panel | Create form (`canOperate`) | Review/post (`canReview`) | Ledger list (`canViewLedger`) | Costs (`canViewCosts`) |
|---|---|---|---|---|
| Dashboard / Reportes | n/a | n/a | summary | cost total shown |
| Catálogo de cuentas | ✅ | n/a | ✅ | n/a |
| Terceros | ✅ | n/a | ✅ | n/a |
| Documentos | ✅ | ✅ (Revisar/Contabilizar/Conciliar) | ✅ | n/a |
| Diarios (asientos) | ✅ | ✅ (Contabilizar/Conciliar) | ✅ | n/a |
| Comprobantes | ✅ | ✅ (Conciliar) | ✅ | n/a |
| Gastos | ✅ | ✅ (Revisar) | ✅ | n/a |
| Planilla | ✅ | ✅ (Preparar/Pagar) | ✅ | n/a |
| Inventario contable | ✅ (gated on `canViewCosts`) | n/a | n/a | ✅ |
| Bancos | ✅ | n/a | ✅ | n/a |
| Conciliación | ✅ | ✅ (Conciliar) | ✅ | n/a |
| Cierres | ✅ | ✅ (Revisar/Cerrar/Reabrir) | ✅ | n/a |

- Buttons/forms visible for CONTADOR where allowed: **Yes.**
- UI says "restricted" despite server allowing CONTADOR: **No** —
  `LedgerRestrictedNotice` only shows when `!canViewLedger` (Gerente), never for CONTADOR.
- Only document viewing exposed: **No** — full create/edit/review/post surface.
- Broken/hidden controls: **None found.**
- `supervision` flag: only drives a label ("Supervisión"/"Operación"); CONTADOR
  (`supervision=false`) shows "Operación". It never hides operator controls.

---

## 6. Route smoke test

A live route smoke as seeded `contador@motomas.local` **could not be executed**:
`prisma migrate status` and any DB read fail with `P1001: Can't reach database
server at localhost:15432` (the local Postgres instance is not running in this
environment). `DATABASE_URL` is present in `.env`.

No temporary smoke route or script was created, so there is nothing to clean up
(no `SMOKE-CONTADOR-` fixtures, no DB writes, no schema/data changes). The audit
conclusions are derived from a complete static reading of the enforcement path,
which is deterministic:

- Seed/dev identity: `contador@motomas.local` → `accountant-general`
  (`src/server/auth/dev-users.ts`), role `CONTADOR`, global branch.
- `getContabilidadPageContext()` for CONTADOR yields
  `{ canAccess, canOperate, canReview, canViewLedger, canViewCosts } = true`,
  `scope = global`, `supervision = false`, `enabled = true` (DB configured).

To run a live smoke later: start Postgres on `localhost:15432`, `npx prisma
migrate deploy && node prisma/seed.mjs`, log in as `contador@motomas.local` /
`Motomas.2026`, and exercise each subroute.

---

## 7. Findings by severity

### None — Blocking
No blocking permission or UI defect found for CONTADOR.

### Low — Observations (not required before production)

**F1 — Documentation/route naming drift (informational).**
ROLES.md §12 lists routes `/panel/contabilidad/diarios` while other docs and this
patch's task list use `asientos`, `plan-cuentas`, `conciliaciones`. The real
routes are `diarios`, `catalogo-cuentas`, `conciliacion`. Purely cosmetic; the
in-area subnav links to the correct routes. *Recommend aligning doc route names
in a future doc pass. Not required before production.*

**F2 — No-DB fallback can read as "view only" (by design).**
When `DATABASE_URL` is absent (dev fallback), `enabled=false`, the DB-backed
operator panels render `SectionUnavailableNotice` and only the legacy
localStorage `AccountingPanel` shows. A tester on a no-DB environment could
mistake this for CONTADOR being read-only. This is the most likely origin of the
reported concern. *Behavior is intentional (DB is the source of truth). No code
change recommended; documented here to prevent misdiagnosis.*

### Informational
- The client-side confinement of CONTADOR to `/panel/contabilidad/*`
  (`operations-shell.tsx` → `RestrictedScreen`) is a UI convenience; the true
  guarantee that CONTADOR cannot mutate commercial/Caja data is the server-side
  role check in each of those modules' actions (`canOperateCrm`, `canOperateCaja`,
  etc., which all exclude CONTADOR). No gap found, but keep this separation in
  mind for any future refactor.

---

## 8. Recommended fixes

| # | Fix | Required before production? | Files likely to change |
|---|---|---|---|
| F1 | Align documented accounting route names (`diarios`, `catalogo-cuentas`, `conciliacion`) across ROLES.md and task specs | No (docs only) | `ROLES.md` |
| F2 | Optionally add a small "requires DATABASE_URL" note on the disabled section notice to prevent misreading as read-only | No (optional UX) | `src/features/operations/modules/contabilidad-db/contabilidad-db-shared.tsx` (already states it) |

No server, schema, migration, or auth changes are recommended. The CONTADOR role
is production-ready with respect to Contabilidad operation.

---

## 9. Exact files reviewed

- `src/server/auth/access.ts` — predicates (`canAccessContabilidad`,
  `canOperateContabilidad`, `canReviewContabilidad`, `canViewAccountingLedger`,
  `canViewAccountingCosts`, `getContabilidadScopeForUser`)
- `src/server/auth/roles.ts` — `UserRoleEnum` incl. CONTADOR, `isGlobalRole`
- `src/server/auth/dev-users.ts` — contador dev identity
- `src/server/contabilidad/context.ts` — page context flags
- `src/server/contabilidad/actions.ts` — all 30+ mutations + `authorizeContabilidad`
- `src/server/contabilidad/queries.ts` — `ledgerEnabled`, `branchConstraint`
- `src/server/contabilidad/shared.ts` — DTOs, guards, cost-exposure boundary
- `src/app/(operations)/panel/contabilidad/**/page.tsx` — 13 route wrappers
- `src/features/operations/modules/contabilidad-db/*.tsx` — 13 UI panels + shared
- `src/features/operations/modules/accounting/accounting-panel.tsx` — subnav
- `src/features/operations/components/operations-shell.tsx` — nav + CONTADOR confinement
- `prisma/seed.mjs`, `ROLES.md`

---

## 10. Validation results

| Command | Result |
|---|---|
| `npx prisma generate` | ✅ Client generated (v6.19.3) |
| `npx prisma validate` | ✅ Schema valid |
| `npx prisma migrate status` | ⚠️ `P1001` — DB server unreachable (`localhost:15432`); environment only, not a code issue |
| `npx tsc --noEmit` | ✅ Exit 0, no type errors |
| `npm run build` | ✅ Exit 0; all 13 contabilidad routes compiled (dynamic) |
