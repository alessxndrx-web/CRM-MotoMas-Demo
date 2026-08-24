-- CreateEnum
CREATE TYPE "CreditFinancingType" AS ENUM ('FINANCIERA_EXTERNA', 'CREDITO_INTERNO', 'OTRO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CreditStatus" ADD VALUE 'DOCUMENTACION_PENDIENTE';
ALTER TYPE "CreditStatus" ADD VALUE 'PREAPROBADO';

-- AlterEnum
ALTER TYPE "ExpedienteDocumentType" ADD VALUE 'LICENCIA';

-- AlterEnum
BEGIN;
CREATE TYPE "QuoteStatus_new" AS ENUM ('BORRADOR', 'EMITIDA', 'ACEPTADA', 'VENCIDA', 'CANCELADA');
ALTER TABLE "public"."quotes" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "quotes" ALTER COLUMN "status" TYPE "QuoteStatus_new" USING ("status"::text::"QuoteStatus_new");
ALTER TYPE "QuoteStatus" RENAME TO "QuoteStatus_old";
ALTER TYPE "QuoteStatus_new" RENAME TO "QuoteStatus";
DROP TYPE "public"."QuoteStatus_old";
ALTER TABLE "quotes" ALTER COLUMN "status" SET DEFAULT 'BORRADOR';
COMMIT;

-- AlterTable
ALTER TABLE "credit_applications" DROP COLUMN "credit_type",
ADD COLUMN     "financing_type" "CreditFinancingType",
ADD COLUMN     "requested_at" TIMESTAMP(3),
ADD COLUMN     "resolved_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "issued_at" TIMESTAMP(3),
ADD COLUMN     "quote_number" TEXT,
ADD COLUMN     "sale_type" "SaleType";

-- CreateIndex
CREATE UNIQUE INDEX "quotes_quote_number_key" ON "quotes"("quote_number");

