# Contabilidad — Auditoría de integración (Patch 4.0S-A)

Audit-only. No code, schema, permission or UI change was made.

## Executive summary

Contabilidad has a **complete relational structure and correct authorization**
(Admin/Contador operate, Gerente reads own-branch inventory/report summaries,
everyone else fails closed), but it is **an electronic filing cabinet, not an
accounting engine**. Documents, journal entries, vouchers, expenses, payroll,
banks, reconciliations and closings are all independent records connected only
by optional, mostly-unpopulated references. Posting a document changes a status
— it creates no journal entry. Posting a journal entry checks balance — but a
posted entry can then be annulled in place without a reversal. Closing a period
locks nothing (verified against the live database). Formal reports (trial
balance, ledger, income statement) still come from the legacy localStorage
panel; the DB layer only offers a counters/sums dashboard whose journal totals
are capped at 200 entries and whose document totals include unposted documents.

**Contabilidad verdict: structural YES · functional PARTIAL · double-entry
safe NO · integrated with Caja/Ventas/Inventario NO · reports reliable NO ·
production ready NO.**

## Accounting feature inventory

| Feature | Action(s) | Classification | Notes |
|---|---|---|---|
| Chart of accounts | create/update/deactivate (actions.ts:179-293) | COMPLETE | Tree via parentId; self-parent blocked (one level only — no deep-cycle check); **DB currently has zero accounts (no seed)** |
| Third parties | create/update/deactivate | COMPLETE | Optional CRM customer link |
| Accounting documents | create/update/issue/review/post/reconcile/cancel (409-780) | PARTIAL | Full status machine BORRADOR→EMITIDO→REVISADO→CONTABILIZADO→CONCILIADO→(ANULADO); "post" is a status flag only |
| Journal entries + lines | create/update/add-remove lines/post/reconcile/cancel (820-1175) | UNSAFE | See invariants |
| Vouchers | create/update/reconcile/cancel (1179-1373) | MANUAL | Single-sided parallel records; no ledger effect |
| Expenses | create/update/review (1377-1560) | MANUAL | REGISTRADO→REVISADO only; no posting, no cancellation, no cash/bank effect |
| Payroll | create/update/prepare/pay (1564-1749) | MANUAL | Flat manual records; no accounting effect |
| Inventory costs | create/update (1753-1849) | MANUAL | Cost catalog per model/branch; Admin/Contador-only (double predicate) ✔ |
| Bank accounts | create/update/deactivate (1853-1958) | MANUAL | Balance hand-edited; nothing moves it |
| Bank reconciliation | create/update/review/cancel (1962-2157) | PARTIAL | Single-movement matcher; see banks section |
| Accounting closings | create/review/close/reopen (2167-2311) | UI_ONLY as a control; MANUAL as a record | Totals typed in by the user; period never locks |
| Reports | `getContabilidadDashboardSummary` + legacy panel | MIXED | See reports section |
| Currencies / exchange rates | free-text currency | PARTIAL | No rates, no consistency enforcement |
| Audit trail | — | MISSING | `UserAuditLog` never written by any financial action (grep: only support/user-store use it) |

## Double-entry invariants (Task 6)

| Invariant | Enforced? | Where / evidence |
|---|---|---|
| debit == credit to post | YES | `postJournalEntryAction` (actions.ts:1097) |
| Minimum valid lines | EFFECTIVE | ≥1 required; 0/0 and debit+credit lines rejected per line, so balance forces ≥2 in practice |
| No zero-value meaningless lines | YES | normalizeJournalLine (795) |
| Valid **active** accounts only | NO | `accountExists` ignores `isActive` (154) — deactivated accounts accepted |
| Sign consistency | YES | negative money rejected by sanitizer; one side per line |
| Journal date validation | PARTIAL | Parseable date required; any past/future date accepted |
| Branch validation | YES when supplied | branch optional by design |
| Currency consistency | NO | not modeled on entries |
| Posted entries immutable | **NO** | `cancelJournalEntryAction` (1149) annuls ANY non-annulled entry — including CONTABILIZADO/CONCILIADO — in place, and **overwrites `notes`** |
| Posted edits require reversal | **NO — no reversal exists anywhere** | |
| Reversal references original | N/A | no reversal concept |
| Cannot post twice | YES (status guard) / race unguarded | check-then-update; benign terminal state |
| Cannot annul twice | YES | status check |
| Closed period rejects postings | **NO** | No period check in any action; smoke E inserted an entry dated inside a CERRADO period successfully |
| Unique numbering | YES (unique) / NOT sequential; client-supplied accepted | smoke F |
| Concurrent duplicate posting | LOW risk | unguarded update, same terminal state |
| Orphan lines impossible | YES | lines only via entry actions; draft-only edits |
| Source references preserved | PARTIAL | optional `accountingDocumentId` on entry; never populated by UI |
| Critical mutations audited | **NO** | zero audit records |

