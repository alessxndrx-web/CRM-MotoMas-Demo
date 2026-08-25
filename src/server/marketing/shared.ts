/**
 * Pure, client-safe Marketing types, enum value unions, label maps and input
 * shapes (Patch 3.7C.1). No database import here so client components can reuse
 * the DTO shapes and catalogs. Enforcement lives in queries.ts / actions.ts.
 *
 * These mirror the Prisma enums MarketingChannel / MarketingCampaignStatus /
 * MarketingCampaignObjective and the current local campaign contract
 * (`src/data/operations/marketing-campaigns.ts`). No external ad-platform
 * integration, webhook or spend synchronization is implied.
 */

import type { LeadStatusValue } from "@/server/crm/shared";
import type { MetaAdDatePresetValue } from "@/server/meta-ads/shared";

export type MarketingChannelValue =
  | "FACEBOOK_ADS"
  | "INSTAGRAM_ADS"
  | "TIKTOK"
  | "WHATSAPP"
  | "WEBSITE"
  | "REFERRAL"
  | "OTHER";

export const marketingChannelValues: MarketingChannelValue[] = [
  "FACEBOOK_ADS",
  "INSTAGRAM_ADS",
  "TIKTOK",
  "WHATSAPP",
  "WEBSITE",
  "REFERRAL",
  "OTHER",
];

export const marketingChannelLabels: Record<MarketingChannelValue, string> = {
  FACEBOOK_ADS: "Facebook Ads",
  INSTAGRAM_ADS: "Instagram Ads",
  TIKTOK: "TikTok",
  WHATSAPP: "WhatsApp",
  WEBSITE: "Sitio web",
  REFERRAL: "Referido",
  OTHER: "Otro",
};

export function isMarketingChannelValue(
  value: string,
): value is MarketingChannelValue {
  return marketingChannelValues.includes(value as MarketingChannelValue);
}

export type MarketingCampaignStatusValue = "ACTIVE" | "PAUSED" | "COMPLETED";

export const marketingCampaignStatusValues: MarketingCampaignStatusValue[] = [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
];

export const marketingCampaignStatusLabels: Record<
  MarketingCampaignStatusValue,
  string
> = {
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  COMPLETED: "Finalizada",
};

export function isMarketingCampaignStatusValue(
  value: string,
): value is MarketingCampaignStatusValue {
  return marketingCampaignStatusValues.includes(
    value as MarketingCampaignStatusValue,
  );
}

export type MarketingCampaignObjectiveValue =
  | "LEADS"
  | "RESERVATIONS"
  | "SALES";

export const marketingCampaignObjectiveValues: MarketingCampaignObjectiveValue[] =
  ["LEADS", "RESERVATIONS", "SALES"];

export const marketingCampaignObjectiveLabels: Record<
  MarketingCampaignObjectiveValue,
  string
> = {
  LEADS: "Leads",
  RESERVATIONS: "Reservas",
  SALES: "Ventas",
};

export function isMarketingCampaignObjectiveValue(
  value: string,
): value is MarketingCampaignObjectiveValue {
  return marketingCampaignObjectiveValues.includes(
    value as MarketingCampaignObjectiveValue,
  );
}

/**
 * A marketing campaign as shown to an authorized viewer. `estimatedBudget` is a
 * marketing planning figure (not an inventory acquisition cost) and is nulled
 * out by the query layer for viewers who may not see costs.
 */
export type MarketingCampaignDTO = {
  id: string;
  name: string;
  channel: MarketingChannelValue;
  channelLabel: string;
  targetBranchCode: string | null;
  targetBranchName: string | null;
  motorcycleSlug: string | null;
  estimatedBudget: number | null;
  startsAt: string;
  endsAt: string | null;
  status: MarketingCampaignStatusValue;
  statusLabel: string;
  objective: MarketingCampaignObjectiveValue;
  objectiveLabel: string;
  description: string | null;
  createdById: string;
  createdByName: string | null;
  /**
   * Patch Attribution-1 — la cuenta publicitaria conectada de la que sale el
   * gasto real de esta campaña, o `null` si no se le ha enlazado ninguna.
   */
  metaAdAccountId: string | null;
  /** Nombre legible de esa cuenta, ya resuelto para no pedirla en pantalla. */
  metaAdAccountLabel: string | null;
  /** Leads attributed to this campaign inside the viewer's scope. */
  leadCount: number;
  createdAt: string;
  updatedAt: string;
};

