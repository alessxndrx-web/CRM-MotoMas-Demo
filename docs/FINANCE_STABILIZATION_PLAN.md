# Finance Stabilization Plan (updated through Patch 4.0S-C1)

Living stabilization plan. Patch 4.0S-B implements the audit and immutability
foundation; Patch 4.0S-C1 adds the accounting period lock and active-account
enforcement. The go-live verdict remains unchanged: NOT production-ready.

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
- STILL PENDING (4.0S-C2+): reversal engine (`reverseJournalEntryAction`,
  `reversalOfId` schema change) and everything below.

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
  CERRADO period accepted; chart of accounts empty (unseeded).

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
  reversal/refunds, journal reversal, period lock, document→journal engine,
  COGS and idempotency keys.
- UNSAFE: expected-cash formula, duplicate-open race and 200-entry report cap.

## Prioritized patch sequence

1. **4.0S-B — Financial audit trail + immutability (COMPLETE).** Added
   `FinancialAuditEvent`, atomic allowlisted audit writes, note-preserving
   reasons and direct-annulment/edit guards for posted entries and documents.
   Corrections still wait for the reversal engine in 4.0S-C.
2. **4.0S-C — Journal reversal + period lock.** Split:
   - **4.0S-C1 (COMPLETE):** posting/finalization checks `AccountingClosing`
     (CERRADO ⇒ reject entry/document dates in that branch+period) and
     active-account enforcement in lines with posting-time revalidation.
   - **4.0S-C2 (PENDING):** `reverseJournalEntryAction` creating a mirrored
     entry referencing the original (`reversalOfId` column — schema change).
3. **4.0S-D — Caja cash movements + closing math.** Opening balance on
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

- `FinancialAuditEvent` is complete in 4.0S-B. Still required:
  `reversalOfId` on `JournalEntry`; `CashMovement`;
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
