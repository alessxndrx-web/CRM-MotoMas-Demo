# Caja — Auditoría operativa (Patch 4.0S-A)

Audit-only. No code, schema, permission or UI change was made. Evidence lines
reference the current working tree.

> **HALLAZGOS PARCIALMENTE SUPERADOS (marcado en el Parche FF1.0).** Este
> documento fotografía Caja en el Parche 4.0S-A y **conserva su valor
> histórico**, pero dos hallazgos ya fueron corregidos:
>
> | Hallazgo original | Estado hoy | Corregido en |
> |---|---|---|
> | "No Caja mutation writes any audit event" | Toda mutación PostgreSQL de Caja escribe su evento financiero en la misma transacción | 4.0S-B |
> | "Document voiding: reason overwrites `notes`" | El motivo vive en el evento de auditoría y no destruye las notas | 4.0S-B |
>
> **Siguen vigentes**, entre otros: sin saldo inicial, sin movimientos de
> efectivo, pagos solo en borrador, sin reversión de pago ni devoluciones,
> fórmula de arqueo basada en facturas en lugar de pagos registrados, sin
> conteo de denominaciones, sin entrega de turno, sin idempotencia y la carrera
> de turno abierto duplicado. Ese es el alcance de **FF1.1**.
>
> El párrafo sobre paneles heredados renderizados junto a los paneles de base de
> datos también quedó obsoleto: desde el Parche 3.7 los paneles `localStorage`
> se ocultan cuando hay base de datos configurada
> (`NEXT_PUBLIC_ENABLE_LEGACY_OPERATIONAL_PANELS`).
>
> Estado vigente: [FINANCE_STABILIZATION_PLAN.md](FINANCE_STABILIZATION_PLAN.md)
> y [FINANCIAL_FOUNDATION.md](FINANCIAL_FOUNDATION.md).

## Executive summary

Caja is **structurally complete and well-authorized but operationally
incomplete**. The PostgreSQL layer (`CashSession`, `CashDocument`,
`CashDocumentItem`, `CashPayment`, `CashClosing`) exists end-to-end with real
server actions, strict role/branch/cashier scoping and Decimal money. However,
the module only models *document issuance with up-front payments*: there is no
opening balance, no cash inflow/outflow ledger, no post-issuance payment, no
payment reversal, no refund path, and the closing compares **counted vs
invoiced** rather than counted vs expected-from-recorded-payments. The legacy
localStorage `CashierPanel` is still mounted on all five Caja routes next to
the DB panels, so two parallel cash records exist per device. No Caja mutation
writes any audit event.

**Caja verdict: structural YES · functional PARTIAL · operational NO ·
integrated with Contabilidad NO · production ready NO.**

## Implemented Caja inventory

