import type { Prisma } from "@prisma/client";

import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { decimalToNumber } from "@/server/finance/money";
import {
  calculatePosLineSubtotal,
  calculatePosPaidTotal,
  posPaymentMethodLabels,
  posInventoryMovementTypeLabels,
  posProductUnitLabels,
  posSaleStatusLabels,
  roundPosMoney,
  type PosInventoryDTO,
  type PosInventoryMovementDTO,
  type PosInventoryMovementTypeValue,
  type PosLookupDTO,
  type PosPaymentMethodValue,
  type PosProductDTO,
  type PosProductUnitValue,
  type PosSaleDTO,
  type PosSaleDetailDTO,
  type PosSaleStatusValue,
  type PosWarehouseDTO,
} from "@/server/pos/shared";

/**
 * Patch POS1.0-A — read side of the Point of Sale.
 *
 * Read-only by construction: nothing here writes, and nothing here computes a
 * figure the database does not already hold, except `paidTotal` and `balance`,
 * which are derived from the payments precisely so they cannot drift out of
 * sync with them.
 */

const LIST_LIMIT = 200;

const saleInclude = {
  branch: true,
  cashier: { select: { name: true } },
  customer: { select: { name: true } },
  payments: { select: { amount: true } },
} satisfies Prisma.PosSaleInclude;

