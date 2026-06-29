# MotoMas Project Audit

Audit date: 2026-06-21

## 1. General status

MotoMas is a Next.js demo that already separates two experiences:

- **Portal Cliente**: public catalog, request capture, and public process lookup.
- **Centro de Operaciones**: role-based demo workspace for commercial and unit operations.

The demo covers the core commercial sequence: public request -> lead -> customer
and expediente -> activity, quote, documents, manual credit follow-up ->
reservation -> sale -> delivery. It also covers unit inventory, transfers,
marketing attribution, commercial reports, and an administrator-only demo reset.

The functional breadth is high for a browser demo. The application is not ready
for real multi-user use: business data, session state, permissions, and
transitions are still browser-side `localStorage` behavior. PostgreSQL/Prisma
files are design artifacts only and no database connection exists.

Build result: `npm.cmd run build` passed on 2026-06-23. Next.js generated all
30 routes successfully.

## 2. Existing modules

### Portal Cliente

| Module | Route | Current state | Persistence / dependencies |
| --- | --- | --- | --- |
| Home | `/` | Functional; links to catalog, request and lookup; featured motorcycle carousel. | Static catalog data and public routes. |
| Catalog | `/catalogo` | Functional public catalog. | `src/data/catalog/motorcycles.ts`, local images. |
| Motorcycle detail | `/motocicletas/[slug]` | Functional with supplied fields and pending-information fallback. | Catalog data. |
| Request information | `/solicitar-informacion` | Functional validation, branch selection, lead creation and campaign UTM capture. | `motomas-public-leads-v1`, marketing campaigns. |
| Check process | `/consultar-expediente` | Functional lookup by request code, expediente, phone, or cedula. | Leads, customers, files, reservations, units, sales. |
| My credit | `/mi-credito` | Public-safe credit status, pending-document message and next step when a file has manual follow-up. | Public process lookup, credit and document records. |
| My reservation | `/mi-reserva` | Functional public reservation summary. | Reservations and unit status. |
| My delivery | `/mi-entrega` | Functional public delivery summary. | Sales and unit status. |

### Centro de Operaciones

| Module | Route | Roles | Current state and dependencies |
| --- | --- | --- | --- |
| Demo login | `/panel` | Vendedor, Gerente, Administrador | Functional browser-side role session. |
| Dashboard | `/panel/dashboard` | All internal roles | Functional scoped metrics across leads, files, activities, quotes, documents, credits, inventory, reservations, transfers, sales. |
| Leads | `/panel/leads` | All internal roles, scoped | Functional intake, filtering, assignment, state change, and conversion to customer/file. |
| Customers | `/panel/clientes` | All internal roles, scoped | Functional list, search, history, related files and activities. |
| Expedientes | `/panel/expedientes` | All internal roles, scoped | Functional details, activities, quote, document checklist and manual credit follow-up. |
| Activities | `/panel/actividades` | All internal roles, scoped | Functional commercial activity list, filters, state transitions and overdue logic. |
| Inventory | `/panel/inventario` | All internal roles, scoped | Functional aggregated and unit views, filters and movement history. |
| Transfers | `/panel/traslados` | Vendedor creates; Gerente operates; Admin sees all | Functional pending -> approved -> in transit -> received/cancelled flow. |
| Reservations | `/panel/reservas` | Scoped | Functional reservation and seller-owned cancellation flow. |
| Sales / deliveries | `/panel/ventas` | Scoped | Functional sale creation and single delivery transition. |
| Marketing | `/panel/marketing` | Gerente, Administrador | Functional local campaigns, filters, links and attribution metrics; only Admin edits. |
| Reports | `/panel/reportes` | Gerente, Administrador | Functional local aggregations, charts and funnel scoped by role/branch. |
| Credits route | `/panel/creditos` | Gerente, Administrador | Consolidated scoped view with metrics, filters and links to expediente detail. |
| Sellers route | `/panel/vendedores` | Gerente, Administrador | Functional demo supervision of sellers, workload and commercial performance, scoped by role and branch. |
| Settings | `/panel/configuracion` | Administrador | Functional demo reset, not real user/branch configuration. |

### Architecture and persistence

- The active UI is App Router code under `src/app/(portal)` and
  `src/app/(operations)`.
