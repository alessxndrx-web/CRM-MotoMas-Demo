# MotoMas Database Plan

## Purpose

MotoMas needs one centralized relational database because customers, units,
transfers, sales and their history belong to the company, not to one browser,
seller or branch. The future database will replace the current browser-only demo
persistence when an approved backend implementation starts.

This document is a technical plan only. The active persistence in this patch is
still `localStorage`; no database, API route, credentials, ORM or external
service is added here.

## Main entities and relationships

- `roles` 1:N `user_roles` N:1 `users`. A user can receive one or more roles
  without using a customer role in the internal operations session.
- `branches` 1:N `users`, `leads`, `customer_files`, `motorcycle_units`,
  `reservations` and `sales`.
- `leads` has an optional assigned user and may create one or more customer
  interactions. Its conversion references a single `customers` record.
- `customers` 1:N `customer_files`, `reservations`, `sales` and
  `customer_interactions`. Phone and cedula are normalized before matching to
  prevent duplicates.
- `customer_files` 1:1 `quotes`. A quote is the editable commercial proforma
  for one expediente; it does not reserve a unit, complete a sale, approve
  credit or replace the expediente.
- `customer_files` 1:N `customer_file_documents`. The current checklist stores
  document metadata and validation status only; future attachment fields remain
  out of scope until a secure storage phase is approved.
- `customer_files` 1:1 `credit_applications`. The current manual credit
  follow-up can reference a customer, lead and optional quote, but does not
  reserve a unit, approve financing automatically or create a sale. A future
  design may replace this relation with 1:N only after the multi-financial
  workflow is explicitly approved.
- `motorcycle_models` 1:N `motorcycle_units`; each unit has one current branch
  and many `inventory_movements`.
- `transfer_orders` references an origin branch, destination branch and users
  involved in each transition. `transfer_order_items` allows the future model
  to move one or more units per order.
- `reservations` relates a customer or customer file to one motorcycle unit.
- `sales` relates a customer, unit, branch, responsible user and optional
  reservation or customer file.
- `activity_logs` records business actions independently from the current
  presentation layer.

## Recommended tables

| Table | Purpose and main foreign keys |
| --- | --- |
| `roles` | Role catalog: Vendedor, Gerente and Administrador. |
| `users` | Internal users; optional primary `branch_id`. |
| `user_roles` | User-to-role mapping for future granular permissions. |
| `branches` | Operational branch catalog. |
| `leads` | Desired branch, motorcycle model, source, status and optional `assigned_user_id`. |
| `customers` | Corporate customer master record with normalized phone and cedula. |
| `customer_interactions` | Customer history with `customer_id`, `branch_id` and optional `user_id`. |
| `customer_files` | Expedientes with `customer_id`, `lead_id`, `branch_id`, `user_id` and motorcycle model. |
| `quotes` | One commercial proforma per expediente with optional model, reference price, payment values, status and dates. It is not legal invoicing. |
| `customer_file_documents` | Checklist document metadata with customer file, customer, lead, branch, seller, validation status and notes. No attachment is stored in this phase. |
| `credit_applications` | One active manual credit follow-up per expediente with editable lender, status, requested amounts, document notes and decision dates. |
| `motorcycle_models` | Public catalog model data shared with operational references. |
| `motorcycle_units` | Individual units with VIN, chassis, engine, current branch and status. |
| `inventory_movements` | Immutable unit traceability with origin, destination and business reference. |
| `transfer_orders` | Transfer header with origin/destination branches and status dates. |
| `transfer_order_items` | Transfered units; one row per unit in an order. |
| `reservations` | Unit reservation with customer, optional customer file and responsible user. |
| `sales` | Completed or delivered sale with optional reservation and customer file. |
| `activity_logs` | Cross-module audit log: actor, branch, entity, action and timestamp. |

Recommended constraints include a unique VIN, chassis and engine per unit, a
unique active reservation per unit, a unique sale per unit, and normalized
customer identity indexes for phone and cedula when present.

## Modules that require persistence

| Current module | Current local key | Future repository |
| --- | --- | --- |
| Public requests and leads | `motomas-public-leads-v1` | `LeadRepository` |
| Customers | `motomas-customers-v1` | `CustomerRepository` |
| Customer files | `motomas-customer-files-v1` | `CustomerFileRepository` |
| Unit inventory | `motomas-inventory-units-v1` | `InventoryRepository` |
| Transfers | `motomas-transfer-orders-v1` | `TransferRepository` |
| Reservations | `motomas-reservations-v1` | `ReservationRepository` |
| Sales and deliveries | `motomas-sales-v1` | `SalesRepository` |
| Commercial proformas | `motomas-quotes-v1` | `QuoteRepository` |
| Expedient documents | `motomas-expedient-documents-v1` | `CustomerFileDocumentRepository` |
| Manual credit follow-up | `motomas-credit-applications-v1` | `CreditApplicationRepository` |
| Demo session | `motomas-demo-session-v1` | Authentication/session service, not a business repository |