/** Attribution performance for one campaign, derived only from DB records. */
export type MarketingCampaignPerformanceDTO = {
  campaignId: string;
  campaignName: string;
  channel: MarketingChannelValue;
  channelLabel: string;
  status: MarketingCampaignStatusValue;
  leads: number;
  /** Leads that reached EXPEDIENTE (converted). */
  converted: number;
  discarded: number;
  /** Reservations whose expediente came from a lead of this campaign. */
  reservations: number;
  /** Sales whose expediente came from a lead of this campaign. */
  sales: number;
  conversionRate: number;
};

/** Aggregate marketing picture for the Reportes / Dashboard marketing block. */
export type MarketingSummaryDTO = {
  totalCampaigns: number;
  activeCampaigns: number;
  pausedCampaigns: number;
  completedCampaigns: number;
  /** Leads attributed to any campaign inside the viewer's scope. */
  attributedLeads: number;
  byChannel: {
    channel: MarketingChannelValue;
    channelLabel: string;
    count: number;
  }[];
  topCampaigns: MarketingCampaignPerformanceDTO[];
};

/**
 * Privacy-minimized lead attribution row for Admin and MARKETING only. This DTO
 * intentionally contains no lead identity/contact data, notes, seller data,
 * expediente contents, credit data, references or conversations.
 */
export type MarketingLeadAttributionDTO = {
  leadCode: string;
  createdAt: string;
  campaignId: string;
  campaignName: string;
  channel: MarketingChannelValue;
  channelLabel: string;
  branchCode: string;
  branchName: string;
  motorcycleInterest: string | null;
  status: LeadStatusValue;
  statusLabel: string;
  finalResult: "Convertido" | "Descartado" | null;
  conversionDate: string | null;
};

/**
 * Server-side campaign input (English enum values). Branch is passed as a code;
 * the action resolves it to a branch id and never trusts a raw id from a client.
 */
export type MarketingCampaignInput = {
  name: string;
  channel: MarketingChannelValue;
  targetBranchCode: string | null;
  motorcycleSlug: string | null;
  estimatedBudget: number | null;
  startsAt: string;
  endsAt: string | null;
  status: MarketingCampaignStatusValue;
  objective: MarketingCampaignObjectiveValue;
  description: string | null;
  /**
   * Patch Attribution-1 — el cuid de una `MetaAdAccount` conectada, o `null`.
   *
   * Llega del navegador y por eso la acción **comprueba que existe** antes de
   * guardarlo, igual que la sucursal se resuelve desde su código y nunca se
   * acepta un id crudo.
   */
  metaAdAccountId: string | null;
};

export function marketingConversionRate(
  leads: number,
  converted: number,
): number {
  if (leads <= 0) return 0;
  return Math.round((converted / leads) * 1000) / 1000;
}

// --- Atribución gasto → leads → ventas (Patch Attribution-1) --------------

/**
 * El canal de marketing al que corresponde un `Lead.originChannel`.
 *
 * ## No hay tabla de correspondencias nueva, y es a propósito
 *
 * `marketingChannelLabels` **ya es** esa correspondencia: sus valores son
 * exactamente las cadenas que el CRM escribe en `originChannel`. Se comprueba
 * en los dos extremos:
 *
 * - Meta-1 escribe `"Instagram Ads"` o `"Facebook Ads"` (`metaOriginChannel` en
 *   `src/server/meta/shared.ts`), que son los valores de `INSTAGRAM_ADS` y
 *   `FACEBOOK_ADS`.
 * - La taxonomía manual del CRM (`leadOriginChannels` en
 *   `src/data/operations/leads.ts`) usa las mismas cadenas para los demás.
 *
 * Escribir aquí un segundo diccionario habría creado dos verdades que se
 * separarían en cuanto alguien renombrara una etiqueta en pantalla.
 *
 * Devuelve `null` para un canal libre que no corresponde a ningún miembro del
 * enumerado —hay leads con `originChannel` escrito a mano, como `"Sucursal"` o
 * `"Presencial"`—. Ese lead **sigue contando** en el informe: aparece con su
 * propio nombre y sin gasto, que es la verdad. Inventarle un canal sería peor.
 */
