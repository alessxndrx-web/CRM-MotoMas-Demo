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

## Patch 3.0.3A - Production data audit and customer/inventory separation report

Audit date: 2026-07-08

Scope: documentation-only audit. No data was deleted, no business logic was
changed, no database reset was performed, and no UI was redesigned.

### Real data to preserve

- Real branch names from `C:\Users\lesli\Desktop\Sucursales Motomas.txt`, now
  represented by `src/data/operations/leads.ts` and `prisma/seed.mjs`.
- User-provided motorcycle images and asset-derived catalog entries under
  `public/catalog/motorcycles`, `public/motos` and
  `src/data/catalog/motorcycles.ts`.
- Current Prisma schema for branches, users, catalog models, motorcycle units,
  inventory movements and audit logs.

### Demo data still seeded through Prisma

- `prisma/seed.mjs` still seeds development users:
  `admin@motomas.local`, `gerente@motomas.local`, `vendedor@motomas.local`,
  `cajero@motomas.local` and `contador@motomas.local`.
- `prisma/seed.mjs` still seeds three physical motorcycle units with fake
  identifiers: `CH-DEMO-0001` / `EN-DEMO-0001`,
  `CH-DEMO-0002` / `EN-DEMO-0002`, and `CH-DEMO-0003` / `EN-DEMO-0003`.
- `prisma/seed.mjs` still creates initial inventory movements with reason
  `Alta inicial de inventario (seed)` and demo notes.
- `prisma/seed.mjs` seeds the public catalog model table. The branch entries
  and Patch 3.0.2A motorcycle catalog entries are approved data sources to
  preserve; the three original Bajaj catalog rows with invented year values
  should be reviewed separately before production cutover.

### Demo data still hardcoded in frontend/static/localStorage files

- `src/shared/persistence/storage-keys.ts` centralizes active browser storage
  keys for leads, customers, files, inventory, transfers, reservations, sales,
  quotes, documents, credit follow-ups, activities, marketing, Caja,
  Contabilidad and demo session state.
- `src/data/operations/leads.ts` contains `legacyDemoBranches`, demo sellers
  and `demoLeads`.
- `src/data/operations/users.ts` contains hardcoded internal demo users and
  role/branch identities.
- `src/data/operations/inventory.ts` generates local demo inventory units with
  `VIN-MTMS-*`, `CHS-*`, `MTR-*` and seeded movement history.
- `src/features/operations/services/inventory-service.ts` initializes
  `motomas-inventory-units-v1` from `createDemoInventoryUnits()` when browser
  storage is empty or invalid.
- `src/features/operations/services/leads-service.ts` injects demo leads when
  fewer than three leads are visible.
- `src/data/operations/cashier.ts` and
  `src/features/operations/services/cashier-service.ts` provide demo Caja
  invoices, receipts, notes and closures.
- `src/data/operations/accounting.ts` and
  `src/features/operations/services/accounting-service.ts` provide demo
  journal entries, vouchers, documents, expenses, payroll, inventory costs,
  chart accounts, banks, reconciliations, closures and third parties.
- `src/features/operations/services/*` still read and write browser
  `localStorage` for customers, customer files, activities, documents, credit
  applications, quotes, reservations, transfers, sales, marketing, Caja and
  Contabilidad.
- `src/components/motomas-app.tsx` is legacy UI/state that still defines
  `motomas-demo-state-v2`, demo sessions and a demo reset flow.
- `src/lib/motomas-data.ts` remains legacy/static MotoMas data and should be
  reviewed with the legacy UI before removal.
- `src/server/auth/dev-users.ts` maps development login accounts to local demo
  identities so the browser-local panels continue to show demo data.

### Persistence status

- Customers are not database-backed yet. There is no `Customer` model in
  `prisma/schema.prisma`; customer records are read and written through
  `motomas-customers-v1` in
  `src/features/operations/services/customer-files-service.ts`.
- Customer files are not database-backed yet. They use
  `motomas-customer-files-v1`.
- Leads remain browser-local in `motomas-public-leads-v1`, with demo fallback
  records added by `src/features/operations/services/leads-service.ts`.
