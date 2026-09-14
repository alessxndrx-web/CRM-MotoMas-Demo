"use server";

import { Prisma } from "@prisma/client";

import { verifyPortalToken } from "@/server/auth/session";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { getActivePaymentProvider } from "@/server/payments/providers";
import {
  listCustomerNotifications,
  listCustomerPaymentRequests,
} from "@/server/payments/queries";
import {
  payablePaymentRequestStatuses,
  type CustomerNotificationDTO,
  type CustomerPaymentRequestDTO,
  type PaymentRequestStatusValue,
} from "@/server/payments/shared";

/**
 * Patch CRM-QA1 — lo que el cliente puede hacer desde el portal público.
 *
 * ## La regla de aislamiento
 *
 * **Ninguna función de este archivo acepta un identificador de cliente.** Todas
 * reciben el testigo firmado que el portal emitió tras verificar código +
 * teléfono/cédula, y sacan el cliente de dentro del testigo. Por construcción no
 * existe el parámetro con el que un cliente pediría los cobros de otro.
 *
 * ## El importe
 *
 * {@link startPortalPaymentAction} recibe el id de la solicitud y **nada más**.
 * El importe sale de la fila. No hay ningún campo de cantidad en ninguna entrada
 * de este archivo.
 */

const DB_REQUIRED = "El portal de pagos no está disponible en este momento.";
const NO_SESSION = "Tu sesión de consulta expiró. Vuelve a buscar tu proceso.";

async function resolveCustomerId(token: string): Promise<string | null> {
  const payload = await verifyPortalToken(token);
  return payload?.customerId ?? null;
}

export type PortalPaymentsResult =
  | {
      ok: true;
      requests: CustomerPaymentRequestDTO[];
      notifications: CustomerNotificationDTO[];
      /** Nulo mientras MotoMas no tenga pasarela contratada y configurada. */
      provider: { key: string; label: string; isSandbox: boolean } | null;
    }
  | { ok: false; error: string };

/**
 * Cobros y avisos del cliente. Es también la función que el portal consulta
 * periódicamente: devuelve el estado completo, no un delta, porque un delta
 * obligaría al navegador a llevar la cuenta de lo que ya vio y una recarga la
 * perdería.
 */
export async function getPortalPaymentsAction(
  token: string,
): Promise<PortalPaymentsResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const customerId = await resolveCustomerId(token);
  if (!customerId) return { ok: false, error: NO_SESSION };

  const [requests, notifications] = await Promise.all([
    listCustomerPaymentRequests(customerId),
    listCustomerNotifications(customerId),
  ]);

  const adapter = getActivePaymentProvider();
  return {
    ok: true,
    requests,
    notifications,
    provider: adapter
      ? { key: adapter.key, label: adapter.label, isSandbox: adapter.isSandbox }
      : null,
  };
}

export type StartPortalPaymentResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string };

/**
 * Abre un intento de cobro contra la pasarela y devuelve a dónde mandar al
 * cliente.
 *
 * **No marca nada como pagado.** Deja la solicitud en PROCESANDO y crea una
 * `PaymentTransaction` en INICIADA. Quien la aprueba es el aviso firmado del
 * proveedor, en `applyProviderWebhook`.
 */
export async function startPortalPaymentAction(input: {
  token: string;
  paymentRequestId: string;
  /** A dónde vuelve el cliente después de pagar. Ruta interna solamente. */
  returnPath: string;
}): Promise<StartPortalPaymentResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const customerId = await resolveCustomerId(input.token);
  if (!customerId) return { ok: false, error: NO_SESSION };

  const adapter = getActivePaymentProvider();
  if (!adapter) {
    return {
      ok: false,
      error:
        "El pago en línea todavía no está habilitado. Comunícate con tu sucursal.",
    };
  }

  const prisma = getPrisma();
  const request = await prisma.paymentRequest.findUnique({
    where: { id: input.paymentRequestId },
  });
  // Mismo `null` para «no existe» y «no es tuyo»: un cliente no puede averiguar
  // si un identificador ajeno corresponde a un cobro real.
  if (!request || request.customerId !== customerId) {
    return { ok: false, error: "No encontramos ese cobro." };
  }
  if (!payablePaymentRequestStatuses.includes(request.status as PaymentRequestStatusValue)) {
    return { ok: false, error: "Este cobro ya no admite pago." };
  }
  if (request.dueDate && request.dueDate.getTime() < Date.now()) {
    return { ok: false, error: "Este cobro venció. Comunícate con tu sucursal." };
  }

  // Sólo rutas internas: un `returnUrl` absoluto convertiría esta acción en un
  // redirector abierto con la marca de MotoMas delante.
  const returnPath =
    input.returnPath.startsWith("/") && !input.returnPath.startsWith("//")
      ? input.returnPath
      : "/mi-reserva";

  try {
    const transaction = await prisma.paymentTransaction.create({
      data: {
        paymentRequestId: request.id,
        provider: adapter.key,
        // El importe se copia de la fila, no de la entrada. Congelarlo aquí es
        // lo que permite que el webhook compare contra lo que se pidió de verdad.
        amount: new Prisma.Decimal(request.amount),
        currency: request.currency,
        status: "INICIADA",
      },
    });

    const checkout = await adapter.createCheckout({
      paymentRequestId: request.id,
      transactionId: transaction.id,
      amount: request.amount.toFixed(2),
      currency: request.currency,
      concept: request.concept,
      returnUrl: returnPath,
    });

    await prisma.$transaction([
      prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          providerReference: checkout.providerReference,
          status: "PENDIENTE",
        },
      }),
      prisma.paymentRequest.updateMany({
        where: { id: request.id, status: "PENDIENTE" },
        data: { status: "PROCESANDO" },
      }),
    ]);

    return { ok: true, redirectUrl: checkout.redirectUrl };
  } catch {
    return { ok: false, error: "No pudimos iniciar el pago. Inténtalo de nuevo." };
  }
}

/** Marca los avisos del cliente como leídos. */
export async function markPortalNotificationsReadAction(
  token: string,
): Promise<{ ok: boolean }> {
  if (!isDatabaseConfigured()) return { ok: false };
  const customerId = await resolveCustomerId(token);
  if (!customerId) return { ok: false };

  await getPrisma().customerNotification.updateMany({
    where: { customerId, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
}
