# Prisma and PostgreSQL Plan

## Recommendation

Prisma and PostgreSQL are recommended for the next persistence phase because
MotoMas requires relational integrity, multi-branch access control, unique unit
identities and atomic changes across inventory, transfers, reservations, sales
and deliveries. PostgreSQL provides transactions and constraints; Prisma gives
the Next.js application typed database access and repeatable migrations once a
backend phase is explicitly approved.

`prisma/schema.prisma` is a draft only. Prisma is not installed, no command is
run, no `.env` file exists and no connection or migration is created in this
patch.

## Local storage mapping

| Local key | Future tables | Notes |
| --- | --- | --- |
| `motomas-public-leads-v1` | `leads`, then `customers`, `customer_files` and `customer_interactions` when converted | Preserve request code and selected branch. |
| `motomas-customers-v1` | `customers`, `customer_interactions` | Normalize and deduplicate phone and cedula before insert. |
| `motomas-customer-files-v1` | `customer_files` | Map lead, customer, branch, seller and motorcycle model when available. |
| `motomas-inventory-units-v1` | `motorcycle_units`, `inventory_movements` | Preserve VIN, chassis, engine, current branch, status and full history. |
| `motomas-transfer-orders-v1` | `transfer_orders`, `transfer_order_items`, `activity_logs` | Existing demo orders contain one unit; the relational design permits multiple. |
| `motomas-reservations-v1` | `reservations`, `activity_logs` | Manual demo reservations without a customer need a reviewed customer mapping. |
| `motomas-sales-v1` | `sales`, `inventory_movements`, `activity_logs` | Preserve sale and delivery dates plus optional reservation/file links. |
| `motomas-quotes-v1` | `quotes`, `activity_logs` | One editable commercial proforma per customer file; it does not reserve, sell, approve credit or replace the expediente. |
| `motomas-expedient-documents-v1` | `customer_file_documents`, `activity_logs` | Checklist and validation state only; future attachments require storage metadata and a secure backend. |
| `motomas-credit-applications-v1` | `credit_applications`, `activity_logs` | One active manual credit follow-up per expediente; preserve editable lender, amounts, notes and dates. |
| `motomas-demo-session-v1` | No business table migration | Replace only after an approved authentication design. |

## Recommended migration order

1. Seed approved branches from the current branch catalog.
2. Seed internal demo users and their roles.
3. Import the real motorcycle catalog into `motorcycle_models`.
4. Import units and their inventory movement history.
5. Import leads with branch, source and assignment data.
6. Normalize and import customers, interactions and customer files.
7. Import one quote per customer file after its customer, lead and seller references are valid.
8. Import customer file document checklists after their customer file references are valid.
9. Import credit follow-ups after the customer file and optional quote references are valid.
10. Import transfer orders and their unit items.
11. Import reservations after customer and unit references are valid.
12. Import sales and delivery data last, validating every unit has only one sale.

## Future expedient document migration

Future `customer_file_documents` records should keep the document type, status,
notes, customer file, customer, lead, seller and branch references. This phase
does not attach files. A future secure storage phase may add `file_url`,
`file_name`, `mime_type` and `storage_provider`. The checklist prepares a
manual credit process but never approves a credit.

## Future manual credit follow-up migration

Future `credit_applications` records should keep a unique customer file
reference plus optional customer, lead and quote references for the current
one-active-follow-up rule. The table should store editable lender details,
financing type, manual status, optional requested amounts, document notes,
observations and request/resolution dates. A future approved multi-financial
workflow may remove the unique customer-file constraint and add status history.
An approved status remains commercial follow-up only: it does not create a bank
approval, reserve a motorcycle or complete a sale.

## Migration risks and controls

- Customer duplication: match normalized phone first, then normalized cedula;
  keep a local-to-database ID mapping and send ambiguous records to review.
- Manual reservations: resolve records that have a display name but no customer
  ID before writing the future required relation.
- Referential order: do not insert a transfer, reservation or sale before its
  referenced branch, user, customer and unit exist.
