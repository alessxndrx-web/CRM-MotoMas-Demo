-- Patch FF2.0-C — tax amount on cash documents.
--
-- FF2.0-B gave `AccountingDocument` a tax amount and left `CashDocument`
-- without one, so the two totals stopped agreeing for the same data. This
-- closes that asymmetry: both models now compute
-- `subtotal + tax - abono - retentions`, floor 0.
--
-- Safe by construction: NOT NULL DEFAULT 0, and the new term is additive. Every
-- cash document written before this migration keeps tax = 0, so its stored
-- `total` remains exactly what the formula produces. No backfill, no
-- recomputation, no row rewritten, and no payment total is invalidated — a
-- larger total can only leave more room under the overpayment guard, never less.
ALTER TABLE "cash_documents"
  ADD COLUMN "tax" DECIMAL(12,2) NOT NULL DEFAULT 0;
