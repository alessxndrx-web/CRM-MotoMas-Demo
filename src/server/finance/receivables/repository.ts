import type {
  Prisma,
  ReceivableAllocation,
  ReceivableDocument,
  ReceivablePayment,
} from "@prisma/client";

import { decimalToNumber } from "@/server/finance/money";
import type {
  ReceivableDocumentFilters,
  ReceivablePaymentFilters,
} from "@/server/finance/receivables/shared";

/**
 * Patch FF1.2-B — data access for accounts receivable.
 *
 * Pure persistence: no authorization, no audit, no business rule. Every
 * function takes the client explicitly so a caller inside a financial
 * transaction reads and writes through that transaction — which matters more
 * here than anywhere else, because an allocation is only safe if the balance it
 * was checked against was read in the same transaction.
 */

export type ReceivableDb = Pick<
  Prisma.TransactionClient,
  "receivableDocument" | "receivablePayment" | "receivableAllocation"
>;

const partyInclude = {
  branch: { select: { code: true, name: true } },
} as const;

const documentInclude = {
  ...partyInclude,
  allocations: {
    include: {
      payment: { select: { paymentNumber: true } },
      receivableDocument: { select: { documentNumber: true } },
    },
    orderBy: { allocatedAt: "asc" },
  },
} as const;

const paymentInclude = {
  ...partyInclude,
  allocations: {
    include: {
      payment: { select: { paymentNumber: true } },
      receivableDocument: { select: { documentNumber: true } },
    },
    orderBy: { allocatedAt: "asc" },
  },
} as const;

export type ReceivableDocumentRow = Prisma.ReceivableDocumentGetPayload<{
  include: typeof documentInclude;
}>;

export type ReceivablePaymentRow = Prisma.ReceivablePaymentGetPayload<{
  include: typeof paymentInclude;
}>;

export type ReceivableAllocationRow =
  ReceivableDocumentRow["allocations"][number];

// --- Reads ---------------------------------------------------------------

export async function findDocumentById(
  db: ReceivableDb,
  id: string,
): Promise<ReceivableDocument | null> {
  return db.receivableDocument.findUnique({ where: { id } });
}

export async function findDocumentWithAllocations(
  db: ReceivableDb,
  id: string,
): Promise<ReceivableDocumentRow | null> {
  return db.receivableDocument.findUnique({
    where: { id },
    include: documentInclude,
  });
}

export async function findPaymentById(
  db: ReceivableDb,
  id: string,
): Promise<ReceivablePayment | null> {
  return db.receivablePayment.findUnique({ where: { id } });
}

export async function findPaymentWithAllocations(
  db: ReceivableDb,
  id: string,
): Promise<ReceivablePaymentRow | null> {
  return db.receivablePayment.findUnique({
    where: { id },
    include: paymentInclude,
  });
}

export async function findAllocationById(
  db: ReceivableDb,
  id: string,
): Promise<ReceivableAllocation | null> {
  return db.receivableAllocation.findUnique({ where: { id } });
}

/**
 * Σ of the APLICADA allocations of an obligation. This is the only way a
 * balance is ever obtained: there is no stored total to read instead.
 */
export async function sumAllocatedToDocument(
  db: ReceivableDb,
  receivableDocumentId: string,
): Promise<number> {
  const result = await db.receivableAllocation.aggregate({
    where: { receivableDocumentId, status: "APLICADA" },
    _sum: { amount: true },
  });
  return decimalToNumber(result._sum.amount);
}

/** Σ of the APLICADA allocations made out of a collection. */
export async function sumAllocatedFromPayment(
  db: ReceivableDb,
  paymentId: string,
): Promise<number> {
  const result = await db.receivableAllocation.aggregate({
    where: { paymentId, status: "APLICADA" },
    _sum: { amount: true },
  });
  return decimalToNumber(result._sum.amount);
}

/** Allocated totals for many obligations at once, for list reads. */
export async function sumAllocatedByDocument(
  db: ReceivableDb,
  documentIds: readonly string[],
): Promise<Map<string, number>> {
  if (!documentIds.length) return new Map();
  const groups = await db.receivableAllocation.groupBy({
    by: ["receivableDocumentId"],
    where: {
      receivableDocumentId: { in: [...documentIds] },
      status: "APLICADA",
    },
    _sum: { amount: true },
  });
  return new Map(
    groups.map((group) => [
      group.receivableDocumentId,
      decimalToNumber(group._sum.amount),
    ]),
  );
}

