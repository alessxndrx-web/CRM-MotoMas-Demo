-- CreateEnum
CREATE TYPE "CashDocumentType" AS ENUM ('FACTURA', 'RECIBO', 'NOTA_DEBITO', 'NOTA_CREDITO');

-- CreateEnum
CREATE TYPE "CashDocumentStatus" AS ENUM ('BORRADOR', 'EMITIDO', 'ANULADO');

-- CreateEnum
CREATE TYPE "CashPaymentMethod" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('ABIERTO', 'CERRADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "CashClosingStatus" AS ENUM ('ABIERTO', 'CERRADO', 'REVISADO_CONTABILIDAD', 'ANULADO');

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "cashier_id" TEXT NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'ABIERTO',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_documents" (
    "id" TEXT NOT NULL,
    "cash_session_id" TEXT,
    "branch_id" TEXT NOT NULL,
    "issued_by_user_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "sale_id" TEXT,
    "reservation_id" TEXT,
    "related_document_id" TEXT,
    "related_document_number" TEXT,
    "type" "CashDocumentType" NOT NULL,
    "document_number" TEXT NOT NULL,
    "status" "CashDocumentStatus" NOT NULL DEFAULT 'BORRADOR',
    "third_party_name" TEXT NOT NULL,
    "tax_id" TEXT,
    "concept" TEXT NOT NULL,
    "description" TEXT,
    "motorcycle_description" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "applied_payment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "retention_1" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "retention_2" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT,
    "notes" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_document_items" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_document_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_payments" (
    "id" TEXT NOT NULL,
    "cash_session_id" TEXT,
    "document_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "recorded_by_user_id" TEXT NOT NULL,
    "method" "CashPaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT,
    "bank" TEXT,
    "reference" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_closings" (
    "id" TEXT NOT NULL,
    "cash_session_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "cashier_id" TEXT NOT NULL,
    "prepared_by_user_id" TEXT NOT NULL,
    "reviewed_by_user_id" TEXT,
    "status" "CashClosingStatus" NOT NULL DEFAULT 'ABIERTO',
    "cash_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "transfer_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "check_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "card_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "invoiced_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "received_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "retention_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "difference" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT,
    "notes" TEXT,
    "prepared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_closings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_sessions_branch_id_status_idx" ON "cash_sessions"("branch_id", "status");

-- CreateIndex
CREATE INDEX "cash_sessions_cashier_id_status_idx" ON "cash_sessions"("cashier_id", "status");

-- CreateIndex
CREATE INDEX "cash_sessions_opened_at_idx" ON "cash_sessions"("opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "cash_documents_document_number_key" ON "cash_documents"("document_number");

-- CreateIndex
CREATE INDEX "cash_documents_branch_id_status_idx" ON "cash_documents"("branch_id", "status");

-- CreateIndex
CREATE INDEX "cash_documents_issued_by_user_id_status_idx" ON "cash_documents"("issued_by_user_id", "status");

-- CreateIndex
CREATE INDEX "cash_documents_issued_at_idx" ON "cash_documents"("issued_at");

-- CreateIndex
CREATE INDEX "cash_documents_cash_session_id_idx" ON "cash_documents"("cash_session_id");

-- CreateIndex
CREATE INDEX "cash_documents_customer_id_idx" ON "cash_documents"("customer_id");

-- CreateIndex
CREATE INDEX "cash_documents_sale_id_idx" ON "cash_documents"("sale_id");

-- CreateIndex
CREATE INDEX "cash_documents_reservation_id_idx" ON "cash_documents"("reservation_id");

-- CreateIndex
CREATE INDEX "cash_documents_related_document_id_idx" ON "cash_documents"("related_document_id");

-- CreateIndex
CREATE INDEX "cash_document_items_document_id_position_idx" ON "cash_document_items"("document_id", "position");

-- CreateIndex
CREATE INDEX "cash_payments_branch_id_method_idx" ON "cash_payments"("branch_id", "method");

-- CreateIndex
CREATE INDEX "cash_payments_recorded_by_user_id_paid_at_idx" ON "cash_payments"("recorded_by_user_id", "paid_at");

-- CreateIndex
CREATE INDEX "cash_payments_document_id_idx" ON "cash_payments"("document_id");

-- CreateIndex
CREATE INDEX "cash_payments_cash_session_id_idx" ON "cash_payments"("cash_session_id");

-- CreateIndex
CREATE INDEX "cash_payments_paid_at_idx" ON "cash_payments"("paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "cash_closings_cash_session_id_key" ON "cash_closings"("cash_session_id");

-- CreateIndex
CREATE INDEX "cash_closings_branch_id_status_idx" ON "cash_closings"("branch_id", "status");

-- CreateIndex
CREATE INDEX "cash_closings_cashier_id_status_idx" ON "cash_closings"("cashier_id", "status");

-- CreateIndex
CREATE INDEX "cash_closings_prepared_at_idx" ON "cash_closings"("prepared_at");

-- CreateIndex
CREATE INDEX "cash_closings_closed_at_idx" ON "cash_closings"("closed_at");

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_documents" ADD CONSTRAINT "cash_documents_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_documents" ADD CONSTRAINT "cash_documents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_documents" ADD CONSTRAINT "cash_documents_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_documents" ADD CONSTRAINT "cash_documents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_documents" ADD CONSTRAINT "cash_documents_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_documents" ADD CONSTRAINT "cash_documents_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_documents" ADD CONSTRAINT "cash_documents_related_document_id_fkey" FOREIGN KEY ("related_document_id") REFERENCES "cash_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_document_items" ADD CONSTRAINT "cash_document_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "cash_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_payments" ADD CONSTRAINT "cash_payments_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_payments" ADD CONSTRAINT "cash_payments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "cash_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_payments" ADD CONSTRAINT "cash_payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_payments" ADD CONSTRAINT "cash_payments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_closings" ADD CONSTRAINT "cash_closings_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_closings" ADD CONSTRAINT "cash_closings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_closings" ADD CONSTRAINT "cash_closings_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_closings" ADD CONSTRAINT "cash_closings_prepared_by_user_id_fkey" FOREIGN KEY ("prepared_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_closings" ADD CONSTRAINT "cash_closings_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