- Persistence keys are mostly centralized in
  `src/shared/persistence/storage-keys.ts`.
- `src/shared/persistence/repository-types.ts` defines future repository
  contracts, but active services still directly read/write browser storage.
- `DATABASE_PLAN.md`, `PRISMA_PLAN.md`, and `prisma/schema.prisma` prepare a
  future relational migration without installing or running Prisma.

## 3. Missing or incomplete modules

### High priority before further business expansion

1. **Keep the credit product decision documented.** The current demo permits
   one active manual credit follow-up per expediente; multiple lender
   applications remain a future product decision.
2. **Define the active catalog source.** App Router screens use
   `src/data/catalog/motorcycles.ts` and `public/catalog/motorcycles`; legacy
   files describe a filesystem catalog under `public/motos`. There must be one
   supported source before admin catalog editing or a database migration.
3. **Set a controlled UI stabilization scope.** The recent visual rollback
   proves that shared visual changes need screenshot-based review and scoped
   acceptance criteria before another global redesign.

### Medium priority

- Customer 360 history across all interactions, quotes, credits, reservations,
  sales and deliveries in one coherent view.
- Formal printable quote output and controlled report export.
- Real document attachments with secure storage, metadata, access controls and
  retention rules.
- Internal notifications for assigned leads, overdue activities, pending
  documents, incoming transfers and delivery readiness.
- Real configuration for users, roles, branches and catalog administration.
- Post-sale basics: delivery confirmation, warranty registration, scheduled
  service, claims and customer follow-up.

### Low priority / post-foundation

- Test ride and appointment calendar specialization.
- WhatsApp Business integration.
- Meta Lead Ads webhook/API integration.
- Warranty and workshop modules.
- Corporate report exports and scheduled reporting.

## 4. Detected errors and risks

### Confirmed or strongly evidenced

| Severity | Finding | Evidence / impact | Recommended resolution |
| --- | --- | --- | --- |
| High for production | Authorization is client-side only. | Session, role and branch scope are read from `motomas-demo-session-v1`; route access and mutation checks execute in the browser. | Introduce authenticated server sessions and enforce scope in server-side repositories/API before real data. |
| High for production | Business state is browser-local and non-transactional. | Services write separate `localStorage` keys for units, reservations, transfers and sales. Another browser or user cannot see changes. | Move transitions to database transactions after approved migration design. |
| Resolved in 2.15 | Credit model documentation contradicted the implementation. | The demo now formally uses one active manual follow-up per expediente with an editable lender. | Revisit only when a multi-financial workflow is approved. |
| Resolved in 2.16 | `/panel/vendedores` was an operational placeholder. | It now supervises demo sellers with scoped workload and commercial metrics. | Keep real user management deferred until authentication and persistence are approved. |
| Medium | Legacy application code and storage remain in the repository. | `src/components/motomas-app.tsx`, `src/lib/motomas-data.ts`, and `src/lib/moto-catalog.ts` use `motomas-demo-state-v2` and are not imported by the active App Router. | Archive or remove in a dedicated cleanup patch after confirming no external consumer depends on it. |
| Medium | Catalog strategy is inconsistent. | Active public catalog is static `src/data/catalog/motorcycles.ts` with `public/catalog`; legacy code expects `/public/motos` and dynamic filesystem loading. | Select one authoritative catalog source and document it before data migration. |
| Medium | Public lookup can disclose a matching record with a phone or cedula alone. | `findPublicProcess` resolves one matching process from public identifiers. Shared phones or compromised identifiers can expose customer process details. | Require a second factor such as request code, masked OTP, or server-side verification for production. |
| Resolved in 2.17 | Visible text had inconsistent accents and spelling. | Active Portal Cliente and Operations screens now use corrected labels, buttons and scoped empty states without changing internal enum values. | Keep future copy changes isolated from business-state strings. |
| Low | Git metadata is unusable in this checkout. | `.git` directory exists, but `git status`, `git diff`, and `git log` report that this is not a Git repository. | Reinitialize or restore valid repository metadata outside application work; do not use it to infer rollback history. |

No TypeScript, import, or Next.js route build error was found in the current
audit build.

## 5. Flows that need clarification

