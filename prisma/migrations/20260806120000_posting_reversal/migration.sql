-- Patch FF1.3-C — posting reversal.
--
-- Fixes a defect of FF1.3-A. `posting_records.idempotency_key` was unique
-- absolutely, while the model's own documentation promised that marking a
-- record REVERTIDO would let the source event be posted again. Both cannot be
-- true: the second attempt would collide on the unique index, so the
-- reverse → correct → post-again loop was impossible.
--
-- The rule that actually holds is "at most one ACTIVE posting per business
-- event". It is expressed with a nullable unique column that carries the key
-- only while the posting is CONTABILIZADO — the same device
-- `account_mapping_sets.active_branch_key` uses, and for the same reason: a
-- partial unique index cannot be declared in the Prisma schema, so it would
-- live only here and every later `prisma migrate dev` would report it as drift.
--
-- Non-destructive: the old index is replaced by a plain index plus the new
-- nullable unique. No row is deleted and every existing key is preserved.

-- DropIndex
DROP INDEX "posting_records_idempotency_key_key";

-- AlterTable
ALTER TABLE "posting_records" ADD COLUMN     "active_idempotency_key" TEXT;

-- Backfill: every posting that is currently CONTABILIZADO holds its key.
UPDATE "posting_records"
SET "active_idempotency_key" = "idempotency_key"
WHERE "status" = 'CONTABILIZADO';

-- CreateIndex
CREATE UNIQUE INDEX "posting_records_active_idempotency_key_key" ON "posting_records"("active_idempotency_key");

-- CreateIndex
CREATE INDEX "posting_records_idempotency_key_idx" ON "posting_records"("idempotency_key");