## Gradual migration plan

1. Keep the existing local storage services as the active adapters. The shared
   keys and repository contracts in this patch make their data boundaries
   explicit without changing their behavior.
2. Approve the database provider, authentication method, security model and
   environment variables in a separate phase. No provider is selected here.
3. Create the relational schema and server-side repositories that implement the
   contracts in `src/shared/persistence/repository-types.ts`.
4. Write an idempotent import tool that reads each listed local key, validates
   records, normalizes customer phone/cedula values and preserves IDs or stores
   a local-to-database mapping. It must never run automatically in production.
5. Migrate in dependency order: branches/users/roles, motorcycle models/units,
   customers/leads/files, reservations/transfers, then sales and activity logs.
6. Move business transitions such as reserve, transfer, sell and deliver into
   database transactions. This guarantees that unit state and history change
   atomically.
7. Switch one module at a time behind an approved server API, verify parity
   with demo data and retain an export/rollback procedure before retiring the
   local adapter.

## Scope boundary

This plan does not create a backend, API routes, tables, migrations, Prisma,
Supabase, PostgreSQL connections or credentials. The Portal Cliente and Centro
de Operaciones continue to use the existing browser demo data unchanged.

## Patch 3.0 update — first database-backed slice

Patch 3.0 begins the migration. The following are now database-backed through
Prisma/PostgreSQL when `DATABASE_URL` is configured:

- `branches` (Branch), `users` (User with password hash + role enum), the
  motorcycle catalog (`motorcycle_catalog_models`), `motorcycle_units` and
  `inventory_movements`, plus a `user_audit_logs` table.

Still on `localStorage` (to be migrated later, in the dependency order above):
leads, customers, customer files, quotes, documents, credit follow-ups,
reservations, transfers, sales, activities, marketing, and the Caja/Contabilidad
demo data. The commercial inventory consultation at `/panel/inventario` also
remains on `localStorage`; the new database inventory lives at
`/panel/inventario/movimientos`.

Authentication replaces the demo session for route protection: `/panel/*`
requires a signed session cookie (see ARCHITECTURE.md §15). Migrations and seed
are run with `npm run prisma:migrate` and `npm run prisma:seed` on an
environment that has a reachable PostgreSQL instance.

## Patch 3.0.1B update — migration and seed executed against a real database

The first migration and seed have been run and verified against a local
PostgreSQL 16 instance (Docker, development only — see PRISMA_PLAN.md for
container details):

- Migration `20260708165039_init` applied; `prisma migrate status` reports the
  schema up to date.
- Seed executed twice to verify idempotency: identical record counts after
  both runs — 3 branches, 5 users (one per role: ADMIN, GERENTE, VENDEDOR,
  CAJERO, CONTADOR), 3 catalog models, 3 motorcycle units (all `AVAILABLE`),
  3 `INGRESO` inventory movements. No duplicates were created.
- Verification was done with a temporary Prisma Client script that was deleted
  immediately after use; no permanent test scaffolding was added.
- Still pending: authentication smoke test (login, session cookie, role
  redirects) and UI verification. Only the database layer was validated in
  this pass.

## Patch 3.0.3B update - production seed cleanup

The Prisma seed is now split away from demo production data:

- It preserves real branch names from the user-provided TXT and upserts them by
  generated stable code.
- It preserves motorcycle catalog model seed rows, including the
  user-provided asset-derived catalog entries.
- It no longer creates fake physical `motorcycle_units` or seed
  `inventory_movements`.
- It no longer silently creates the five development users in a production
  database.
- It creates one bootstrap Admin only when `MOTOMAS_ADMIN_NAME`,
  `MOTOMAS_ADMIN_EMAIL` and `MOTOMAS_ADMIN_PASSWORD` are provided.
- Existing demo users or demo units from earlier seeds are not deleted by the
  seed; they require reviewed manual cleanup if present.

Customers, leads, customer files, reservations, transfers, sales, activities,
Caja and Contabilidad remain pending for future database migration. This patch
does not add or migrate those tables.

## Patch 3.1A update - CRM core is now database-backed

The CRM core slice (customers, leads, expedientes) is now database-backed
through Prisma/PostgreSQL:

- `customers` (Customer): person master record with normalized phone/cedula
  columns for future deduplication, an origin `branch_id`, optional email and
  timestamps.
- `leads` (Lead): unique public `tracking_code`, desired `branch_id`, origin
  channel, `LeadStatus` enum, optional `assigned_seller_id` and `created_by_id`
  user relations, and an optional `customer_id` for the lead -> customer
  conversion.
- `customer_files` (CustomerFile / Expediente): unique `file_number`, required
  `customer_id` and `branch_id`, optional `lead_id` and `seller_id`,
  `CustomerFileStatus` enum and notes.
- `activities` (Activity): optional links to lead, customer and customer file,
  a `branch_id`, optional `user_id`, `ActivityType` / `ActivityStatus` /
  `ActivityPriority` enums and a nullable `scheduled_at` (historical notes are
  not forced into the agenda), per the future activities note above.

All four tables are branch-scoped and carry `created_at` / `updated_at`.
Customer and MotorcycleUnit remain separate entities with no relation between
them. Reservations, transfers, sales, quotes, documents, credit follow-ups,
Caja and Contabilidad are still on localStorage and remain pending. Migration
`20260708183522_crm_core` was applied without resetting the database or
removing existing models.

## Patch 3.2A update - operations core is now database-backed (schema)

The operations slice (reservations, sales, transfers) now has database-backed
Prisma models (schema + migration only; UI not connected yet):

- `reservations` (Reservation): `Customer` + optional `CustomerFile` +
  `MotorcycleUnit` + `Branch` + seller (`User`); `ReservationStatus` enum;
  `reservedAt` / `cancelledAt` / `completedAt`.
- `sales` (Sale): `Customer` + optional `CustomerFile` + optional `Reservation`
  + `MotorcycleUnit` + `Branch` + seller (`User`); `SaleType` + `SaleStatus`
  enums; `soldAt` / `deliveredAt`. Delivery lives on the sale row
  (`ENTREGADA` + `deliveredAt`), matching the current flow. `motorcycle_unit_id`
  and `reservation_id` are unique to prevent double-sale / duplicate sale.
- `transfer_orders` (TransferOrder): `MotorcycleUnit` + origin/destination
  `Branch` + requested/approved/dispatched/received/cancelled users;
  `TransferStatus` enum with the requested→approved→in-transit→received→
  cancelled lifecycle. One unit per order (multi-unit `transfer_order_items`
  remains a documented future option).

Recommended constraints partially realized: unique sale per unit and unique
sale per reservation are enforced in the schema; the unique *active* reservation
per unit is deferred to the service layer (a plain unique would block historical
cancelled reservations). Customer and MotorcycleUnit remain separate; no cost
fields are stored. Caja, Contabilidad and the public portal remain on
localStorage. Migration `20260708193916_operations_core` was applied without
resetting the database or removing existing models.

## Patch 3.3A update - expediente support is now database-backed (schema)

The expediente support slice (proformas, document checklist, manual credit
follow-up) now has database-backed Prisma models (schema + migration only; UI
not connected, no server actions):

- `quotes` (Quote): one proforma per expediente (`customer_file_id` unique),
  optional customer, `branch_id`, optional `created_by_user_id`, quoted
  `motorcycle_model` text, optional price/down_payment/term_months/
  estimated_payment/currency/notes, `QuoteStatus` enum.
- `expediente_documents` (ExpedienteDocument): checklist rows per expediente
  (`customer_file_id`, not unique), `branch_id`, `ExpedienteDocumentType`,
  `ExpedienteDocumentStatus`, optional notes and `reviewed_by_user_id` /
  `reviewed_at`. Status only — no file upload in this phase.
- `credit_applications` (CreditApplication): one active manual follow-up per
  expediente (`customer_file_id` unique), optional customer, `branch_id`,
  optional `created_by_user_id`, optional financial_institution/credit_type/
  amount/down_payment/term_months/estimated_payment/currency/pending_items/
  observations, `CreditStatus` enum. Manual only — no bank integration.

The Patch 3.1A `Activity` table already covers expediente follow-ups and was
reused (not duplicated). Quotes store the motorcycle as text and none of these
tables relate to `motorcycle_units`, preserving Customer/inventory separation.
Money fields are commercial figures, not inventory costs. Caja, Contabilidad
and the public portal remain on localStorage. Migration
`20260708202124_expediente_support` was applied without resetting the database
or removing existing models.

## Patch FF1.0 update - financial foundation tables

