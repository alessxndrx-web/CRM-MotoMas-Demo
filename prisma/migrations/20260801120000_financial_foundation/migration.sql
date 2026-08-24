-- CreateEnum
CREATE TYPE "FinancialDocumentSeries" AS ENUM ('CAJA_FACTURA', 'CAJA_RECIBO', 'CAJA_NOTA_DEBITO', 'CAJA_NOTA_CREDITO', 'CONTABILIDAD_DOCUMENTO', 'CONTABILIDAD_ASIENTO', 'CONTABILIDAD_COMPROBANTE');

-- CreateEnum
CREATE TYPE "AccountMappingSetStatus" AS ENUM ('BORRADOR', 'ACTIVO', 'ARCHIVADO');

-- CreateEnum
CREATE TYPE "AccountingEventType" AS ENUM ('CAJA_FACTURA', 'CAJA_RECIBO', 'CAJA_NOTA_DEBITO', 'CAJA_NOTA_CREDITO', 'CAJA_CIERRE', 'DOCUMENTO_FACTURA', 'DOCUMENTO_NOTA_DEBITO', 'DOCUMENTO_NOTA_CREDITO', 'DOCUMENTO_RECIBO_OFICIAL_CAJA', 'GASTO', 'COMPROBANTE_INGRESO', 'COMPROBANTE_EGRESO', 'COMPROBANTE_CHEQUE', 'COMPROBANTE_TRANSFERENCIA', 'COMPROBANTE_REEMBOLSO', 'COMPROBANTE_AJUSTE', 'PLANILLA');

-- CreateEnum
CREATE TYPE "AccountingEventComponent" AS ENUM ('SUBTOTAL', 'RETENCION_1', 'RETENCION_2', 'ABONO_APLICADO', 'TOTAL', 'PAGO_EFECTIVO', 'PAGO_TRANSFERENCIA', 'PAGO_CHEQUE', 'PAGO_TARJETA', 'DIFERENCIA_SOBRANTE', 'DIFERENCIA_FALTANTE', 'PLANILLA_NETO', 'PLANILLA_DEDUCCIONES');

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" TEXT NOT NULL,
    "series" "FinancialDocumentSeries" NOT NULL,
    "branch_id" TEXT,
    "branch_key" TEXT NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "next_value" INTEGER NOT NULL DEFAULT 1,
    "last_number" TEXT,
    "last_issued_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_mapping_sets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AccountMappingSetStatus" NOT NULL DEFAULT 'BORRADOR',
    "branch_id" TEXT,
    "branch_key" TEXT NOT NULL,
    "active_branch_key" TEXT,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "activated_by_user_id" TEXT,
    "archived_by_user_id" TEXT,
    "activated_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_mapping_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_mapping_rules" (
    "id" TEXT NOT NULL,
    "set_id" TEXT NOT NULL,
    "event" "AccountingEventType" NOT NULL,
    "component" "AccountingEventComponent" NOT NULL,
    "debit_account_id" TEXT NOT NULL,
    "credit_account_id" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_mapping_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_sequences_branch_id_idx" ON "document_sequences"("branch_id");

-- CreateIndex
CREATE INDEX "document_sequences_series_is_active_idx" ON "document_sequences"("series", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_series_branch_key_fiscal_year_key" ON "document_sequences"("series", "branch_key", "fiscal_year");

-- CreateIndex
CREATE UNIQUE INDEX "account_mapping_sets_active_branch_key_key" ON "account_mapping_sets"("active_branch_key");

-- CreateIndex
CREATE INDEX "account_mapping_sets_branch_key_status_idx" ON "account_mapping_sets"("branch_key", "status");

-- CreateIndex
CREATE INDEX "account_mapping_sets_status_effective_from_idx" ON "account_mapping_sets"("status", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "account_mapping_sets_code_version_key" ON "account_mapping_sets"("code", "version");

-- CreateIndex
CREATE INDEX "account_mapping_rules_set_id_idx" ON "account_mapping_rules"("set_id");

-- CreateIndex
CREATE INDEX "account_mapping_rules_debit_account_id_idx" ON "account_mapping_rules"("debit_account_id");

-- CreateIndex
CREATE INDEX "account_mapping_rules_credit_account_id_idx" ON "account_mapping_rules"("credit_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_mapping_rules_set_id_event_component_key" ON "account_mapping_rules"("set_id", "event", "component");

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "account_mapping_sets" ADD CONSTRAINT "account_mapping_sets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "account_mapping_sets" ADD CONSTRAINT "account_mapping_sets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mapping_sets" ADD CONSTRAINT "account_mapping_sets_activated_by_user_id_fkey" FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mapping_sets" ADD CONSTRAINT "account_mapping_sets_archived_by_user_id_fkey" FOREIGN KEY ("archived_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mapping_rules" ADD CONSTRAINT "account_mapping_rules_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "account_mapping_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mapping_rules" ADD CONSTRAINT "account_mapping_rules_debit_account_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "account_mapping_rules" ADD CONSTRAINT "account_mapping_rules_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