## Posting / reversal / closing workflow (Task 7 trace)

A. Create document → SUPPORTED (BORRADOR).
B. Add journal lines → SUPPORTED (separate entry object; document link optional and unused by UI).
C. Validate debit/credit → SUPPORTED at post time only; drafts may stay unbalanced (flagged in dashboard count).
D. Review document → SUPPORTED (REVISADO, reviewer recorded).
E. Post → PARTIAL: document posting is a status change; **no ledger effect**. Journal posting checks balance.
F. Appears in journal/ledger → PARTIAL: journal list yes; there is no ledger/account-movement query in the DB layer at all.
G. Edit posted entry → correctly blocked (`requireDraftEntry`), **but** H shows the bypass.
H. Reverse → UNSUPPORTED. Only in-place annulment (UNSAFE: history mutation, notes overwritten).
I. Reversal effects → N/A.
J. Close period → record-level only; totals typed manually.
K. Post into closed period → **ACCEPTED** (smoke E) — nothing checks `AccountingClosing`.
L. Reports → dashboard sums only; formal statements are localStorage-based.

## Source-document traceability

Schema is ready (`cashDocumentId`, `cashClosingId`, `saleId`, `reservationId`,
`customerId` on `AccountingDocument`; `accountingDocumentId` on `JournalEntry`
and `BankReconciliation`; `origin` enum; `listCajaLinkedAccountingDocuments`
query exists). **The creation UI populates none of them** — every document is
typed from scratch, so `origin` is always CONTABILIDAD and the Caja-linked
list is permanently empty. Traceability today is a free-text `sourceDocument`
field. Classification: MANUAL at best, DISCONNECTED in practice.

## Sales integration (Task 8)

`src/server/operations` (sales/reservations/transfers) contains **zero**
references to Caja or Contabilidad models. A completed sale creates no revenue
recognition, no receivable, no cash movement, no COGS, no accounting document
and no journal entry. Duplicate-posting protection is moot (nothing posts).
Classification: **DISCONNECTED**.

## Caja integration (Task 9)

- Invoice/receipt creation in Caja → no accounting effect.
- Payment registration → none.
- Session closing / difference / review → none (closing status
  REVISADO_CONTABILIDAD is a label; no accounting record is produced).
- Bank deposit / refund / outflow → do not exist in Caja.
- Contador re-keys everything manually and cannot even link the source with
  the current forms. Closing totals cannot be reconciled against any ledger.
Classification: **DISCONNECTED (manual re-keying)**.

## Inventory integration (Task 10)

- Physical inventory (`MotorcycleUnit`, `InventoryMovement`) stores no cost;
  `src/server/inventory` has zero cost references.
- `AccountingInventoryCost` is a manually-maintained per-model cost catalog,
  gated to Admin/Contador; Gerente reads own-branch summaries.
- Sale/delivery/transfer produce no cost recognition, no COGS, no accounting
  entry; transfers change physical location only (intended per FLOWS; actual
  matches intended). Accounting inventory can diverge freely from operational
  inventory — nothing compares them. Duplicate cost rows prevented by
  `@@unique([branchId, modelSlug])`.
Classification: **MANUAL catalog, DISCONNECTED valuation**.

## Expenses (Task 11)

Expense = manual record (branch, category, supplier, amounts, optional account
and voucher references). No approval chain beyond REGISTRADO→REVISADO, no
journal posting, no cash/bank effect, no cancellation/reversal, no audit.
Classification: **independent + manually posted (i.e., never posted)**.

