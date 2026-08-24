# Finance Stabilization Plan (updated through Patch FF1.1-B)

Living stabilization plan. Patch 4.0S-B implements the audit and immutability
foundation; Patch 4.0S-C1 adds the accounting period lock and active-account
enforcement; Patch 4.0S-C2 adds the journal reversal engine; Patch FF1.0 adds
the shared financial infrastructure the remaining patches consume; Patch FF1.1-A
adds the chart-of-accounts foundation and its template catalogue. The go-live
verdict remains unchanged: NOT production-ready.

## Patch numbering note

Patches 4.0S-D through 4.0S-K below are now delivered under the **FF** naming
used by the financial-core plan, with the same content and the same order:

| Plan original | Nombre vigente | Contenido |
|---|---|---|
| — | **FF1.0 (COMPLETE)** | Helper transaccional, numeración secuencial, mapeo contable |
| — | **FF1.1-A (COMPLETE)** | Fundación del catálogo de cuentas y plantilla de referencia |
| 4.0S-D | FF1.1-B (ARITMÉTICA COMPLETA) | Aritmética de cierre corregida; movimientos de efectivo pendientes |
| 4.0S-E | FF1.2 | Cobros post-emisión y reversión de pagos |
| 4.0S-F | FF1.3 | Traspaso Caja → Contabilidad idempotente |
| 4.0S-G | FF1.4 | Motor documento → asiento |
| 4.0S-I + reportes | FF1.5 | Reportes derivados del libro y cierres calculados |
| 4.0S-J + 4.0S-K | FF1.6 | Endurecimiento de concurrencia y retiro del plano heredado |

> **FF1.1 se dividió.** El plan tenía numerado como FF1.1 el trabajo de caja
> (movimientos de efectivo y aritmética de cierre). El catálogo de cuentas se
> priorizó por delante porque era el **bloqueo declarado de FF1.4** y depende de
> una decisión externa (la aprobación del contador de la empresa) que conviene
> iniciar cuanto antes. Se dividió en FF1.1-A (catálogo, entregado) y FF1.1-B
> (caja, pendiente) en lugar de renumerar toda la serie, para no invalidar las
> decenas de referencias a FF1.2–FF1.6 que ya existen en la documentación.

## Patch FF1.1-B progress

- COMPLETE: la aritmética del arqueo. `difference` dejó de compararse contra
  la facturación y pasa a compararse contra los cobros realmente registrados
  en los documentos EMITIDO del turno, por forma de pago.
- COMPLETE: una sola fórmula. `calculateCashClosingTotals` sustituye las tres
  copias que existían (preparar cierre, cerrar turno y vista previa del panel),
  y `collectCashClosingInputs` es el único lugar que lee lo esperado.
- COMPLETE: el esperado por método se **almacena** en `CashClosing` (migración
  aditiva `20260803120000_cash_closing_expected_totals`), de modo que un pago
  corregido después no reescribe una diferencia ya revisada.
- COMPLETE: totales de sesión y de tablero corregidos. Los borradores dejaron
  de sumar y los pagos de documentos anulados dejaron de contarse como
  cobrados; el saldo compara ahora el mismo universo en ambos lados.
- COMPLETE: auditoría ampliada, no reducida. El evento del cierre incluye los
  cinco campos de esperado.
- NOT DONE ON PURPOSE: `openingBalance` en `CashSession` y el modelo
  `CashMovement` (salidas, gastos menores, depósitos, retiros). Son
  capacidades de negocio nuevas, no correcciones de cálculo; sin ellas el
  efectivo esperado es únicamente lo cobrado y un fondo de cambio contado al
  cierre aparece como sobrante.
- NOT DONE ON PURPOSE: aceptación explícita de faltante/sobrante en la revisión
  y la ruta de anulación/reapertura del cierre
  (`CashClosingStatus.ANULADO` sigue siendo inalcanzable).
- NOT VERIFIED YET: la migración no se aplicó y `SMOKE-FF1.1-B` está pendiente
  — no había PostgreSQL alcanzable en la máquina de entrega.

## Patch FF1.1-A progress

- COMPLETE: `ChartAccount` extendido con nivel materializado, cuenta de
  agrupación, procedencia plantilla/empresa, aprobación, vigencia y archivado.
  Migración aditiva salvo el cambio de la FK del árbol a `RESTRICT`.
- COMPLETE: servicio `src/server/finance/chart-of-accounts` con el ciclo de vida
  autorizado, transaccional y auditado. Las acciones de Contabilidad delegan en
  él; no se creó ninguna implementación paralela.
