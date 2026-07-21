# Role & Ticket Implementation Plan — Patch 4.0A.1

**Date:** 2026-07-21
**Status:** DESIGN ONLY — no code, schema, migration, permission, or UI change.
Supersedes the placeholders in [ROLE_EXPANSION_PLAN.md](ROLE_EXPANSION_PLAN.md)
(Patch 4.0A) with the final business decisions. This is the concrete blueprint the
implementation patches (4.0B → 4.1A) will follow.

## 0. Final decisions (locked)

| Placeholder (4.0A) | Final decision |
|---|---|
| `NEW_ROLE_A` | **MARKETING** (DB enum `MARKETING`, UI label "Marketing") |
| `NEW_ROLE_B` | **SOPORTE_TECNICO** (DB enum `SOPORTE_TECNICO`, UI label "Soporte Técnico") |
| `SHARED_FN` "Mi cuenta" | **"Tickets / Ayuda"** — global support/help-desk at `/panel/ayuda*` |

- **MARKETING** — home `/panel/marketing`; confined to `/panel/marketing*` and
  `/panel/ayuda*`. May access `/panel/cuenta` later if that shared profile ships.
- **SOPORTE_TECNICO** — home `/panel/soporte`; confined to `/panel/soporte*` and
  `/panel/ayuda*`. May access `/panel/cuenta` later.
- The system now has **seven internal roles**: ADMIN, GERENTE, VENDEDOR, CAJERO,
  CONTADOR, MARKETING, SOPORTE_TECNICO. A public **CLIENTE** ticket surface is a
  later phase (4.0H) and is not an operations role.

> The two-representation rule from 4.0A still holds: each role exists as a DB
> `UserRoleEnum` **and** a Spanish `OperationRole`, bridged by
> `roleEnumToSpanish` / `spanishToRoleEnum`. Add both, plus every exhaustive
> `Record<OperationRole,…>`, or `tsc` fails (desirable tripwire).

---

## 1. Role name / label / route reference

| DB enum (`UserRole` / `UserRoleEnum`) | Spanish (`OperationRole`) | Home route | Confinement (allowed prefixes) |
|---|---|---|---|
| `MARKETING` | `Marketing` | `/panel/marketing` | `/panel/marketing*`, `/panel/ayuda*` |
| `SOPORTE_TECNICO` | `Soporte Técnico` | `/panel/soporte` | `/panel/soporte*`, `/panel/ayuda*` |

Existing five unchanged (ADMIN global, GERENTE branch, VENDEDOR personal, CAJERO →
`/panel/caja*`, CONTADOR → `/panel/contabilidad*`). **Note:** to give CAJERO and
CONTADOR the global ticket function, their existing `RestrictedScreen` guards must
also whitelist `/panel/ayuda*` (§7, §9).

---

## 2. MARKETING role scope

**Can:** manage marketing campaigns (create/edit/duplicate/schedule/pause/reactivate/
archive, budget, participating branches, promoted models, channel, UTM/tracking —
progressively), campaign attribution correction, promotional content (later),
marketing metrics/attribution analytics, and a **reduced lead-attribution view**.
Can create and view own tickets and relate them to campaigns / (future) Meta
accounts.

**Reduced lead attribution DTO (MARKETING only)** — a new restricted read exposing
ONLY: code, date, campaign, channel, branch, motorcycle of interest, general status,
final result, conversion date. **Never**: seller private notes, expediente docs,
full cédula, banking info, credit evaluations, personal references, private
conversations.

**Cannot:** operate leads (assign, change commercial state, change operative
branch), inventory, reservations, sales, Caja, Contabilidad; approve credits; mark
sales complete; see costs (finance). Cannot see any other existing panel.

**Access predicate deltas** (in `access.ts`):
- `canViewMarketing(MARKETING) = true`, `canManageMarketing(MARKETING) = true`.
- New `canViewLeadAttribution(role)` → `ADMIN, MARKETING` (restricted DTO only).
- All commercial/finance predicates → `MARKETING = false` (default, but assert).