- Unit state mismatch: verify the final unit status against its latest movement,
  active reservation, transfer and sale before cutover.
- Partial imports: run imports in transactions or resumable batches with audit
  logs. Never delete browser data until import reports are reviewed.
- Authorization drift: role and branch scope must be enforced server-side, not
  only by the current UI filters.

## What must not happen yet

- Do not install Prisma or run `prisma init`, `prisma migrate` or `prisma db`.
- Do not create `.env`, `DATABASE_URL`, credentials, API routes or a database
  client.
- Do not replace local storage services or change Portal Cliente or panel UI.
- Do not auto-import browser records, connect Supabase or PostgreSQL, or remove
  the demo reset flow.

The next approved phase should choose hosting, authentication, credentials,
server authorization and an import rehearsal before any live database change.

## Future Meta Lead Ads integration

Future `marketing_campaigns` records should store channel, target branch,
target motorcycle model, budget, status and objective. Leads should retain
optional Meta identifiers and UTM attribution fields. The real integration
requires a public HTTPS backend, webhook verification, Lead Ads API access and
a real database; none of those connections or credentials are added here.

## Patch 3.0 update — Prisma is now installed (supersedes the draft-only notes)

As of Patch 3.0 the earlier "Prisma is not installed / do not run any command"
notes are superseded for the production-foundation entities:

- `prisma` and `@prisma/client` (v6) are installed and `prisma generate` was run
  (the client is generated).
- `prisma/schema.prisma` is now a real production schema for: `Branch`, `User`
  (with `password_hash` and a role enum ADMIN/GERENTE/VENDEDOR/CAJERO/CONTADOR),
  `MotorcycleCatalogModel`, `MotorcycleUnit`, `InventoryMovement`, `UserAuditLog`.
- `.env.example` documents `DATABASE_URL` and `SESSION_SECRET`. `.env` is NOT
  committed and was NOT created in the delivery environment.
- Migrations and seed were NOT run here because no PostgreSQL instance /
  `DATABASE_URL` is available. Run them on a machine with Postgres:

  ```txt
  npm run prisma:generate
  npm run prisma:migrate       # npx prisma migrate dev --name init
  npm run prisma:seed          # node prisma/seed.mjs
  ```

- Only the branches, users, motorcycle units and inventory movements are
  database-backed in this phase. All other CRM/accounting modules still use
  `localStorage` and follow the migration order above in later patches.
- Authorization is enforced server-side (session cookie + access helpers), not
  only by UI filters. Password hashing uses Node `scrypt`; sessions are signed
  with HMAC-SHA256 via Web Crypto.

## Patch 3.0.1A update — local PostgreSQL via Docker (development only)

A local development database was brought up with Docker for the Windows
delivery environment:

- Container: `motomas-postgres` (image `postgres:16`), persistent named volume
  `motomas-postgres-data`, database `motomas_db`, user `motomas`.
- **Port note:** the standard host port `5432` (and `5433`) could not be bound
  on this machine because Windows had a Hyper-V/WSL TCP port-exclusion range
  covering `5243-5942`. The container was published on host port **`15432`**
  instead (`-p 15432:5432`); PostgreSQL still listens on `5432` inside the
  container. If you hit the same `bind: ... no permitido por sus permisos de
  acceso` error on Windows, check
  `netsh interface ipv4 show excludedportrange protocol=tcp` and pick a host
  port outside the listed ranges.
- Local `.env` (`DATABASE_URL`, `SESSION_SECRET`) was generated for this
  container. These are **development-only** credentials, not committed, and
  must never be reused in production.
- Migrations and seed are still pending as of this note — only the container
  and `.env` were prepared. Run `npx prisma migrate dev --name init` then
  `npx prisma db seed` next.

## Patch 3.0.1B update — migration and seed executed and verified

Migrations and seed (marked pending above) have now been run against the local
`motomas-postgres` container:

