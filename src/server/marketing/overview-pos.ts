import { Prisma } from "@prisma/client";

import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { overviewSince, type OverviewPeriod } from "@/server/marketing/overview";
import {
  posPurchaseOrderStatusLabels,
  posPurchaseOrderStatusValues,
  posSaleStatusLabels,
  type PosPurchaseOrderStatusValue,
  type PosSaleStatusValue,
} from "@/server/pos/shared";

/**
 * Patch CRM-INT2 — el mostrador de repuestos en la visión comercial de
 * Marketing.
 *
 * ## Otra línea de negocio, otra consulta
 *
 * Caja factura motocicletas y el POS vende repuestos (CLAUDE.md, «Business-line
 * separation»). Este archivo **no suma nada con `overview.ts`**: la pantalla
 * los pinta en secciones separadas y ninguna cifra mezcla las dos líneas.
 *
 * ## Qué cuenta y cuándo
 *
 * - **Ventas brutas:** ventas `COMPLETADA`, por `completedAt` dentro del
 *   periodo. Es el mismo criterio que el tablero del POS (`pos/dashboard.ts`).
 * - **Anuladas:** se cuentan aparte y **no restan** de lo bruto, porque nunca
 *   sumaron: una venta anulada no está `COMPLETADA`. Hoy ningún flujo anula una
 *   venta cobrada (INT5 retiró esa puerta); son históricas.
 * - **Devoluciones:** por la fecha **de la devolución**, no de la venta. El
 *   valor devuelto es el mismo que calcula `return-actions.ts`: el total de
 *   cada línea a prorrata de lo devuelto, redondeado por devolución.
 * - **Neto** = bruto − valor devuelto del periodo. Una devolución de una venta
 *   de un periodo anterior resta en el periodo en que ocurrió, como en los
 *   libros; por eso el neto de un periodo corto puede ser menor que su bruto
 *   sin que ninguna venta del periodo se haya devuelto.
 *
 * ## Lo que no sale
 *
 * Ni cliente, ni cajero, ni proveedor, ni costo. Las compras se ven en
 * cantidades y estado, **nunca en importes**: el costo de adquisición es dato
 * de Contabilidad (ver `AccountingInventoryCost`). Las ventas sí llevan
 * importe: es el precio al público, no un dato confidencial, y es lo único que
 * mide una campaña de repuestos.
 */

export type PosOverviewDTO = {
  kpis: {
    completedSales: number;
    grossSales: string;
    cancelledSales: number;
    returns: number;
    returnedValue: string;
    cashRefunded: string;
    netSales: string;
    purchaseOrders: number;
    purchasesByStatus: Partial<Record<PosPurchaseOrderStatusValue, number>>;
  };
  byBranch: Array<{
    branchCode: string;
    branchName: string;
    completedSales: number;
    grossSales: string;
    cancelledSales: number;
    returns: number;
    returnedValue: string;
    netSales: string;
    purchaseOrders: number;
    receivedOrders: number;
  }>;
  sales: Page<{
    code: string;
    date: string;
    branchName: string;
    statusLabel: string;
    lines: number;
    total: string;
    returnedValue: string;
  }>;
  purchases: Page<{
    code: string;
    createdAt: string;
    branchName: string;
    statusLabel: string;
    lines: number;
    orderedQuantity: string;
    receivedQuantity: string;
  }>;
};

type Page<T> = { page: number; pageSize: number; total: number; rows: T[] };

export const POS_OVERVIEW_PAGE_SIZE = 20;

const ZERO = new Prisma.Decimal(0);
const money = (value: Prisma.Decimal | null | undefined) => (value ?? ZERO).toFixed(2);

