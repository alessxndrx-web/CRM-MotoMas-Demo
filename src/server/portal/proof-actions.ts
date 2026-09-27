"use server";

import { Prisma } from "@prisma/client";

import { verifyPortalToken } from "@/server/auth/session";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  notifyUsers,
  resolveProofReviewers,
} from "@/server/notifications/service";
import {
  isReservationPaymentMethod,
  reservationProofStatusLabels,
  reservationStatusLabels,
  type ReservationPaymentProofStatusValue,
  type ReservationStatusValue,
} from "@/server/operations/shared";
import { notify } from "@/server/payments/service";
import { isSupportedCurrency, parseAmountInput } from "@/server/payments/shared";
import type { PortalReservationDTO } from "@/server/portal/shared";
import { storeUploadedFile } from "@/server/storage/service";
import { RECEIPT_MIME_TYPES } from "@/server/storage/shared";

/**
 * Patch CRM-INT1 — el cliente sube el comprobante de su reserva desde el
 * portal.
 *
 * ## La regla de aislamiento, la misma que el cobro en línea
 *
 * **Ninguna función de este archivo acepta un identificador de cliente.** Las
 * dos reciben el testigo firmado que el portal emitió tras verificar código y
 * teléfono o cédula, y sacan de él al cliente. La reserva se busca **con el
 * cliente dentro del `where`**: una reserva ajena responde lo mismo que una que
 * no existe.
 *
 * ## Qué es y qué no es un comprobante del cliente
 *
 * Una **evidencia**. No marca nada como pagado y no aparta la unidad: la
 * reserva sigue PENDIENTE_PAGO y el comprobante nace PENDIENTE_REVISION. Lo que
 * aparta la unidad es que alguien de MotoMas lo verifique en el panel
 * (`reviewReservationPaymentProof`). Ni siquiera entonces es un ingreso: el
 * dinero nace en Caja cuando la venta se factura.
 *
 * ## Límites contra el abuso
 *
 * Como mucho un comprobante esperando revisión por reserva (lo impone también
 * un índice único parcial) y {@link MAX_PORTAL_ATTEMPTS} intentos en total por
 * reserva. El archivo pasa por la misma validación de contenido que el del
 * panel: tipo, tamaño medido sobre los bytes y firma binaria.
 */

const DB_REQUIRED = "El portal no está disponible en este momento.";
const NO_SESSION = "Tu sesión de consulta expiró. Vuelve a buscar tu proceso.";
const NOT_FOUND = "No encontramos esa reserva.";

/** Intentos por reserva, sumando rechazados y pendientes. */
const MAX_PORTAL_ATTEMPTS = 5;

async function resolveCustomerId(token: string): Promise<string | null> {
  const payload = await verifyPortalToken(token);
  return payload?.customerId ?? null;
}

export type PortalReservationsResult =
  | { ok: true; reservations: PortalReservationDTO[] }
  | { ok: false; error: string };

/** Las reservas vivas del cliente del testigo, con el estado de su comprobante. */
export async function getPortalReservationsAction(
  token: string,
): Promise<PortalReservationsResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const customerId = await resolveCustomerId(token);
  if (!customerId) return { ok: false, error: NO_SESSION };

  const reservations = await getPrisma().reservation.findMany({
    where: { customerId, status: { in: ["PENDIENTE_PAGO", "ACTIVA"] } },
    include: {
      branch: { select: { name: true } },
      motorcycleUnit: { select: { brand: true, model: true, year: true } },
      paymentProofs: {
        orderBy: { uploadedAt: "desc" },
        select: {
          status: true,
          source: true,
          uploadedAt: true,
          reviewedAt: true,
          reviewNotes: true,
        },
      },
      paymentRequests: { where: { status: "PAGADA" }, select: { id: true }, take: 1 },
    },
    orderBy: { reservedAt: "desc" },
    take: 10,
  });

  return {
    ok: true,
    reservations: reservations.map((reservation) => {
      const latest = reservation.paymentProofs[0] ?? null;
      const status = reservation.status as ReservationStatusValue;
      const attempts = reservation.paymentProofs.length;
      const blockedByProof =
        latest?.status === "PENDIENTE_REVISION" || latest?.status === "APROBADO";
      return {
        id: reservation.id,
        reservationNumber: reservation.reservationNumber,
        status,
        statusLabel: reservationStatusLabels[status] ?? reservation.status,
        unitLabel: `${reservation.motorcycleUnit.brand} ${reservation.motorcycleUnit.model} ${reservation.motorcycleUnit.year}`.trim(),
        branchName: reservation.branch.name,
        reservedAt: reservation.reservedAt.toISOString(),
        paidOnline: reservation.paymentRequests.length > 0,
        latestProof: latest
          ? {
              status: latest.status as ReservationPaymentProofStatusValue,
              statusLabel:
                reservationProofStatusLabels[
                  latest.status as ReservationPaymentProofStatusValue
                ] ?? latest.status,
              sentByCustomer: latest.source === "PORTAL_CLIENTE",
              uploadedAt: latest.uploadedAt.toISOString(),
              reviewedAt: latest.reviewedAt ? latest.reviewedAt.toISOString() : null,
              // El motivo de un rechazo sí se le enseña: es lo que le dice qué
              // volver a enviar. Las notas de una verificación se quedan dentro.
              rejectionReason: latest.status === "RECHAZADO" ? latest.reviewNotes : null,
            }
          : null,
        canUploadProof:
          status === "PENDIENTE_PAGO" &&
          reservation.paymentRequests.length === 0 &&
          !blockedByProof &&
          attempts < MAX_PORTAL_ATTEMPTS,
        attemptsLeft: Math.max(0, MAX_PORTAL_ATTEMPTS - attempts),
      };
    }),
  };
}

