import { Prisma } from "@prisma/client";

import { generateCrmCode } from "@/server/crm/codes";
import { getPrisma } from "@/server/db/prisma";
import {
  resolveMetaLinkedCampaign,
  type MetaAdAttribution,
} from "@/server/marketing/attribution";
import { logMetaInfo, logMetaWarn } from "@/server/meta/log";
import {
  checkMetaLeadCompleteness,
  mapMetaLeadFields,
  metaOriginChannel,
  type MetaLeadFieldEntry,
  type MetaLeadgenDetail,
} from "@/server/meta/shared";
import {
  getMetaPageAccessToken,
  type MetaLeadgenChangeValue,
} from "@/server/meta/webhook";

/**
 * Captación de un lead de Meta Lead Ads.
 *
 * ## Lo que el webhook NO trae
 *
 * La entrega del webhook contiene `leadgen_id`, `page_id`, `form_id` y la fecha.
 * **No trae el nombre, el teléfono ni el correo.** Tratar ese payload como si
 * fueran los datos del lead es el error habitual de esta integración y produce
 * leads vacíos sin que nada falle. Las respuestas hay que ir a buscarlas al
 * Graph API con el token de página.
 *
 * ## Dónde termina cada lead
 *
 * Con la página mapeada a una sucursal activa, nace un `Lead`. Sin mapeo, nace
 * una fila en el andén (`MetaUnmappedLead`) con las respuestas ya traídas. Nunca
 * se descarta y nunca se le adivina una sucursal: son 14 y el payload no sabe
 * cuál.
 *
 * No hay reconciliación automática — mapear una página nueva no reprocesa el
 * andén. La resolución es manual, una fila a la vez, desde el panel.
 *
 * ## La campaña (Patch CRM-INT3)
 *
 * Además de las respuestas se piden `campaign_id`, `campaign_name`,
 * `adset_id` y `ad_id`, y se guardan en el lead **tal cual**, haya o no
 * campaña de MotoMas para ellos. Si Marketing vinculó esa campaña de Meta a
 * una campaña de MotoMas (`MarketingCampaignMetaLink`) y ésta cubre la
 * sucursal y estaba vigente cuando se llenó el formulario, el lead nace
 * atribuido (`campaignAttributionSource = META_LEAD_ADS`). Si no, nace sin
 * campaña y el vínculo que se cree después lo atribuirá con la misma regla.
 *
 * Pedir esos campos no puede costar un lead: si el Graph API rechaza la
 * petición completa (un token sin permiso sobre los anuncios), se repite con
 * los campos de siempre y el lead entra sin atribución.
 */

/**
 * Versión del Graph API contra la que se llama. Fijada a propósito: Meta cambia
 * la forma de las respuestas entre versiones y una versión flotante rompería la
 * captación sin un despliegue de por medio. Al subirla, revisar `field_data`.
 */
const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_HOST = "https://graph.facebook.com";

/** Campos que se le piden al nodo del lead. `field_data` es el que importa. */
const LEADGEN_FIELDS = "id,created_time,form_id,platform,field_data";
/** Patch CRM-INT3 — el anuncio de origen. Se piden junto a los de arriba. */
const ATTRIBUTION_FIELDS = "campaign_id,campaign_name,adset_id,ad_id";

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export type MetaIngestOutcome =
  | { status: "lead-created"; leadId: string; branchId: string }
  | { status: "lead-duplicate"; leadId: string }
  | { status: "staged"; stagedId: string; reason: MetaStagedReason }
  | { status: "staged-duplicate"; stagedId: string };

/** Por qué un lead acabó en el andén en vez de ser un `Lead`. */
export type MetaStagedReason = "pagina-no-mapeada" | "campos-incompletos";

function isFieldEntryArray(value: unknown): value is MetaLeadFieldEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { name?: unknown }).name === "string",
    )
  );
}

/**
 * Trae el nodo del lead. Lanza si Meta responde mal: un fallo aquí es
 * recuperable reintentando, y la ruta lo convierte en un 500 para que Meta
 * reenvíe la entrega en vez de perder el lead.
 */
