# Finance Stabilization Plan (Patch 4.0S-A deliverable)

Plan only — nothing here is implemented by 4.0S-A.

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
  COGS, financial audit trail, idempotency keys.
- UNSAFE: in-place annulment of posted entries/documents; expected-cash
  formula; duplicate-open race; note-overwriting cancels; 200-entry report cap.

## Prioritized patch sequence

1. **4.0S-B — Financial audit trail + immutability.** New `FinanceAuditEvent`
   (or reuse pattern from `TicketEvent`): actor, action, before/after, source
   ref, append-only. Convert every cancel to require it. Stop overwriting
   `notes`; store reasons in dedicated columns/events. Block annulment of
   CONTABILIZADO/CONCILIADO entries and documents (prep for reversal).
2. **4.0S-C — Journal reversal + period lock.** `reverseJournalEntryAction`
   creating a mirrored entry referencing the original (`reversalOfId` column —
   schema change); posting/annulment checks `AccountingClosing` (CERRADO ⇒
   reject entry/document dates in that branch+period). Enforce active-account
   check in lines. Guarded updates (`updateMany` with status condition).
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

- `reversalOfId` on `JournalEntry`; audit model; `CashMovement`;
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
