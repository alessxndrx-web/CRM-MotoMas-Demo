import { getPrisma } from "@/server/db/prisma";
import {
  adAccountStatusLabel,
  isAdAccountHealthy,
  type MetaAdAccountDTO,
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
