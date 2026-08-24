-- Patch FF1.1 — Chart of accounts foundation.
--
-- Everything here is additive except one FK replacement (see the last block):
-- CREATE TYPE, ADD COLUMN with defaults, CREATE INDEX and ADD CONSTRAINT. No
-- column is dropped, renamed or retyped, and no row is deleted.
--
-- The two backfills exist because the new columns describe facts the previous
-- schema could not store. A populated catalogue would otherwise start with
-- every account at level 1 and every grouping account marked as postable.

-- CreateEnum
CREATE TYPE "ChartAccountOrigin" AS ENUM ('PLANTILLA', 'EMPRESA');

-- AlterTable
ALTER TABLE "chart_accounts" ADD COLUMN     "allows_branch_detail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allows_posting" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_user_id" TEXT,
ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "archived_by_user_id" TEXT,
ADD COLUMN     "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "effective_to" TIMESTAMP(3),
ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "origin" "ChartAccountOrigin" NOT NULL DEFAULT 'EMPRESA',
ADD COLUMN     "requires_cost_center" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "template_version" TEXT;

-- Backfill: materialize the depth every existing account already had through
-- `parent_id`. Recursive, so a catalogue of any depth is resolved in one pass.
WITH RECURSIVE tree AS (
    SELECT "id", 1 AS "depth"
    FROM "chart_accounts"
    WHERE "parent_id" IS NULL
  UNION ALL
    SELECT child."id", parent."depth" + 1
    FROM "chart_accounts" child
    JOIN tree parent ON child."parent_id" = parent."id"
)
UPDATE "chart_accounts" account
SET "level" = tree."depth"
FROM tree
WHERE account."id" = tree."id" AND account."level" <> tree."depth";

-- Backfill: an account that already has children is a grouping header, so it
-- must not keep the permissive default. Accounts without children keep
-- `allows_posting = true`, which is what the previous schema implied.
UPDATE "chart_accounts" parent
SET "allows_posting" = false
WHERE EXISTS (
  SELECT 1 FROM "chart_accounts" child WHERE child."parent_id" = parent."id"
);

-- CreateIndex
CREATE INDEX "chart_accounts_origin_is_active_idx" ON "chart_accounts"("origin", "is_active");

-- CreateIndex
CREATE INDEX "chart_accounts_level_code_idx" ON "chart_accounts"("level", "code");

-- AddForeignKey
ALTER TABLE "chart_accounts" ADD CONSTRAINT "chart_accounts_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_accounts" ADD CONSTRAINT "chart_accounts_archived_by_user_id_fkey" FOREIGN KEY ("archived_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropForeignKey / AddForeignKey: the tree FK moves from SET NULL to RESTRICT.
-- Chart accounts are never deleted; if one ever were, SET NULL would silently
-- promote its whole subtree to the root and destroy the hierarchy without a
-- single error. RESTRICT makes that impossible at the database level. The
-- statement is not destructive: it rewrites a constraint, not data.
ALTER TABLE "chart_accounts" DROP CONSTRAINT "chart_accounts_parent_id_fkey";

-- AddForeignKey
ALTER TABLE "chart_accounts" ADD CONSTRAINT "chart_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
