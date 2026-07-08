-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('BORRADOR', 'EMITIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "ExpedienteDocumentType" AS ENUM ('CEDULA', 'INGRESOS', 'SERVICIOS', 'CONSTANCIA', 'REFERENCIA', 'OTRO');

-- CreateEnum
CREATE TYPE "ExpedienteDocumentStatus" AS ENUM ('PENDIENTE', 'RECIBIDO', 'REVISADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('PENDIENTE', 'EN_REVISION', 'APROBADO', 'RECHAZADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "customer_file_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "branch_id" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "motorcycle_model" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "down_payment" DECIMAL(12,2),
    "term_months" INTEGER,
    "estimated_payment" DECIMAL(12,2),
    "currency" TEXT,
    "notes" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'BORRADOR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expediente_documents" (
    "id" TEXT NOT NULL,
    "customer_file_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "document_type" "ExpedienteDocumentType" NOT NULL,
    "status" "ExpedienteDocumentStatus" NOT NULL DEFAULT 'PENDIENTE',
    "notes" TEXT,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expediente_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_applications" (
    "id" TEXT NOT NULL,
    "customer_file_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "branch_id" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "financial_institution" TEXT,
    "credit_type" TEXT,
    "status" "CreditStatus" NOT NULL DEFAULT 'PENDIENTE',
    "amount" DECIMAL(12,2),
    "down_payment" DECIMAL(12,2),
    "term_months" INTEGER,
    "estimated_payment" DECIMAL(12,2),
    "currency" TEXT,
    "pending_items" TEXT,
    "observations" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotes_customer_file_id_key" ON "quotes"("customer_file_id");

-- CreateIndex
CREATE INDEX "quotes_branch_id_status_idx" ON "quotes"("branch_id", "status");

-- CreateIndex
CREATE INDEX "expediente_documents_customer_file_id_idx" ON "expediente_documents"("customer_file_id");

-- CreateIndex
CREATE INDEX "expediente_documents_branch_id_status_idx" ON "expediente_documents"("branch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "credit_applications_customer_file_id_key" ON "credit_applications"("customer_file_id");

-- CreateIndex
CREATE INDEX "credit_applications_branch_id_status_idx" ON "credit_applications"("branch_id", "status");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_file_id_fkey" FOREIGN KEY ("customer_file_id") REFERENCES "customer_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expediente_documents" ADD CONSTRAINT "expediente_documents_customer_file_id_fkey" FOREIGN KEY ("customer_file_id") REFERENCES "customer_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expediente_documents" ADD CONSTRAINT "expediente_documents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expediente_documents" ADD CONSTRAINT "expediente_documents_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_customer_file_id_fkey" FOREIGN KEY ("customer_file_id") REFERENCES "customer_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