| Flow | What is confusing | Impact | Recommendation |
| --- | --- | --- | --- |
| Public request -> lead | The form says later phases do not create customers/files, while the broader application does support conversion. | Customers may not understand the next internal step; staff have no explicit conversion checklist. | Keep public wording simple and add an internal lead-to-file checklist in a later CRM patch. |
| Lead -> customer/file | Conversion is tied to Contactado or Interesado and the file state stays `Expediente creado`. | There is no expediente lifecycle beyond creation. | Define explicit file stages separately from lead status. |
| Expediente -> credit | One active manual follow-up is embedded in expediente; manager/admin have a consolidated supervised view. | A future multi-financial flow would require a new decision and model. | Keep the single-follow-up rule until a new phase approves expansion. |
| Credit -> reservation / sale | Credit status is intentionally informational and does not block reservations or sales. | A user can assume Aprobado authorizes a sale. | Add business guidance and later policy checks only after the business decides the rule. |
| Public credit view | Public view exposes only status, pending-document message and next step. | It deliberately omits lender, amounts and internal observations. | Keep this privacy boundary in future public changes. |
| Reservation -> sale | A reservation may be created using a manually entered customer name without a customer ID. | Future database migration and customer traceability become ambiguous. | Require a customer or expediente before production; provide controlled migration handling for legacy demo records. |
| Marketing attribution | Campaigns can exist without a target branch and Gerente visibility allows branchless campaigns. | Branch ownership of campaign data is ambiguous. | Define whether global campaigns are visible to all managers or only administrators. |
| Demo reset | Reset removes all demo keys and recreates inventory. | Correct for demo, destructive for any real browser data. | Keep it strictly demo-only and exclude it from any production environment. |

## 6. UI/UX pending review

The desired direction remains dark, sporty, technological and commercial. Do
not convert the product into a light generic admin template.

- The Portal Cliente and Operations shell have separate navigation, which is
  correct. Their visual systems should be improved through isolated sections,
  not global shared-component rewrites.
- The home carousel is interactive and catalog-based, but needs screenshot
  review at mobile, tablet and desktop before another styling change.
- Many pages use dense cards and responsive grid/table breakpoints. Large
  internal tables need tested horizontal-scroll behavior and readable compact
  row summaries on mobile.
- Empty states should remain specific to their operational scope; the Credits
  and Sellers routes are no longer placeholders.
- Repeated field/select class strings create drift risk. A future UI patch can
  introduce small primitives only after visual acceptance criteria are agreed.
- Copy is normalized across the active screens. Some source output still
  displays mojibake under the current Windows shell, so browser rendering must
  be checked before declaring an encoding defect.

## 7. Roles and permissions review

### Current demo behavior

- **Vendedor**: sees assigned leads and own scoped customers, files,
  activities, reservations, sales, and credits embedded in own expedientes.
  Cannot access Reports, Marketing, Settings, or navigation to Credits.
- **Gerente**: sees branch-scoped leads, customers, files, operational data,
  reports and marketing. Handles transfer approval/dispatch/receipt according
  to branch relation.
- **Administrador**: sees global operational data, reports and settings. Demo
  settings reset is restricted to this role.
- **Cliente publico**: has no operations login and does not receive inventory
  or corporate reports through public routes.

### Permission gaps

1. Filtering is consistently implemented through service helpers, but it is
   presentation-layer enforcement only. Direct `localStorage` manipulation can
   impersonate a role in the demo.
2. Route restrictions render a restricted/unauthenticated UI rather than
   enforcing a server redirect or authorization boundary.
3. Gerente campaign visibility for campaigns without a target branch should be
   an explicit policy decision.
4. Administrador cannot mutate some embedded commercial workflows by design;
   this is acceptable only if supervisory read-only behavior is documented.

## 8. Local persistence review

### Centralized active keys