- `npx prisma generate`: OK (Prisma Client v6.19.3).
- No `prisma/migrations` directory existed, so `npx prisma migrate dev --name
  init` was run. It created and applied `prisma/migrations/20260708165039_init`.
  `npx prisma migrate status` confirms the schema is up to date. No existing
  data was destroyed (the database was empty before this migration).
- `npx prisma db seed` was run twice in a row. Both runs completed without
  error and produced identical record counts, confirming the seed's `upsert`
  (branches, users, catalog models) and `findUnique`-before-`create` (units)
  logic is idempotent:
  - 3 branches, 5 users (one ADMIN, one GERENTE, one VENDEDOR, one CAJERO, one
    CONTADOR — all `isActive: true`), 3 motorcycle catalog models, 3
    motorcycle units (`AVAILABLE`), 3 `INGRESO` inventory movements.
- Verification used a temporary script (`prisma/_verify-seed.mjs`) that queried
  counts via Prisma Client; it was deleted immediately after confirming the
  numbers above, per the no-permanent-scaffolding rule for this phase.
- The development-only credentials from Patch 3.0.1A remain unchanged and are
  not reprinted here. The documented seed password is for local development
  only (see ROLES.md / `prisma/seed.mjs`) and must never be used in production.
- Not yet done: authentication smoke test and UI verification (explicitly out
  of scope for this pass).

## Future commercial activities migration

Future `activities` records should map to a dedicated activities table linked
optionally to a lead, customer or customer file. `scheduled_at` must remain
nullable so historical notes, completed calls, WhatsApp contacts and visits are
not forced into the agenda. Overdue and upcoming-action queries must only use
pending records with a scheduled date. Role and branch visibility will be
enforced by the future backend, replacing the current demo session filters.

## Patch 3.0.2B update - branch seed behavior

The branch seed now uses the user-provided real MotoMas branch names from
`Sucursales Motomas.txt`. Codes are generated only because the Prisma `Branch`
schema requires a unique `code`: lowercase, accents removed, spaces converted to
hyphens and unsafe characters removed.

The branch upsert updates only `name` and `isActive`; it does not write address,
phone, manager, hours, region or coordinates. Existing demo/legacy branch rows
are not deleted by the seed. Existing seeded users are not reassigned because
the user upsert no longer overwrites `branchId`; fresh databases create the demo
users against real branch codes.

## Patch 3.0.3B update - production seed cleanup

The seed no longer creates development users or fake physical motorcycle units.
It now has these production-safe boundaries:

- Real branches from `Sucursales Motomas.txt` are preserved and upserted by
  code.
- Motorcycle catalog model rows are preserved, including the asset-derived
  public catalog entries.
- `MotorcycleUnit` and `InventoryMovement` rows are not created by seed unless
  a future patch receives real physical inventory data.
- One bootstrap Admin is created only from `MOTOMAS_ADMIN_NAME`,
  `MOTOMAS_ADMIN_EMAIL` and `MOTOMAS_ADMIN_PASSWORD`.
- Missing bootstrap Admin variables produce a seed warning instead of silently
  creating demo accounts.
- Old demo rows are not deleted automatically; cleanup must be reviewed and run
  manually because existing rows may be referenced.

Development fallback users remain application-only, outside production, and are
disabled when `NODE_ENV=production`. LocalStorage demo records are gated by
`NEXT_PUBLIC_MOTOMAS_ENABLE_DEMO_DATA` and default to empty production initial
state.

## Patch 3.1A update - CRM core Prisma models added and migrated

The CRM core entities were added to `prisma/schema.prisma` and migrated:

- Models: `Customer`, `Lead`, `CustomerFile` (Expediente) and `Activity`
  (tables `customers`, `leads`, `customer_files`, `activities`).
- Enums: `LeadStatus` (NUEVO_LEAD, ASIGNADO, CONTACTADO, INTERESADO,
  EXPEDIENTE, DESCARTADO), `CustomerFileStatus` (ABIERTO, EN_PROCESO,
  COMPLETADO, CANCELADO), `ActivityType`, `ActivityStatus`, `ActivityPriority`.
  These mirror the current localStorage statuses so migrated records keep their
  meaning.
