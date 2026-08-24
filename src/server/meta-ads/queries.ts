import { getPrisma } from "@/server/db/prisma";
import {
  adAccountStatusLabel,
  isAdAccountHealthy,
  type MetaAdAccountDTO,
  type MetaAdDatePresetValue,
  type MetaAdMetricRowDTO,
  type MetaAdMetricsBoardDTO,
} from "@/server/meta-ads/shared";

/**
 * Lecturas del registro de cuentas publicitarias.
 *
 * Alcance global a propósito: qué cuentas sigue MotoMas es configuración de la
 * integración, no un dato de sucursal. Quién puede verlo lo decide la pantalla
 * con `canManageMarketing` (Admin y MARKETING), la misma puerta que ya usan las
 * campañas y los mapeos de página de Meta-1.
 *
 * No llama al Graph API: devuelve lo cacheado en la base. Refrescarlo es una
 * acción manual y explícita (`resyncMetaAdAccountMetadata`).
 */

const LIST_LIMIT = 200;

export async function listMetaAdAccounts(): Promise<MetaAdAccountDTO[]> {
  const rows = await getPrisma().metaAdAccount.findMany({
    orderBy: [{ isActive: "desc" }, { connectedAt: "asc" }],
    take: LIST_LIMIT,
  });

  return rows.map((row) => ({
    id: row.id,
    adAccountId: row.adAccountId,
    label: row.label,
    accountName: row.accountName,
    currency: row.currency,
    accountStatus: row.accountStatus,
    accountStatusLabel: adAccountStatusLabel(row.accountStatus),
    isHealthy: isAdAccountHealthy(row.accountStatus),
    isActive: row.isActive,
    connectedAt: row.connectedAt.toISOString(),
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
  }));
}

/**
 * Lo que el tablero de métricas lee al renderizar (Patch Meta-4).
 *
 * **No llama al Graph API. Nunca.** Lee las fotos guardadas y nada más. Ésa es
 * la razón de ser de `MetaAdMetricSnapshot`: la Marketing API limita la
 * frecuencia de peticiones con dureza, y un tablero que consultara en cada carga
 * alcanzaría ese límite y dejaría de funcionar justo cuando más se mira.
 * Refrescar es un botón, y vive en `actions.ts`.
 *
 * Si alguna vez añades una llamada de red a esta función, has convertido el
 * tablero en lo que este diseño existe para evitar.
 *
 * Devuelve una fila por cuenta activa del registro, con su foto más reciente
 * para ese periodo — o `null` si nunca se consultó, que el tablero muestra
 * distinto de una foto con ceros.
 */
export async function getLatestMetaAdMetrics(
  datePreset: MetaAdDatePresetValue,
): Promise<MetaAdMetricsBoardDTO> {
  const prisma = getPrisma();

  const accounts = await prisma.metaAdAccount.findMany({
    where: { isActive: true },
    orderBy: { connectedAt: "asc" },
    take: LIST_LIMIT,
    select: {
      adAccountId: true,
      label: true,
      accountName: true,
      currency: true,
    },
  });

  if (!accounts.length) return { datePreset, rows: [] };

  /*
   * `distinct` sobre `adAccountId` con el orden (cuenta, fecha desc) deja
   * exactamente la foto más reciente de cada cuenta. Sin él habría que traer el
   * historial entero para quedarse con una fila por cuenta.
   */
  const snapshots = await prisma.metaAdMetricSnapshot.findMany({
    where: {
      datePreset,
      adAccountId: { in: accounts.map((account) => account.adAccountId) },
    },
    orderBy: [{ adAccountId: "asc" }, { fetchedAt: "desc" }],
    distinct: ["adAccountId"],
  });

  const latest = new Map(snapshots.map((snap) => [snap.adAccountId, snap]));

  const rows: MetaAdMetricRowDTO[] = accounts.map((account) => {
    const snap = latest.get(account.adAccountId);
    return {
      adAccountId: account.adAccountId,
      label: account.label,
      accountName: account.accountName,
      registryCurrency: account.currency,
      snapshot: snap
        ? {
            id: snap.id,
            impressions: Number(snap.impressions),
            clicks: Number(snap.clicks),
            spend: Number(snap.spend),
            currency: snap.currency,
            ctr: Number(snap.ctr),
            cpc: snap.cpc === null ? null : Number(snap.cpc),
            fetchedAt: snap.fetchedAt.toISOString(),
          }
        : null,
    };
  });

  return { datePreset, rows };
}