export async function getPosOverview(input: {
  branchCode: string | null;
  period: OverviewPeriod;
  salesPage: number;
  purchasesPage: number;
}): Promise<PosOverviewDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const prisma = getPrisma();
  const branches = await prisma.branch.findMany({
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, isActive: true },
  });
  const selected = input.branchCode
    ? branches.find((branch) => branch.code === input.branchCode) ?? null
    : null;
  // Mismo contrato que `getCommercialOverview`: un código inexistente no ensancha.
  if (input.branchCode && !selected) return null;
  const since = overviewSince(input.period);
  const branchWhere = selected ? { branchId: selected.id } : {};
  const completedWhere: Prisma.PosSaleWhereInput = {
    ...branchWhere,
    status: "COMPLETADA",
    ...(since ? { completedAt: { gte: since } } : {}),
  };
  const cancelledWhere: Prisma.PosSaleWhereInput = {
    ...branchWhere,
    status: "ANULADA",
    ...(since ? { cancelledAt: { gte: since } } : {}),
  };
  const returnWhere: Prisma.PosSaleReturnWhereInput = {
    ...branchWhere,
    ...(since ? { createdAt: { gte: since } } : {}),
  };
  const purchaseWhere: Prisma.PosPurchaseOrderWhereInput = {
    ...branchWhere,
    ...(since ? { createdAt: { gte: since } } : {}),
  };
  // La lista muestra lo cobrado y lo anulado del periodo; el borrador no es una venta.
  const listWhere: Prisma.PosSaleWhereInput = { OR: [completedWhere, cancelledWhere] };

  const branchFilter = selected ? Prisma.sql`AND r."branch_id" = ${selected.id}` : Prisma.empty;
  const sinceFilter = since ? Prisma.sql`AND r."created_at" >= ${since}` : Prisma.empty;

  const salesPage = Math.max(1, input.salesPage);
  const purchasesPage = Math.max(1, input.purchasesPage);

  const [
    completedGroups,
    cancelledGroups,
    refundGroups,
    returnValueRows,
    purchaseGroups,
    salesTotal,
    salesRows,
    purchasesTotal,
    purchaseRows,
  ] = await Promise.all([
    prisma.posSale.groupBy({
      by: ["branchId"],
      where: completedWhere,
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.posSale.groupBy({ by: ["branchId"], where: cancelledWhere, _count: { _all: true } }),
    prisma.posSaleReturn.groupBy({
      by: ["branchId"],
      where: returnWhere,
      _count: { _all: true },
      _sum: { cashRefunded: true },
    }),
    // Valor devuelto por sucursal, redondeado por devolución como al registrarla.
    prisma.$queryRaw<Array<{ branch_id: string; value: Prisma.Decimal }>>`
      SELECT per_return.branch_id, COALESCE(SUM(per_return.value), 0) AS value
        FROM (
          SELECT r."branch_id" AS branch_id,
                 ROUND(SUM(si."total" * ri."quantity" / NULLIF(si."quantity", 0)), 2) AS value
            FROM "pos_sale_returns" r
            JOIN "pos_sale_return_items" ri ON ri."return_id" = r."id"
            JOIN "pos_sale_items" si ON si."id" = ri."sale_item_id"
           WHERE TRUE ${branchFilter} ${sinceFilter}
           GROUP BY r."id", r."branch_id"
        ) per_return
       GROUP BY per_return.branch_id
    `,
    prisma.posPurchaseOrder.groupBy({
      by: ["branchId", "status"],
      where: purchaseWhere,
      _count: { _all: true },
    }),
    prisma.posSale.count({ where: listWhere }),
    prisma.posSale.findMany({
      where: listWhere,
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      skip: (salesPage - 1) * POS_OVERVIEW_PAGE_SIZE,
      take: POS_OVERVIEW_PAGE_SIZE,
      // Lista explícita: sin cliente, cajero ni operador.
      select: {
        id: true,
        saleNumber: true,
        status: true,
        total: true,
        completedAt: true,
        cancelledAt: true,
        createdAt: true,
        branch: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.posPurchaseOrder.count({ where: purchaseWhere }),
    prisma.posPurchaseOrder.findMany({
      where: purchaseWhere,
      orderBy: { createdAt: "desc" },
      skip: (purchasesPage - 1) * POS_OVERVIEW_PAGE_SIZE,
      take: POS_OVERVIEW_PAGE_SIZE,
      // Sin proveedor, costos ni totales: sólo cantidades y estado.
      select: {
        orderNumber: true,
        status: true,
        createdAt: true,
        branch: { select: { name: true } },
        items: { select: { quantity: true, receivedQuantity: true } },
      },
    }),
  ]);

  // Lo devuelto de cada venta de la página, con la misma fórmula.
  const pageSaleIds = salesRows.map((row) => row.id);
  const returnedBySale = pageSaleIds.length
    ? await prisma.$queryRaw<Array<{ sale_id: string; value: Prisma.Decimal }>>`
        SELECT per_return.sale_id, COALESCE(SUM(per_return.value), 0) AS value
          FROM (
            SELECT r."sale_id" AS sale_id,
                   ROUND(SUM(si."total" * ri."quantity" / NULLIF(si."quantity", 0)), 2) AS value
              FROM "pos_sale_returns" r
              JOIN "pos_sale_return_items" ri ON ri."return_id" = r."id"
              JOIN "pos_sale_items" si ON si."id" = ri."sale_item_id"
             WHERE r."sale_id" IN (${Prisma.join(pageSaleIds)})
             GROUP BY r."id", r."sale_id"
          ) per_return
         GROUP BY per_return.sale_id
      `
    : [];
  const returnedMap = new Map(returnedBySale.map((row) => [row.sale_id, row.value]));

  const find = <T extends { branchId: string }>(rows: T[], branchId: string) =>
    rows.find((row) => row.branchId === branchId);
  const returnedValueOf = (branchId: string) =>
    new Prisma.Decimal(returnValueRows.find((row) => row.branch_id === branchId)?.value ?? 0);

  const byBranch = (selected ? [selected] : branches).flatMap((branch) => {
    const completed = find(completedGroups, branch.id);
    const gross = completed?._sum.total ?? ZERO;
    const returned = returnedValueOf(branch.id);
    const purchases = purchaseGroups.filter((row) => row.branchId === branch.id);
    const row = {
      branchCode: branch.code,
      branchName: branch.name,
      completedSales: completed?._count._all ?? 0,
      grossSales: money(gross),
      cancelledSales: find(cancelledGroups, branch.id)?._count._all ?? 0,
      returns: find(refundGroups, branch.id)?._count._all ?? 0,
      returnedValue: money(returned),
      netSales: money(gross.sub(returned)),
      purchaseOrders: purchases.reduce((sum, item) => sum + item._count._all, 0),
      receivedOrders: purchases
        .filter((item) => item.status === "RECIBIDA" || item.status === "RECIBIDA_PARCIAL")
        .reduce((sum, item) => sum + item._count._all, 0),
    };
    const active =
      row.completedSales + row.cancelledSales + row.returns + row.purchaseOrders > 0;
    return branch.isActive || active ? [row] : [];
  });

  const gross = completedGroups.reduce((sum, row) => sum.add(row._sum.total ?? ZERO), ZERO);
  const returned = returnValueRows.reduce(
    (sum, row) => sum.add(new Prisma.Decimal(row.value)),
    ZERO,
  );
  const purchasesByStatus: Partial<Record<PosPurchaseOrderStatusValue, number>> = {};
  for (const status of posPurchaseOrderStatusValues) {
    const count = purchaseGroups
      .filter((row) => row.status === status)
      .reduce((sum, row) => sum + row._count._all, 0);
    if (count) purchasesByStatus[status] = count;
  }

  return {
    kpis: {
      completedSales: completedGroups.reduce((sum, row) => sum + row._count._all, 0),
      grossSales: money(gross),
      cancelledSales: cancelledGroups.reduce((sum, row) => sum + row._count._all, 0),
      returns: refundGroups.reduce((sum, row) => sum + row._count._all, 0),
      returnedValue: money(returned),
      cashRefunded: money(
        refundGroups.reduce((sum, row) => sum.add(row._sum.cashRefunded ?? ZERO), ZERO),
      ),
      netSales: money(gross.sub(returned)),
      purchaseOrders: purchaseGroups.reduce((sum, row) => sum + row._count._all, 0),
      purchasesByStatus,
    },
    byBranch,
    sales: {
      page: salesPage,
      pageSize: POS_OVERVIEW_PAGE_SIZE,
      total: salesTotal,
      rows: salesRows.map((sale) => ({
        code: sale.saleNumber,
        date: (sale.completedAt ?? sale.cancelledAt ?? sale.createdAt).toISOString(),
        branchName: sale.branch.name,
        statusLabel: posSaleStatusLabels[sale.status as PosSaleStatusValue] ?? sale.status,
        lines: sale._count.items,
        total: money(sale.total),
        returnedValue: money(new Prisma.Decimal(returnedMap.get(sale.id) ?? 0)),
      })),
    },
    purchases: {
      page: purchasesPage,
      pageSize: POS_OVERVIEW_PAGE_SIZE,
      total: purchasesTotal,
      rows: purchaseRows.map((order) => ({
        code: order.orderNumber,
        createdAt: order.createdAt.toISOString(),
        branchName: order.branch.name,
        statusLabel:
          posPurchaseOrderStatusLabels[order.status as PosPurchaseOrderStatusValue] ??
          order.status,
        lines: order.items.length,
        orderedQuantity: order.items
          .reduce((sum, item) => sum.add(item.quantity), ZERO)
          .toString(),
        receivedQuantity: order.items
          .reduce((sum, item) => sum.add(item.receivedQuantity), ZERO)
          .toString(),
      })),
    },
  };
}
