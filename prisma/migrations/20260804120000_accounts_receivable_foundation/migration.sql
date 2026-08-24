-- Patch FF1.2-B — accounts receivable foundation.
--
-- Purely additive: three enums, three tables, their indexes and their foreign
-- keys. No existing table, column, index or constraint is touched, and no row
-- is written, rewritten or deleted. Nothing depends on these tables yet, so the
-- migration is safe on a populated database and needs no backfill: a receivable
-- is created from a document by an explicit action, never inferred.
--
-- Every foreign key that points at money or at a source document is RESTRICT:
-- a collection, an allocation and the document behind an obligation are records
-- that must never disappear from under the history that references them.

-- CreateEnum
CREATE TYPE "ReceivableOrigin" AS ENUM ('CAJA', 'CONTABILIDAD');

-- CreateEnum
CREATE TYPE "ReceivablePaymentStatus" AS ENUM ('REGISTRADO', 'REVERTIDO');

-- CreateEnum
CREATE TYPE "ReceivableAllocationStatus" AS ENUM ('APLICADA', 'REVERTIDA');

-- CreateTable
CREATE TABLE "receivable_documents" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "third_party_id" TEXT,
    "party_name" TEXT NOT NULL,
    "origin" "ReceivableOrigin" NOT NULL,
    "cash_document_id" TEXT,
    "accounting_document_id" TEXT,
    "document_number" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "original_amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT,
    "notes" TEXT,
    "settled_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" TEXT,
    "cancel_reason" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receivable_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivable_payments" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "third_party_id" TEXT,
    "party_name" TEXT NOT NULL,
    "payment_number" TEXT NOT NULL,
    "method" "CashPaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT,
    "bank" TEXT,
    "reference" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "status" "ReceivablePaymentStatus" NOT NULL DEFAULT 'REGISTRADO',
    "cash_payment_id" TEXT,
    "cash_session_id" TEXT,
    "notes" TEXT,
    "reversed_at" TIMESTAMP(3),
    "reversed_by_user_id" TEXT,
    "reversal_reason" TEXT,
    "recorded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receivable_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivable_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "receivable_document_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "ReceivableAllocationStatus" NOT NULL DEFAULT 'APLICADA',
    "allocated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocated_by_user_id" TEXT NOT NULL,
    "reversed_at" TIMESTAMP(3),
    "reversed_by_user_id" TEXT,
    "reversal_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receivable_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receivable_documents_cash_document_id_key" ON "receivable_documents"("cash_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_documents_accounting_document_id_key" ON "receivable_documents"("accounting_document_id");

-- CreateIndex
CREATE INDEX "receivable_documents_branch_id_settled_at_idx" ON "receivable_documents"("branch_id", "settled_at");

-- CreateIndex
CREATE INDEX "receivable_documents_customer_id_idx" ON "receivable_documents"("customer_id");

-- CreateIndex
CREATE INDEX "receivable_documents_third_party_id_idx" ON "receivable_documents"("third_party_id");

-- CreateIndex
CREATE INDEX "receivable_documents_issued_at_idx" ON "receivable_documents"("issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_payments_payment_number_key" ON "receivable_payments"("payment_number");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_payments_cash_payment_id_key" ON "receivable_payments"("cash_payment_id");

-- CreateIndex
CREATE INDEX "receivable_payments_branch_id_status_idx" ON "receivable_payments"("branch_id", "status");

-- CreateIndex
CREATE INDEX "receivable_payments_customer_id_idx" ON "receivable_payments"("customer_id");

-- CreateIndex
CREATE INDEX "receivable_payments_third_party_id_idx" ON "receivable_payments"("third_party_id");

-- CreateIndex
CREATE INDEX "receivable_payments_received_at_idx" ON "receivable_payments"("received_at");

-- CreateIndex
CREATE INDEX "receivable_allocations_payment_id_status_idx" ON "receivable_allocations"("payment_id", "status");

-- CreateIndex
CREATE INDEX "receivable_allocations_receivable_document_id_status_idx" ON "receivable_allocations"("receivable_document_id", "status");

-- AddForeignKey
ALTER TABLE "receivable_documents" ADD CONSTRAINT "receivable_documents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_documents" ADD CONSTRAINT "receivable_documents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_documents" ADD CONSTRAINT "receivable_documents_third_party_id_fkey" FOREIGN KEY ("third_party_id") REFERENCES "third_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_documents" ADD CONSTRAINT "receivable_documents_cash_document_id_fkey" FOREIGN KEY ("cash_document_id") REFERENCES "cash_documents"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "receivable_documents" ADD CONSTRAINT "receivable_documents_accounting_document_id_fkey" FOREIGN KEY ("accounting_document_id") REFERENCES "accounting_documents"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "receivable_documents" ADD CONSTRAINT "receivable_documents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_documents" ADD CONSTRAINT "receivable_documents_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_third_party_id_fkey" FOREIGN KEY ("third_party_id") REFERENCES "third_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_cash_payment_id_fkey" FOREIGN KEY ("cash_payment_id") REFERENCES "cash_payments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_reversed_by_user_id_fkey" FOREIGN KEY ("reversed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_allocations" ADD CONSTRAINT "receivable_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "receivable_payments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "receivable_allocations" ADD CONSTRAINT "receivable_allocations_receivable_document_id_fkey" FOREIGN KEY ("receivable_document_id") REFERENCES "receivable_documents"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "receivable_allocations" ADD CONSTRAINT "receivable_allocations_allocated_by_user_id_fkey" FOREIGN KEY ("allocated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_allocations" ADD CONSTRAINT "receivable_allocations_reversed_by_user_id_fkey" FOREIGN KEY ("reversed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
