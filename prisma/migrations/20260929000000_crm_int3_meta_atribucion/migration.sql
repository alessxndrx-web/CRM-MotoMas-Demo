-- Patch CRM-INT3 — atribución de Meta Lead Ads a campañas de MotoMas.
--
-- Aditiva. No escribe ni corrige ninguna fila existente:
--
-- * `leads.campaign_attribution_source` queda NULL en todos los leads de antes:
--   no se sabe por qué camino llegó su campaña y no se inventa.
-- * `leads.meta_*` y `meta_unmapped_leads.meta_*` quedan NULL en lo anterior:
--   Meta no guardó esos datos en su momento y no se vuelven a pedir.
-- * `marketing_campaign_meta_links` nace vacía: el vínculo lo crea una persona
--   desde el detalle de la campaña (docs/META_INTEGRATIONS.md §3.1).
--
-- La deriva previa de `pos_sales_operator_id_idx` y `pos_sales_warehouse_id_idx`
-- (índices creados por migraciones y no declarados en el esquema) NO se toca
-- aquí: no es de este parche.

-- CreateEnum
CREATE TYPE "CampaignAttributionSource" AS ENUM ('ENLACE_CAMPANA', 'REGISTRO_MANUAL', 'META_LEAD_ADS');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "campaign_attribution_source" "CampaignAttributionSource",
ADD COLUMN     "meta_ad_id" TEXT,
ADD COLUMN     "meta_adset_id" TEXT,
ADD COLUMN     "meta_campaign_id" TEXT,
ADD COLUMN     "meta_campaign_name" TEXT,
ADD COLUMN     "meta_form_id" TEXT;

-- AlterTable
ALTER TABLE "meta_unmapped_leads" ADD COLUMN     "meta_ad_id" TEXT,
ADD COLUMN     "meta_adset_id" TEXT,
ADD COLUMN     "meta_campaign_id" TEXT,
ADD COLUMN     "meta_campaign_name" TEXT;

-- CreateTable
CREATE TABLE "marketing_campaign_meta_links" (
    "meta_campaign_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "label" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_campaign_meta_links_pkey" PRIMARY KEY ("meta_campaign_id")
);

-- CreateIndex
CREATE INDEX "marketing_campaign_meta_links_campaign_id_idx" ON "marketing_campaign_meta_links"("campaign_id");

-- CreateIndex
CREATE INDEX "leads_meta_campaign_id_idx" ON "leads"("meta_campaign_id");

-- AddForeignKey
ALTER TABLE "marketing_campaign_meta_links" ADD CONSTRAINT "marketing_campaign_meta_links_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaign_meta_links" ADD CONSTRAINT "marketing_campaign_meta_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Un origen de atribución sin campaña no significa nada; una atribución por
-- Meta sin el `campaign_id` de Meta no se podría deshacer al desvincular.
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_attribution_source_check"
  CHECK (
    "campaign_attribution_source" IS NULL
    OR (
      "marketing_campaign_id" IS NOT NULL
      AND ("campaign_attribution_source" <> 'META_LEAD_ADS' OR "meta_campaign_id" IS NOT NULL)
    )
  );