const detailInclude = {
  branch: true,
  cashier: { select: { name: true } },
  customer: { select: { name: true } },
  items: {
    include: { product: { select: { name: true, sku: true } } },
    orderBy: { position: "asc" },
  },
  payments: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.PosSaleInclude;

type SaleRow = Prisma.PosSaleGetPayload<{ include: typeof saleInclude }>;
type DetailRow = Prisma.PosSaleGetPayload<{ include: typeof detailInclude }>;

function mapSale(row: SaleRow): PosSaleDTO {
  const status = row.status as PosSaleStatusValue;
  const total = decimalToNumber(row.total);
  const paidTotal = calculatePosPaidTotal(
    row.payments.map((payment) => ({ amount: decimalToNumber(payment.amount) })),
  );
  return {
    id: row.id,
    saleNumber: row.saleNumber,
    branchCode: row.branch.code,
    branchName: row.branch.name,
    cashierName: row.cashier.name,
    customerName: row.customer?.name ?? null,
    status,
    statusLabel: posSaleStatusLabels[status] ?? row.status,
    subtotal: decimalToNumber(row.subtotal),
    discount: decimalToNumber(row.discount),
    tax: decimalToNumber(row.tax),
    total,
    paidTotal,
    balance: roundPosMoney(total - paidTotal),
    notes: row.notes,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listPosSales(
  filters: { branchCode?: string; status?: PosSaleStatusValue } = {},
): Promise<PosSaleDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await getPrisma().posSale.findMany({
    where: {
      status: filters.status,
      branch: filters.branchCode ? { code: filters.branchCode } : undefined,
    },
    include: saleInclude,
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });
  return rows.map(mapSale);
}

export async function getPosSaleDetail(
  saleId: string,
): Promise<PosSaleDetailDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const row: DetailRow | null = await getPrisma().posSale.findUnique({
    where: { id: saleId },
    include: detailInclude,
  });
  if (!row) return null;

  const base = mapSale({
    ...row,
    payments: row.payments.map((payment) => ({ amount: payment.amount })),
  } as unknown as SaleRow);

  return {
    ...base,
    items: row.items.map((item) => {
      const quantity = decimalToNumber(item.quantity);
      const unitPrice = decimalToNumber(item.unitPrice);
      return {
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        productSku: item.product.sku,
        quantity,
        unitPrice,
        discount: decimalToNumber(item.discount),
        tax: decimalToNumber(item.tax),
        subtotal: calculatePosLineSubtotal({ quantity, unitPrice }),
        total: decimalToNumber(item.total),
        position: item.position,
      };
    }),
    payments: row.payments.map((payment) => {
      const method = payment.method as PosPaymentMethodValue;
      return {
        id: payment.id,
        method,
        methodLabel: posPaymentMethodLabels[method] ?? payment.method,
        amount: decimalToNumber(payment.amount),
        reference: payment.reference,
      };
    }),
  };
}

/**
 * Patch POS1.0-D — customer lookup owned by the POS.
 *
 * `crm/queries.ts` has `listCustomers`, but it takes a `CrmScope`: using it here
 * would couple the till to another context's authorization model for a read the
 * POS can do itself. This reads the shared `Customer` table directly, which the
 * POS already does through `PosSale.customer`.
 */
export async function searchPosCustomers(
  term: string,
): Promise<Array<{ id: string; name: string; phone: string | null }>> {
  if (!isDatabaseConfigured()) return [];
  const clean = term.trim();
  if (!clean) return [];
  const rows = await getPrisma().customer.findMany({
    where: {
      OR: [
        { name: { contains: clean, mode: "insensitive" } },
        { phone: { contains: clean } },
      ],
    },
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  return rows;
}

/**
 * Patch POS1.1-A — un producto y sus metadatos.
 *
 * La categoría y la marca se resuelven a nombre aquí para que ninguna pantalla
 * tenga que volver a consultarlas; los identificadores viajan igual porque un
 * formulario de edición los necesita.
 */
const productInclude = {
  category: { select: { name: true } },
  brand: { select: { name: true } },
} satisfies Prisma.PosProductInclude;

type ProductRow = Prisma.PosProductGetPayload<{ include: typeof productInclude }>;

function mapProduct(row: ProductRow): PosProductDTO {
  const unit = row.unit as PosProductUnitValue;
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    unitPrice: decimalToNumber(row.unitPrice),
    isActive: row.isActive,
    description: row.description,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    brandId: row.brandId,
    brandName: row.brand?.name ?? null,
    unit,
    unitLabel: posProductUnitLabels[unit] ?? row.unit,
    defaultTaxRate: decimalToNumber(row.defaultTaxRate),
    minimumStock: decimalToNumber(row.minimumStock),
    reorderPoint: decimalToNumber(row.reorderPoint),
    cost: decimalToNumber(row.cost),
    imageUrl: row.imageUrl,
  };
}

/** Catalogue lookup. `term` matches the SKU, the barcode or the name. */
export async function searchPosProducts(
  term: string,
  options: { includeInactive?: boolean; categoryId?: string; brandId?: string } = {},
): Promise<PosProductDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const clean = term.trim();
  const rows = await getPrisma().posProduct.findMany({
    where: {
      isActive: options.includeInactive ? undefined : true,
      categoryId: options.categoryId,
      brandId: options.brandId,
      ...(clean
        ? {
            OR: [
              { sku: { equals: clean, mode: "insensitive" } },
              { barcode: { equals: clean } },
              { name: { contains: clean, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: productInclude,
    orderBy: { name: "asc" },
    take: LIST_LIMIT,
  });
  return rows.map(mapProduct);
}

/** Patch POS1.1-A. Una sola lectura para el formulario de edición. */
export async function getPosProduct(
  productId: string,
): Promise<PosProductDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const row = await getPrisma().posProduct.findUnique({
    where: { id: productId },
    include: productInclude,
  });
  return row ? mapProduct(row) : null;
}

export async function listPosCategories(
  options: { includeInactive?: boolean } = {},
): Promise<PosLookupDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await getPrisma().posCategory.findMany({
    where: { isActive: options.includeInactive ? undefined : true },
    orderBy: { name: "asc" },
    take: LIST_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    notes: row.notes,
  }));
}

// --- Inventario (POS1.1-B) -----------------------------------------------

/**
 * Patch POS1.1-B — lado de lectura del inventario del mostrador.
 *
 * **No lee nada del inventario serializado.** `motorcycle_units` e
 * `inventory_movements` no aparecen aquí: los dos inventarios conviven sin
 * conocerse, y esa separación es lo que permitió que este modelo exista sin
 * rediseñar el flujo de motocicletas.
 *
 * Como en el resto del contexto, nada aquí escribe y nada calcula una cifra que
 * la base no tenga ya. El saldo se **lee**, no se deriva de los movimientos:
 * derivarlo aquí volvería inútil la desnormalización que POS1.1-B pagó a
 * propósito.
 */
export async function listPosWarehouses(
  filters: { branchCode?: string; includeInactive?: boolean } = {},
): Promise<PosWarehouseDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await getPrisma().posWarehouse.findMany({
    where: {
      isActive: filters.includeInactive ? undefined : true,
      branch: filters.branchCode ? { code: filters.branchCode } : undefined,
    },
    include: {
      branch: { select: { code: true, name: true } },
      _count: { select: { inventory: true } },
    },
    orderBy: [{ branchId: "asc" }, { code: "asc" }],
    take: LIST_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    branchCode: row.branch.code,
    branchName: row.branch.name,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    notes: row.notes,
    productCount: row._count.inventory,
  }));
}

export async function listPosInventory(
  filters: { warehouseId?: string; branchCode?: string; productId?: string } = {},
): Promise<PosInventoryDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await getPrisma().posInventory.findMany({
    where: {
      warehouseId: filters.warehouseId,
      productId: filters.productId,
      warehouse: filters.branchCode
        ? { branch: { code: filters.branchCode } }
        : undefined,
    },
    include: {
      warehouse: {
        select: { code: true, name: true, branch: { select: { code: true } } },
      },
      product: {
        select: {
          sku: true,
          name: true,
          unit: true,
          minimumStock: true,
          reorderPoint: true,
        },
      },
    },
    orderBy: [{ warehouseId: "asc" }, { productId: "asc" }],
    take: LIST_LIMIT,
  });
  return rows.map((row) => {
    const unit = row.product.unit as PosProductUnitValue;
    return {
      id: row.id,
      warehouseId: row.warehouseId,
      warehouseCode: row.warehouse.code,
      warehouseName: row.warehouse.name,
      branchCode: row.warehouse.branch.code,
      productId: row.productId,
      productSku: row.product.sku,
      productName: row.product.name,
      unit,
      unitLabel: posProductUnitLabels[unit] ?? row.product.unit,
      quantity: decimalToNumber(row.quantity),
      minimumStock: decimalToNumber(row.product.minimumStock),
      reorderPoint: decimalToNumber(row.product.reorderPoint),
    };
  });
}

export async function listPosInventoryMovements(
  filters: { warehouseId?: string; productId?: string } = {},
): Promise<PosInventoryMovementDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await getPrisma().posInventoryMovement.findMany({
    where: { warehouseId: filters.warehouseId, productId: filters.productId },
    include: {
      warehouse: { select: { name: true } },
      product: { select: { sku: true, name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });
  return rows.map((row) => {
    const type = row.type as PosInventoryMovementTypeValue;
    return {
      id: row.id,
      warehouseId: row.warehouseId,
      warehouseName: row.warehouse.name,
      productId: row.productId,
      productSku: row.product.sku,
      productName: row.product.name,
      type,
      typeLabel: posInventoryMovementTypeLabels[type] ?? row.type,
      quantity: decimalToNumber(row.quantity),
      quantityBefore: decimalToNumber(row.quantityBefore),
      quantityAfter: decimalToNumber(row.quantityAfter),
      reason: row.reason,
      notes: row.notes,
      createdByName: row.createdBy.name,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function listPosBrands(
  options: { includeInactive?: boolean } = {},
): Promise<PosLookupDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await getPrisma().posBrand.findMany({
    where: { isActive: options.includeInactive ? undefined : true },
    orderBy: { name: "asc" },
    take: LIST_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    notes: row.notes,
  }));
}