| Key | Purpose |
| --- | --- |
| `motomas-public-leads-v1` | Public requests and operational leads. |
| `motomas-demo-session-v1` | Demo internal session. |
| `motomas-customers-v1` | Customer records and interaction summaries. |
| `motomas-customer-files-v1` | Expedientes. |
| `motomas-inventory-units-v1` | Individual units and movement history. |
| `motomas-transfer-orders-v1` | Transfer orders. |
| `motomas-reservations-v1` | Reservations. |
| `motomas-sales-v1` | Sales and deliveries. |
| `motomas-marketing-campaigns-v1` | Local marketing campaigns. |
| `motomas-activities-v1` | Commercial activities. |
| `motomas-quotes-v1` | One quote per expediente. |
| `motomas-expedient-documents-v1` | File document checklist. |
| `motomas-credit-applications-v1` | Manual credit follow-ups. |

`storage-keys.ts` centralizes these active keys and reset logic uses the same
list. Direct service access to `window.localStorage` remains duplicated, so the
abstract adapter is preparatory rather than active.

### Legacy key

`src/components/motomas-app.tsx` still defines `motomas-demo-state-v2`. It is
outside the active storage-key registry and belongs to unused legacy UI code.
It should be handled in a dedicated cleanup/migration review, not silently
deleted.

## 9. Documentation review

| Document | Status | Required follow-up |
| --- | --- | --- |
| `PROJECT_RULES.md` | Strong business reference. | Keep the one-active-manual-follow-up rule until a future multi-financial workflow is approved. |
| `ARCHITECTURE.md` | Correctly documents portal/operations separation. | Update catalog-source guidance if the legacy filesystem loader is retired. |
| `ROLES.md` | Useful role intent. | Documents the demo-only seller supervision boundary and deferred real user management. |
| `FLOWS.md` | Broad commercial target flow. | Separate current demo behavior from intended future processes. |
| `CHANGES.md` | Detailed chronological history. | Keep rollback and audit notes separate from functional patch claims. |
| `DATABASE_PLAN.md` | Good migration intent. | Preserve the current one-to-one credit follow-up constraint in the first migration. |
| `PRISMA_PLAN.md` | Good staged migration outline. | Add an explicit data import plan for legacy `motomas-demo-state-v2`, if retained. |
| `prisma/schema.prisma` | Detailed draft only. | Do not run it until auth, tenancy, constraints, migration rehearsal and database hosting are approved. |

## 10. Recommended next patches

### Medium priority

1. **Parche 2.18 - Customer 360 and commercial lifecycle**
   - Objective: show a cohesive customer timeline and define expediente stages.
   - Risk: medium; requires agreed business status model.

2. **Parche 2.19 - Documents and formal output plan**
   - Objective: specify secure attachments, formal quote printing and report
     export without implementing external storage yet.
   - Risk: medium; privacy and retention requirements are required first.

3. **Parche 3.2 - Persistence migration readiness**
   - Objective: convert current service contracts into an import rehearsal and
     authorization design, without switching production persistence.
   - Risk: high; must follow provider, auth and security approval.

### Low priority

4. **Post-sale, warranty and service workflow** after operational data and
  customer history have a stable central data model.
5. **Meta Lead Ads and WhatsApp Business APIs** after public HTTPS backend,
   webhooks, authentication and database persistence are live.

## 11. Risks before real production use

- `localStorage` is device-local, user-editable, capacity-limited and has no
  backup, concurrency, auditing or shared visibility.
- There is no real authentication, password policy, session expiry, server-side
  authorization or access revocation.
- There is no central database, transaction handling, migration, backup or
  recovery process.
- Browser-only permission filters cannot protect customer, financial or unit
  information.
- Public lookup needs stronger identity verification before exposing real
  customer information.
- Document checklists have no actual file attachments, malware screening,
  retention policy or controlled download access.
- Marketing attribution has no Meta webhook, HTTPS endpoint, signature
  verification or consent/retention implementation.
- Git history is not usable in this checkout, preventing reliable change
  recovery and release traceability.

Before production, resolve identity/authentication, database architecture,
server-side authorization, backups, audit logging, privacy review, monitoring,
error reporting, concurrency controls and deployment operations.

## 12. Conclusion

MotoMas is advanced as a functional local demo: the primary commercial and
unit flows are represented and build successfully. It is ready for a formal
demo after a controlled visual stabilization pass.

It is not ready for production with customer data. The next work should be
Parche 2.18, focused on customer lifecycle consistency. Database,
authentication and external integrations must remain deferred until the
migration foundation is explicitly approved.