**Deferred (explicit):** Meta Business multi-account API, direct ad payment via CRM,
public-portal content CMS, promociones/audiencias/plantillas/recursos modules,
richer campaign status set (see §10).

---

## 3. SOPORTE_TECNICO role scope

**Can:** operate the help desk (classify, assign, prioritize, comment incl. internal
notes, request info, relate incidents, mark duplicates, escalate, propose solution,
resolve, close, reopen, record root cause, author KB articles); run **safe,
controlled** diagnostics and health checks (read-only or whitelisted safe actions
like "retry notification", "recalculate status", "create technical ticket");
read-only technical audit; controlled access support (view account active/blocked,
**request** password reset / unlock / session close — sensitive changes flow through
Admin approval).

**Cannot (hard rules):** modify commercial, financial or accounting data directly;
see secrets, tokens, or raw credentials; execute arbitrary SQL; run destructive
actions (drop DB, delete backups/audit, delete users, deploy, edit env, edit prod
records directly); self-elevate role or make anyone Admin; deactivate the primary
Admin.

**Access predicate deltas:**
- New `canOperateSupport(role)` → `SOPORTE_TECNICO` (+ `ADMIN` supervises).
- New `canViewTechnicalAudit(role)` → `ADMIN, SOPORTE_TECNICO` (read-only).
- All commercial/finance/cost predicates → `SOPORTE_TECNICO = false` (assert).
- Sensitive access actions are **request-only**, approved by `canManageUsers` (Admin).

**Deferred:** system-destructive/diagnostic auto-fixes beyond the safe whitelist,
provider escalation integrations, real backup/restore controls.

---

## 4. Global Tickets / Help ("Tickets / Ayuda") scope

One ticket system, per-role permissions/visibility/routes. Internal MVP first;
public CLIENTE portal deferred to 4.0H.

**Routes (internal):** `/panel/ayuda`, `/panel/ayuda/nuevo-ticket`,
`/panel/ayuda/mis-tickets`, `/panel/ayuda/tickets/[id]`; operator surface for
Soporte at `/panel/soporte/tickets`, `/panel/soporte/tickets/[id]`.
**Public (deferred 4.0H):** `/ayuda`, `/ayuda/reportar`, `/ayuda/mis-solicitudes`,
`/ayuda/ticket/[codigo]`.

**Core rules:** every internal user creates + views own tickets; Gerente views
operational branch tickets; Admin supervises all; Soporte classifies/assigns/
prioritizes/comments/resolves/closes. **Public vs internal notes are separated**
(`TicketCommentVisibility PUBLIC|INTERNAL`) — internal notes never shown to the
creator or non-privileged roles. Ticket captures branch, module, and safe context
automatically. Sensitive data (passwords, tokens, full card, CVV, docs) is **never**
auto-captured and is masked on detection. Every state change is audited
(`TicketEvent`). A closed ticket is immutable except via reopen.

---

## 5. Permission matrix — seven roles

`✓` allow · `—` deny · `sup` supervise-only. Predicates live in
`src/server/auth/access.ts` (existing + **new**, marked ⁺). Fill/confirm at
implementation; values below are the intended target.

### 5a. Existing domain predicates
| Predicate | ADMIN | GERENTE | VENDEDOR | CAJERO | CONTADOR | MARKETING | SOPORTE_TECNICO |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `canOperateCrm` | ✓ | ✓ | ✓ | — | — | — | — |
| `canAssignLeads` | ✓ | ✓ | — | — | — | — | — |
| `canManageReservations` / `Sales` / `Transfers` | ✓ | ✓ | ✓ | — | — | — | — |
| `canApproveTransfers` | ✓ | ✓ | — | — | — | — | — |
| `canManageInventory` / ingress / egress | ✓ | ✓ | — | — | — | — | — |
| `canViewCosts` | ✓ | ✓ | — | — | ✓ | — | — |
| `canAccessCaja` | ✓ | ✓ | — | ✓ | — | — | — |
| `canOperateCaja` | ✓ | — | — | ✓ | — | — | — |
| `canAccessContabilidad` | ✓ | ✓ | — | — | ✓ | — | — |
| `canOperateContabilidad` / `canReviewContabilidad` | ✓ | — | — | — | ✓ | — | — |
| `canViewMarketing` | ✓ | ✓ | — | — | — | **✓** | — |
| `canManageMarketing` | ✓ | — | — | — | — | **✓** | — |
| `canViewCommercialAnalytics` | ✓ | ✓ | ✓ | — | — | — | — |
| `canManageUsers` | ✓ | ✓ | — | — | — | — | — |
| `getCreatableRolesForActor` | all | [VENDEDOR] | [] | [] | [] | [] | [] |

