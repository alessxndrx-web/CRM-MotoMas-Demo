-- CreateEnum
CREATE TYPE "AccountingDocumentType" AS ENUM ('FACTURA', 'NOTA_DEBITO', 'NOTA_CREDITO', 'RECIBO_OFICIAL_CAJA');

-- CreateEnum
CREATE TYPE "AccountingDocumentStatus" AS ENUM ('BORRADOR', 'EMITIDO', 'REVISADO', 'CONTABILIZADO', 'CONCILIADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "AccountingDocumentOrigin" AS ENUM ('CAJA', 'CONTABILIDAD');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('BORRADOR', 'CONTABILIZADO', 'CONCILIADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "JournalEntrySource" AS ENUM ('MANUAL', 'DOCUMENTO', 'CAJA');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO', 'COSTO');

-- CreateEnum
CREATE TYPE "AccountNature" AS ENUM ('DEUDORA', 'ACREEDORA');

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('INGRESO', 'EGRESO', 'CHEQUE', 'TRANSFERENCIA', 'REEMBOLSO', 'AJUSTE');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('REGISTRADO', 'CONCILIADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('COMBUSTIBLE', 'COMPRAS_VARIAS', 'SERVICIOS_BASICOS', 'MANTENIMIENTO', 'PAPELERIA', 'VIATICOS', 'REPUESTOS_INTERNOS', 'GASTOS_ADMINISTRATIVOS', 'OTROS');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('REGISTRADO', 'REVISADO');

-- CreateEnum
CREATE TYPE "BankReconciliationStatus" AS ENUM ('PENDIENTE', 'CONCILIADO', 'DIFERENCIA', 'ANULADO');

-- CreateEnum
CREATE TYPE "AccountingClosingStatus" AS ENUM ('ABIERTO', 'EN_REVISION', 'CERRADO', 'REABIERTO');

-- CreateEnum
CREATE TYPE "ThirdPartyType" AS ENUM ('CLIENTE', 'PROVEEDOR', 'EMPLEADO');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('BORRADOR', 'PREPARADA', 'PAGADA');

-- CreateTable
CREATE TABLE "chart_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "nature" "AccountNature" NOT NULL,
    "parent_id" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chart_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "third_parties" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "type" "ThirdPartyType" NOT NULL,
    "name" TEXT NOT NULL,
    "tax_id" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "third_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_documents" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "third_party_id" TEXT,
    "cash_document_id" TEXT,
    "cash_closing_id" TEXT,
    "sale_id" TEXT,
    "reservation_id" TEXT,
    "customer_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "reviewed_by_user_id" TEXT,
    "posted_by_user_id" TEXT,
    "reconciled_by_user_id" TEXT,
    "cancelled_by_user_id" TEXT,
    "type" "AccountingDocumentType" NOT NULL,
    "status" "AccountingDocumentStatus" NOT NULL DEFAULT 'BORRADOR',
    "origin" "AccountingDocumentOrigin" NOT NULL DEFAULT 'CONTABILIDAD',
    "document_number" TEXT NOT NULL,
    "document_date" TIMESTAMP(3) NOT NULL,
    "third_party_name" TEXT NOT NULL,
    "tax_id" TEXT,
    "concept" TEXT NOT NULL,
    "source_document" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "retention_1" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "retention_2" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "applied_payment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT,
    "payment_method" TEXT,
    "bank" TEXT,
    "reference" TEXT,
    "motorcycle_description" TEXT[],
    "notes" TEXT,
    "accounting_notes" TEXT,
    "cancel_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "posted_at" TIMESTAMP(3),
    "reconciled_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT,
    "accounting_document_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "posted_by_user_id" TEXT,
    "entry_number" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'BORRADOR',
    "source" "JournalEntrySource" NOT NULL DEFAULT 'MANUAL',
    "invoice_number" TEXT,
    "customer_code" TEXT,
    "supplier" TEXT,
    "tax_id" TEXT,
    "tax_base" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bank" TEXT,
    "bank_payment_reference" TEXT,
    "reconciliation" TEXT,
    "retention" TEXT,
    "retention_date" TIMESTAMP(3),
    "refund" TEXT,
    "notes" TEXT,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry_lines" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "concept" TEXT,
    "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_vouchers" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "account_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "type" "VoucherType" NOT NULL,
    "status" "VoucherStatus" NOT NULL DEFAULT 'REGISTRADO',
    "voucher_number" TEXT NOT NULL,
    "voucher_date" TIMESTAMP(3) NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "bank" TEXT,
    "reference" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "account_id" TEXT,
    "voucher_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "reviewed_by_user_id" TEXT,
    "category" "ExpenseCategory" NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'REGISTRADO',
    "expense_date" TIMESTAMP(3) NOT NULL,
    "supplier" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "tax_id" TEXT,
    "invoice_number" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "retention_1" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "retention_2" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT,
    "bank" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_records" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "employee_name" TEXT NOT NULL,
    "position" TEXT,
    "period" TEXT NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'BORRADOR',
    "base_salary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commissions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonuses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "advances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_pay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_inventory_costs" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "catalog_model_id" TEXT,
    "model_slug" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "minimum_stock" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_inventory_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NIO',
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliations" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "accounting_document_id" TEXT,
    "reconciled_by_user_id" TEXT,
    "status" "BankReconciliationStatus" NOT NULL DEFAULT 'PENDIENTE',
    "movement_date" TIMESTAMP(3) NOT NULL,
    "related_document" TEXT,
    "payment_method" TEXT,
    "reference" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT,
    "notes" TEXT,
    "reconciled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_closings" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "closed_by_user_id" TEXT,
    "reviewed_by_user_id" TEXT,
    "period" TEXT NOT NULL,
    "status" "AccountingClosingStatus" NOT NULL DEFAULT 'ABIERTO',
    "income_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expense_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "retention_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "applied_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cash_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "difference" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT,
    "notes" TEXT,
    "closed_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reopened_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_closings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chart_accounts_code_key" ON "chart_accounts"("code");

-- CreateIndex
CREATE INDEX "chart_accounts_type_nature_idx" ON "chart_accounts"("type", "nature");

-- CreateIndex
CREATE INDEX "chart_accounts_parent_id_idx" ON "chart_accounts"("parent_id");

-- CreateIndex
CREATE INDEX "third_parties_branch_id_type_idx" ON "third_parties"("branch_id", "type");

-- CreateIndex
CREATE INDEX "third_parties_tax_id_idx" ON "third_parties"("tax_id");

-- CreateIndex
CREATE INDEX "third_parties_customer_id_idx" ON "third_parties"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_documents_document_number_key" ON "accounting_documents"("document_number");

-- CreateIndex
CREATE INDEX "accounting_documents_branch_id_status_idx" ON "accounting_documents"("branch_id", "status");

-- CreateIndex
CREATE INDEX "accounting_documents_status_type_idx" ON "accounting_documents"("status", "type");

-- CreateIndex
CREATE INDEX "accounting_documents_document_date_idx" ON "accounting_documents"("document_date");

-- CreateIndex
CREATE INDEX "accounting_documents_origin_idx" ON "accounting_documents"("origin");

-- CreateIndex
CREATE INDEX "accounting_documents_cash_document_id_idx" ON "accounting_documents"("cash_document_id");

-- CreateIndex
CREATE INDEX "accounting_documents_third_party_id_idx" ON "accounting_documents"("third_party_id");

-- CreateIndex
CREATE INDEX "accounting_documents_created_by_user_id_idx" ON "accounting_documents"("created_by_user_id");

-- CreateIndex
CREATE INDEX "accounting_documents_reviewed_by_user_id_idx" ON "accounting_documents"("reviewed_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_entry_number_key" ON "journal_entries"("entry_number");

-- CreateIndex
CREATE INDEX "journal_entries_branch_id_status_idx" ON "journal_entries"("branch_id", "status");

-- CreateIndex
CREATE INDEX "journal_entries_entry_date_idx" ON "journal_entries"("entry_date");

-- CreateIndex
CREATE INDEX "journal_entries_status_source_idx" ON "journal_entries"("status", "source");

-- CreateIndex
CREATE INDEX "journal_entries_accounting_document_id_idx" ON "journal_entries"("accounting_document_id");

-- CreateIndex
CREATE INDEX "journal_entries_created_by_user_id_idx" ON "journal_entries"("created_by_user_id");

-- CreateIndex
CREATE INDEX "journal_entry_lines_entry_id_position_idx" ON "journal_entry_lines"("entry_id", "position");

-- CreateIndex
CREATE INDEX "journal_entry_lines_account_id_idx" ON "journal_entry_lines"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_vouchers_voucher_number_key" ON "accounting_vouchers"("voucher_number");

-- CreateIndex
CREATE INDEX "accounting_vouchers_branch_id_status_idx" ON "accounting_vouchers"("branch_id", "status");

-- CreateIndex
CREATE INDEX "accounting_vouchers_type_status_idx" ON "accounting_vouchers"("type", "status");

-- CreateIndex
CREATE INDEX "accounting_vouchers_voucher_date_idx" ON "accounting_vouchers"("voucher_date");

-- CreateIndex
CREATE INDEX "accounting_vouchers_created_by_user_id_idx" ON "accounting_vouchers"("created_by_user_id");

-- CreateIndex
CREATE INDEX "expenses_branch_id_status_idx" ON "expenses"("branch_id", "status");

-- CreateIndex
CREATE INDEX "expenses_category_status_idx" ON "expenses"("category", "status");

-- CreateIndex
CREATE INDEX "expenses_expense_date_idx" ON "expenses"("expense_date");

-- CreateIndex
CREATE INDEX "expenses_voucher_id_idx" ON "expenses"("voucher_id");

-- CreateIndex
CREATE INDEX "expenses_created_by_user_id_idx" ON "expenses"("created_by_user_id");

-- CreateIndex
CREATE INDEX "payroll_records_branch_id_status_idx" ON "payroll_records"("branch_id", "status");

-- CreateIndex
CREATE INDEX "payroll_records_period_idx" ON "payroll_records"("period");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_records_branch_id_period_employee_name_key" ON "payroll_records"("branch_id", "period", "employee_name");

-- CreateIndex
CREATE INDEX "accounting_inventory_costs_catalog_model_id_idx" ON "accounting_inventory_costs"("catalog_model_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_inventory_costs_branch_id_model_slug_key" ON "accounting_inventory_costs"("branch_id", "model_slug");

-- CreateIndex
CREATE INDEX "bank_accounts_branch_id_is_active_idx" ON "bank_accounts"("branch_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_bank_name_account_number_key" ON "bank_accounts"("bank_name", "account_number");

-- CreateIndex
CREATE INDEX "bank_reconciliations_branch_id_status_idx" ON "bank_reconciliations"("branch_id", "status");

-- CreateIndex
CREATE INDEX "bank_reconciliations_bank_account_id_status_idx" ON "bank_reconciliations"("bank_account_id", "status");

-- CreateIndex
CREATE INDEX "bank_reconciliations_movement_date_idx" ON "bank_reconciliations"("movement_date");

-- CreateIndex
CREATE INDEX "bank_reconciliations_accounting_document_id_idx" ON "bank_reconciliations"("accounting_document_id");

-- CreateIndex
CREATE INDEX "accounting_closings_branch_id_status_idx" ON "accounting_closings"("branch_id", "status");

-- CreateIndex
CREATE INDEX "accounting_closings_period_idx" ON "accounting_closings"("period");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_closings_branch_id_period_key" ON "accounting_closings"("branch_id", "period");

-- AddForeignKey
ALTER TABLE "chart_accounts" ADD CONSTRAINT "chart_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "chart_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "third_parties" ADD CONSTRAINT "third_parties_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "third_parties" ADD CONSTRAINT "third_parties_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_documents" ADD CONSTRAINT "accounting_documents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_documents" ADD CONSTRAINT "accounting_documents_third_party_id_fkey" FOREIGN KEY ("third_party_id") REFERENCES "third_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_documents" ADD CONSTRAINT "accounting_documents_cash_document_id_fkey" FOREIGN KEY ("cash_document_id") REFERENCES "cash_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_documents" ADD CONSTRAINT "accounting_documents_cash_closing_id_fkey" FOREIGN KEY ("cash_closing_id") REFERENCES "cash_closings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_documents" ADD CONSTRAINT "accounting_documents_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_documents" ADD CONSTRAINT "accounting_documents_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_documents" ADD CONSTRAINT "accounting_documents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_documents" ADD CONSTRAINT "accounting_documents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_documents" ADD CONSTRAINT "accounting_documents_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_documents" ADD CONSTRAINT "accounting_documents_posted_by_user_id_fkey" FOREIGN KEY ("posted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_documents" ADD CONSTRAINT "accounting_documents_reconciled_by_user_id_fkey" FOREIGN KEY ("reconciled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_documents" ADD CONSTRAINT "accounting_documents_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_accounting_document_id_fkey" FOREIGN KEY ("accounting_document_id") REFERENCES "accounting_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_user_id_fkey" FOREIGN KEY ("posted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_vouchers" ADD CONSTRAINT "accounting_vouchers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_vouchers" ADD CONSTRAINT "accounting_vouchers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_vouchers" ADD CONSTRAINT "accounting_vouchers_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "accounting_vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_inventory_costs" ADD CONSTRAINT "accounting_inventory_costs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_inventory_costs" ADD CONSTRAINT "accounting_inventory_costs_catalog_model_id_fkey" FOREIGN KEY ("catalog_model_id") REFERENCES "motorcycle_catalog_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_accounting_document_id_fkey" FOREIGN KEY ("accounting_document_id") REFERENCES "accounting_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_reconciled_by_user_id_fkey" FOREIGN KEY ("reconciled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_closings" ADD CONSTRAINT "accounting_closings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_closings" ADD CONSTRAINT "accounting_closings_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_closings" ADD CONSTRAINT "accounting_closings_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