- Motorcycle inventory has a database-backed slice:
  `MotorcycleUnit` and `InventoryMovement` in `prisma/schema.prisma`, accessed
  by `src/server/inventory/actions.ts` and `src/server/inventory/queries.ts`
  for `/panel/inventario/movimientos`.
- The commercial inventory consultation still has a separate localStorage demo
  source in `motomas-inventory-units-v1`.

### Customer and inventory separation

- Public catalog models and physical units are separated in Prisma:
  `MotorcycleCatalogModel` has many `MotorcycleUnit` records, and
  `MotorcycleUnit.catalogModelId` is optional.
- The public catalog remains separate from operational inventory data. Catalog
  entries store display/catalog fields; physical units store branch, unit
  identity, status and movement history.
- Prisma `MotorcycleUnit` does not contain customer fields. It stores unit
  identity, catalog reference, branch, entry/exit dates and status.
- Prisma has no `Customer` table yet, so customer records are not embedded in
  database motorcycle inventory rows.
- LocalStorage `InventoryUnit` does not store customer objects or customer IDs.
  Reservations and sales store references such as `clienteId`, `clienteNombre`
  and `unidadId`; this links customer and unit at the transaction record level,
  not inside the unit record.
- Local customer records store customer identity, origin branch, source lead
  and interaction history. Customer files store `motoInteres` as interest text;
  they do not store VIN, chassis, engine number, cost or physical branch
  inventory data.

### Cleanup candidates for the next patch

- `prisma/seed.mjs`: split production seed from development/demo seed; fence
  or remove seeded dev users and fake motorcycle units from production seed.
- `src/data/operations/leads.ts`: remove or quarantine `demoLeads`, demo
  sellers and `legacyDemoBranches` after migration policy is approved.
- `src/data/operations/users.ts` and `src/server/auth/dev-users.ts`: replace
  demo identity mappings with database users only after production auth smoke
  tests pass.
- `src/data/operations/inventory.ts` and
  `src/features/operations/services/inventory-service.ts`: retire
  localStorage demo inventory once `/panel/inventario` reads from the database
  inventory source.
- `src/data/operations/cashier.ts`,
  `src/features/operations/services/cashier-service.ts`,
  `src/data/operations/accounting.ts` and
  `src/features/operations/services/accounting-service.ts`: quarantine demo
  financial documents before production use.
- `src/components/motomas-app.tsx` and `src/lib/motomas-data.ts`: archive or
  remove legacy demo application state in a dedicated cleanup patch.
- `src/shared/persistence/storage-keys.ts` and
  `src/features/operations/services/demo-data-reset-service.ts`: keep the demo
  reset flow out of production environments.

Recommended next patch: Patch 3.0.3B - Demo data quarantine and production seed
split. That patch should separate real seed data from development fixtures
without deleting database rows, then plan the customer/leads persistence
migration as a later database-backed phase.

## Patch 3.0.3B - Production seed cleanup and demo data removal

Audit date: 2026-07-08

Scope: cleanup/isolation patch. Real branch names, user-provided motorcycle
catalog assets and the current Prisma schema were preserved. No database reset
or destructive database cleanup was performed.

### Seed cleanup status

- `prisma/seed.mjs` no longer creates the five development users
  `*@motomas.local`.
- `prisma/seed.mjs` no longer creates fake physical motorcycle units,
  `CH-DEMO-*` chassis numbers, `EN-DEMO-*` engine numbers or seed ingress
  movements.
- The seed still preserves and upserts the real branch catalog from the TXT
  source and the motorcycle catalog model rows, including user-provided asset
  entries from Patch 3.0.2A.
- A bootstrap Admin is created only when all three environment variables are
  present: `MOTOMAS_ADMIN_NAME`, `MOTOMAS_ADMIN_EMAIL` and
  `MOTOMAS_ADMIN_PASSWORD`.
- If bootstrap Admin variables are missing, the seed prints a warning and does
  not silently create a production user.
- Existing old demo users or demo units are not deleted automatically. The seed
  reports them as manual cleanup pending when found.

### Frontend/static demo isolation

