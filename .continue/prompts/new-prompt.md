---
name: MotoMas Global Development Rule
description: Global rule
invokable: true
---

You are working on MotoMas, a commercial CRM/ERP-style platform for a motorcycle dealership/distributor.

Before making changes, always read and respect these files when they exist:

* PROJECT_RULES.md
* ARCHITECTURE.md
* ROLES.md
* FLOWS.md
* CHANGES.md
* DATABASE_PLAN.md
* PRISMA_PLAN.md
* PROJECT_AUDIT.md
* UI_REFERENCE.md
* prisma/schema.prisma

Project identity:

MotoMas is not a generic CRM, marketplace, e-commerce, or financial ERP. It is a commercial operations platform for motorcycle sales, leads, customers, branches, inventory, transfers, reservations, sales, deliveries, marketing, reports, documents, proformas, and manual credit follow-up.

Architecture rules:

* Keep Portal Cliente and Centro de Operaciones separated.
* Do not mix public customer routes with internal operations routes.
* Public routes live under the Portal Cliente experience.
* Internal operations live under `/panel`.
* Do not expose internal IDs, technical storage terms, seller assignment internals, or operational data to public customer pages.

Current persistence:

The active demo still uses localStorage. Do not migrate to PostgreSQL, Prisma, Supabase, backend APIs, authentication, webhooks, Meta API, or WhatsApp API unless explicitly requested.

Do not change storage keys unless the task explicitly requires it. Existing keys include:

* motomas-public-leads-v1
* motomas-demo-session-v1
* motomas-customers-v1
* motomas-customer-files-v1
* motomas-inventory-units-v1
* motomas-transfer-orders-v1
* motomas-reservations-v1
* motomas-sales-v1
* motomas-marketing-campaigns-v1
* motomas-activities-v1
* motomas-quotes-v1
* motomas-expedient-documents-v1
* motomas-credit-applications-v1

Roles:

* Cliente público only uses Portal Cliente.
* Vendedor works assigned leads, customers, expedientes, activities, proformas, documents, reservations, sales, deliveries and credit follow-up inside their own scope.
* Gerente supervises and operates within their branch.
* Administrador has global visibility and demo configuration/reset.
* Contabilidad, when added, must be treated as a separate role with accounting-specific permissions.
* Do not invent new permissions or change role visibility unless requested.

Business rules:

* Customers belong to MotoMas, not to individual sellers.
* A customer may have history across branches.
* Expediente is the commercial file.
* Proforma is a single commercial document inside the expediente.
* Documents are checklist/status only unless file upload is explicitly requested.
* Credit is currently one manual credit follow-up per expediente.
* Credit does not approve automatically.
* Credit does not create sales or reservations automatically.
* Reservation does not equal sale.
* Sale does not equal delivery until marked delivered.
* Inventory unit status must remain consistent with transfers, reservations, sales and deliveries.

Patch workflow:

* Work in small patches.
* Do not do global rewrites unless explicitly requested.
* Do not create new modules unless explicitly requested.
* Do not change existing behavior silently.
* Keep backward compatibility with demo data.
* Update CHANGES.md after each completed patch.
* Always run `npm.cmd run build` before declaring a patch finished.
* If build fails, fix only errors related to the patch.
* Report files changed, build result, and anything left pending.

UI language:

Visible UI text should be Spanish, clear and professional.

Use accents correctly:

* información
* teléfono
* cédula
* crédito
* créditos
* público
* catálogo
* próxima acción
* documentación
* tránsito
* configuración
* sesión
* operación

Do not show technical terms in the UI:

* localStorage
* payload
* JSON
* repository
* internal id
* vendedorAsignado

When unsure:

* Ask before changing architecture.
* Ask before changing persistence.
* Ask before touching multiple modules.
* Ask before removing existing functionality.
* Never invent business rules, prices, motorcycle specs, branches, sellers, financial rules, or tax behavior.