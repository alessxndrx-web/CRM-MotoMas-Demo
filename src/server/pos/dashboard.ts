import { Prisma } from "@prisma/client";

import { canAccessCaja, canManageInventory } from "@/server/auth/access";
import type { UserRoleEnum } from "@/server/auth/roles";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

/**
 * Patch POS2.1 — el tablero operativo del mostrador.
 *
 * ## Por qué existe, habiendo ya un dashboard
 *
 * El dashboard de `/panel/dashboard` es **comercial**: leads, expedientes,
 * actividades, créditos, reservas y venta de motocicletas. Nunca ha sabido nada
 * de lo que POS1.0 a POS1.2 construyeron — ventas de mostrador, existencias,
 * órdenes de compra— y esos son justamente los datos que responden «cómo va el
 * negocio ahora». Este módulo es esa mitad que faltaba, no una segunda versión
 * de la que ya había.
 *
 * ## Una sola fuente de verdad
 *
 * **Una función, una llamada, un período.** Que cada tarjeta consultara por su
 * cuenta produciría lo que el encargo prohíbe: una pantalla donde una cifra dice
 * «hoy», otra «últimos 30 días» y ninguna lo declara. Aquí el rango se calcula
 * una vez y todas las métricas que dependen de él lo reciben.
 *
 * ## Autorización
 *
 * **No se inventa ningún permiso.** Se componen los que ya existen, con el
 * significado que ya tenían:
 *
 * - `canAccessCaja` (ADMIN, GERENTE, CAJERO) → las cifras de venta de mostrador.
 * - `canManageInventory` (ADMIN, GERENTE) → existencias y compras.
 *
 * El alcance por sucursal se resuelve **aquí**, contra la sesión, y las consultas
 * ya salen filtradas. Un rol no global no recibe datos de otra sucursal ni
 * siquiera en el HTML: no se ocultan en el cliente, no se consultan.
 */

export type DashboardPeriodId = "hoy" | "7d" | "30d" | "mes";

export const dashboardPeriods: Array<{ id: DashboardPeriodId; label: string }> = [
  { id: "hoy", label: "Hoy" },
  { id: "7d", label: "Últimos 7 días" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "mes", label: "Este mes" },
];

export function parseDashboardPeriod(value: string | undefined): DashboardPeriodId {
  return dashboardPeriods.some((period) => period.id === value)
    ? (value as DashboardPeriodId)
    : "30d";
}

