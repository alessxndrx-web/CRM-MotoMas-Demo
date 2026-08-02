-- Patch FF1.3-A — posting engine foundation.
--
-- Purely additive: one enum, one table, its indexes and its foreign keys. No
-- existing table, column, index or constraint is touched and no row is written,
-- rewritten or deleted. Nothing reads or writes this table yet: no strategy is
-- registered in the engine, so no business event can reach it until FF1.3-B.
--
-- `posting_records` exists to turn "the same event cannot be posted twice" into
-- a database guarantee. `journal_entries.accounting_document_id` is neither
-- unique nor applicable to events that are not documents (a cash closing, a
-- collection), which is finding R-08 of docs/ACCOUNTING_EVENTS.md.

-- CreateEnum
CREATE TYPE "PostingRecordStatus" AS ENUM ('CONTABILIZADO', 'REVERTIDO');

-- CreateTable
CREATE TABLE "posting_records" (
    "id" TEXT NOT NULL,
    "event" "AccountingEventType" NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "journal_entry_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "status" "PostingRecordStatus" NOT NULL DEFAULT 'CONTABILIZADO',
    "accounting_date" TIMESTAMP(3) NOT NULL,
    "currency" TEXT,
    "line_count" INTEGER NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "posted_by_user_id" TEXT NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversed_at" TIMESTAMP(3),
    "reversed_by_user_id" TEXT,
    "reversal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posting_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "posting_records_idempotency_key_key" ON "posting_records"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "posting_records_journal_entry_id_key" ON "posting_records"("journal_entry_id");

-- CreateIndex
CREATE INDEX "posting_records_event_status_idx" ON "posting_records"("event", "status");

-- CreateIndex
CREATE INDEX "posting_records_source_type_source_id_idx" ON "posting_records"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "posting_records_branch_id_accounting_date_idx" ON "posting_records"("branch_id", "accounting_date");

-- AddForeignKey
ALTER TABLE "posting_records" ADD CONSTRAINT "posting_records_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "posting_records" ADD CONSTRAINT "posting_records_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posting_records" ADD CONSTRAINT "posting_records_posted_by_user_id_fkey" FOREIGN KEY ("posted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posting_records" ADD CONSTRAINT "posting_records_reversed_by_user_id_fkey" FOREIGN KEY ("reversed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