- COMPLETE: una sola regla de elegibilidad
  (`describeChartAccountPostingBlock`) sustituye las tres comprobaciones
  divergentes de `isActive` en líneas de asiento, contabilización y mapeo, y
  agrega archivado, agrupación, ventana de vigencia y aprobación de plantilla.
- COMPLETE: plantilla de 239 cuentas para concesionario de motocicletas,
  repuestos y taller, sembrada como PLANTILLA y **sin aprobar**, con script
  idempotente que nunca borra ni revierte una decisión del contador.
- NOT DONE ON PURPOSE: ningún asiento, mapeo automático, impuesto, centro de
  costo, reporte por sucursal, POS ni facturación.
- NOT VERIFIED YET: la migración y la siembra NO se aplicaron — no había
  PostgreSQL alcanzable en la máquina de entrega. `SMOKE-FF1.1` pendiente
  (15 casos en `docs/CHART_OF_ACCOUNTS.md` §12).
- BLOCKER RESOLVED (parcialmente): la base ya puede tener cuentas. Lo que sigue
  bloqueando FF1.4 es la **aprobación del catálogo por el contador** y el
  contenido del mapeo contable, ambas decisiones de negocio.

## Patch FF1.0 progress

- COMPLETE: `runFinancialTransaction` centralizes database gating, the Prisma
  transaction, atomic audit writing, error translation and post-commit
  revalidation. A rejected rule (`ctx.fail` / `ctx.ensure`) now aborts the
  transaction instead of returning a failure over committed writes.
- COMPLETE: `DocumentSequence` + numbering service. One counter per series,
  branch scope and fiscal year; allocation is a single atomic increment inside
  the caller's transaction; an unconfigured or inactive series fails closed
  instead of falling back to a random number; the counter can never be rewound
  by a caller.
- COMPLETE: `AccountMappingSet` / `AccountMappingRule` + versioned lifecycle,
  validation and the `resolveAccountMapping` read the posting engine will use.
  Every rule carries a required debit and credit account that must differ, so an
  entry built from a validated set is balanced by construction. At most one
  ACTIVO set per branch scope is a database guarantee (`activeBranchKey` unique).
- COMPLETE: audit allowlist extended (`DOCUMENT_SEQUENCE_*`,
  `ACCOUNT_MAPPING_*`) and named access predicates added that grant no role
  anything it did not already have.
- NOT DONE ON PURPOSE: no posting engine, no Caja/Contabilidad integration, no
  change to any existing action, route, permission or screen, and no existing
  document number migrated.
- NOT VERIFIED YET: migration `20260801120000_financial_foundation` is additive
  and validated (`prisma validate`, `tsc`, `eslint`, `next build`) but was NOT
  applied — no PostgreSQL instance was reachable in the delivery environment.
  `SMOKE-FF1.0` against a real database is pending (see FINANCIAL_FOUNDATION.md
  §10).
- BLOCKER CARRIED FORWARD: the chart of accounts is still unseeded. FF1.4 cannot
  start until the company's real accounts and their event mapping exist.
  (Addressed by FF1.1-A above: the catalogue infrastructure and a template now
  exist. What remains is the company accountant approving it and the mapping
  content being decided.)

## Patch 4.0S-C2 progress

- COMPLETE: `reverseJournalEntryAction` corrects a posted entry by creating a
  new entry with every debit and credit mirrored on the same accounts and
  branch, linked through the nullable unique `JournalEntry.reversalOfId`
  self-relation (migration `20260724120000_add_journal_entry_reversal`, additive
  column + unique index + restrictive self FK).
- Eligibility: only CONTABILIZADO/CONCILIADO reverse; drafts, cancelled,
  missing, line-less, unbalanced and malformed sources are rejected, and a
  reversal cannot itself be reversed — reversal chains are NOT permitted.
- One reversal per original, enforced by the database unique constraint; a
  concurrent duplicate loses with a business error and rolls back completely.
- The source entry is never edited, re-dated, cancelled or deleted.
- The period lock applies to the **reversal date**, not the original's, so an
  entry from a closed month stays correctable in the current open period; a
  reversal dated inside a CERRADO period of its branch is still rejected, and a
  branch-less reversal fails closed exactly as 4.0S-C1 defines.
- Historical-account exception: a reversal may reuse an account deactivated
  after the original was posted (the account must still exist). Ordinary manual
  lines and ordinary posting keep the strict active-account rule; the exception
  is scoped to this action only.
- Audit: `JOURNAL_ENTRY_REVERSED` on the original and `JOURNAL_ENTRY_POSTED` on
  the reversal, both committed inside the reversal transaction.
- Verified by SMOKE-4.0S-C2 (94/94 assertions, `America/Managua`, zero fixtures
  left).
