ALTER TABLE crm_finance_documents ADD COLUMN details JSONB;
ALTER TABLE crm_finance_policy ADD COLUMN tax_regime TEXT;
CREATE TABLE crm_receivable_basis (
 id TEXT PRIMARY KEY, receivable_id TEXT NOT NULL UNIQUE REFERENCES receivable_documents(id) ON DELETE RESTRICT,
 account_id TEXT NOT NULL REFERENCES chart_accounts(id) ON DELETE RESTRICT,
 currency TEXT NOT NULL CHECK(currency IN ('NIO','USD')), exchange_rate NUMERIC(18,6) NOT NULL CHECK(exchange_rate>0),
 carrying_amount NUMERIC(12,2) NOT NULL CHECK(carrying_amount>0), as_of DATE NOT NULL,
 evidence TEXT NOT NULL, approved_by_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE crm_bank_matches (
 id TEXT PRIMARY KEY, statement_id TEXT NOT NULL REFERENCES crm_bank_statement_lines(id) ON DELETE RESTRICT,
 line_id TEXT NOT NULL UNIQUE REFERENCES journal_entry_lines(id) ON DELETE RESTRICT, amount NUMERIC(12,2) NOT NULL CHECK(amount<>0)
);
CREATE INDEX crm_bank_matches_statement_id_idx ON crm_bank_matches(statement_id);
INSERT INTO crm_bank_matches(id,statement_id,line_id,amount)
 SELECT 'legacy-'||id,id,matched_line_id,amount FROM crm_bank_statement_lines WHERE matched_line_id IS NOT NULL;
CREATE TABLE crm_tax_rules (
 id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, regime TEXT NOT NULL,
 rate NUMERIC(8,4) NOT NULL CHECK(rate>=0 AND rate<=100),
 debit_account_id TEXT NOT NULL REFERENCES chart_accounts(id) ON DELETE RESTRICT,
 credit_account_id TEXT NOT NULL REFERENCES chart_accounts(id) ON DELETE RESTRICT,
 effective_from DATE NOT NULL, effective_to DATE, evidence TEXT NOT NULL,
 created_by_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (effective_to IS NULL OR effective_to>=effective_from), CHECK(debit_account_id<>credit_account_id)
);
CREATE UNIQUE INDEX crm_tax_rules_code_effective_from_key ON crm_tax_rules(code,effective_from);
CREATE UNIQUE INDEX crm_year_end_unique ON crm_finance_documents(branch_id,period) WHERE kind='YEAR_END' AND status='POSTED';
CREATE UNIQUE INDEX crm_opening_unique ON crm_finance_documents(branch_id) WHERE kind='OPENING' AND status='POSTED';
