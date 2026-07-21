# Role Expansion & Shared Function Plan — Patch 4.0A

**Date:** 2026-07-21
**Status:** DESIGN ONLY — no code, schema, migration, permission, or UI change in
this patch. This document is the safe blueprint for a later implementation patch.

> **Naming is provisional.** The two new roles and the shared function below are
> *proposals with rationale*, expressed as placeholders (`NEW_ROLE_A`,
> `NEW_ROLE_B`, `SHARED_FN`). Final identities require stakeholder confirmation
> before the implementation patch. Every matrix is a fillable **template**.

---

## 1. Current role map

Five roles, mapped across two representations that must always stay in sync:

| DB enum (`UserRole`) | Spanish (`OperationRole`) | Scope | Home route | Confined? |
|---|---|---|---|---|
| `ADMIN` | Administrador | Global | `/panel/dashboard` | No (global supervisor) |
| `GERENTE` | Gerente | Branch | `/panel/leads` (`/panel/dashboard` via nav) | No |
| `VENDEDOR` | Vendedor | Personal | `/panel/dashboard` | No (commercial only) |
| `CAJERO` | Cajero | Branch (cashier) | `/panel/caja` | **Yes** → `/panel/caja/*` |
| `CONTADOR` | Contador | Global | `/panel/contabilidad` | **Yes** → `/panel/contabilidad/*` |

**Two-representation rule.** Every role exists twice and is bridged by
`roleEnumToSpanish` / `spanishToRoleEnum` in `src/server/auth/roles.ts`:
- **DB / server enum** `UserRoleEnum` (`ADMIN|GERENTE|VENDEDOR|CAJERO|CONTADOR`) —
  the Prisma `enum UserRole`, session `roleEnum`, and all `access.ts` predicates.
- **UI / session role** `OperationRole` (Spanish) — nav, guards, copy, dashboards.

Adding a role means adding it to **both** unions and **both** bridge maps, or the
build fails (this is a desirable safety property — see §11).

---

## 2. Role dependency map

How a role flows through the system, in evaluation order:

```
prisma UserRole enum
   └─> DB users.role
        └─> login (dev-users.ts / user-store) ─> spanishToRoleEnum
             └─> createSessionToken({ role, roleEnum, branchId })   [session.ts]
                  └─> cookie (HMAC) ─> proxy.ts (auth-only gate on /panel/*)
                       └─> requireAuth()/getCurrentUserSession()    [context.ts]
                            ├─> access.ts predicates (server enforcement)
                            │     canAccess*/canOperate*/canReview*/getScope*
                            │        └─> server actions + scoped queries
                            └─> DemoSession mirror (toDemoSession)   [roles.ts]
                                 └─> operations-shell.tsx
                                      ├─> navGroups[].roles[]  (menu visibility)
                                      ├─> RestrictedScreen     (confinement)
                                      └─> role-copy.ts / dashboards (labels, home)
```

**Key dependency facts:**
- `proxy.ts` enforces **authentication only** (matcher `/panel/:path*`); it does
  **not** branch on role. Role authorization lives in `access.ts` (server) and
  the shell (UI).
- The security boundary is **server-side** (`access.ts` + per-action re-checks).
  Nav `roles[]` and `RestrictedScreen` are UX; they must agree with `access.ts`
  but are not the guarantee.
- Exhaustive `Record<OperationRole, …>` maps are compile-time tripwires: adding a
  role breaks `tsc` until every map is updated (see §11 list).

---

## 3. Proposed shared cross-role function (`SHARED_FN`)

**One function available to ALL roles**, including the confined Cajero and
Contador.

### Recommended: "Mi cuenta" — self-service profile & password
- **Route:** `/panel/cuenta` (proposed).
- **Available to:** every authenticated role, no exception.
- **Does:** show own name / email / role / branch (read-only) and change **own**
  password. No cross-user visibility, no role/branch self-editing.
- **Why it's a good shared-function pattern:**
  - Genuinely universal — every role needs it; no self-service exists today.
  - Low blast radius — touches only the acting user's own record.
  - Exercises the **confined-role whitelist** cleanly: the shell's Cajero/Contador
    `RestrictedScreen` guards must allow this one shared route in addition to their
    home area — the exact cross-cutting concern a "shared function" introduces.

### Alternatives (for stakeholder choice)
- **Notificaciones / alertas** center (per-user feed). Larger surface (new model,
  fan-out from many modules) — heavier for a first shared function.
- **Centro de ayuda** (static help/FAQ). Lowest risk but low value.