- A shared demo gate was added in `src/shared/lib/demo-mode.ts`.
- Development demo data is enabled by default only outside production, or
  explicitly with `NEXT_PUBLIC_MOTOMAS_ENABLE_DEMO_DATA=true`.
- Production/default reads for leads, inventory, Caja and Contabilidad no
  auto-populate fake records when storage is empty.
- Existing browser localStorage records are still preserved and read when
  valid; this patch does not delete user-created local records.
- The demo reset helper no longer clears browser business keys unless demo
  data is enabled.
- Legacy branch names remain only as compatibility data in `legacyDemoBranches`
  or gated demo fixture content; active selectors continue to use real
  `desiredBranches`.

### Separation status after cleanup

- `MotorcycleCatalogModel` remains separate from `MotorcycleUnit`.
- Public catalog entries do not create inventory units automatically.
- Inventory ingress still creates only `MotorcycleUnit` plus
  `InventoryMovement`.
- Customer creation still does not create inventory units.
- `MotorcycleUnit` still has no customer fields.
- Customer persistence remains pending; there is still no Prisma `Customer`
  model in this patch.

### Remaining risks

- Databases seeded before this patch may still contain old demo users and demo
  motorcycle units. Because those rows may be referenced by existing movement
  history or local testing, cleanup is left as an explicit manual operation.
- CRM, reservations, sales, transfers, Caja and Contabilidad are still not
  migrated to PostgreSQL. They remain localStorage-backed until a future
  persistence migration patch.
- Development demo fixture functions remain in the repo for local demos, but
  are now isolated from production/default auto-seeding behavior.

## Patch 3.1A/3.1B/3.1C - CRM core database slice and UI connection

Audit date: 2026-07-08

Scope: adds database-backed Customer/Lead/CustomerFile/Activity models
(3.1A), a server-side CRM data layer of role-scoped queries and actions
(3.1B), and additive UI sections connecting `/solicitar-informacion`,
`/panel/leads`, `/panel/clientes` and `/panel/expedientes` to that data layer
(3.1C). No database reset, no UI redesign, no reservations/sales/transfers/
Caja/Contabilidad migration.

### What is now database-backed

- `prisma/schema.prisma`: `Customer`, `Lead`, `CustomerFile`, `Activity`
  models and their enums, migration `20260708183522_crm_core`.
- `src/server/crm/{shared,queries,actions}.ts`: role-scoped reads
  (`listLeads`, `listCustomers`, `listCustomerFiles`, `getCustomerFileDetail`)
  and actions (`createPublicLeadAction`, `assignLeadAction`,
  `updateLeadStatusAction`, `createCustomerAction`, `createExpedienteAction`).
- `src/server/auth/access.ts`: `canOperateCrm`, `canAssignLeads`,
  `getCrmScopeForUser` (`global` / `branch` / `personal` scope).
- UI: `/solicitar-informacion` writes a lead to the database first (falls back
  to localStorage-only on failure); `/panel/leads`, `/panel/clientes` and
  `/panel/expedientes` each render a new "Base de datos" section (server
  component fetch + client panel) above the existing page content, following
  the same pattern already shipped for `/panel/inventario` (localStorage)
  next to `/panel/inventario/movimientos` (database).

### What is still localStorage-only after this patch

The new database section on each of the three panel routes is **additive**;
the full pre-existing localStorage-driven module on that same route is
untouched and still the primary/complete experience:

- **Leads**: manual lead registration, follow-up notes, activity history via
  `ActivityRelationshipPanel`, workload panel, assignment recommendation, and
  lead → customer/expediente conversion (`createCustomerFileFromLead`) all
  still read/write `motomas-public-leads-v1` exclusively. The new database
  section only supports: viewing role-scoped database leads, assigning a
  database lead to a database seller, and changing a database lead's status.
- **Customers**: interaction history, search and the customer detail view
  still read `motomas-customers-v1`. The new database section only lists
  database customers (name, phone, cedula, branch, email).
