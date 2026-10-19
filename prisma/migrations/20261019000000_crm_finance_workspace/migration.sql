-- CreateEnum
CREATE TYPE "CrmFinanceKind" AS ENUM ('PAYABLE_INVOICE', 'PAYABLE_PAYMENT', 'RECEIVABLE_COLLECTION', 'BANK_IN', 'BANK_OUT', 'CASH_IN', 'CASH_OUT', 'ASSET_ACQUISITION', 'DEPRECIATION', 'TAX', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CrmFinanceStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'POSTED', 'REVERSED', 'REJECTED');

-- AlterTable
ALTER TABLE "cash_sessions" ADD COLUMN     "crm_counted_amount" DECIMAL(12,2),
ADD COLUMN     "crm_denominations" JSONB,
ADD COLUMN     "crm_expected_amount" DECIMAL(12,2),
ADD COLUMN     "crm_register_id" TEXT;

-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "ledger_account_id" TEXT;

-- CreateTable
CREATE TABLE "crm_finance_documents" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "request_key" TEXT NOT NULL,
    "kind" "CrmFinanceKind" NOT NULL,
    "status" "CrmFinanceStatus" NOT NULL DEFAULT 'DRAFT',
    "branch_id" TEXT NOT NULL,
    "third_party_id" TEXT,
    "parent_id" TEXT,
    "receivable_id" TEXT,
    "bank_account_id" TEXT,
    "cash_session_id" TEXT,
    "debit_account_id" TEXT NOT NULL,
    "credit_account_id" TEXT NOT NULL,
    "journal_entry_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "date" DATE NOT NULL,
    "due_date" DATE,
    "currency" TEXT NOT NULL,
    "exchange_rate" DECIMAL(18,6) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "base_amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "useful_life_months" INTEGER,
    "residual_amount" DECIMAL(12,2),
    "period" TEXT,
    "tax_base" DECIMAL(12,2),
    "tax_rate" DECIMAL(8,4),
    "certificate" TEXT,
    "attachment_url" TEXT,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_finance_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_cash_registers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NIO',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "crm_cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_bank_statement_lines" (
    "id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "matched_line_id" TEXT,
    "matched_by_id" TEXT,
    "matched_at" TIMESTAMP(3),

    CONSTRAINT "crm_bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_finance_policy" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "company_name" TEXT NOT NULL,
    "tax_id" TEXT NOT NULL,
    "functional_currency" TEXT NOT NULL,
    "require_separation" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_finance_policy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_finance_documents_number_key" ON "crm_finance_documents"("number");

-- CreateIndex
CREATE UNIQUE INDEX "crm_finance_documents_request_key_key" ON "crm_finance_documents"("request_key");

-- CreateIndex
CREATE UNIQUE INDEX "crm_finance_documents_journal_entry_id_key" ON "crm_finance_documents"("journal_entry_id");

-- CreateIndex
CREATE INDEX "crm_finance_documents_branch_id_date_status_idx" ON "crm_finance_documents"("branch_id", "date", "status");

-- CreateIndex
CREATE INDEX "crm_finance_documents_parent_id_status_idx" ON "crm_finance_documents"("parent_id", "status");

-- CreateIndex
CREATE INDEX "crm_finance_documents_receivable_id_idx" ON "crm_finance_documents"("receivable_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_cash_registers_account_id_key" ON "crm_cash_registers"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_cash_registers_branch_id_name_key" ON "crm_cash_registers"("branch_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "crm_bank_statement_lines_matched_line_id_key" ON "crm_bank_statement_lines"("matched_line_id");

-- CreateIndex
CREATE INDEX "crm_bank_statement_lines_bank_account_id_date_idx" ON "crm_bank_statement_lines"("bank_account_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "crm_bank_statement_lines_bank_account_id_external_id_key" ON "crm_bank_statement_lines"("bank_account_id", "external_id");

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_crm_register_id_fkey" FOREIGN KEY ("crm_register_id") REFERENCES "crm_cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_ledger_account_id_fkey" FOREIGN KEY ("ledger_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_finance_documents" ADD CONSTRAINT "crm_finance_documents_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_finance_documents" ADD CONSTRAINT "crm_finance_documents_third_party_id_fkey" FOREIGN KEY ("third_party_id") REFERENCES "third_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_finance_documents" ADD CONSTRAINT "crm_finance_documents_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "crm_finance_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_finance_documents" ADD CONSTRAINT "crm_finance_documents_receivable_id_fkey" FOREIGN KEY ("receivable_id") REFERENCES "receivable_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_finance_documents" ADD CONSTRAINT "crm_finance_documents_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_finance_documents" ADD CONSTRAINT "crm_finance_documents_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_finance_documents" ADD CONSTRAINT "crm_finance_documents_debit_account_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_finance_documents" ADD CONSTRAINT "crm_finance_documents_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_finance_documents" ADD CONSTRAINT "crm_finance_documents_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_finance_documents" ADD CONSTRAINT "crm_finance_documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_finance_documents" ADD CONSTRAINT "crm_finance_documents_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_cash_registers" ADD CONSTRAINT "crm_cash_registers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_cash_registers" ADD CONSTRAINT "crm_cash_registers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_bank_statement_lines" ADD CONSTRAINT "crm_bank_statement_lines_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_bank_statement_lines" ADD CONSTRAINT "crm_bank_statement_lines_matched_line_id_fkey" FOREIGN KEY ("matched_line_id") REFERENCES "journal_entry_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The new workspace adds no POS trigger or dependency.
CREATE UNIQUE INDEX crm_register_one_open ON cash_sessions(crm_register_id) WHERE status = 'ABIERTO' AND crm_register_id IS NOT NULL;
CREATE UNIQUE INDEX crm_supplier_invoice_unique ON crm_finance_documents(third_party_id, reference) WHERE kind = 'PAYABLE_INVOICE';
CREATE UNIQUE INDEX crm_asset_month_unique ON crm_finance_documents(parent_id, period) WHERE kind = 'DEPRECIATION' AND status = 'POSTED';
ALTER TABLE crm_finance_documents ADD CONSTRAINT crm_document_positive CHECK (amount > 0 AND base_amount > 0 AND exchange_rate > 0 AND currency IN ('NIO','USD') AND debit_account_id <> credit_account_id);
ALTER TABLE crm_finance_documents ADD CONSTRAINT crm_document_posting_link CHECK ((status IN ('POSTED','REVERSED')) = (journal_entry_id IS NOT NULL));
CREATE FUNCTION protect_crm_finance_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('POSTED','REVERSED') THEN
   IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Posted CRM documents cannot be deleted'; END IF;
   IF (to_jsonb(NEW) - ARRAY['status','rejection_reason','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','rejection_reason','updated_at']) OR NOT (OLD.status='POSTED' AND NEW.status='REVERSED') THEN
     RAISE EXCEPTION 'Posted CRM documents are immutable; use a linked reversal';
   END IF;
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_document_immutable BEFORE UPDATE OR DELETE ON crm_finance_documents FOR EACH ROW EXECUTE FUNCTION protect_crm_finance_document();