### 5b. New predicates (⁺ to add in 4.0C/4.0D/4.0E)
| Predicate ⁺ | ADMIN | GERENTE | VENDEDOR | CAJERO | CONTADOR | MARKETING | SOPORTE_TECNICO |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `canViewLeadAttribution` | ✓ | — | — | — | — | ✓ | — |
| `canOperateSupport` | sup | — | — | — | — | — | ✓ |
| `canViewTechnicalAudit` | ✓ | — | — | — | — | — | ✓ |
| `canCreateTicket` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `canViewOwnTickets` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `canViewBranchTickets` | ✓ | ✓ (operational, own branch) | — | — | — | — | ✓ |
| `canViewAllTickets` | ✓ | — | — | — | — | — | ✓ |
| `canOperateTickets` (classify/assign/priority/resolve/close/merge) | sup | — | — | — | — | — | ✓ |
| `canWriteInternalNote` | ✓ | — | — | — | — | — | ✓ |
| `getTicketScopeForUser` → | global | branchOperational | personal | personal | personal | personal | global |

Creator (any role) may: view, comment (public), attach (later), respond to info
requests, confirm/reopen/cancel own, rate. Creator may **not**: change priority,
assign, change final category, mark resolved, delete comments/history, view
internal notes.

---

## 6. Route access matrix — seven roles

`✓` allowed + in-nav · `(d)` reachable, no nav · `—` blocked/redirect.

| Route | ADMIN | GERENTE | VENDEDOR | CAJERO | CONTADOR | MARKETING | SOPORTE_TECNICO |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `/panel/dashboard` | ✓ | ✓ | ✓ | — | — | — | — |
| `/panel/leads` `/clientes` `/expedientes` `/actividades` | ✓ | ✓ | ✓ | — | — | — | — |
| `/panel/creditos` | ✓ | ✓ | — | — | — | — | — |
| `/panel/inventario` (+`/movimientos` Admin/Gerente) | ✓ | ✓ | ✓ | — | — | — | — |
| `/panel/reservas` `/traslados` `/ventas` | ✓ | ✓ | ✓ | — | — | — | — |
| `/panel/vendedores` `/reportes` | ✓ | ✓ | — | — | — | — | — |
| `/panel/marketing*` | ✓ | ✓ | — | — | — | **✓** | — |
| `/panel/configuracion` | ✓ | ✓ | — | — | — | — | — |
| `/panel/caja*` | ✓ | ✓(nav) | — | ✓ | — | — | — |
| `/panel/contabilidad*` | ✓ | ✓ | — | — | ✓ | — | — |
| `/panel/soporte*` | ✓ (d/sup) | — | — | — | — | — | **✓** |
| `/panel/ayuda*` (Tickets/Ayuda) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 7. Confinement design (`operations-shell.tsx`)

Add two new `RestrictedScreen` blocks mirroring Cajero/Contador, and **widen the
allow-check to include the shared help route**:

```
MARKETING:        allow /panel, /panel/marketing*, /panel/ayuda*   → else RestrictedScreen(→ /panel/marketing)
SOPORTE_TECNICO:  allow /panel, /panel/soporte*,   /panel/ayuda*   → else RestrictedScreen(→ /panel/soporte)
CAJERO (edit):    allow /panel/caja*   + ADD /panel/ayuda*
CONTADOR (edit):  allow /panel/contabilidad* + ADD /panel/ayuda*
```

The `/panel/ayuda*` whitelist for the two existing confined roles is the single
most error-prone edit — without it, Cajero/Contador cannot reach the global ticket
function they are entitled to.