- **Expedientes**: proforma (quote), document checklist and manual credit
  follow-up still read `motomas-customer-files-v1`,
  `motomas-quotes-v1`, `motomas-expedient-documents-v1` and
  `motomas-credit-applications-v1`. The new database section only lists
  database expedientes (file number, customer, branch, seller, status).
- **Public process lookup** (`/consultar-expediente`, `/mi-reserva`,
  `/mi-entrega`, `/mi-credito`): `findPublicProcess` still reads only
  `localStorage` (leads, customers, files, reservations, sales, units,
  credits, documents) because these public views depend on
  reservation/sale/unit/credit records that are explicitly out of scope for
  this migration phase. This is why the public lead form writes to
  `localStorage` in addition to the database, using the database `trackingCode`
  as the shared id — so these existing lookups keep working unchanged without
  touching `public-process-service.ts`.
- **Reservations, sales, transfers, quotes, documents, credit follow-ups,
  activities, marketing, Caja, Contabilidad**: entirely unchanged, still
  `localStorage`-only, not touched by 3.1A/3.1B/3.1C.

### Why the database sections are additive rather than a full swap

Reservations, sales, quotes, documents and credit follow-ups all key off the
`localStorage` customer/expediente record ids (`clienteId`, `expedienteId`).
Switching `/panel/clientes` or `/panel/expedientes` to read database records
as the *only* source would desynchronize those ids from the still-localStorage
downstream modules this patch was explicitly told not to touch. The additive
"Base de datos" section pattern (already established by
`/panel/inventario/movimientos`) lets the new CRM core data layer be exercised
end-to-end from real UI without breaking any existing flow.

### Verification performed

- `npx tsc --noEmit`: clean.
- `npm.cmd run build`: compiled successfully; `/panel/leads`,
  `/panel/clientes`, `/panel/expedientes` and `/solicitar-informacion` build
  as dynamic (`ƒ`) routes.
- Local dev server against the `motomas-postgres` container (14 branches, 5
  users, 0 leads at test time): public request page renders, unauthenticated
  `/panel/leads` redirects to `/login`, `/consultar-expediente` renders, no
  server errors.
- Not performed: authenticated click-through of the new database sections
  (assign a lead, change status, view scoped lists as each role). This needs
  real login credentials for the existing seeded accounts, which this agent
  does not have and did not reset. Recommended as a manual follow-up before
  relying on this patch for a live demo.

## Patch 3.1D - CRM core authenticated smoke test and DB-primary cleanup

Audit date: 2026-07-08

Scope: closes the follow-up gap from 3.1C above. No reservations/sales/
transfers/Caja/Contabilidad migration, no UI redesign, no database reset, no
`.env` change.

### Credential availability

The documented dev password (`Motomas.2026`) verifies against all 5 seeded
database users' stored hashes (`admin@motomas.local`, `gerente@motomas.local`,
`vendedor@motomas.local`, `cajero@motomas.local`, `contador@motomas.local`) —
login is functionally available for every role via the database path. This
was confirmed with the app's own `verifyPassword` logic in a temporary,
read-only script (no secrets printed, deleted immediately after).

### CRM flow verification

No browser-automation tool is installed in this environment (no Playwright/
Puppeteer/Cypress) and the login form's server action cannot be reliably
replayed over raw HTTP. A temporary script mirroring the exact rules in
`src/server/auth/access.ts` and `src/server/crm/{actions,queries}.ts` ran
against the real `motomas-postgres` database and passed all 17 checks: CRM
role gating (Cajero/Contador blocked, Admin/Gerente can assign, Vendedor
cannot), public lead creation with a valid tracking code, branch/global/
personal lead visibility, lead assignment within the same branch, lead status
progression, customer creation with phone-based dedup, expediente creation
correctly linking lead/customer and advancing lead status, and zero
`MotorcycleUnit` rows created as a side effect. All test rows were deleted at
the end; no pre-existing data was touched.

### DB-primary cleanup

The three "Base de datos" panels (leads/customers/expedientes) are now
labeled "fuente principal" (primary source) for new records. Each of
`/panel/leads`, `/panel/clientes`, `/panel/expedientes` shows a plain divider
label ("Temporal, pendiente de migración") above the pre-existing
localStorage-driven view — only when the database section is actually the
one rendered, so the localStorage view is never mislabeled while it's still
the only working path (no `DATABASE_URL`). No localStorage flow, key or
component was deleted, and no other UI was changed.

