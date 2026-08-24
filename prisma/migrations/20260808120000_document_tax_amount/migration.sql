-- Patch FF2.0-B — tax amount on accounting documents.
--
-- FF2.0-A made `IMPUESTO` a first-class accounting component, but only
-- `Expense` carried a tax amount, so no document could ever emit it. This adds
-- the missing business datum.
--
-- Safe by construction: the column is NOT NULL DEFAULT 0, and
-- `calculateAccountingDocumentTotal` only gains an additive term. Every
-- document written before this migration keeps tax = 0, so its stored `total`
-- remains exactly what the formula produces. No backfill, no recomputation, no
-- row rewritten.
ALTER TABLE "accounting_documents"
  ADD COLUMN "tax" DECIMAL(12,2) NOT NULL DEFAULT 0;