---

## 8. Marketing MVP scope (4.0C)

- **Reuse the existing `/panel/marketing` page and `MarketingCampaign` model.**
- Grant MARKETING `canViewMarketing` + `canManageMarketing` → the existing
  create/update/archive campaign actions work unchanged (they gate on
  `canManageMarketing`).
- Add the MARKETING nav item + confinement + home route + reduced lead-attribution
  read (restricted DTO, §2).
- **No** Meta API, **no** ad payments, **no** public content CMS, **no** new
  campaign sub-routes (`/campanas`, `/contenido`, `/promociones`, `/audiencias`,
  `/plantillas`, `/recursos`, `/analitica`) in the MVP.
- Current campaign status set (`ACTIVE|PAUSED|COMPLETED`) stays; the richer
  8-state set + UTM/tracking + attribution editing are a **later marketing patch**,
  not 4.0C. Deferred items are enumerated so they are not silently dropped.

---

## 9. Ticket MVP scope (4.0E/4.0F/4.0G)

**In scope:** internal tickets for all seven roles; create form (título, categoría,
descripción, impacto, módulo required; sucursal, registro relacionado, pasos,
resultado esperado/obtenido optional); auto-captured safe context (usuario, rol,
sucursal, ruta, módulo, fecha/hora, navegador/SO/dispositivo, versión app, id de
sesión, código de error) with sensitive-value masking; public vs internal comments;
impact→priority mapping by Soporte; per-role visibility scope; participants;
duplicates (`duplicateOfId`) and global incidents (`globalIncidentId`); full event
audit; "Mis tickets" shared view; Gerente branch view; Soporte operator inbox;
"Reportar problema" entry point (top bar / error states).

**Out of scope (first patches):** file attachments (no `TicketAttachment` yet);
public customer ticket portal (`/ayuda/*` public, 4.0H); automatic WhatsApp/email
notifications (in-CRM only, if any); auto-close-after-3-days automation; satisfaction
rating automation into performance; any system-destructive action from a ticket.

**Impact → initial priority (Soporte may override):**
CONSULTA→P4 · AFECTA_UNA_TAREA→P3 · IMPIDE_TRABAJAR→P2 · AFECTA_VARIOS_USUARIOS→P2 ·
SISTEMA_INDISPONIBLE→P1 · RIESGO_SEGURIDAD→P1.

---

## 10. Prisma models needed for the ticket MVP (DOCUMENTED, NOT IMPLEMENTED)

> Reproduced for the schema patch (4.0E). **No schema change in this patch.**
> Attachments are intentionally omitted from the MVP (`TicketAttachment` deferred).
> `Role?` in the sketch maps to the existing `UserRole` enum.

**Models (4):** `SupportTicket`, `TicketComment`, `TicketParticipant`,
`TicketEvent`.

```
model SupportTicket {
  id, code @unique, title, description,
  category TicketCategory, subcategory String?,
  impact TicketImpact, priority TicketPriority, status TicketStatus,
  scope TicketScope @default(USER),
  createdById String?, createdByRole UserRole?, branchId String?,
  assignedToId String?, relatedEntityType String?, relatedEntityId String?,
  sourceRoute String?, errorCode String?, appVersion String?,
  browser String?, operatingSystem String?, deviceType String?,
  duplicateOfId String?, globalIncidentId String?,
  resolvedAt DateTime?, closedAt DateTime?, createdAt, updatedAt,
  comments TicketComment[], participants TicketParticipant[], events TicketEvent[]
}
model TicketComment    { id, ticketId→SupportTicket, authorId?, content, visibility TicketCommentVisibility, createdAt }
model TicketParticipant { id, ticketId, userId, type TicketParticipantType, addedById?, createdAt }
model TicketEvent       { id, ticketId, actorId?, action, fromValue?, toValue?, metadata Json?, createdAt }
```