### Remaining localStorage CRM dependencies (unchanged from 3.1C)

Manual lead registration, follow-up notes, activity history, lead →
customer/expediente conversion, customer interaction history, proformas,
document checklists, credit follow-ups, and the entire public process lookup
(`/consultar-expediente`, `/mi-reserva`, `/mi-entrega`, `/mi-credito` via
`findPublicProcess`). Reservations, sales, transfers, Caja and Contabilidad
remain fully untouched and localStorage-only.

### Verification performed

- `npx tsc --noEmit`: clean.
- `npm.cmd run build`: compiled successfully, no errors or warnings.

## Patch 3.2C - Operations UI database connection

Audit date: 2026-07-08

Scope: connects `/panel/reservas`, `/panel/ventas`, `/panel/traslados` to the
Patch 3.2B database actions/queries using the additive "Base de datos (fuente
principal)" pattern established in 3.1C. No UI redesign, no Prisma schema
change, no migration, no Caja/Contabilidad/public-portal change, no
`localStorage` key removed.

### What is now database-backed

- `/panel/reservas`: reservation list scoped by role + create/cancel actions
  (`createReservation`, `cancelReservation`).
- `/panel/ventas`: sale list scoped by role + create/deliver actions
  (`createSale`, `markSaleDelivered`), including creating a sale directly from
  an active reservation.
- `/panel/traslados`: transfer list scoped by role + request/approve/dispatch/
  receive/cancel actions (`createTransfer`, `approveTransfer`,
  `dispatchTransfer`, `receiveTransfer`, `cancelTransfer`).

Each database section only renders when `DATABASE_URL` is configured and the
caller's role may operate that module; a plain-text divider then labels the
pre-existing localStorage panel "Temporal, pendiente de migración".

### What is still localStorage-only after this patch

The full pre-existing `ReservationsPanel`, `SalesPanel` and `TransfersPanel`
components are untouched and remain the complete, primary experience when the
database is not configured:

- Manual/legacy reservation creation flows tied to `motomas-reservations-v1`
  (e.g. reservations created from a manually entered customer name without a
  customer id, per the known migration risk in DATABASE_PLAN.md) are not
  connected to the database and are not expected to be — that data has no
  reliable customer/unit mapping yet.
- `motomas-sales-v1` sale records, including any linkage to
  `motomas-quotes-v1`, `motomas-expedient-documents-v1` or
  `motomas-credit-applications-v1`, remain fully separate from the new
  database `sales` table. A sale created in one system does not appear in the
  other.
- `motomas-transfer-orders-v1` transfer history and its role-based dashboards
  (workload/recommendation panels already shipped for Leads do not exist for
  Transfers) remain localStorage-only.
- The public process lookup (`/consultar-expediente`, `/mi-reserva`,
  `/mi-entrega`, `/mi-credito` via `findPublicProcess`) still reads only
  `localStorage` reservations/sales/units; it does not see database
  reservations or sales created through the new panels. This is an explicit,
  documented gap: a reservation/sale made through the new database section
  will not be visible to a customer checking their process publicly until a
  future patch connects the public lookup to the database.
- Caja, Contabilidad and inventory ingress/egress (`/panel/inventario/movimientos`,
  already database-backed since Patch 3.0) are unaffected.

### Verification performed

- `npx prisma generate`: OK, no schema change (Patch 3.2A models were
  sufficient).
- `npx tsc --noEmit`: clean.
- `npm.cmd run build`: compiled successfully; `/panel/reservas`,
  `/panel/ventas`, `/panel/traslados` build as dynamic (`ƒ`) routes.
- Not performed: authenticated click-through of the new create/cancel/approve/
  dispatch/receive/deliver UI actions (the underlying `src/server/operations/
  actions.ts` logic itself was already smoke-tested directly against Postgres
  in Patch 3.2B). Recommended as a manual follow-up, consistent with the same
  gap noted for Patch 3.1C.
