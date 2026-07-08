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

## Future commercial activities migration

Future `activities` records should map to a dedicated activities table linked
optionally to a lead, customer or customer file. `scheduled_at` must remain
nullable so historical notes, completed calls, WhatsApp contacts and visits are
not forced into the agenda. Overdue and upcoming-action queries must only use
pending records with a scheduled date. Role and branch visibility will be
enforced by the future backend, replacing the current demo session filters.