**Enums (needed for MVP):**
- `TicketStatus`: NUEVO, RECIBIDO, EN_CLASIFICACION, EN_PROGRESO, PENDIENTE_USUARIO,
  PENDIENTE_APROBACION, ESCALADO_DESARROLLO, ESCALADO_PROVEEDOR, SOLUCION_PROPUESTA,
  RESUELTO, CERRADO, REABIERTO, CANCELADO
- `TicketPriority`: P1_CRITICA, P2_ALTA, P3_MEDIA, P4_BAJA
- `TicketImpact`: CONSULTA, AFECTA_UNA_TAREA, IMPIDE_TRABAJAR, AFECTA_VARIOS_USUARIOS,
  SISTEMA_INDISPONIBLE, RIESGO_SEGURIDAD
- `TicketCategory`: ACCESO_Y_CUENTA, ERROR_DEL_SISTEMA, RENDIMIENTO, DATOS_INCORRECTOS,
  INVENTARIO, TRASLADOS, RESERVAS, VENTAS, EXPEDIENTES, CREDITOS, LEADS, MARKETING,
  REPORTES, NOTIFICACIONES, INTEGRACIONES, SOLICITUD_DE_AYUDA, SOLICITUD_DE_MEJORA,
  SEGURIDAD, OTRO
- `TicketScope`: USER, BRANCH, MODULE, GLOBAL
- `TicketCommentVisibility`: PUBLIC, INTERNAL
- `TicketParticipantType`: CREATOR, REQUESTER, WATCHER, ASSIGNEE, APPROVER, COLLABORATOR

**Schema-mechanics notes for 4.0E:** add relation back-references on `User`/`Branch`
if navigating from them; index `code`, `status`, `branchId`, `assignedToId`,
`globalIncidentId`; `code` generated app-side (e.g. `TKT-YYYY-NNNNN`); this is the
**only** step requiring a migration.

---

## 11. Implementation sequence

| Patch | Scope | Migration? |
|---|---|---|
| **4.0A.1** | This plan (design). | No |
| **4.0B** | Roles enum/type scaffolding: add `MARKETING`, `SOPORTE_TECNICO` to `enum UserRole`, `UserRoleEnum`, `OperationRole`, both bridge maps, all exhaustive Records, `operationRoles[]`, `getDefaultRouteForSession`. Roles exist with **no permissions**. | **Yes** (enum) |
| **4.0C** | MARKETING activation: predicates (`canViewMarketing`/`canManageMarketing`/`canViewLeadAttribution`), nav item, confinement, home, reduced lead-attribution read. Reuses existing marketing page. | No |
| **4.0D** | SOPORTE_TECNICO activation: predicates (`canOperateSupport`/`canViewTechnicalAudit`), `/panel/soporte` home + safe read-only dashboard, nav, confinement. No destructive actions. | No |
| **4.0E** | Internal ticket schema + server layer: 4 models + 7 enums (§10), scoped queries, server actions with per-role authorization + sensitive-value masking + event audit. | **Yes** (ticket models) |
| **4.0F** | Internal ticket UI for all roles: `/panel/ayuda*` (create, mis-tickets, detail), "Reportar problema" entry point, public/internal comment split, **whitelist `/panel/ayuda*` in Cajero/Contador/Marketing/Soporte guards**. | No |
| **4.0G** | Support operator panel: `/panel/soporte/tickets*` inbox — classify, assign, priority, internal notes, resolve, close, merge, escalate, root cause, KB. | No |
| **4.0H** | Public customer ticket reporting (`/ayuda/*`, code+phone identity). | Maybe |
| **4.1A** | Meta Business integration **design** (multi-account API, Lead Ads sync, in-CRM ad payment) — design doc only, no implementation. | No |

Each patch ends with the §13 build/type gates. Attachments and auto-notifications
slot in as follow-ups after 4.0G when explicitly scheduled.

---

## 12. Test matrix & smoke plan

