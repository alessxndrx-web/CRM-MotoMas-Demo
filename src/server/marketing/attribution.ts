import type { Prisma } from "@prisma/client";

import { campaignCoversBranch } from "@/server/marketing/shared";

/**
 * Patch CRM-INT3 — la regla de atribución de un lead a una campaña, en un solo
 * sitio.
 *
 * La usaban el alta pública, el alta manual y la ficha del lead (CRM-INT1 y
 * CRM-INT2, en `src/server/crm/actions.ts`); ahora también la entrada de Meta
 * Lead Ads y el vínculo de campañas de Meta. Vive fuera de los archivos
 * `"use server"` a propósito: exportada desde uno sería una acción invocable
 * desde el navegador.
 */

type Db = Prisma.TransactionClient;

/**
 * Las fechas de campaña son días del calendario guardados a medianoche UTC
 * mientras el negocio opera en UTC−6: se admite un día de margen a cada lado
 * para que un lead de la última noche no quede fuera por el huso horario.
 */
const ATTRIBUTION_MARGIN_MS = 24 * 60 * 60 * 1000;

type AttributableCampaign = {
  id: string;
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  branches: Array<{ branchId: string }>;
};

const attributableSelect = {
  id: true,
  status: true,
  startsAt: true,
  endsAt: true,
  branches: { select: { branchId: true } },
} as const;

/**
 * ¿Puede esta campaña quedarse con un lead de esta sucursal que llegó en este
 * momento?
 *
 * No está finalizada, cubre la sucursal (una campaña sin sucursales cubre
 * todas) y **el lead nació mientras estaba vigente** (CRM-INT2): anotar hoy la
 * campaña de un lead de hace meses fabricaría una atribución que ningún anuncio
 * produjo.
 */
function campaignAcceptsLead(
  campaign: AttributableCampaign,
  branchId: string,
  leadCreatedAt: Date,
): boolean {
  if (campaign.status === "COMPLETED") return false;
  if (!campaignCoversBranch(campaign.branches, branchId)) return false;
  const at = leadCreatedAt.getTime();
  if (at < campaign.startsAt.getTime() - ATTRIBUTION_MARGIN_MS) return false;
  // `endsAt` es el último día incluido: vale hasta el final de ese día.
  if (campaign.endsAt && at >= campaign.endsAt.getTime() + 2 * ATTRIBUTION_MARGIN_MS) {
    return false;
  }
  return true;
}

/**
 * La campaña a la que se atribuye un lead, validada. Devuelve `null` si no
 * cumple: quien llama decide si eso es un error (el panel) o se ignora sin
 * romper el alta (el portal, Meta).
 */
export async function resolveAttributableCampaign(
  db: Db,
  campaignId: string | null | undefined,
  branchId: string,
  leadCreatedAt: Date,
): Promise<string | null> {
  const id = campaignId?.trim();
  if (!id) return null;
  const campaign = await db.marketingCampaign.findUnique({
    where: { id },
    select: attributableSelect,
  });
  if (!campaign) return null;
  return campaignAcceptsLead(campaign, branchId, leadCreatedAt) ? campaign.id : null;
}

/**
 * Lo que Meta dice del anuncio que produjo un lead. Todos opcionales: un lead
 * orgánico no trae campaña, y un token sin permiso para leerlos tampoco.
 */
export type MetaAdAttribution = {
  metaCampaignId: string | null;
  metaCampaignName: string | null;
  metaAdsetId: string | null;
  metaAdId: string | null;
};

/**
 * La campaña de MotoMas vinculada al `campaign_id` de Meta, **si** esa campaña
 * puede quedarse con el lead. Sin vínculo, o con un vínculo a una campaña que no
 * cubre la sucursal o no estaba vigente, `null`: el lead entra igual, sin
 * campaña y con los datos de Meta guardados, y se atribuirá si alguien crea o
 * corrige el vínculo.
 */
export async function resolveMetaLinkedCampaign(
  db: Db,
  metaCampaignId: string | null,
  branchId: string,
  leadCreatedAt: Date,
): Promise<string | null> {
  if (!metaCampaignId) return null;
  const link = await db.marketingCampaignMetaLink.findUnique({
    where: { metaCampaignId },
    select: { campaignId: true },
  });
  if (!link) return null;
  return resolveAttributableCampaign(db, link.campaignId, branchId, leadCreatedAt);
}

/**
 * Al crear un vínculo, atribuye los leads que **ya** habían entrado con ese
 * `campaign_id` de Meta. Con la misma regla que los nuevos, y **sólo los que no
 * tienen campaña**: un lead que alguien ya atribuyó —por enlace, a mano o por
 * otro vínculo— no se toca.
 *
 * La condición `marketingCampaignId: null` va también en el `updateMany`: si un
 * lead se atribuye por otro camino entre la lectura y la escritura, no se pisa.
 */
export async function attributeExistingMetaLeads(
  tx: Db,
  input: { metaCampaignId: string; campaignId: string },
): Promise<{ attributed: number; outOfScope: number }> {
  const campaign = await tx.marketingCampaign.findUnique({
    where: { id: input.campaignId },
    select: attributableSelect,
  });
  if (!campaign) return { attributed: 0, outOfScope: 0 };
  const candidates = await tx.lead.findMany({
    where: { metaCampaignId: input.metaCampaignId, marketingCampaignId: null },
    select: { id: true, branchId: true, createdAt: true },
  });
  const eligible = candidates
    .filter((lead) => campaignAcceptsLead(campaign, lead.branchId, lead.createdAt))
    .map((lead) => lead.id);
  const updated = eligible.length
    ? await tx.lead.updateMany({
        where: { id: { in: eligible }, marketingCampaignId: null },
        data: { marketingCampaignId: campaign.id, campaignAttributionSource: "META_LEAD_ADS" },
      })
    : { count: 0 };
  return { attributed: updated.count, outOfScope: candidates.length - eligible.length };
}

/**
 * Al deshacer un vínculo, quita la campaña **sólo** a los leads que ese vínculo
 * atribuyó (origen `META_LEAD_ADS` y ese `campaign_id` de Meta). Los que
 * alguien corrigió a mano después conservan su campaña: esa decisión ya no es
 * del vínculo.
 */
export async function detachMetaLinkAttribution(
  tx: Db,
  input: { metaCampaignId: string; campaignId: string },
): Promise<number> {
  const updated = await tx.lead.updateMany({
    where: {
      metaCampaignId: input.metaCampaignId,
      marketingCampaignId: input.campaignId,
      campaignAttributionSource: "META_LEAD_ADS",
    },
    data: { marketingCampaignId: null, campaignAttributionSource: null },
  });
  return updated.count;
}
