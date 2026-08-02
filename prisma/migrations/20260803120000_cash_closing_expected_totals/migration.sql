-- Patch FF1.1-B — expected cash per payment method on the shift closing.
--
-- Purely additive: five columns with a zero default. No column is dropped,
-- renamed or retyped, no row is deleted and no existing value is rewritten.
--
-- Existing closings (if any) keep `expected_* = 0`, which is honest: the data
-- needed to reconstruct their expectation — which payments belonged to which
-- issued document — was never stored on the closing, so a backfill would be a
-- guess. Their `difference` stays as it was computed under the old formula and
-- must be read with that caveat.

-- AlterTable
ALTER TABLE "cash_closings" ADD COLUMN     "expected_card_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "expected_cash_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "expected_check_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "expected_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "expected_transfer_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