### 12a. Per-role checks (run for all seven)
| Check | ADMIN | GERENTE | VENDEDOR | CAJERO | CONTADOR | MARKETING | SOPORTE_TECNICO |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Login → correct home route | | | | | | | |
| Nav shows exactly allowed items | | | | | | | |
| Allowed routes render | | | | | | | |
| Blocked routes → RestrictedScreen/redirect | | | | | | | |
| `/panel/ayuda` reachable (all roles) | | | | | | | |
| Create ticket → own only visible | | | | | | | |
| Internal notes hidden from creator/non-privileged | | | | | | | |
| Blocked server actions denied when called directly | | | | | | | |
| MARKETING cannot touch leads/inventory/sales/caja/ctb | n/a | n/a | n/a | n/a | n/a | ✓ | n/a |
| SOPORTE cannot mutate commercial/finance, no secrets/SQL | n/a | n/a | n/a | n/a | n/a | n/a | ✓ |

### 12b. Ticket-specific
- Gerente sees only **operational** branch tickets, not personal access/security
  tickets of employees; not other branches.
- Soporte sees all; can classify/assign/priority/resolve/close/merge; creator cannot.
- Impact→priority mapping applied on intake; Soporte override works.
- Duplicate/global-incident linkage propagates status; original preserved.
- Sensitive-value masking: attempt to submit a token/password string → masked/stripped.
- Every state change writes a `TicketEvent`; closed ticket immutable except reopen.

### 12c. Smoke plan (per patch)
- Use isolated data prefixed `SMOKE-4.0X-`; clean up after; never touch prod data,
  never reset DB, never leave fixtures or temp routes.
- Regression: re-run CONTADOR audit checks and Cajero confinement; confirm the five
  existing roles are unchanged (additive-only).
- Server-side denial is the real test (call blocked actions directly — a hidden
  button is not proof, per `PROJECT_RULES`).

### 12d. Build/type gates (every patch)
`npx prisma generate` · `npx prisma validate` · `npx tsc --noEmit` · `npm run build`.
Exhaustive `Record<OperationRole,…>` maps make `tsc` a completeness check for role
additions.

---

## 13. No-touch rules

- No production server config; no `.env`; no `SESSION_SECRET` changes.
- No Prisma reset; no destructive migrations; migrations only in 4.0B (enum) and
  4.0E (ticket models), additive.
- No weakening of `proxy.ts` auth gate or existing confined-role guards (only widen
  to add `/panel/ayuda*`).
- No exposing secrets/tokens/credentials anywhere; mask sensitive values in tickets;
  never store passwords or Meta tokens in ticket data.
- **SOPORTE_TECNICO** never edits the DB directly, never runs SQL, never performs
  destructive/deploy/env actions; sensitive access changes are request→Admin-approve.
- **MARKETING** performs no lead/inventory/reservation/sale/Caja/Contabilidad
  operation and sees no costs; lead access is the reduced attribution DTO only.
- No Meta API / ad-payment implementation before the 4.1A design is approved.
- No ticket model implementation before 4.0E; this patch changes no schema.

---

## 14. Highest-risk areas
1. **Ticket visibility leaks** — internal notes to creator/Gerente, or cross-branch
   /cross-role ticket exposure. Enforce scope + visibility **server-side** in every
   query; test directly.
2. **Confined-role help whitelist** — forgetting `/panel/ayuda*` for Cajero/Contador
   (and the two new roles) hides the shared function from entitled roles.
3. **Sensitive-data capture** — auto-context or Meta tickets leaking tokens/PII.
   Mask on intake; never auto-capture credentials.
4. **SOPORTE privilege boundary** — support tooling must be read-only/safe-action
   only; any write to commercial/finance or any destructive/SQL path is a breach.
5. **Enum migration ordering** — app code referencing `MARKETING`/`SOPORTE_TECNICO`
   or ticket enums before the migration lands fails at runtime; migration precedes
   code.
6. **Two-representation drift** — add DB enum + Spanish + all Records together.

## 15. Open items for later design (not blocking 4.0B–4.0G)
- Meta multi-account API, Lead Ads sync, in-CRM ad payment (4.1A).
- Public customer ticket identity (code+phone / secure link) and portal (4.0H).
- Attachment storage/scanning, notification channels, SLA/auto-close automation.
- Whether MARKETING campaign status expands to the 8-state set + UTM/attribution.