export async function fetchLeadgenDetail(
  leadgenId: string,
): Promise<MetaLeadgenDetail> {
  const token = getMetaPageAccessToken();
  const request = (fields: string) => {
    const url = new URL(`${GRAPH_API_HOST}/${GRAPH_API_VERSION}/${leadgenId}`);
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", token);
    return fetch(url, { method: "GET" });
  };

  let response = await request(`${LEADGEN_FIELDS},${ATTRIBUTION_FIELDS}`);
  if (!response.ok) {
    // Patch CRM-INT3. La atribución es un extra: sin permiso para leerla, el
    // lead se trae igual con los campos de siempre.
    logMetaWarn("el Graph API rechazó los campos de atribución; se reintenta sin ellos", {
      leadgenId,
      estado: response.status,
    });
    response = await request(LEADGEN_FIELDS);
  }
  if (!response.ok) {
    // El cuerpo de error de Meta puede repetir el token; sólo se propaga el
    // estado, que es lo que distingue "token vencido" de "lead caducado".
    throw new Error(
      `El Graph API respondió ${response.status} al leer el lead ${leadgenId}.`,
    );
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) {
    throw new Error(`Respuesta ilegible del Graph API para el lead ${leadgenId}.`);
  }

  const record = body as Record<string, unknown>;
  const fieldData = isFieldEntryArray(record.field_data) ? record.field_data : [];

  return {
    id: typeof record.id === "string" ? record.id : leadgenId,
    created_time:
      typeof record.created_time === "string" ? record.created_time : undefined,
    form_id: typeof record.form_id === "string" ? record.form_id : undefined,
    platform: typeof record.platform === "string" ? record.platform : undefined,
    field_data: fieldData,
    campaign_id: optionalString(record.campaign_id),
    campaign_name: optionalString(record.campaign_name),
    adset_id: optionalString(record.adset_id),
    ad_id: optionalString(record.ad_id),
  };
}

/**
 * Patch CRM-INT3 — la atribución de un lead de Meta: la del Graph API y, para
 * anuncio y conjunto, la de la entrega del webhook si aquélla no vino. La
 * campaña no se deduce de nada: si el Graph API no la dio, no la hay.
 */
function attributionFrom(
  detail: MetaLeadgenDetail,
  event: MetaLeadgenChangeValue,
): MetaAdAttribution {
  return {
    metaCampaignId: detail.campaign_id ?? null,
    metaCampaignName: detail.campaign_name?.slice(0, 200) ?? null,
    metaAdsetId: detail.adset_id ?? event.adgroup_id ?? null,
    metaAdId: detail.ad_id ?? event.ad_id ?? null,
  };
}

/** Cuándo se llenó el formulario según Meta; si no lo dice, ahora. */
function submittedAt(detail: MetaLeadgenDetail): Date {
  const parsed = detail.created_time ? new Date(detail.created_time) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

/**
 * Crea el `Lead`. Resuelve el reenvío de Meta igual que el cobro del mostrador
 * resuelve el suyo: dos entregas de la misma `leadgen_id` pueden pasar las dos
 * por la lectura previa, el índice único deja pasar a una y aborta la otra, y
 * quien pierde relee la que ganó — quería exactamente lo mismo.
 */
export async function createLeadFromMetaFields(input: {
  leadgenId: string;
  branchId: string;
  fieldData: MetaLeadFieldEntry[];
  platform: string | undefined;
  /** Patch CRM-INT3 — el anuncio de origen, y cuándo se llenó el formulario. */
  attribution: MetaAdAttribution;
  formId: string | null;
  submittedAt: Date;
}): Promise<
  | { ok: true; leadId: string; marketingCampaignId: string | null }
  | { ok: false; missing: string[] }
> {
  const mapped = mapMetaLeadFields(input.fieldData);
  if (mapped.unknownFields.length) {
    // Un formulario personalizado puede preguntar lo que quiera. Se registran y
    // se omiten: perder una pregunta suelta es mejor que perder el lead entero.
    logMetaInfo("campos del formulario sin equivalencia en Lead", {
      leadgenId: input.leadgenId,
      campos: mapped.unknownFields,
    });
  }

  const complete = checkMetaLeadCompleteness(mapped);
  if (!complete.ok) return { ok: false, missing: complete.missing };

  const prisma = getPrisma();
  const marketingCampaignId = await resolveMetaLinkedCampaign(
    prisma,
    input.attribution.metaCampaignId,
    input.branchId,
    input.submittedAt,
  );
  try {
    const lead = await prisma.lead.create({
      data: {
        trackingCode: generateCrmCode("SOL"),
        name: complete.name,
        phone: complete.phone,
        email: complete.email,
        branchId: input.branchId,
        originChannel: metaOriginChannel(input.platform),
        status: "NUEVO_LEAD",
        metaLeadgenId: input.leadgenId,
        // utmSource/utmCampaign se quedan en null a propósito: `campaign_id` y
        // `campaign_name` de Meta son de Meta Ads, no son UTMs. Van en sus
        // columnas propias, y la campaña de MotoMas sólo sale de un vínculo
        // que una persona eligió (Patch CRM-INT3).
        metaCampaignId: input.attribution.metaCampaignId,
        metaCampaignName: input.attribution.metaCampaignName,
        metaAdsetId: input.attribution.metaAdsetId,
        metaAdId: input.attribution.metaAdId,
        metaFormId: input.formId,
        marketingCampaignId,
        campaignAttributionSource: marketingCampaignId ? "META_LEAD_ADS" : null,
      },
      select: { id: true },
    });
    return { ok: true, leadId: lead.id, marketingCampaignId };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await prisma.lead.findUnique({
        where: { metaLeadgenId: input.leadgenId },
        select: { id: true, marketingCampaignId: true },
      });
      if (winner) {
        return { ok: true, leadId: winner.id, marketingCampaignId: winner.marketingCampaignId };
      }
    }
    throw error;
  }
}