- Relations: every model carries a `branchId` for branch scope. `Lead` has
  optional `assignedSellerId` and `createdById` user relations plus an optional
  `customerId` for conversion; `CustomerFile` has required `customerId` and
  `branchId` and optional `leadId` / `sellerId`; `Activity` links optionally to
  lead, customer and customer file. All user relations are optional with
  `ON DELETE SET NULL`.
- `Lead.trackingCode` is the unique public tracking code (maps
  `motomas-public-leads-v1` request codes); `CustomerFile.fileNumber` is unique.
- Timestamps (`created_at` / `updated_at`) on all four models.
- `npx prisma generate` passed. `npx prisma migrate dev --name crm_core`
  created and applied `20260708183522_crm_core` against the local
  `motomas-postgres` container. The migration only creates the four new tables
  and their foreign keys; it does not drop or alter existing tables, and the
  database was not reset.

Still on localStorage and pending later patches (per the migration order
above): quotes, expedient documents, credit follow-ups, reservations,
transfers, sales, marketing, Caja and Contabilidad. Customer (a person) and
MotorcycleUnit (a physical unit) remain intentionally separate.

## Patch 3.2A update - operations core Prisma models added and migrated

The operations core entities were added to `prisma/schema.prisma` and migrated
(schema-only; no server actions or UI yet):

- Models: `Reservation`, `Sale`, `TransferOrder` (tables `reservations`,
  `sales`, `transfer_orders`). Delivery is modeled on `Sale`
  (`SaleStatus.ENTREGADA` + `deliveredAt`), not a separate table.
- Enums: `ReservationStatus`, `SaleType`, `SaleStatus`, `TransferStatus` -
  values mirror the current localStorage statuses so future imports keep their
  meaning.
- Relations: reservations/sales link `Customer`, optional `CustomerFile`,
  `MotorcycleUnit`, `Branch` and seller; sales also link an optional
  `Reservation`. Transfers link `MotorcycleUnit`, origin/destination `Branch`
  and the requested/approved/dispatched/received/cancelled users. Back-relations
  were added to `Branch`, `User`, `MotorcycleUnit`, `Customer`, `CustomerFile`.
- Constraints: `Sale.motorcycleUnitId` and `Sale.reservationId` are unique
  (no double-sale, one sale per reservation). "One active reservation per unit"
  and "sold/delivered/exited units cannot be reserved" are deferred to the
  service layer in a later patch.
- `npx prisma generate` passed. `npx prisma migrate dev --name operations_core`
  created and applied `20260708193916_operations_core` against the local
  `motomas-postgres` container. The migration only creates the three new tables
  and four enums with their foreign keys; it does not drop or alter existing
  tables, and the database was not reset.

Still on localStorage and pending later patches: quotes, expedient documents,
credit follow-ups, marketing, Caja and Contabilidad, plus the public portal
lookups. Customer (a person) and MotorcycleUnit (a physical unit) remain
intentionally separate.

## Patch 3.3A update - expediente support Prisma models added and migrated

The expediente support entities were added to `prisma/schema.prisma` and
migrated (schema-only; no server actions or UI yet):

- Models: `Quote`, `ExpedienteDocument`, `CreditApplication` (tables `quotes`,
  `expediente_documents`, `credit_applications`).
- Enums: `QuoteStatus`, `ExpedienteDocumentType`, `ExpedienteDocumentStatus`,
  `CreditStatus`.
- Relations center on `CustomerFile`. `Quote` and `CreditApplication` are 1:1
  with the expediente (`customer_file_id` unique); `ExpedienteDocument` is 1:N.
  Optional `customer`, required `branch`, and optional `createdBy`/`reviewedBy`
  user relations. Back-relations added to `Branch`, `User`, `Customer`,
  `CustomerFile`.
- The Patch 3.1A `Activity` model was reused for follow-ups; no duplicate
  activity model was created.
- No uploads, PDF or bank integration. Quotes reference the motorcycle as text
  only; no relation to `MotorcycleUnit`. Money fields are commercial figures,
  not inventory costs.
