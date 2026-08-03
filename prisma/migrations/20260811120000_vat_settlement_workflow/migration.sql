-- Patch FF2.0-E — the VAT settlement business model.
--
-- FF2.0-D introduced the `LIQUIDACION_IVA` event but nothing could reach it: the
-- settlement had no row, no lifecycle and no action. This adds the thin model
-- that carries the declared amount and the two-state lifecycle that recognizes
-- it.
--
-- The table records a human decision; it does not derive one. Computing the VAT
-- position from the ledger remains open (limitation L-10).
--
-- Purely additive: a new enum and a new table. No existing type, table, column
-- or constraint is touched, and no row anywhere is rewritten.
CREATE TYPE "VatSettlementStatus" AS ENUM ('BORRADOR', 'EJECUTADA');

CREATE TABLE "vat_settlements" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "VatSettlementStatus" NOT NULL DEFAULT 'BORRADOR',
    "notes" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "executed_by_user_id" TEXT,
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vat_settlements_pkey" PRIMARY KEY ("id")
);

-- The business twin of the engine's idempotency key: one settlement per branch
-- and period, enforced by the database on both sides.
CREATE UNIQUE INDEX "vat_settlements_branch_id_period_key"
    ON "vat_settlements"("branch_id", "period");
CREATE INDEX "vat_settlements_branch_id_status_idx"
    ON "vat_settlements"("branch_id", "status");
CREATE INDEX "vat_settlements_period_idx" ON "vat_settlements"("period");

ALTER TABLE "vat_settlements"
    ADD CONSTRAINT "vat_settlements_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vat_settlements"
    ADD CONSTRAINT "vat_settlements_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vat_settlements"
    ADD CONSTRAINT "vat_settlements_executed_by_user_id_fkey"
    FOREIGN KEY ("executed_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