### Shared-function design rules (whichever is chosen)
1. Visible to all roles → a nav item with `roles: [all five + both new]`, or a
   role-agnostic placement (e.g. user menu) that bypasses the `roles[]` filter.
2. Confined roles (Cajero, Contador, `NEW_ROLE_*` if confined) must whitelist the
   shared route in `operations-shell.tsx` guards:
   `pathname.startsWith("/panel/cuenta")` joins the allowed-prefix check.
3. Server action must authorize on **identity, not role** (act on
   `session.uid` only) — never a role predicate.
4. If the route lives outside `/panel`, extend the `proxy.ts` matcher; if inside
   `/panel`, `proxy.ts` already covers it (auth-only).

---

## 4. New role placeholders

Two new roles. Names provisional; slots defined so matrices/templates are stable.

### `NEW_ROLE_A` — candidate: **SUPERVISOR**
- **Origin:** foreshadowed in `ROLES.md` §7 ("un supervisor participe en la
  asignación de leads y supervisión operativa").
- **Provisional identity:** cross-/multi-branch commercial supervision, sitting
  between Gerente (single branch) and Administrador (global + config). Assigns
  leads and reviews performance across assigned branches; **no** system config,
  **no** user management, **no** finance operation.
- **Scope:** `branch`-like but possibly multi-branch → **may require a scope model
  extension** (today scopes are global / branch / personal / cashier). Flag as a
  design risk (§12).

### `NEW_ROLE_B` — candidate: **LOGISTICA / BODEGA** (warehouse)
- **Origin:** inventory movements (`/panel/inventario/movimientos`) and traslado
  dispatch/receipt are today Gerente/Admin only; a dedicated operational owner is
  a natural split.
- **Provisional identity:** operates physical inventory ingress/egress and
  transfer dispatch/receipt for its branch; **no** commercial CRM, **no** finance,
  **no** costs beyond what inventory ops require.
- **Scope:** `branch`, likely **confined** (like Cajero/Contador) to
  `/panel/inventario*` + `/panel/traslados`.

> These candidates are illustrative. If the business intends different roles, only
> the fill-in values in §5–§10 change; the affected-file set (§11) and sequence
> (§13) do not.

---

## 5. Permission matrix template (`access.ts` predicates)

Fill each cell `✓`/`—`. Every predicate lives in `src/server/auth/access.ts`.
Confirm each new role against **every** predicate — an omitted predicate silently
defaults the role to "excluded" for allow-lists (safe) but must still be reviewed.

| Predicate | ADMIN | GERENTE | VENDEDOR | CAJERO | CONTADOR | NEW_ROLE_A | NEW_ROLE_B |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `canOperateCrm` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `canAssignLeads` | ✓ | ✓ | — | — | — | ? | ? |
| `canManageReservations` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `canManageSales` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `canManageTransfers` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `canApproveTransfers` | ✓ | ✓ | — | — | — | ? | ? |
| `canOperateExpedientes` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `canReviewExpedienteDocuments` | ✓ | ✓ | — | — | — | ? | ? |
| `canOperateActivities` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `canManageInventory` | ✓ | ✓ | — | — | — | ? | ? |
| `canRegisterMotorcycleIngress` | ✓ | ✓ | — | — | — | ? | ? |
| `canRegisterMotorcycleEgress` | ✓ | ✓ | — | — | — | ? | ? |
| `canViewCosts` | ✓ | ✓ | — | — | ✓ | ? | ? |
| `canAccessCaja` | ✓ | ✓ | — | ✓ | — | ? | ? |
| `canOperateCaja` | ✓ | — | — | ✓ | — | ? | ? |
| `canReviewCaja` | ✓ | ✓ | — | — | — | ? | ? |
| `canAccessContabilidad` | ✓ | ✓ | — | — | ✓ | ? | ? |
| `canOperateContabilidad` | ✓ | — | — | — | ✓ | ? | ? |
| `canReviewContabilidad` | ✓ | — | — | — | ✓ | ? | ? |
| `canViewAccountingLedger` | ✓ | — | — | — | ✓ | ? | ? |
| `canViewAccountingCosts` | ✓ | ✓ | — | — | ✓ | ? | ? |
| `canViewCommercialAnalytics` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `canViewBranchPerformance` | ✓ | — | — | — | — | ? | ? |
| `canViewSellerPerformance` | ✓ | ✓ | — | — | — | ? | ? |
| `canViewMarketing` | ✓ | ✓ | — | — | — | ? | ? |
| `canManageMarketing` | ✓ | — | — | — | — | ? | ? |
| `canManageUsers` | ✓ | ✓ | — | — | — | ? | ? |
| `getCreatableRolesForActor` | all | [VENDEDOR] | [] | [] | [] | ? | ? |
| `isGlobalScopeRole` / `isGlobalRole` | ✓ | — | — | — | ✓ | ? | ? |
| `SHARED_FN` (identity-based) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Scope resolvers to review per new role: `getBranchScopeForUser`,
`getCrmScopeForUser`, `getOperationsScopeForUser`, `getExpedienteScopeForUser`,
`getActivityScopeForUser`, `getCajaScopeForUser`, `getMarketingScopeForUser`,
`getAnalyticsScopeForUser`, `getContabilidadScopeForUser`,
`getAssignableBranchCodesForActor`, `canCreateUserInBranch`,
`canCreateUserRole`.

---

## 6. Route access matrix template

`✓` = allowed + in-nav, `(d)` = reachable direct but no nav, `—` = blocked/redirect.
Confinement is enforced in `operations-shell.tsx` (`RestrictedScreen`).

| Route | ADMIN | GERENTE | VENDEDOR | CAJERO | CONTADOR | NEW_ROLE_A | NEW_ROLE_B |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `/panel/dashboard` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `/panel/leads` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `/panel/clientes` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `/panel/expedientes` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `/panel/actividades` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `/panel/creditos` | ✓ | ✓ | — | — | — | ? | ? |
| `/panel/inventario` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `/panel/inventario/movimientos` | ✓ | ✓ | — | — | — | ? | ? |
| `/panel/reservas` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `/panel/traslados` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `/panel/ventas` | ✓ | ✓ | ✓ | — | — | ? | ? |
| `/panel/vendedores` | ✓ | ✓ | — | — | — | ? | ? |
| `/panel/reportes` | ✓ | ✓ | — | — | — | ? | ? |
| `/panel/marketing` | ✓ | ✓ | — | — | — | ? | ? |
| `/panel/configuracion` | ✓ | ✓ | — | — | — | ? | ? |
| `/panel/caja*` | ✓ | ✓(nav) | — | ✓ | — | ? | ? |
| `/panel/contabilidad*` | ✓ | ✓ | — | — | ✓ | ? | ? |
| `/panel/cuenta` (`SHARED_FN`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 7. Server action impact list

Per-action authorization already re-checks role via `access.ts`, so **most
actions need no edit** — they inherit whatever the predicates decide. Review by
domain to confirm intent for each new role:

| Domain | Action files | Gate | Action for new roles |
|---|---|---|---|
| Auth | `src/server/auth/actions.ts` | login/logout | none (role flows through); optionally add dev login |
| CRM / leads / clientes / expedientes / actividades | `src/server/**` commercial actions | `canOperateCrm`, `canAssignLeads`, `getCrmScope*` | set predicate cells; no per-action code change if predicates suffice |
| Reservas / Ventas / Traslados | operations actions | `canManageReservations/Sales/Transfers`, `canApproveTransfers` | predicate cells (esp. `NEW_ROLE_B` transfers) |
| Inventario movimientos | inventory actions | `canManageInventory`, ingress/egress | predicate cells (esp. `NEW_ROLE_B`) |
| Caja | `src/server/caja/*` | `canAccessCaja/canOperateCaja/canReviewCaja` | predicate cells |
| Contabilidad | `src/server/contabilidad/actions.ts` | `authorizeContabilidad` (operate/review/costs) | predicate cells only |
| Marketing / Analytics | `src/server/marketing/*`, `src/server/analytics/*` | `canViewMarketing/canManageMarketing/canView*Analytics` | predicate cells |
| Users | `src/server/auth/actions.ts` (create user), settings | `canManageUsers`, `getCreatableRolesForActor`, `canCreateUserInBranch` | **must extend** to allow/deny creating new roles |
| `SHARED_FN` | **new** `src/server/account/*` | identity (`session.uid`) | **new action**, role-agnostic |

**Net-new server code:** only the `SHARED_FN` action(s) and the new roles' home
dashboards. Everything else is predicate configuration.

---

## 8. Seed impact list

| File | Item | Change |
|---|---|---|
| `prisma/schema.prisma` | `enum UserRole` | **[FUTURE patch]** add `NEW_ROLE_A`, `NEW_ROLE_B` → requires a migration |
| `prisma/seed.mjs` | `developmentUserEmails[]` | add optional emails if dev logins wanted; keep warn-only cleanup |
| `prisma/seed.mjs` | bootstrap | still Admin-only from env; no new bootstrap users needed |
| `src/server/auth/dev-users.ts` | `devAccountByEmail` | add `newrolea@motomas.local` / `newroleb@motomas.local` → demo identity (dev/no-DB only) |
| `src/data/operations/users.ts` | `demoInternalUsers` | add demo user(s) for each new role (for dev fallback + settings counts) |

**Migration note:** the schema enum change is the ONLY step that needs a Prisma
migration; it is explicitly **out of scope for this patch** and belongs to the
first implementation patch (§13, Patch 4.0B).

---

## 9. Navigation impact list

| File | Item | Change |
|---|---|---|
| `operations-shell.tsx` | `navGroups[].items[].roles[]` | add new Spanish role names to each item they should see |
| `operations-shell.tsx` | `RestrictedScreen` guards | add a confinement block per confined new role (mirror Cajero/Contador); **whitelist the `SHARED_FN` route** for confined roles |
| `operations-shell.tsx` | possibly a new nav group | e.g. "Logística" for `NEW_ROLE_B`; or reuse "Operación" |
| `role-copy.ts` | `shellSubtitleByRole`, `accountingIntroByRole`, `cashierIntroByRole` | **exhaustive Records** — MUST add an entry per new role or `tsc` fails |
| `demo-session-login.tsx` | `roleCopy` | **exhaustive Record** — MUST add an entry per new role |
| `data/operations/users.ts` | `getDefaultRouteForSession` | add home-route branch per new role |
| `data/operations/users.ts` | `operationRoles[]` | add both roles (drives settings role list + counts) |

The nav `roles[]` filter and the confined-role whitelist for `SHARED_FN` are the
two most error-prone edits — call them out in review.

---

## 10. Testing plan

### 10.1 Full role test matrix (run per role, all 7 after expansion)
For each role, verify: login → correct home route → nav shows exactly the allowed
items → each **allowed** route renders with correct controls → each **blocked**
route redirects/`RestrictedScreen` → `SHARED_FN` reachable and edits only self →
each server action allowed/blocked as per §5 (attempt a blocked action directly).

| Check | ADMIN | GERENTE | VENDEDOR | CAJERO | CONTADOR | NEW_ROLE_A | NEW_ROLE_B |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Login + home route | | | | | | | |
| Nav = allowed set | | | | | | | |
| Allowed routes render | | | | | | | |
| Blocked routes guarded | | | | | | | |
| Allowed actions succeed | | | | | | | |
| Blocked actions denied (server) | | | | | | | |
| `SHARED_FN` reachable + self-only | | | | | | | |
| No cost/finance leak (where `—`) | | | | | | | |

### 10.2 Regression guardrails (must stay green)
- Existing five roles unchanged — re-run the CONTADOR audit checks
  (`docs/CONTADOR_ROLE_AUDIT.md`) and equivalent for Cajero.
- **Server-side denial** is the real test: call a blocked action directly (not
  just "button hidden"), per `PROJECT_RULES` ("No basta con ocultar un botón").
- Branch/scope isolation holds for branch-scoped new roles.

### 10.3 Build/type gates (every patch)
`npx prisma generate` · `npx prisma validate` · `npx tsc --noEmit` ·
`npm run build`. The exhaustive Records make `tsc` a strong completeness check.

---

## 11. Files likely affected (implementation reference)

**Type / enum (both representations):**
- `prisma/schema.prisma` — `enum UserRole` *(migration; later patch)*
- `src/server/auth/roles.ts` — `UserRoleEnum`, `userRoleEnums[]`,
  `roleEnumToSpanish`*, `spanishToRoleEnum`*, `isGlobalRole`
- `src/features/operations/types.ts` — `OperationRole`
- `src/data/operations/users.ts` — `operationRoles[]`, `getDefaultRouteForSession`,
  `demoInternalUsers`

**Access / authorization:**
- `src/server/auth/access.ts` — predicates + scope resolvers + creatable roles
- `src/server/auth/context.ts` — `requireRole` (generic; no change expected)
- `src/proxy.ts` — matcher (change only if `SHARED_FN` lives outside `/panel`)

**Session / login:**
- `src/server/auth/session.ts` — `SessionPayload` (types flow; no structural change)
- `src/server/auth/actions.ts` — login + create-user role handling
- `src/server/auth/dev-users.ts` — `devAccountByEmail`
- `prisma/seed.mjs` — `developmentUserEmails`

**Nav / shell / copy (`*` = exhaustive `Record<OperationRole>` → tsc tripwire):**
- `src/features/operations/components/operations-shell.tsx` — nav roles, guards
- `src/features/operations/lib/role-copy.ts` — `shellSubtitleByRole`*,
  `accountingIntroByRole`*, `cashierIntroByRole`*
- `src/features/operations/components/demo-session-login.tsx` — `roleCopy`*
- `src/features/operations/modules/settings/settings-panel.tsx` — consumes
  `operationRoles` + `getCreatableRolesForActor` (auto-updates)

**Net-new:**
- `SHARED_FN`: `src/app/(operations)/panel/cuenta/page.tsx`, panel component,
  `src/server/account/*` action.
- New role homes: dashboard page + module panel(s) per new role.

---

## 12. Risks & no-touch rules

### Risks
1. **Two-representation drift.** Forgetting the DB enum ↔ Spanish bridge for a new
   role → runtime `undefined` role mapping. *Mitigation:* exhaustive Records +
   `tsc` catch most; add the enum and both bridge maps in one commit.
2. **Multi-branch scope for `SUPERVISOR`.** Current scopes are single-branch /
   global / personal / cashier. A cross-branch supervisor may need a **new scope
   shape** — a bigger design decision than a predicate flip. Resolve before coding.
3. **Confined-role whitelist for `SHARED_FN`.** If the Cajero/Contador (and any
   confined new role) guard is not widened to allow the shared route, the shared
   function is invisible to exactly the roles it's meant to include.
4. **UI-only vs server enforcement.** Hiding a nav item ≠ blocking access.
   Every new allow/deny must be a server predicate, verified by direct action
   call (`PROJECT_RULES`).
5. **Migration ordering.** The enum change requires a migration; deploying app
   code that references a new enum value before the migration lands will fail at
   runtime. Migration must precede or accompany the code (§13).
6. **Seed/prod users.** Real production users come from the DB, not the seed;
   creating operable new-role users in prod needs the Admin user-creation flow to
   support the new roles (`getCreatableRolesForActor`).

### No-touch rules for the implementation patches
- Do **not** change existing five-role permissions or scopes (additive only).
- Do **not** change Caja or commercial-role behavior (per prior patch contracts).
- Do **not** weaken `proxy.ts` auth gate or the confined-role guards.
- Do **not** touch `.env`, `SESSION_SECRET`, or production server config.
- Do **not** redesign existing UI; new roles reuse existing panels/patterns.
- `SHARED_FN` server action authorizes on **identity only**, never role.

---

## 13. Implementation patch sequence

This document is **Patch 4.0A (design only)**. Proposed follow-on order:

1. **4.0A — Design (this doc).** No code. ✅
2. **4.0B — Enum + type scaffolding.** Add `NEW_ROLE_A/B` to `prisma/schema.prisma`
   (**migration**), `UserRoleEnum`, `OperationRole`, both bridge maps, all
   exhaustive Records, `operationRoles[]`, `getDefaultRouteForSession`. Roles exist
   but have **no permissions yet** (all predicates `—`). Build must stay green.
3. **4.0C — `SHARED_FN` for existing roles.** Ship `/panel/cuenta` for the current
   five roles first (incl. confined-role whitelist). Isolated, low-risk, validates
   the shared-route pattern before new roles depend on it.
4. **4.0D — `NEW_ROLE_A` permissions + home + nav + guard.** Wire predicates,
   dashboard, nav, confinement (if any). Test matrix §10 for that role.
5. **4.0E — `NEW_ROLE_B` permissions + home + nav + guard.** Same, second role.
6. **4.0F — Seed / dev users + Admin creation flow.** Enable creating the new
   roles via `getCreatableRolesForActor` and optional dev accounts.
7. **4.0G — Full regression.** Run the complete §10 matrix across all seven roles.

Each patch ends with the §10.3 build/type gates.

---

## 14. Open decisions (require confirmation before 4.0B)
- Final names for `NEW_ROLE_A`, `NEW_ROLE_B` (candidates: SUPERVISOR, LOGÍSTICA/BODEGA).
- Final `SHARED_FN` (recommended: "Mi cuenta" profile + password).
- Whether `SUPERVISOR` needs multi-branch scope (Risk #2).
- Which existing routes/modules each new role may enter (fill §5–§6).
- Whether new roles are confined (like Cajero/Contador) or open (like Gerente).