- `npx prisma generate` passed. `npx prisma migrate dev --name
  expediente_support` created and applied `20260708202124_expediente_support`
  against the local `motomas-postgres` container. The migration only creates the
  three new tables and four enums with their foreign keys; it does not drop or
  alter existing tables, and the database was not reset.

Still on localStorage and pending later patches: marketing, Caja and
Contabilidad, plus the public portal lookups. Customer (a person) and
MotorcycleUnit (a physical unit) remain intentionally separate.

## Patch FF1.0 update - financial foundation models

Three additive models were added to `prisma/schema.prisma`: `DocumentSequence`,
`AccountMappingSet` and `AccountMappingRule`, plus the enums
`FinancialDocumentSeries`, `AccountMappingSetStatus`, `AccountingEventType` and
`AccountingEventComponent`. Back-relations were added to `Branch`, `User` and
`ChartAccount`; no existing model, column, index or constraint was altered.

Two schema decisions worth preserving:

- **Non-null branch key.** `DocumentSequence.branchKey` and
  `AccountMappingSet.branchKey` mirror a nullable `branchId` with a corporate
  sentinel, because a unique key containing a nullable column does not prevent
  duplicates in PostgreSQL (NULLs never collide).
- **Nullable unique instead of a partial index.** "At most one ACTIVO mapping
  set per branch scope" is enforced by `AccountMappingSet.activeBranchKey`,
  which is unique and only carries a value while the set is active. A partial
  unique index (`... WHERE status = 'ACTIVO'`) would express the same rule but
  cannot be declared in the Prisma schema: it would live only in the migration
  SQL and every later `prisma migrate dev` would report it as drift and try to
  drop it.

Commands run in this patch: `npx prisma validate` (valid), `npx prisma format`,
`npx prisma generate` (client v6.19.3) and `npx prisma migrate diff` to produce
`prisma/migrations/20260801120000_financial_foundation/migration.sql`.

`prisma migrate dev` was NOT run and the migration was NOT applied: no
PostgreSQL instance was reachable in the delivery environment (the local
`motomas-postgres` container was not running). Apply it with
`npx prisma migrate deploy` and confirm with `npx prisma migrate status` on a
machine that has the database.

## Patch FF1.1-A update - chart of accounts foundation

`ChartAccount` was extended in place — no second model, no parallel catalogue.
New scalar fields: `level`, `allowsPosting`, `origin`, `templateVersion`,
`approvedAt`, `approvedByUserId`, `requiresCostCenter`, `allowsBranchDetail`,
`effectiveFrom`, `effectiveTo`, `archivedAt`, `archivedByUserId`. New enum
`ChartAccountOrigin`. New relations `ChartAccountApprovedBy` and
`ChartAccountArchivedBy` on `User`, plus the indexes `[origin, isActive]` and
`[level, code]`.

Three schema decisions worth preserving:

- **`archivedAt` instead of a status enum.** A three-state enum would have
  duplicated what `isActive` already carries and forced every existing guard to
  read two columns to decide the same thing. Archiving implies
  `isActive = false`, so every previous check keeps rejecting an archived
  account without being modified.
- **Materialized `level`.** The depth is stored and maintained by the service on
  create and on move, so rendering the catalogue never walks the tree. A move
  re-levels the subtree inside the same transaction.
- **Tree FK `RESTRICT` instead of `SET NULL`.** Accounts are never deleted; if
  one ever were, `SET NULL` would silently promote its subtree to the root.
  This is the only non-additive statement in the migration.

Commands run in this patch: `npx prisma validate` (valid), `npx prisma format`,
`npx prisma generate` (client v6.19.3) and `npx prisma migrate diff --from-empty`
to verify the hand-written migration against the target datamodel.

`prisma migrate dev` was NOT run and the migration was NOT applied: no
PostgreSQL instance was reachable in the delivery environment. Apply it with
`npx prisma migrate deploy`, confirm with `npx prisma migrate status`, and seed
the reference catalogue with `npm run prisma:seed:cuentas`.