export type DashboardRange = {
  id: DashboardPeriodId;
  label: string;
  from: Date;
  to: Date;
  /** El mismo tamaño de ventana, inmediatamente anterior. */
  previousFrom: Date;
  previousTo: Date;
  /** Cuántos días cubre. Decide si la tendencia se dibuja por día. */
  days: number;
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * El rango, resuelto una vez.
 *
 * **La comparación es la misma ventana desplazada hacia atrás**, no «el mes
 * pasado» ni «la semana pasada»: comparar 30 días contra un mes de 28 produce
 * una variación que no significa nada. Para «este mes» el período anterior es el
 * mismo número de días justo antes de que empezara, por la misma razón.
 */
export function resolveDashboardRange(
  id: DashboardPeriodId,
  now: Date = new Date(),
): DashboardRange {
  const to = now;
  let from: Date;

  if (id === "hoy") {
    from = startOfDay(now);
  } else if (id === "7d") {
    from = startOfDay(new Date(now.getTime() - 6 * 86_400_000));
  } else if (id === "30d") {
    from = startOfDay(new Date(now.getTime() - 29 * 86_400_000));
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  const span = to.getTime() - from.getTime();
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(from.getTime() - span);
  const days = Math.max(1, Math.ceil(span / 86_400_000));

  return {
    id,
    label: dashboardPeriods.find((period) => period.id === id)!.label,
    from,
    to,
    previousFrom,
    previousTo,
    days,
  };
}

export type DashboardSalesDTO = {
  total: number;
  count: number;
  /** Derivado, nunca almacenado. */
  averageTicket: number;
  previousTotal: number;
  /** `null` cuando el período anterior fue cero: dividir entre cero no es «+100%». */
  changePercent: number | null;
  byDay: Array<{ day: string; total: number; count: number }>;
  byBranch: Array<{ branchName: string; total: number; count: number }>;
  byMethod: Array<{ method: string; total: number; count: number }>;
};

export type DashboardInventoryDTO = {
  /** Pares bodega+producto con saldo en cero o negativo. */
  outOfStock: number;
  /** Por debajo de su mínimo, contando solo los que tienen mínimo declarado. */
  belowMinimum: number;
  /** Cuántos artículos activos tienen un mínimo configurado. */
  productsWithThreshold: number;
  activeProducts: number;
  lowStock: Array<{
    productId: string;
    sku: string;
    name: string;
    warehouseName: string;
    quantity: number;
    minimumStock: number;
  }>;
};

export type DashboardPurchasesDTO = {
  draft: number;
  approved: number;
  partiallyReceived: number;
  /** Aprobadas o parciales: mercancía comprometida que todavía no llegó entera. */
  pending: number;
};

export type DashboardMovementDTO = {
  id: string;
  type: string;
  quantity: number;
  productName: string;
  productSku: string;
  warehouseName: string;
  userName: string | null;
  createdAt: string;
  reason: string;
};

export type PosDashboardDTO = {
  range: { id: DashboardPeriodId; label: string; from: string; to: string; days: number };
  /** Qué secciones puede ver quien pregunta. La página no lo vuelve a decidir. */
  canSeeSales: boolean;
  canSeeInventory: boolean;
  /** `true` cuando el rol ve todas las sucursales. */
  global: boolean;
  branchName: string;
  sales: DashboardSalesDTO | null;
  inventory: DashboardInventoryDTO | null;
  purchases: DashboardPurchasesDTO | null;
  movements: DashboardMovementDTO[];
};

const emptySales: DashboardSalesDTO = {
  total: 0,
  count: 0,
  averageTicket: 0,
  previousTotal: 0,
  changePercent: null,
  byDay: [],
  byBranch: [],
  byMethod: [],
};

export type PosDashboardContext = {
  role: UserRoleEnum;
  /** Ya `null` para roles globales; un código de sucursal en otro caso. */
  branchCode: string | null;
  branchName: string;
};

/**
 * Todo el tablero, en una llamada.
 *
 * Las consultas van en un solo `Promise.all`: son independientes entre sí y
 * encadenarlas solo añadiría latencia. **Ninguna trae filas para contarlas en
 * memoria** — se agrega en la base, que es donde están los índices.
 */
export async function getPosDashboard(
  context: PosDashboardContext,
  period: DashboardPeriodId,
  now: Date = new Date(),
): Promise<PosDashboardDTO> {
  const range = resolveDashboardRange(period, now);
  const canSeeSales = canAccessCaja(context.role);
  const canSeeInventory = canManageInventory(context.role);
  const global = context.branchCode === null;

  const base: PosDashboardDTO = {
    range: {
      id: range.id,
      label: range.label,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      days: range.days,
    },
    canSeeSales,
    canSeeInventory,
    global,
    branchName: context.branchName,
    sales: null,
    inventory: null,
    purchases: null,
    movements: [],
  };

  if (!isDatabaseConfigured()) return base;

  const prisma = getPrisma();

  // El alcance por sucursal se materializa en un id antes de consultar nada. Si
  // el código no resuelve, el alcance queda vacío: se prefiere no mostrar nada
  // a mostrar de más.
  let branchId: string | null = null;
  if (!global) {
    const branch = await prisma.branch.findUnique({
      where: { code: context.branchCode! },
      select: { id: true },
    });
    if (!branch) return base;
    branchId = branch.id;
  }

  const saleWhere: Prisma.PosSaleWhereInput = {
    status: "COMPLETADA",
    completedAt: { gte: range.from, lte: range.to },
    ...(branchId ? { branchId } : {}),
  };
  const previousWhere: Prisma.PosSaleWhereInput = {
    status: "COMPLETADA",
    completedAt: { gte: range.previousFrom, lte: range.previousTo },
    ...(branchId ? { branchId } : {}),
  };

  const [sales, inventory, purchases, movements] = await Promise.all([
    canSeeSales ? loadSales(prisma, saleWhere, previousWhere, range, branchId, global) : null,
    canSeeInventory ? loadInventory(prisma, branchId) : null,
    canSeeInventory ? loadPurchases(prisma, branchId) : null,
    canSeeInventory ? loadMovements(prisma, branchId) : [],
  ]);

  return { ...base, sales, inventory, purchases, movements };
}

/* -------------------------------------------------------------------------
 * Ventas
 * ---------------------------------------------------------------------- */

async function loadSales(
  prisma: ReturnType<typeof getPrisma>,
  where: Prisma.PosSaleWhereInput,
  previousWhere: Prisma.PosSaleWhereInput,
  range: DashboardRange,
  branchId: string | null,
  global: boolean,
): Promise<DashboardSalesDTO> {
  const [current, previous, byDayRows, byBranchRows, byMethodRows] = await Promise.all([
    prisma.posSale.aggregate({ where, _sum: { total: true }, _count: { _all: true } }),
    prisma.posSale.aggregate({ where: previousWhere, _sum: { total: true } }),

    // **Agrupar por día exige SQL.** Prisma no sabe truncar una fecha, y traerse
    // las ventas para agruparlas en memoria es exactamente lo que el encargo
    // prohíbe. Los parámetros van interpolados por Prisma, no concatenados.
    prisma.$queryRaw<Array<{ day: Date; total: Prisma.Decimal; count: bigint }>>`
      SELECT date_trunc('day', "completed_at") AS day,
             COALESCE(SUM("total"), 0)        AS total,
             COUNT(*)                         AS count
        FROM "pos_sales"
       WHERE "status" = 'COMPLETADA'
         AND "completed_at" >= ${range.from}
         AND "completed_at" <= ${range.to}
         ${branchId ? Prisma.sql`AND "branch_id" = ${branchId}` : Prisma.empty}
       GROUP BY 1
       ORDER BY 1
    `,

    global
      ? prisma.posSale.groupBy({
          by: ["branchId"],
          where,
          _sum: { total: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),

    prisma.$queryRaw<Array<{ method: string; total: Prisma.Decimal; count: bigint }>>`
      SELECT p."method"                       AS method,
             COALESCE(SUM(p."amount"), 0)     AS total,
             COUNT(*)                         AS count
        FROM "pos_payments" p
        JOIN "pos_sales" s ON s."id" = p."sale_id"
       WHERE s."status" = 'COMPLETADA'
         AND s."completed_at" >= ${range.from}
         AND s."completed_at" <= ${range.to}
         ${branchId ? Prisma.sql`AND s."branch_id" = ${branchId}` : Prisma.empty}
       GROUP BY 1
       ORDER BY 2 DESC
    `,
  ]);

  const total = Number(current._sum.total ?? 0);
  const count = current._count._all;
  const previousTotal = Number(previous._sum.total ?? 0);

  const branchNames = new Map<string, string>();
  if (byBranchRows.length) {
    const branches = await prisma.branch.findMany({
      where: { id: { in: byBranchRows.map((row) => row.branchId) } },
      select: { id: true, name: true },
    });
    for (const branch of branches) branchNames.set(branch.id, branch.name);
  }

  return {
    total,
    count,
    // Derivado. Un ticket promedio almacenado es un ticket promedio que se
    // desincroniza en cuanto se anula una venta.
    averageTicket: count > 0 ? total / count : 0,
    previousTotal,
    // Sin base con la que comparar no hay variación. «+100%» sobre cero es una
    // cifra inventada.
    changePercent:
      previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null,
    byDay: byDayRows.map((row) => ({
      day: row.day.toISOString(),
      total: Number(row.total),
      count: Number(row.count),
    })),
    byBranch: byBranchRows
      .map((row) => ({
        branchName: branchNames.get(row.branchId) ?? "—",
        total: Number(row._sum.total ?? 0),
        count: row._count._all,
      }))
      .sort((a, b) => b.total - a.total),
    byMethod: byMethodRows.map((row) => ({
      method: row.method,
      total: Number(row.total),
      count: Number(row.count),
    })),
  };
}

/* -------------------------------------------------------------------------
 * Inventario
 * ---------------------------------------------------------------------- */

/**
 * **El mínimo solo cuenta si alguien lo declaró.**
 *
 * `PosProduct.minimumStock` nace en cero y el esquema dice que hasta POS1.1-A
 * nadie lo leía. Contar «por debajo del mínimo» incluyendo los que valen cero
 * marcaría como alerta cualquier artículo agotado y además duplicaría la cifra
 * de «sin existencia». Se cuentan aparte, y la pantalla dice cuántos artículos
 * tienen umbral configurado para que la cifra se pueda interpretar.
 */
async function loadInventory(
  prisma: ReturnType<typeof getPrisma>,
  branchId: string | null,
): Promise<DashboardInventoryDTO> {
  const warehouseWhere = branchId ? { branchId, isActive: true } : { isActive: true };

  const [outOfStock, belowMinimum, productsWithThreshold, activeProducts, lowStock] =
    await Promise.all([
      prisma.posInventory.count({
        where: {
          quantity: { lte: 0 },
          warehouse: warehouseWhere,
          product: { isActive: true },
        },
      }),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
          FROM "pos_inventory" i
          JOIN "pos_products" p ON p."id" = i."product_id"
          JOIN "pos_warehouses" w ON w."id" = i."warehouse_id"
         WHERE p."is_active" = true
           AND w."is_active" = true
           AND p."minimum_stock" > 0
           AND i."quantity" > 0
           AND i."quantity" <= p."minimum_stock"
           ${branchId ? Prisma.sql`AND w."branch_id" = ${branchId}` : Prisma.empty}
      `,
      prisma.posProduct.count({ where: { isActive: true, minimumStock: { gt: 0 } } }),
      prisma.posProduct.count({ where: { isActive: true } }),
      prisma.$queryRaw<
        Array<{
          product_id: string;
          sku: string;
          name: string;
          warehouse_name: string;
          quantity: Prisma.Decimal;
          minimum_stock: Prisma.Decimal;
        }>
      >`
        SELECT p."id" AS product_id, p."sku", p."name",
               w."name" AS warehouse_name,
               i."quantity", p."minimum_stock"
          FROM "pos_inventory" i
          JOIN "pos_products" p ON p."id" = i."product_id"
          JOIN "pos_warehouses" w ON w."id" = i."warehouse_id"
         WHERE p."is_active" = true
           AND w."is_active" = true
           AND (i."quantity" <= 0 OR (p."minimum_stock" > 0 AND i."quantity" <= p."minimum_stock"))
           ${branchId ? Prisma.sql`AND w."branch_id" = ${branchId}` : Prisma.empty}
         ORDER BY i."quantity" ASC, p."name" ASC
         LIMIT 8
      `,
    ]);

  return {
    outOfStock,
    belowMinimum: Number(belowMinimum[0]?.count ?? 0),
    productsWithThreshold,
    activeProducts,
    lowStock: lowStock.map((row) => ({
      productId: row.product_id,
      sku: row.sku,
      name: row.name,
      warehouseName: row.warehouse_name,
      quantity: Number(row.quantity),
      minimumStock: Number(row.minimum_stock),
    })),
  };
}

/* -------------------------------------------------------------------------
 * Compras
 * ---------------------------------------------------------------------- */

async function loadPurchases(
  prisma: ReturnType<typeof getPrisma>,
  branchId: string | null,
): Promise<DashboardPurchasesDTO> {
  // Un solo `groupBy`: tres `count` habrían sido tres viajes por la misma tabla.
  const rows = await prisma.posPurchaseOrder.groupBy({
    by: ["status"],
    where: branchId ? { branchId } : {},
    _count: { _all: true },
  });
  const by = new Map(rows.map((row) => [row.status, row._count._all]));
  const approved = by.get("APROBADA") ?? 0;
  const partiallyReceived = by.get("RECIBIDA_PARCIAL") ?? 0;

  return {
    draft: by.get("BORRADOR") ?? 0,
    approved,
    partiallyReceived,
    pending: approved + partiallyReceived,
  };
}

/* -------------------------------------------------------------------------
 * Actividad reciente
 * ---------------------------------------------------------------------- */

/**
 * La bitácora de inventario, que es una fuente explícita.
 *
 * **No se reconstruye nada leyendo texto libre.** El tipo, la cantidad, el
 * producto, la bodega, el autor y la fecha son columnas; el motivo se muestra
 * como lo escribió quien lo registró, sin interpretarlo.
 */
async function loadMovements(
  prisma: ReturnType<typeof getPrisma>,
  branchId: string | null,
): Promise<DashboardMovementDTO[]> {
  const rows = await prisma.posInventoryMovement.findMany({
    where: branchId ? { warehouse: { branchId } } : {},
    include: {
      product: { select: { name: true, sku: true } },
      warehouse: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    quantity: Number(row.quantity),
    productName: row.product.name,
    productSku: row.product.sku,
    warehouseName: row.warehouse.name,
    userName: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    reason: row.reason,
  }));
}

export { emptySales };
