"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import {
  canAccessBranch,
  canManagePaymentRequests,
  getCrmScopeForUser,
} from "@/server/auth/access";
import { getCurrentUserSession } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { generateCrmCode } from "@/server/crm/codes";
import { sanitizeText } from "@/server/crm/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { notify } from "@/server/payments/service";
import {
  formatMoney,
  isSupportedCurrency,
  parseAmountInput,
} from "@/server/payments/shared";

/**
 * Patch CRM-QA1 — el lado interno del cobro: un empleado autorizado le pide un
 * importe concreto a un cliente concreto.
 *
 * **El importe nace aquí y no se vuelve a tocar.** La acción del portal que el
 * cliente ejecuta recibe sólo el identificador de la solicitud; lee el importe
 * de la fila y se lo pasa al proveedor. No existe ningún camino por el que una
 * cifra del navegador del cliente llegue a la pasarela.
 */

const DB_REQUIRED =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";
const NO_SESSION = "Sesión no válida.";
const NO_PERMISSION = "No tienes permiso para solicitar pagos.";

export type PaymentActionResult = { ok: true } | { ok: false; error: string };

function sessionBranchCode(branchId: string): string | null {
  return branchId === GLOBAL_BRANCH_ID ? null : branchId;
}

export type CreatePaymentRequestInput = {
  customerId: string;
  /** Importe como texto. Nunca un `number`: ver `parseAmountInput`. */
  monto: string;
  moneda: string;
  concepto: string;
  /** Reserva que este cobro paga, si lo es. */
  reservationId?: string | null;
  leadId?: string | null;
  /** ISO date. Opcional. */
  vence?: string | null;
};

export type CreatePaymentRequestResult =
  | { ok: true; paymentRequestId: string; requestNumber: string }
  | { ok: false; error: string };

export async function createPaymentRequestAction(
  input: CreatePaymentRequestInput,
): Promise<CreatePaymentRequestResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canManagePaymentRequests(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const amount = parseAmountInput(input.monto ?? "");
  if (!amount) {
    return {
      ok: false,
      error: "El monto debe ser un número positivo con hasta dos decimales.",
    };
  }
  const currency = (input.moneda ?? "").trim().toUpperCase();
  if (!isSupportedCurrency(currency)) {
    return { ok: false, error: "Selecciona una moneda válida (NIO o USD)." };
  }
  const concept = sanitizeText(input.concepto ?? "").slice(0, 200);
  if (!concept) {
    return { ok: false, error: "Describe el concepto del cobro." };
  }

  let dueDate: Date | null = null;
  if (input.vence) {
    const parsed = new Date(input.vence);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "La fecha de vencimiento no es válida." };
    }
    dueDate = parsed;
  }

  const actorBranch = sessionBranchCode(session.branchId);

  try {
    const prisma = getPrisma();
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      include: { branch: true },
    });
    if (!customer) return { ok: false, error: "El cliente no existe." };
    if (!canAccessBranch(session.roleEnum, actorBranch, customer.branch.code)) {
      return { ok: false, error: "El cliente no pertenece a tu sucursal." };
    }

    // La reserva, si la hay, tiene que ser de ESE cliente: sin esta comprobación
    // un cobro podría quedar colgado de la reserva de otra persona y confirmarla
    // al pagarse.
    let reservationId: string | null = null;
    let purpose: "RESERVA" | "SOLICITUD" = "SOLICITUD";
    if (input.reservationId?.trim()) {
      const reservation = await prisma.reservation.findUnique({
        where: { id: input.reservationId.trim() },
      });
      if (!reservation || reservation.customerId !== customer.id) {
        return { ok: false, error: "La reserva no corresponde a ese cliente." };
      }
      if (reservation.status !== "PENDIENTE_PAGO") {
        return {
          ok: false,
          error: "Solo puedes cobrar una reserva que siga pendiente de pago.",
        };
      }
      reservationId = reservation.id;
      purpose = "RESERVA";
    }

    let leadId: string | null = null;
    if (input.leadId?.trim()) {
      const lead = await prisma.lead.findUnique({
        where: { id: input.leadId.trim() },
        include: { branch: true },
      });
      if (!lead) return { ok: false, error: "El lead no existe." };
      if (!canAccessBranch(session.roleEnum, actorBranch, lead.branch.code)) {
        return { ok: false, error: "El lead no pertenece a tu alcance." };
      }
      leadId = lead.id;
    }

    const requestNumber = generateCrmCode("PAG");
    const created = await prisma.$transaction(async (tx) => {
      const request = await tx.paymentRequest.create({
        data: {
          requestNumber,
          branchId: customer.branchId,
          customerId: customer.id,
          reservationId,
          leadId,
          purpose,
          concept,
          amount: new Prisma.Decimal(amount),
          currency,
          status: "PENDIENTE",
          dueDate,
          createdById: session.uid,
        },
      });
      await notify(tx, {
        customerId: customer.id,
        paymentRequestId: request.id,
        reservationId,
        kind: "PAGO_SOLICITADO",
        title: "Tienes un pago pendiente",
        body: `${concept} — ${formatMoney(amount, currency)}.`,
      });
      return request;
    });

    revalidatePath("/panel/pagos");
    revalidatePath("/panel/reservas");
    return { ok: true, paymentRequestId: created.id, requestNumber };
  } catch {
    return { ok: false, error: "No se pudo crear la solicitud de pago." };
  }
}

/**
 * Anula una solicitud. Sólo mientras siga viva: una ya pagada no se puede
 * «des-cobrar» desde aquí, porque el dinero ya se movió y devolverlo es un acto
 * de caja, no un cambio de estado.
 */
export async function cancelPaymentRequestAction(input: {
  paymentRequestId: string;
}): Promise<PaymentActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canManagePaymentRequests(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const scope = getCrmScopeForUser(
    session.roleEnum,
    sessionBranchCode(session.branchId),
    session.uid,
  );

  try {
    const prisma = getPrisma();
    const request = await prisma.paymentRequest.findUnique({
      where: { id: input.paymentRequestId },
      include: { branch: true },
    });
    if (!request) return { ok: false, error: "La solicitud no existe." };
    if (scope.level === "branch" && request.branch.code !== scope.branchCode) {
      return { ok: false, error: "Esta solicitud no está en tu alcance." };
    }
    if (scope.level === "personal" && request.createdById !== scope.userId) {
      return { ok: false, error: "Esta solicitud no está en tu alcance." };
    }
    if (request.status === "PAGADA") {
      return { ok: false, error: "No puedes anular una solicitud ya pagada." };
    }
    if (request.status !== "PENDIENTE" && request.status !== "PROCESANDO") {
      return { ok: false, error: "La solicitud ya no está vigente." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.paymentRequest.update({
        where: { id: request.id },
        data: {
          status: "CANCELADA",
          cancelledById: session.uid,
          cancelledAt: new Date(),
        },
      });
      await notify(tx, {
        customerId: request.customerId,
        paymentRequestId: request.id,
        kind: "PAGO_CANCELADO",
        title: "Cobro anulado",
        body: `MotoMas anuló el cobro ${request.requestNumber}.`,
      });
    });

    revalidatePath("/panel/pagos");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo anular la solicitud." };
  }
}