/** Allocated totals for many collections at once, for list reads. */
export async function sumAllocatedByPayment(
  db: ReceivableDb,
  paymentIds: readonly string[],
): Promise<Map<string, number>> {
  if (!paymentIds.length) return new Map();
  const groups = await db.receivableAllocation.groupBy({
    by: ["paymentId"],
    where: { paymentId: { in: [...paymentIds] }, status: "APLICADA" },
    _sum: { amount: true },
  });
  return new Map(
    groups.map((group) => [group.paymentId, decimalToNumber(group._sum.amount)]),
  );
}

function documentWhere(
  filters: ReceivableDocumentFilters,
  branchId: string | null,
): Prisma.ReceivableDocumentWhereInput {
  const search = filters.search?.trim();
  return {
    ...(branchId ? { branchId } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.thirdPartyId ? { thirdPartyId: filters.thirdPartyId } : {}),
    ...(filters.origin ? { origin: filters.origin } : {}),
    ...(filters.includeCancelled ? {} : { cancelledAt: null }),
    // "Open" is expressed through `settledAt`, the settlement event, so the
    // filter never needs a stored balance column.
    ...(filters.openOnly ? { settledAt: null } : {}),
    ...(filters.overdueOnly
      ? { settledAt: null, dueDate: { lt: new Date() } }
      : {}),
    ...(search
      ? {
          OR: [
            { documentNumber: { contains: search, mode: "insensitive" } },
            { partyName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listDocuments(
  db: ReceivableDb,
  filters: ReceivableDocumentFilters,
  branchId: string | null,
  take?: number,
): Promise<ReceivableDocumentRow[]> {
  return db.receivableDocument.findMany({
    where: documentWhere(filters, branchId),
    include: documentInclude,
    orderBy: [{ issuedAt: "desc" }, { documentNumber: "desc" }],
    ...(take === undefined ? {} : { take }),
  });
}

function paymentWhere(
  filters: ReceivablePaymentFilters,
  branchId: string | null,
): Prisma.ReceivablePaymentWhereInput {
  const search = filters.search?.trim();
  return {
    ...(branchId ? { branchId } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.thirdPartyId ? { thirdPartyId: filters.thirdPartyId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(search
      ? {
          OR: [
            { paymentNumber: { contains: search, mode: "insensitive" } },
            { partyName: { contains: search, mode: "insensitive" } },
            { reference: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listPayments(
  db: ReceivableDb,
  filters: ReceivablePaymentFilters,
  branchId: string | null,
  take?: number,
): Promise<ReceivablePaymentRow[]> {
  return db.receivablePayment.findMany({
    where: paymentWhere(filters, branchId),
    include: paymentInclude,
    orderBy: [{ receivedAt: "desc" }, { paymentNumber: "desc" }],
    ...(take === undefined ? {} : { take }),
  });
}

// --- Writes --------------------------------------------------------------

export async function createDocument(
  db: ReceivableDb,
  data: Prisma.ReceivableDocumentUncheckedCreateInput,
): Promise<ReceivableDocument> {
  return db.receivableDocument.create({ data });
}

export async function updateDocument(
  db: ReceivableDb,
  id: string,
  data: Prisma.ReceivableDocumentUncheckedUpdateInput,
): Promise<ReceivableDocument> {
  return db.receivableDocument.update({ where: { id }, data });
}

export async function createPayment(
  db: ReceivableDb,
  data: Prisma.ReceivablePaymentUncheckedCreateInput,
): Promise<ReceivablePayment> {
  return db.receivablePayment.create({ data });
}

export async function updatePayment(
  db: ReceivableDb,
  id: string,
  data: Prisma.ReceivablePaymentUncheckedUpdateInput,
): Promise<ReceivablePayment> {
  return db.receivablePayment.update({ where: { id }, data });
}

export async function createAllocation(
  db: ReceivableDb,
  data: Prisma.ReceivableAllocationUncheckedCreateInput,
): Promise<ReceivableAllocation> {
  return db.receivableAllocation.create({ data });
}

export async function updateAllocation(
  db: ReceivableDb,
  id: string,
  data: Prisma.ReceivableAllocationUncheckedUpdateInput,
): Promise<ReceivableAllocation> {
  return db.receivableAllocation.update({ where: { id }, data });
}

/** Active allocations of a collection, used when the collection is reversed. */
export async function listActiveAllocationsOfPayment(
  db: ReceivableDb,
  paymentId: string,
): Promise<ReceivableAllocation[]> {
  return db.receivableAllocation.findMany({
    where: { paymentId, status: "APLICADA" },
    orderBy: { allocatedAt: "asc" },
  });
}