| Capability | Model / action | Classification | Notes |
|---|---|---|---|
| Open cash session | `CashSession` / `openCashSessionAction` (actions.ts:399) | PARTIAL | No opening balance/petty fund field; duplicate-open guard is check-then-create (smoke A: DB accepts 2 open sessions) |
| Cashier identity / branch identity | session-derived (`authorizeCaja`, actions.ts:87) | COMPLETE | Never client-supplied; ADMIN may name a branch, CAJERO/GERENTE fixed to own branch |
| One open session rule | service-layer check only (actions.ts:413) | UNSAFE (race) | Schema comment admits no partial unique (schema.prisma:1037) |
| Session recovery | DB persistence + `getCurrentCashSession` | COMPLETE | Survives browser interruption |
| Invoices / receipts / notes | `CashDocument` (FACTURA, RECIBO, NOTA_DEBITO, NOTA_CREDITO) | COMPLETE (lifecycle) | BORRADOR → EMITIDO → ANULADO; items only on FACTURA; notes cannot carry payments |
| Document numbering | unique `documentNumber`, random suffix (actions.ts:391) | PARTIAL | Unique but not sequential; client may supply arbitrary number; P2002 handled |
| Payments | `CashPayment` / `addCashPaymentAction` (actions.ts:940) | PARTIAL | **Draft-only**: once EMITIDO no payment can be added |
| Partial payments | payment ≤ total allowed at draft | PARTIAL | Balance shown in DTO (`balance`), but no way to settle it later |
| Overpayment | blocked (actions.ts:968) | COMPLETE (blocked by design) | |
| Multiple payments / mixed methods | multiple `CashPayment` rows, 4 methods | PARTIAL | Only while draft; EFECTIVO/TRANSFERENCIA/CHEQUE/TARJETA |
| Payment references / bank | stored on payment | COMPLETE | |
| Change returned | — | MISSING | No field or calculation |
| Currencies / exchange rates | free-text sanitized `currency` | PARTIAL | No exchange rates; no doc-vs-payment consistency check |
| Cash inflows (non-document) | — | MISSING | |
| Cash outflows / petty expenses / withdrawals / deposits | — | MISSING | No model at all; Caja cannot record money leaving the drawer |
| Payment cancellation / reversal | `removeCashPaymentAction` (draft-only hard delete) | MISSING (post-issue) | No reversal record; draft deletion leaves no trace |
| Refunds | — | MISSING | NOTA_CREDITO exists as a document but is not linked to money returned |
| Document voiding | `cancelCashDocumentAction` (actions.ts:792) | PARTIAL | Only while session open; **reason overwrites `notes`** (prior notes lost); no audit event |
| Closing: counted amounts | `createCashClosingAction` (actions.ts:1051) | COMPLETE | Cashier declares cash/transfer/check/card counted |
| Closing: expected amount | `invoicedTotal` from EMITIDO FACTURA totals | UNSAFE (formula) | Expected is **not** derived from recorded `CashPayment` rows; see below |
| Shortage / overage | `difference = received − invoiced` | PARTIAL | Signed number stored; no explicit shortage/overage state, no acceptance step |
| Denomination counting | — | MISSING | |
| Cashier confirmation → close | `closeCashSessionAction` (actions.ts:1147) | COMPLETE | Requires prepared closing + zero drafts; closes session transactionally |
| Manager review | `reviewCashClosingAction` (actions.ts:1222), `canReviewCaja` (Admin/Gerente) | COMPLETE | CERRADO → REVISADO_CONTABILIDAD |
| Closing immutability | status checks | PARTIAL | No reopen/correction path; `CashClosingStatus.ANULADO` is unreachable (no action) |
| Shift handover | — | MISSING | |
| Daily/branch summaries | `getCajaDashboardSummary` (queries.ts:430) | COMPLETE | Scoped counts/sums |
| Audit trail | — | MISSING | `UserAuditLog` is never written by any Caja action |
| Idempotency | — | MISSING | Random doc numbers mean a double submit creates two documents |
| Concurrency | partial | UNSAFE (spots) | See integrity table |

## Real daily workflow matrix (Task 3 trace)

| Step | Status | Notes |
|---|---|---|
| A. Open session with opening balance | PARTIAL | Session opens; **no opening balance can be recorded** |
| B. Full cash payment for a sale | SUPPORTED | Draft FACTURA (+optional `saleId` link, branch-validated) + EFECTIVO payment + issue |
| C. Partial payment | PARTIAL | Allowed at draft; outstanding balance can never be collected later (payments locked after EMITIDO) |
| D. Mixed cash + transfer | SUPPORTED | Multiple payment rows while draft |
| E. Authorized cash outflow | UNSUPPORTED | No outflow concept exists |
| F. Cancel / reverse a payment | UNSUPPORTED after issue; draft delete is traceless | |
| G. Count physical cash | SUPPORTED | Counted per method on closing |
| H. System calculates expected | UNSAFE | Expected = invoiced FACTURA total, not Σ payments by method; credit/partial invoices guarantee false differences |
| I. Shortage/overage registered | PARTIAL | Signed `difference` only |
| J. Close session | SUPPORTED | Transactional; drafts block closing |
| K. Manager review | SUPPORTED | Gerente/Admin |
| L. Available to accounting/bank reconciliation | UNSUPPORTED | Nothing flows to Contabilidad; `AccountingDocument.cashDocumentId/cashClosingId` exist but **no UI or action ever populates them** — the Contador re-keys documents manually |

## Payment-method matrix

EFECTIVO / TRANSFERENCIA / CHEQUE / TARJETA are modeled with bank + reference
fields. Closing captures a counted amount per method, but the system never
aggregates `CashPayment` by method for the same session to produce an expected
figure per method (the dashboard does aggregate by method globally —
queries.ts:487 — proving the data exists to do it). No deposit-to-bank handoff
exists; `BankAccount.balance` in Contabilidad is manually edited.

## Opening/closing audit

- Open: no balance, no float, race on duplicate open (smoke A).
- Prepare closing: one per session enforced by `@unique(cashSessionId)`
  (smoke C blocked) and a transaction-level existence check.
