import type { Prisma } from "@prisma/client";

import { catalogModelLabel } from "@/server/catalog/shared";
import { leadStatusLabels, leadStatusValues, type LeadStatusValue } from "@/server/crm/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  reservationStatusLabels,
  saleStatusLabels,
  saleTypeLabels,
  type ReservationStatusValue,
  type SaleStatusValue,
  type SaleTypeValue,
} from "@/server/operations/shared";

/**
 * Patch CRM-INT1 — la visión comercial de todas las sucursales, para
 * Marketing.
 *
 * ## Lectura, y con qué datos
 *
 * Marketing necesita ver qué pasa en cada sucursal —leads, clientes, reservas,
 * ventas e inventario— para decidir dónde y qué anunciar. **No necesita saber
 * quién es cada cliente.** Por eso ninguna consulta de este archivo selecciona
 * nombre, teléfono, cédula, correo, notas, documentos ni datos de crédito: los
 * `select` son listas explícitas de lo que sí sale. Las listas identifican cada
 * registro por su código (SOL-…, RES-…, VEN-…), que es suficiente para
 * conversar con la sucursal sin exponer a la persona.
 *
 * El nombre del **vendedor** sí sale: es personal interno, y saber quién
 * atiende qué es parte de medir campañas.
 *
 * ## Alcance
 *
 * Global por definición: la llama sólo quien pasa `canViewCommercialOverview`
 * (Administrador y Marketing). El filtro de sucursal **reduce**, nunca amplía.
 * No hay costos: ni precio de compra de unidades ni gasto publicitario.
 *
 * Patch CRM-INT2 — esto es **sólo la línea de motocicletas**. El mostrador de
 * repuestos está en `overview-pos.ts` y nunca se suma con esto.
 */

export type OverviewPeriod = "7d" | "30d" | "90d" | "todo";

export const overviewPeriodLabels: Record<OverviewPeriod, string> = {
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  todo: "Todo el historial",
};

export function isOverviewPeriod(value: string): value is OverviewPeriod {
  return value in overviewPeriodLabels;
}

export type CommercialOverviewDTO = {
  branchName: string | null;
  period: OverviewPeriod;
  kpis: {
    leads: number;
    leadsWithCampaign: number;
    newCustomers: number;
    liveReservations: number;
    sales: number;
    availableUnits: number;
  };
  byBranch: Array<{
    branchCode: string;
    branchName: string;
    leads: number;
    leadsByStatus: Partial<Record<LeadStatusValue, number>>;
    newCustomers: number;
    liveReservations: number;
    sales: number;
    availableUnits: number;
  }>;
  leadsByChannel: Array<{ channel: string; count: number }>;
  recentLeads: Array<{
    code: string;
    createdAt: string;
    branchName: string;
    channel: string | null;
    campaignName: string | null;
    motorcycle: string | null;
    statusLabel: string;
    sellerName: string | null;
  }>;
  recentReservations: Array<{
    code: string;
    reservedAt: string;
    branchName: string;
    unit: string;
    statusLabel: string;
  }>;
  recentSales: Array<{
    code: string;
    soldAt: string;
    branchName: string;
    unit: string;
    typeLabel: string;
    statusLabel: string;
  }>;
  inventoryByModel: Array<{
    model: string;
    total: number;
    branches: Array<{ branchName: string; count: number }>;
  }>;
};

const PERIOD_DAYS: Record<OverviewPeriod, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  todo: null,
};

const RECENT_LIMIT = 25;

/** Desde cuándo cuenta un periodo; `null` es todo el historial. */
export function overviewSince(period: OverviewPeriod): Date | null {
  const days = PERIOD_DAYS[period];
  return days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
}

