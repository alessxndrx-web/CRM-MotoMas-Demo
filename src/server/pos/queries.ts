import type { Prisma } from "@prisma/client";

import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { decimalToNumber } from "@/server/finance/money";
import {
  calculatePosLineSubtotal,
  calculatePosPaidTotal,
  posPaymentMethodLabels,
  posSaleStatusLabels,
  roundPosMoney,
  type PosPaymentMethodValue,
  type PosProductDTO,
  type PosSaleDTO,
  type PosSaleDetailDTO,
  type PosSaleStatusValue,
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

/** Catalogue lookup. `term` matches the SKU, the barcode or the name. */
export async function searchPosProducts(
  term: string,
  options: { includeInactive?: boolean } = {},
): Promise<PosProductDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const clean = term.trim();
  const rows = await getPrisma().posProduct.findMany({
    where: {
      isActive: options.includeInactive ? undefined : true,
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
    orderBy: { name: "asc" },
    take: LIST_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    unitPrice: decimalToNumber(row.unitPrice),
    isActive: row.isActive,
  }));
}