- Close: transactional, recomputes invoiced/retention totals, blocks drafts.
- Review: single forward step; no un-review, no closing annulment, no reopen.
- Difference formula: `received − invoiced` — deterministic but conceptually
  wrong for any session containing partial payments, credit documents or
  RECIBO-type income (recibos are excluded from `invoicedTotal` yet their
  payments are counted in `received`).

## Cancellation/reversal audit

Draft: items and payments are hard-deleted (no trace). Issued: document can be
ANULADO with a reason **only while the session is still open**, and the reason
replaces `notes`. After session close nothing can be cancelled or corrected —
there is no credit-note linkage that reverses an issued document's totals, and
closings cannot be annulled. No reversal produces any compensating record.

## Physical-cash control

Not implemented: no drawer float, no in/out movements, no denominations, no
change calculation, no deposit slips. The only physical-cash artifact is the
counted `cashAmount` at closing.

## Branch/cashier permissions

Verified in `access.ts` + `caja/queries.ts` scope filters (all reads and the
`canAccessCash*` helpers AND the scope into the SQL):

- CAJERO: own branch + own sessions/documents/payments only; costs never
  exposed (no cost fields exist in Caja).
- GERENTE: branch supervision + review; cannot be excluded from operating
  (`canOperateCaja` is ADMIN/CAJERO — Gerente cannot issue documents ✔).
- ADMIN: global, may name a branch on open.
- CONTADOR/VENDEDOR/MARKETING/SOPORTE: `canAccessCaja` false → every action
  and query fails closed. Direct server-action calls re-check on every entry
  point ✔.

## Integrations

None. Caja neither creates accounting documents nor notifies Contabilidad.
`origin: CAJA` on `AccountingDocument` is only set when a caller passes
`cashDocumentId`/`cashClosingId` — and the only creation UI
(`contabilidad-documents-db-panel.tsx:381`) passes neither. Sales are linkable
(`saleId` validated against branch) but the sale itself never triggers a cash
document.

## Idempotency / concurrency

| Risk | Location | Status |
|---|---|---|
| Double-open session | actions.ts:413 (find→create) | REAL — smoke A proved DB accepts duplicates |
| Double-submit document | random number → no P2002 protection | REAL — two distinct documents |
| Double-submit payment | check-then-create (actions.ts:964-980), no transaction | REAL — concurrent adds can exceed document total |
| Concurrent close | transaction but unguarded update (no status condition on UPDATE) | LOW impact (same terminal state) |
| Item/payment edit races | draft-scope refresh in transaction | OK |
| Unique doc number | DB unique + P2002 handling | OK (smoke B) |
| One closing per session | DB unique | OK (smoke C) |

## Findings (severity)

| ID | Sev | Finding | Blocker |
|---|---|---|---|
| CAJ-01 | HIGH | Payments locked after EMITIDO → no receivable/settlement workflow | YES |
| CAJ-02 | HIGH | No cash outflows/petty cash/deposits/withdrawals | YES |
| CAJ-03 | HIGH | Expected-cash formula compares counted vs invoiced, not vs recorded payments per method | YES |
| CAJ-04 | HIGH | Duplicate open sessions possible (no partial unique; race) | YES |
| CAJ-05 | HIGH | No idempotency on document/payment creation (double-click duplicates) | YES |
| CAJ-06 | HIGH | No Caja→Contabilidad handoff; manual re-keying | YES |
| CAJ-07 | MEDIUM | Cancel overwrites notes; draft deletes traceless; no audit events at all | YES (with CTB-05) |
| CAJ-08 | MEDIUM | No opening balance / change / denominations / handover | NO |
| CAJ-09 | MEDIUM | No closing reopen/annul path; ANULADO status dead | NO |
| CAJ-10 | MEDIUM | Client-supplied document numbers accepted; numbering not sequential | NO |
| CAJ-11 | MEDIUM | Legacy localStorage CashierPanel still mounted on all 5 routes (parallel record) | YES |
| CAJ-12 | LOW | Currency free-text; no doc/payment consistency check | NO |

## Production blockers

CAJ-01…CAJ-06, CAJ-07 (jointly with the missing audit trail) and CAJ-11.

## Recommended patches

See `docs/FINANCE_STABILIZATION_PLAN.md` (sequence 4.0S-B…4.0S-I).