## Banks / reconciliation (Task 12)

`BankReconciliation` is a **single-movement match record**: one amount, one
optional document link; review derives CONCILIADO/DIFERENCIA from the linked
document total (or CONCILIADO by default when unlinked — a self-certifying
match). There are no statement periods, no opening/closing balances, no
imported movements, no partial matches, no finalization beyond row status, and
reconciliation never touches `BankAccount.balance` (which is hand-edited).
Classification: **a summary/matching record, not a reconciliation workflow**.

## Reports (Task 14)

| Report | Actual source | Classification |
|---|---|---|
| DB dashboard ("Reportes" header card) | Prisma counts/sums: documents (all non-ANULADO, **not posted-only**), journal totals (**first 200 entries only**, all statuses incl. ANULADO lines? — annulled entries keep their lines and are included), expenses, payroll, manual bank balances | PARTIAL / UNSAFE at scale |
| Trial balance, journal book, ledger, income statement, balance sheet, third-party movement, closing reports | Legacy `AccountingPanel` (localStorage, per-browser data) | UI_ONLY for production purposes |
| Caja daily summary | DB, correctly scoped | COMPLETE (as a summary) |

No report is derived from *posted journal entries only*; no balance validation
backs any statement. **Financial reports cannot currently be trusted.**

## Permissions (Task 15)

Verified against `access.ts` predicates and every action's entry guard:

- ADMIN: global operate/review in both modules ✔
- GERENTE: `branchReadOnly` scope; cannot operate Contabilidad or Caja
  documents; reviews Caja closings (intended) ✔; no global leakage (scope
  filters in every query) ✔
- CAJERO: Caja operate only; no Contabilidad access; no cost fields exist in
  any Caja DTO ✔
- CONTADOR: full Contabilidad; `canAccessCaja` false → no Caja operation ✔
- VENDEDOR / MARKETING / SOPORTE_TECNICO: both `canAccessCaja` and
  `canAccessContabilidad` false; every server action fails closed on direct
  call ✔ (support module has read-only sanitized diagnostics elsewhere)

No permission finding. The authorization layer is the strongest part of both
modules.

## Findings (severity)

| ID | Sev | Finding | Blocker |
|---|---|---|---|
| CTB-01 | CRITICAL | Posted journal entries / posted documents can be annulled in place (no reversal, notes overwritten) → posted data is mutable, reports falsifiable | YES |
| CTB-02 | CRITICAL | Accounting closings lock nothing; postings accepted into CERRADO periods (smoke E) | YES |
| CTB-03 | CRITICAL | No document→journal engine: "CONTABILIZADO" is a label; ledger and documents diverge by design | YES |
| CTB-04 | CRITICAL | Dual data planes: legacy localStorage panels (incl. all formal reports) mounted beside DB panels on the same routes | YES |
| CTB-05 | CRITICAL | Zero financial audit trail; several cancel actions destroy prior notes | YES |
| CTB-06 | HIGH | Closing totals manual, not ledger-derived; difference derived from typed inputs | YES |
| CTB-07 | HIGH | Bank reconciliation lacks statements/balances; unlinked movements self-certify as CONCILIADO; bank balance hand-edited | YES |
| CTB-08 | HIGH | Sales/Caja/Inventory/Expenses never reach the ledger (manual re-keying without links) | YES |
| CTB-09 | MEDIUM | Inactive accounts usable in journal lines | NO |
| CTB-10 | MEDIUM | Dashboard journal totals capped at 200 entries; document totals include unposted docs | NO |
| CTB-11 | MEDIUM | Client-supplied numbers accepted; no sequential numbering; annulled entries still counted in sums | NO |
| CTB-12 | MEDIUM | Status transitions unguarded against concurrent writes (check-then-update everywhere) | NO |
| CTB-13 | LOW | Chart of accounts unseeded (live DB has zero accounts) | NO |
| CTB-14 | LOW | Free-text currency everywhere; no consistency rule | NO |

## Production blockers

CTB-01…CTB-08 (plus Caja blockers CAJ-01…CAJ-07, CAJ-11).

## Recommended patches

See `docs/FINANCE_STABILIZATION_PLAN.md`.
