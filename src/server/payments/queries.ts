import type { Prisma } from "@prisma/client";

import type { CrmScope } from "@/server/auth/access";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  paymentRequestPurposeLabels,
  paymentRequestStatusLabels,
  payablePaymentRequestStatuses,
  type CustomerNotificationDTO,
  type CustomerNotificationKindValue,
  type CustomerPaymentRequestDTO,
  type PaymentRequestDTO,
  type PaymentRequestPurposeValue,
  type PaymentRequestStatusValue,
} from "@/server/payments/shared";

/**
 * Patch CRM-QA1 — lecturas del cobro al cliente, cada una con su alcance.
 *
 * Hay dos lados y **nunca comparten función**: el panel interno lee por
 * {@link CrmScope}, y el portal lee por un identificador de cliente ya
 * verificado. Escribir una sola función con un parámetro «modo» habría puesto a
 * un `if` a decidir si un cliente ve la cartera de otro.
 */

const LIST_LIMIT = 200;

async function resolveBranchId(branchCode: string): Promise<string | null> {
  const branch = await getPrisma().branch.findUnique({
    where: { code: branchCode },
  });
  return branch?.id ?? null;
}

export async function listPaymentRequests(
  scope: CrmScope,
): Promise<PaymentRequestDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const prisma = getPrisma();

  let where: Prisma.PaymentRequestWhereInput = {};
  if (scope.level === "branch") {
    const branchId = await resolveBranchId(scope.branchCode);
    if (!branchId) return [];
    where = { branchId };
  } else if (scope.level === "personal") {
    // Un vendedor ve los cobros de los clientes de su cartera y los que él
    // mismo pidió. Nunca los de la sucursal entera.
    where = {
      OR: [
        { createdById: scope.userId },
        { customer: { assignedSellerId: scope.userId } },
      ],
    };
  }

  const rows = await prisma.paymentRequest.findMany({
    where,
    include: {
      customer: true,
      branch: true,
      createdBy: true,
      reservation: { select: { reservationNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return rows.map((row) => ({
    id: row.id,
    requestNumber: row.requestNumber,
    customerId: row.customerId,
    customerName: row.customer.name,
    branchName: row.branch.name,
    purpose: row.purpose as PaymentRequestPurposeValue,
    purposeLabel: paymentRequestPurposeLabels[row.purpose as PaymentRequestPurposeValue],
    concept: row.concept,
    amount: row.amount.toFixed(2),
    currency: row.currency,
    status: row.status as PaymentRequestStatusValue,
    statusLabel: paymentRequestStatusLabels[row.status as PaymentRequestStatusValue],
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    reservationId: row.reservationId,
    reservationNumber: row.reservation?.reservationNumber ?? null,
    createdByName: row.createdBy?.name ?? null,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Los cobros de UN cliente. `customerId` viene siempre de un contexto ya
 * verificado por el portal, nunca de un parámetro del navegador.
 */
export async function listCustomerPaymentRequests(
  customerId: string,
): Promise<CustomerPaymentRequestDTO[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await getPrisma().paymentRequest.findMany({
    where: { customerId },
    include: { branch: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return rows.map((row) => {
    const status = row.status as PaymentRequestStatusValue;
    return {
      id: row.id,
      requestNumber: row.requestNumber,
      concept: row.concept,
      amount: row.amount.toFixed(2),
      currency: row.currency,
      status,
      statusLabel: paymentRequestStatusLabels[status],
      dueDate: row.dueDate ? row.dueDate.toISOString() : null,
      branchName: row.branch.name,
      createdAt: row.createdAt.toISOString(),
      payable: payablePaymentRequestStatuses.includes(status),
    };
  });
}

/** Los avisos de UN cliente, del más reciente al más antiguo. */
export async function listCustomerNotifications(
  customerId: string,
  limit = 30,
): Promise<CustomerNotificationDTO[]> {
  if (!isDatabaseConfigured()) return [];

  const rows = await getPrisma().customerNotification.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as CustomerNotificationKindValue,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  }));
}