> Scope note for readers of the earlier sections: statements above that place
> Caja and Contabilidad "still on localStorage" describe the plan as it stood
> before Patches 3.4A/3.5A. Both modules are database-backed today. Marketing
> and the internal support desk were migrated afterwards as well. The remaining
> localStorage dependencies are the legacy panels inventoried in
> `docs/LOCALSTORAGE_AUDIT.md`, hidden whenever a database is configured.

Patch FF1.0 adds three infrastructure tables. They are additive, hold no money
and take part in no existing workflow:

- `document_sequences` (`DocumentSequence`): one concurrency-safe counter per
  numbering series, branch scope and fiscal year. `branch_key` is a non-null
  mirror of `branch_id` (corporate sentinel when the series is not
  branch-scoped) because PostgreSQL treats NULLs as distinct inside a unique
  key, which would otherwise permit duplicate corporate counters. Unique on
  `(series, branch_key, fiscal_year)`.
- `account_mapping_sets` (`AccountMappingSet`): versioned rule sets with the
  lifecycle BORRADOR -> ACTIVO -> ARCHIVADO. Unique on `(code, version)`.
  `active_branch_key` is unique and carries the branch scope only while the set
  is ACTIVO, which guarantees at most one active set per branch scope at the
  database level without a partial index Prisma cannot express.
- `account_mapping_rules` (`AccountMappingRule`): one event component mapped to
  a required debit account and a required credit account, both `RESTRICT` on
  delete. Unique on `(set_id, event, component)`.

New enums: `FinancialDocumentSeries`, `AccountMappingSetStatus`,
`AccountingEventType`, `AccountingEventComponent`.

Migration `20260801120000_financial_foundation` was generated with
`prisma migrate diff` between the previous and the new datamodel. It contains
only `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX` and `ADD CONSTRAINT`; there
is no destructive statement and no data migration. **It has not been applied to
a database** — no PostgreSQL instance was reachable in the delivery environment.
Run `npx prisma migrate deploy` and `npx prisma migrate status` where the
database is available.

Existing document numbers are NOT migrated. A numbering series only numbers
documents created after it is wired into a create action, which happens in a
later patch, never retroactively.

Still pending for the financial core, in order: Caja cash movements and closing
math (FF1.1), post-issue collections and payment reversal (FF1.2), the
idempotent Caja to Contabilidad handoff (FF1.3), the document to journal posting
engine (FF1.4), ledger-derived reports (FF1.5) and concurrency hardening plus
legacy panel retirement (FF1.6). The chart of accounts is still unseeded, which
blocks FF1.4.

## Patch FF1.1-A update - chart of accounts foundation

`chart_accounts` gained twelve additive columns and one new enum
(`ChartAccountOrigin`): `level`, `allows_posting`, `origin`, `template_version`,
`approved_at`, `approved_by_user_id`, `requires_cost_center`,
`allows_branch_detail`, `effective_from`, `effective_to`, `archived_at` and
`archived_by_user_id`, plus two indexes (`origin, is_active` and `level, code`)
and two user foreign keys.

Migration `20260802120000_chart_of_accounts_foundation` was hand-written and
contrasted against `prisma migrate diff --from-empty` to confirm that column
names, types, defaults, index names and foreign-key actions match the target
schema exactly. It contains two backfills, needed because the new columns
describe facts the previous schema could not store on a populated catalogue:

- a recursive CTE that materializes each account's depth from `parent_id`;
- `allows_posting = false` for every account that already has children.

One statement is not additive: the tree foreign key
(`chart_accounts_parent_id_fkey`) moves from `ON DELETE SET NULL` to
`ON DELETE RESTRICT`. With `SET NULL`, deleting an account would have promoted
its whole subtree to the root without error. The statement rewrites a
constraint; it touches no data and deletes nothing.

**It has not been applied to a database** — the development PostgreSQL instance
was unreachable in the delivery environment (`localhost:15432`). Run
`npx prisma migrate deploy`, `npx prisma migrate status` and then
`npm run prisma:seed:cuentas` where the database is available.

Accounts are never physically deleted. The database enforces it from three
sides: the tree FK, the journal-line FK and both account-mapping FKs are all
`RESTRICT`. Retiring an account is `is_active = false` (reversible) or
`archived_at` (permanent), never a `DELETE`.

The chart of accounts is no longer unseeded: `npm run prisma:seed:cuentas`
loads a 239-account **template** catalogue with `origin = PLANTILLA` and no
approval. FF1.4 still waits for the company accountant to approve it and for the
account-mapping content to be decided. Details in
[docs/CHART_OF_ACCOUNTS.md](docs/CHART_OF_ACCOUNTS.md).