/** Deja el lead en el andén. Mismo trato al reenvío que el `Lead`. */
async function stageUnmappedLead(input: {
  leadgenId: string;
  pageId: string;
  formId: string;
  fieldData: MetaLeadFieldEntry[];
  attribution: MetaAdAttribution;
}): Promise<string> {
  const prisma = getPrisma();
  try {
    const staged = await prisma.metaUnmappedLead.create({
      data: {
        leadgenId: input.leadgenId,
        pageId: input.pageId,
        formId: input.formId,
        fetchedFields: input.fieldData as unknown as Prisma.InputJsonValue,
        ...input.attribution,
      },
      select: { id: true },
    });
    return staged.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await prisma.metaUnmappedLead.findUnique({
        where: { leadgenId: input.leadgenId },
        select: { id: true },
      });
      if (winner) return winner.id;
    }
    throw error;
  }
}

/**
 * Punto de entrada de un evento `leadgen`. La ruta lo llama como función
 * normal; no es una Server Action porque no lo invoca un formulario del panel
 * sino un `POST` de Meta ya autenticado por firma.
 */
export async function ingestMetaLeadgen(
  event: MetaLeadgenChangeValue,
): Promise<MetaIngestOutcome> {
  const prisma = getPrisma();
  const { leadgen_id: leadgenId, page_id: pageId, form_id: formId } = event;

  // Reenvío ya resuelto: se corta antes de gastar una llamada al Graph API.
  const existingLead = await prisma.lead.findUnique({
    where: { metaLeadgenId: leadgenId },
    select: { id: true },
  });
  if (existingLead) {
    logMetaInfo("entrega repetida, el lead ya existe", { leadgenId });
    return { status: "lead-duplicate", leadId: existingLead.id };
  }

  const existingStaged = await prisma.metaUnmappedLead.findUnique({
    where: { leadgenId },
    select: { id: true },
  });
  if (existingStaged) {
    logMetaInfo("entrega repetida, el lead ya está en el andén", { leadgenId });
    return { status: "staged-duplicate", stagedId: existingStaged.id };
  }

  const detail = await fetchLeadgenDetail(leadgenId);
  const attribution = attributionFrom(detail, event);

  const mapping = await prisma.metaPageBranch.findFirst({
    where: { pageId, isActive: true },
    select: { branchId: true },
  });

  if (mapping) {
    const created = await createLeadFromMetaFields({
      leadgenId,
      branchId: mapping.branchId,
      fieldData: detail.field_data,
      platform: detail.platform,
      attribution,
      formId: detail.form_id ?? formId,
      submittedAt: submittedAt(detail),
    });
    if (created.ok) {
      logMetaInfo("lead creado desde Meta Lead Ads", {
        leadgenId,
        pageId,
        branchId: mapping.branchId,
        metaCampaignId: attribution.metaCampaignId,
        campaign: created.marketingCampaignId,
      });
      return {
        status: "lead-created",
        leadId: created.leadId,
        branchId: mapping.branchId,
      };
    }

    // Página mapeada pero el formulario no preguntó lo que `Lead` exige. Se
    // conserva en el andén con sus respuestas: alguien tendrá que mirarlo.
    const stagedId = await stageUnmappedLead({
      leadgenId,
      pageId,
      formId,
      fieldData: detail.field_data,
      attribution,
    });
    logMetaWarn("lead retenido: faltan campos obligatorios", {
      leadgenId,
      pageId,
      faltan: created.missing,
    });
    return { status: "staged", stagedId, reason: "campos-incompletos" };
  }

  const stagedId = await stageUnmappedLead({
    leadgenId,
    pageId,
    formId,
    fieldData: detail.field_data,
    attribution,
  });
  // Estado normal y esperado mientras Marketing conecta las páginas. No es un
  // fallo: por eso es `info` y por eso la ruta responde 200.
  logMetaInfo("lead retenido: la página no está mapeada a ninguna sucursal", {
    leadgenId,
    pageId,
  });
  return { status: "staged", stagedId, reason: "pagina-no-mapeada" };
}