export function marketingChannelForOriginChannel(
  originChannel: string,
): MarketingChannelValue | null {
  const match = marketingChannelValues.find(
    (value) => marketingChannelLabels[value] === originChannel,
  );
  return match ?? null;
}

/**
 * La mitad monetaria de una fila (Patch Marketing-P1).
 *
 * **Vive en su propio objeto para poder no existir.** Antes estas cinco cifras
 * eran campos sueltos de la fila, y ocultárselas a alguien habría exigido
 * ponerlas a `null` — pero `spend: null` **ya significa otra cosa**: «no hay
 * datos de ese periodo». Un Gerente habría visto exactamente lo mismo que quien
 * mira una cuenta sin foto, y las dos situaciones no se parecen en nada.
 *
 * Agrupadas aquí, la ausencia se expresa donde corresponde: `row.cost === null`
 * es «no te corresponde ver dinero», y `row.cost.spend === null` sigue siendo
 * «no hay datos». Dos preguntas, dos sitios.
 */
export type MarketingAttributionCostDTO = {
  /** Cuentas publicitarias enlazadas a campañas de este canal. */
  linkedAccounts: number;
  /** De ésas, cuántas no tienen foto de este periodo. Si >0, el gasto es parcial. */
  accountsWithoutSnapshot: number;
  /**
   * Verdadero cuando las cuentas enlazadas reportan en monedas distintas. En ese
   * caso `spend` es `null`: sumar córdobas con dólares da un número que parece
   * correcto y no lo es.
   */
  mixedCurrency: boolean;
  /**
   * Gasto sumado de las fotos más recientes de las cuentas enlazadas.
   *
   * `null` significa **«sin datos»**, nunca «cero». Ocurre cuando ninguna cuenta
   * enlazada tiene foto de ese periodo, cuando el canal no tiene cuenta
   * enlazada, o cuando las fotos vienen en monedas distintas y sumarlas
   * inventaría una cifra. Distinguirlo de un cero real es el mismo criterio que
   * Meta-4 aplica en su propio tablero.
   */
  spend: number | null;
  /** Moneda del gasto. `null` cuando no hay gasto que expresar. */
  spendCurrency: string | null;
  /**
   * Gasto entre leads.
   *
   * `null` cuando no hay leads —dividir entre cero— o cuando no hay gasto que
   * dividir. La pantalla muestra un guion. **No se sustituye por 0.00**: un
   * coste por lead sin leads no es cero, es nada, exactamente como el `cpc` de
   * Meta-4 cuando no hubo clics.
   */
  costPerLead: number | null;
};

/** Una fila del informe: un canal, lo que produjo y —si procede— lo que costó. */
export type MarketingAttributionRowDTO = {
  /** El `Lead.originChannel` tal cual, que es lo que se muestra. */
  channel: string;
  /** El miembro del enumerado equivalente, o `null` si es un canal libre. */
  marketingChannel: MarketingChannelValue | null;
  /** Leads con este `originChannel` creados dentro de la ventana. */
  leads: number;
  /** Ventas completadas en la ventana cuyo lead atribuido es de este canal. */
  salesCount: number;
  /** Suma de `PosSale.total` de esas ventas. */
  salesTotal: number;
  /**
   * Las cifras de dinero, o `null` cuando quien mira no puede verlas.
   *
   * **`null` aquí es «no te corresponde», y no tiene nada que ver con
   * `cost.spend === null`, que es «no hay datos».** Ver
   * {@link MarketingAttributionCostDTO}.
   */
  cost: MarketingAttributionCostDTO | null;
};

/** El informe completo, con la ventana que se usó ya resuelta. */
export type MarketingAttributionReportDTO = {
  datePreset: MetaAdDatePresetValue;
  /** Inicio de la ventana, inclusive (ISO). */
  from: string;
  /** Fin de la ventana, exclusivo (ISO). */
  to: string;
  /** Código de la sucursal a la que se acotaron leads y ventas, si se acotó. */
  branchCode: string | null;
  /**
   * Si las filas traen su mitad monetaria.
   *
   * Va en la cabecera y no sólo en cada fila porque la pantalla necesita saberlo
   * **antes** de dibujar: con cero filas no hay ninguna `cost` que mirar, y las
   * columnas de dinero no deben aparecer vacías esperando datos que no van a
   * llegar nunca para esta sesión.
   */
  includesCost: boolean;
  rows: MarketingAttributionRowDTO[];
};