- STILL PENDING (4.0S-D+): Caja cash movements and everything below.

## Patch 4.0S-C1 progress

- COMPLETE: a CERRADO `AccountingClosing` now blocks — server-side, inside the
  posting transaction — journal posting, journal reconciliation and document
  CONTABILIZADO/CONCILIADO transitions dated in its branch+period. Inclusive
  month boundaries, UTC date-only comparison, Admin has no bypass, branch-less
  entries fail closed, authorized reopen restores posting.
- COMPLETE: journal lines require existing active accounts on create/update,
  and posting revalidates every current line, so drafts holding a
  later-deactivated account cannot post until corrected. Posted history is
  never rewritten by deactivation.
- The reversal engine that was pending here shipped in 4.0S-C2 (above).

## Patch 4.0S-B progress

- COMPLETE: append-only `FinancialAuditEvent`, safe authorized read DTOs and
  one additive migration.
- COMPLETE: current PostgreSQL-backed Caja and Contabilidad mutations commit
  their allowlisted audit event atomically.
- COMPLETE: posted journal headers/lines and `CONTABILIZADO` accounting
  documents reject direct editing and direct annulment, including for Admin.
- COMPLETE: cancellation/review/reopen reasons no longer destroy existing notes.
- COMPLETE (4.0S-B1): named audit predicates (`canViewGlobalFinancialAudit`,
  `canViewAccountingAudit`, `canViewBranchCashAudit`) and a fresh
  SMOKE-4.0S-B1 pass over the audit writer (atomicity, serialization, masking,
  allowlist), zero fixtures left.
- STILL PENDING: reversal entries, period lock and every cross-module posting or
  cash-movement feature assigned to later patches. Caja and Contabilidad remain
  NOT production-ready; 4.0S-B2/B3 scope items already shipped with 4.0S-B, and
  the reversal/period-lock work stays in 4.0S-C.

## Confirmed current state

- Caja and Contabilidad are real PostgreSQL modules with strict, verified
  role/branch/cashier authorization and Decimal money — the structural and
  security foundation is sound.
- Both are **record-keeping systems without financial semantics**: no money
  movement, posting, reversal, period lock, audit trail or cross-module flow
  exists. Integration columns exist in the schema but are never populated.
- Legacy localStorage panels (cashier + all accounting sections, including
  every formal report) still render on the same routes as the DB panels.
- Live DB facts (SMOKE-4.0S-A, all fixtures removed): duplicate open cash
  sessions accepted; document/closing uniqueness enforced; postings into a
  CERRADO period accepted; chart of accounts empty (unseeded). The last two were
  corrected afterwards by 4.0S-C1 and FF1.1-A respectively, neither verified
  against a live database yet.

## What is truly COMPLETE

- Authorization model (predicates + per-action guards + SQL scope filters).
- Caja document lifecycle (draft → issue → cancel-while-open) with items,
  draft payments capped at total, and per-session closing with manager review.
- Contabilidad master data (chart of accounts, third parties, banks as
  records), document/entry/voucher/expense/payroll status machines.
- Balance check at journal posting; unique numbering; one closing per session.

## What is PARTIAL / MANUAL / UI_ONLY / MISSING / UNSAFE

- PARTIAL: payments (draft-only), closing math, bank reconciliation, reports
  dashboard, traceability fields, currency handling.
- MANUAL: expenses, payroll, vouchers, inventory costs, closing totals,
  Caja→Contabilidad transfer (re-keying), bank balances.
- UI_ONLY: formal accounting reports (localStorage), closing as a period
  control.
- MISSING: cash outflows/opening balance/denominations/handover, payment
  reversal/refunds, document→journal engine, COGS and idempotency keys.
  (Journal reversal shipped in 4.0S-C2 and the period lock in 4.0S-C1; both
  were MISSING when this section was written against the 4.0S-A audit.)
- UNSAFE: duplicate-open race and 200-entry report cap. (The expected-cash
  formula was corrected in FF1.1-B; the remaining gap is the missing opening
  balance and cash movements, not the arithmetic.)

## Prioritized patch sequence

1. **4.0S-B — Financial audit trail + immutability (COMPLETE).** Added
   `FinancialAuditEvent`, atomic allowlisted audit writes, note-preserving
   reasons and direct-annulment/edit guards for posted entries and documents.
   Corrections still wait for the reversal engine in 4.0S-C.
2. **4.0S-C — Journal reversal + period lock.** Split:
   - **4.0S-C1 (COMPLETE):** posting/finalization checks `AccountingClosing`
     (CERRADO ⇒ reject entry/document dates in that branch+period) and
     active-account enforcement in lines with posting-time revalidation.
   - **4.0S-C2 (COMPLETE):** `reverseJournalEntryAction` creates a mirrored
     entry referencing the original through the unique `reversalOfId` column;
     one reversal per original, no chains, period lock on the reversal date,
     historical accounts reusable inside this flow only.
