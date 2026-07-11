-- CreateEnum
CREATE TYPE "MarketingChannel" AS ENUM ('FACEBOOK_ADS', 'INSTAGRAM_ADS', 'TIKTOK', 'WHATSAPP', 'WEBSITE', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MarketingCampaignObjective" AS ENUM ('LEADS', 'RESERVATIONS', 'SALES');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "marketing_campaign_id" TEXT,
ADD COLUMN     "utm_campaign" TEXT,
ADD COLUMN     "utm_content" TEXT,
ADD COLUMN     "utm_medium" TEXT,
ADD COLUMN     "utm_source" TEXT,
ADD COLUMN     "utm_term" TEXT;

-- CreateTable
CREATE TABLE "marketing_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "MarketingChannel" NOT NULL,
    "target_branch_id" TEXT,
    "motorcycle_slug" TEXT,
    "estimated_budget" DECIMAL(12,2),
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "objective" "MarketingCampaignObjective" NOT NULL,
    "description" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_campaigns_target_branch_id_status_idx" ON "marketing_campaigns"("target_branch_id", "status");

-- CreateIndex
CREATE INDEX "marketing_campaigns_created_by_id_idx" ON "marketing_campaigns"("created_by_id");

-- CreateIndex
CREATE INDEX "marketing_campaigns_starts_at_ends_at_idx" ON "marketing_campaigns"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "leads_marketing_campaign_id_idx" ON "leads"("marketing_campaign_id");

-- CreateIndex
CREATE INDEX "leads_origin_channel_idx" ON "leads"("origin_channel");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_marketing_campaign_id_fkey" FOREIGN KEY ("marketing_campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_target_branch_id_fkey" FOREIGN KEY ("target_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