export type PortalProofUploadResult = { ok: true } | { ok: false; error: string };

/**
 * Sube el comprobante del cliente. Ver el comentario del archivo: **no aparta
 * la unidad ni marca nada como pagado.**
 */
export async function uploadPortalReservationProofAction(input: {
  token: string;
  reservationId: string;
  file: File;
  monto?: string | null;
  moneda?: string | null;
  metodo?: string | null;
  referencia?: string | null;
}): Promise<PortalProofUploadResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const customerId = await resolveCustomerId(input.token);
  if (!customerId) return { ok: false, error: NO_SESSION };

  const method = (input.metodo ?? "TRANSFERENCIA").trim().toUpperCase();
  if (!isReservationPaymentMethod(method)) {
    return { ok: false, error: "Selecciona cómo realizaste el pago." };
  }
  let amount: string | null = null;
  if (input.monto?.trim()) {
    amount = parseAmountInput(input.monto);
    if (!amount) return { ok: false, error: "El monto indicado no es válido." };
  }
  const currency = (input.moneda ?? "NIO").trim().toUpperCase();
  if (!isSupportedCurrency(currency)) {
    return { ok: false, error: "Selecciona una moneda válida (NIO o USD)." };
  }

  try {
    const prisma = getPrisma();
    // El cliente va en el `where`: una reserva ajena no se distingue de una
    // que no existe.
    const reservation = await prisma.reservation.findFirst({
      where: { id: input.reservationId, customerId },
      include: {
        motorcycleUnit: { select: { name: true } },
        paymentProofs: { select: { status: true } },
        paymentRequests: { where: { status: "PAGADA" }, select: { id: true }, take: 1 },
      },
    });
    if (!reservation) return { ok: false, error: NOT_FOUND };
    if (reservation.status !== "PENDIENTE_PAGO") {
      return {
        ok: false,
        error: "Esta reserva ya no está esperando pago. Si tienes dudas, comunícate con tu sucursal.",
      };
    }
    if (reservation.paymentRequests.length) {
      return { ok: false, error: "Esta reserva ya se pagó en línea." };
    }
    if (reservation.paymentProofs.some((proof) => proof.status === "PENDIENTE_REVISION")) {
      return {
        ok: false,
        error: "Ya recibimos un comprobante para esta reserva y lo estamos verificando.",
      };
    }
    if (reservation.paymentProofs.some((proof) => proof.status === "APROBADO")) {
      return { ok: false, error: "El pago de esta reserva ya fue verificado." };
    }
    if (reservation.paymentProofs.length >= MAX_PORTAL_ATTEMPTS) {
      return {
        ok: false,
        error: "Alcanzaste el máximo de comprobantes para esta reserva. Comunícate con tu sucursal.",
      };
    }

    const stored = await storeUploadedFile({
      file: input.file,
      allowedMimeTypes: RECEIPT_MIME_TYPES,
      branchId: reservation.branchId,
      uploadedByCustomerId: customerId,
    });
    if (!stored.ok) return { ok: false, error: stored.error };

    await prisma.$transaction(async (tx) => {
      await tx.reservationPaymentProof.create({
        data: {
          reservationId: reservation.id,
          storedFileId: stored.storedFileId,
          source: "PORTAL_CLIENTE",
          amount: amount ? new Prisma.Decimal(amount) : null,
          currency: amount ? currency : null,
          method,
          reference: input.referencia?.trim()?.slice(0, 120) || null,
          status: "PENDIENTE_REVISION",
          uploadedByCustomerId: customerId,
        },
      });
      // Quien verifica en esa sucursal y el vendedor de la reserva: es su
      // cliente, y es quien le va a responder si algo no cuadra.
      await notifyUsers(tx, {
        userIds: [
          ...(await resolveProofReviewers(tx, reservation.branchId)),
          reservation.sellerId,
        ],
        kind: "COMPROBANTE_POR_REVISAR",
        title: "El cliente envió un comprobante",
        body: `Reserva ${reservation.reservationNumber} · ${reservation.motorcycleUnit.name}`,
        reservationId: reservation.id,
      });
      await notify(tx, {
        customerId,
        reservationId: reservation.id,
        kind: "COMPROBANTE_RECIBIDO",
        title: "Recibimos tu comprobante",
        body: `Lo verificaremos y te avisaremos aquí. Tu reserva ${reservation.reservationNumber} sigue pendiente hasta entonces.`,
      });
    });

    return { ok: true };
  } catch (error) {
    // El índice único parcial: otra pestaña del mismo cliente subió uno a la
    // vez. Para él es la misma situación que el aviso de arriba.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        error: "Ya recibimos un comprobante para esta reserva y lo estamos verificando.",
      };
    }
    return { ok: false, error: "No pudimos recibir tu comprobante. Inténtalo de nuevo." };
  }
}
