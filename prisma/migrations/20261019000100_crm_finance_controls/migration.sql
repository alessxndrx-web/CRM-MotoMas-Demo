-- AlterTable
ALTER TABLE "crm_finance_documents" ADD COLUMN     "cash_flow_class" TEXT,
ADD COLUMN     "fx_account_id" TEXT;

-- AddForeignKey
ALTER TABLE "crm_finance_documents" ADD CONSTRAINT "crm_finance_documents_fx_account_id_fkey" FOREIGN KEY ("fx_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE SEQUENCE crm_finance_voucher_seq;
DROP INDEX crm_supplier_invoice_unique;
CREATE UNIQUE INDEX crm_supplier_invoice_unique ON crm_finance_documents(third_party_id, reference) WHERE kind = 'PAYABLE_INVOICE' AND status <> 'REJECTED';
CREATE UNIQUE INDEX crm_bank_ledger_unique ON bank_accounts(ledger_account_id) WHERE ledger_account_id IS NOT NULL;
