-- CreateEnum
CREATE TYPE "FinancialAuditDomain" AS ENUM ('CAJA', 'CONTABILIDAD');

-- CreateTable
CREATE TABLE "financial_audit_events" (
    "id" TEXT NOT NULL,
    "domain" "FinancialAuditDomain" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "entity_code" TEXT,
    "action" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_role" "UserRole" NOT NULL,
    "branch_id" TEXT,
    "reason" TEXT,
    "before_data" JSONB,
    "after_data" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_audit_events_domain_created_at_idx"
ON "financial_audit_events"("domain", "created_at");

-- CreateIndex
CREATE INDEX "financial_audit_events_entity_type_entity_id_created_at_idx"
ON "financial_audit_events"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "financial_audit_events_entity_type_entity_code_created_at_idx"
ON "financial_audit_events"("entity_type", "entity_code", "created_at");

-- CreateIndex
CREATE INDEX "financial_audit_events_actor_user_id_created_at_idx"
ON "financial_audit_events"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "financial_audit_events_branch_id_created_at_idx"
ON "financial_audit_events"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "financial_audit_events_created_at_idx"
ON "financial_audit_events"("created_at");

-- AddForeignKey
ALTER TABLE "financial_audit_events"
ADD CONSTRAINT "financial_audit_events_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_audit_events"
ADD CONSTRAINT "financial_audit_events_branch_id_fkey"
FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