2b. **FF1.1-A — Chart of accounts foundation (COMPLETE).** Hierarchy levels,
   grouping vs posting accounts, effective window, archival, template/company
   provenance with explicit approval, one shared posting-eligibility rule, and a
   239-account template catalogue seeded unapproved. Details in
   `docs/CHART_OF_ACCOUNTS.md`.
3. **4.0S-D / FF1.1-B — Caja cash movements + closing math.** Opening balance on
   `CashSession`; `CashMovement` model (IN/OUT: outflows, petty expenses,
   deposits, withdrawals — schema change); expected-per-method computed from
   `CashPayment` + movements; store expected/counted/difference per method;
   explicit shortage/overage acceptance in review; closing annul/reopen path.
4. **4.0S-E — Receivables: post-issue payments + payment reversal.** Allow
   payments against EMITIDO documents until settled; reversal rows instead of
   deletes; document settlement status; refunds via credit-note linkage.
5. **4.0S-F — Caja→Contabilidad handoff.** Action that materializes an
   `AccountingDocument` (origin CAJA, linked ids populated) from each emitted
   Caja document/closing, idempotent per source id (unique constraint on
   `cashDocumentId`); Contador reviews instead of re-keying.
6. **4.0S-G — Document→journal engine.** Posting a reviewed document generates
   its balanced journal entry from an account mapping table; posting twice
   impossible (unique `accountingDocumentId` + status guard); expenses and
   payroll post the same way.
7. **4.0S-H — Sales/COGS integration.** Sale completion emits (or queues) the
   revenue + receivable/cash entry and the COGS/inventory entry from
   `AccountingInventoryCost`; cancellation reverses via 4.0S-C.
8. **4.0S-I — Bank statements.** Statement period model (opening/closing
   balance, movements), matching against payments/deposits/expenses, finalize/
   reopen, and reconciliation-driven bank balance.
9. **4.0S-J — Retire legacy localStorage financial panels** once parity is
   confirmed (per LOCALSTORAGE_AUDIT sequence), removing the dual data plane.
10. **4.0S-K — Concurrency hardening.** Postgres partial unique index for one
    ABIERTO session per cashier+branch; idempotency keys on document/payment
    creation; transactions around check-then-create paths; report queries
    unbounded aggregates (SQL SUM, not first-200 rows).

## Required schema changes

- `FinancialAuditEvent` is complete in 4.0S-B and `reversalOfId` on
  `JournalEntry` in 4.0S-C2. Still required: `CashMovement`;
  `openingBalance` on `CashSession`; per-method expected/counted on
  `CashClosing`; unique on `AccountingDocument.cashDocumentId`/`cashClosingId`
  (nullable unique); bank statement models; partial unique index (raw SQL
  migration) for open sessions; account-mapping table for the posting engine.

## Required server changes

Listed per patch above; all new invariants live in server actions with guarded
updates and transactions; no client-side enforcement.

## Required UI changes

Closing screen (expected vs counted per method), payment settlement view,
reversal buttons with confirmations, Caja-import review queue for Contador,
period-lock indicators, replacing legacy report screens with ledger-derived DB
reports.

## Migration risk

Additive columns/models are low-risk. The partial unique index requires
cleaning any duplicate open sessions first. Retiring localStorage panels risks
losing demo-era local data — export/import bridge already outlined in
LOCALSTORAGE_AUDIT. The document→journal engine needs the chart of accounts
seeded and mapped before activation (currently empty).

## Regression plan

Each patch: `prisma validate` + `migrate status`, `tsc`, build, plus a tagged
DB smoke (SMOKE-<patch>-) exercising the new invariant both positively and
negatively (e.g., reversal of posted entry allowed, second reversal rejected,
posting into closed period rejected), with zero-fixture cleanup — mirroring
the 4.0S-A methodology.

## Go-live criteria (finance)

1. Posted data immutable; corrections only via referenced reversals.
2. Period lock enforced server-side and verified by smoke.
3. Every Caja money event reaches the ledger exactly once (idempotent).
4. Closing reconciles counted vs expected per method from recorded data.
5. Trial balance/ledger derived exclusively from posted journal entries, and
   debit == credit across the whole ledger at all times.
6. Financial audit trail on every mutation.
7. Legacy localStorage financial panels removed.
8. Duplicate-open, double-submit and concurrent-posting races closed at the
   database level.

Until all eight hold, no real production financial transactions should be
entered.