export async function getCommercialOverview(input: {
  branchCode: string | null;
  period: OverviewPeriod;
}): Promise<CommercialOverviewDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const prisma = getPrisma();

  const branches = await prisma.branch.findMany({
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, isActive: true },
  });
  const selected = input.branchCode
    ? branches.find((branch) => branch.code === input.branchCode) ?? null
    : null;
  // Un código que no existe no ensancha a «todas»: devuelve vacío.
  if (input.branchCode && !selected) return null;

  const since = overviewSince(input.period);
  const branchWhere = selected ? { branchId: selected.id } : {};
  const leadWhere: Prisma.LeadWhereInput = {
    ...branchWhere,
    ...(since ? { createdAt: { gte: since } } : {}),
  };
  const customerWhere: Prisma.CustomerWhereInput = {
    ...branchWhere,
    ...(since ? { createdAt: { gte: since } } : {}),
  };
  const saleWhere: Prisma.SaleWhereInput = {
    ...branchWhere,
    ...(since ? { soldAt: { gte: since } } : {}),
  };
  const liveReservationWhere: Prisma.ReservationWhereInput = {
    ...branchWhere,
    status: { in: ["PENDIENTE_PAGO", "ACTIVA"] },
  };

  const [
    leadGroups,
    leadCampaignCount,
    channelGroups,
    customerGroups,
    reservationGroups,
    saleGroups,
    unitGroups,
    recentLeads,
    recentReservations,
    recentSales,
    catalog,
  ] = await Promise.all([
    prisma.lead.groupBy({ by: ["branchId", "status"], where: leadWhere, _count: { _all: true } }),
    prisma.lead.count({ where: { ...leadWhere, marketingCampaignId: { not: null } } }),
    prisma.lead.groupBy({ by: ["originChannel"], where: leadWhere, _count: { _all: true } }),
    prisma.customer.groupBy({ by: ["branchId"], where: customerWhere, _count: { _all: true } }),
    prisma.reservation.groupBy({
      by: ["branchId"],
      where: liveReservationWhere,
      _count: { _all: true },
    }),
    prisma.sale.groupBy({ by: ["branchId"], where: saleWhere, _count: { _all: true } }),
    prisma.motorcycleUnit.groupBy({
      by: ["branchId", "catalogModelId", "brand", "model"],
      where: { ...branchWhere, status: "AVAILABLE" },
      _count: { _all: true },
    }),
    prisma.lead.findMany({
      where: leadWhere,
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      // Lista explícita: sin nombre, teléfono, cédula, correo ni notas.
      select: {
        trackingCode: true,
        createdAt: true,
        originChannel: true,
        motorcycleInterest: true,
        status: true,
        branch: { select: { name: true } },
        marketingCampaign: { select: { name: true } },
        assignedSeller: { select: { name: true } },
      },
    }),
    prisma.reservation.findMany({
      where: {
        ...branchWhere,
        ...(since ? { reservedAt: { gte: since } } : {}),
      },
      orderBy: { reservedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        reservationNumber: true,
        reservedAt: true,
        status: true,
        branch: { select: { name: true } },
        motorcycleUnit: { select: { brand: true, model: true, year: true } },
      },
    }),
    prisma.sale.findMany({
      where: saleWhere,
      orderBy: { soldAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        saleNumber: true,
        soldAt: true,
        type: true,
        status: true,
        branch: { select: { name: true } },
        motorcycleUnit: { select: { brand: true, model: true, year: true } },
      },
    }),
    prisma.motorcycleCatalogModel.findMany({
      select: { id: true, brand: true, model: true, version: true, year: true },
    }),
  ]);

  const catalogLabel = new Map(catalog.map((model) => [model.id, catalogModelLabel(model)]));
  const branchName = new Map(branches.map((branch) => [branch.id, branch.name]));

  const sumBy = <T extends { branchId: string; _count: { _all: number } }>(
    rows: T[],
    branchId: string,
  ) => rows.filter((row) => row.branchId === branchId).reduce((sum, row) => sum + row._count._all, 0);

  const branchRows = (selected ? [selected] : branches).flatMap((branch) => {
    const leadsByStatus: Partial<Record<LeadStatusValue, number>> = {};
    for (const status of leadStatusValues) {
      const count = leadGroups
        .filter((row) => row.branchId === branch.id && row.status === status)
        .reduce((sum, row) => sum + row._count._all, 0);
      if (count) leadsByStatus[status] = count;
    }
    const row = {
      branchCode: branch.code,
      branchName: branch.name,
      leads: sumBy(leadGroups, branch.id),
      leadsByStatus,
      newCustomers: sumBy(customerGroups, branch.id),
      liveReservations: sumBy(reservationGroups, branch.id),
      sales: sumBy(saleGroups, branch.id),
      availableUnits: sumBy(unitGroups, branch.id),
    };
    const hasActivity =
      row.leads + row.newCustomers + row.liveReservations + row.sales + row.availableUnits > 0;
    // Una sucursal desactivada sin actividad no aporta nada a la vista.
    return branch.isActive || hasActivity ? [row] : [];
  });

  const inventory = new Map<string, { total: number; branches: Map<string, number> }>();
  for (const row of unitGroups) {
    const label =
      (row.catalogModelId && catalogLabel.get(row.catalogModelId)) ||
      `${row.brand} ${row.model} (sin modelo de catálogo)`;
    const entry = inventory.get(label) ?? { total: 0, branches: new Map<string, number>() };
    entry.total += row._count._all;
    const name = branchName.get(row.branchId) ?? "Sucursal";
    entry.branches.set(name, (entry.branches.get(name) ?? 0) + row._count._all);
    inventory.set(label, entry);
  }

  const unitLabel = (unit: { brand: string; model: string; year: number }) =>
    `${unit.brand} ${unit.model} ${unit.year}`;

  return {
    branchName: selected?.name ?? null,
    period: input.period,
    kpis: {
      leads: leadGroups.reduce((sum, row) => sum + row._count._all, 0),
      leadsWithCampaign: leadCampaignCount,
      newCustomers: customerGroups.reduce((sum, row) => sum + row._count._all, 0),
      liveReservations: reservationGroups.reduce((sum, row) => sum + row._count._all, 0),
      sales: saleGroups.reduce((sum, row) => sum + row._count._all, 0),
      availableUnits: unitGroups.reduce((sum, row) => sum + row._count._all, 0),
    },
    byBranch: branchRows,
    leadsByChannel: channelGroups
      .map((row) => ({ channel: row.originChannel ?? "Sin canal", count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    recentLeads: recentLeads.map((lead) => ({
      code: lead.trackingCode,
      createdAt: lead.createdAt.toISOString(),
      branchName: lead.branch.name,
      channel: lead.originChannel,
      campaignName: lead.marketingCampaign?.name ?? null,
      motorcycle: lead.motorcycleInterest,
      statusLabel: leadStatusLabels[lead.status as LeadStatusValue] ?? lead.status,
      sellerName: lead.assignedSeller?.name ?? null,
    })),
    recentReservations: recentReservations.map((reservation) => ({
      code: reservation.reservationNumber,
      reservedAt: reservation.reservedAt.toISOString(),
      branchName: reservation.branch.name,
      unit: unitLabel(reservation.motorcycleUnit),
      statusLabel:
        reservationStatusLabels[reservation.status as ReservationStatusValue] ??
        reservation.status,
    })),
    recentSales: recentSales.map((sale) => ({
      code: sale.saleNumber,
      soldAt: sale.soldAt.toISOString(),
      branchName: sale.branch.name,
      unit: unitLabel(sale.motorcycleUnit),
      typeLabel: saleTypeLabels[sale.type as SaleTypeValue] ?? sale.type,
      statusLabel: saleStatusLabels[sale.status as SaleStatusValue] ?? sale.status,
    })),
    inventoryByModel: [...inventory.entries()]
      .map(([model, entry]) => ({
        model,
        total: entry.total,
        branches: [...entry.branches.entries()]
          .map(([name, count]) => ({ branchName: name, count }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.total - a.total),
  };
}
