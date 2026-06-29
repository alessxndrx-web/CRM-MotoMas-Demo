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
