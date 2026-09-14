import { Prisma } from "@prisma/client";

import { getPrisma } from "@/server/db/prisma";
import {
  getPaymentProvider,
  type ProviderWebhookEvent,
} from "@/server/payments/providers";
import { notifyUsers } from "@/server/notifications/service";
import { isSupportedCurrency } from "@/server/payments/shared";

/**
 * Patch CRM-QA1 — la máquina de estados del cobro y el manejador del aviso del
 * proveedor.
 *
 * ## La regla que gobierna este archivo
 *
 * **El estado real de un pago lo dicta el proveedor, verificado.** Nunca la
 * vuelta del navegador del cliente a una URL de éxito: esa URL la puede escribir
 * cualquiera en la barra de direcciones. La página de retorno sólo enseña lo que
 * la base ya sabe; quien cambia la base es {@link applyProviderWebhook}.
 *
 * ## Cómo un pago no se aplica dos veces
 *
 * Tres cierres, no uno:
 *
 * 1. `payment_webhook_events(provider, event_id)` es único, y su INSERT ocurre
 *    **dentro de la misma transacción** que aplica el pago. Un reenvío choca y
 *    deshace la transacción entera: el pago no se aplicó una segunda vez.
 * 2. `payment_transactions(provider, provider_reference)` es único, así que dos
 *    eventos no pueden inventar dos cobros para la misma referencia.
 * 3. La transición sólo se aplica si la fila está en un estado que la admite. Un
 *    evento aprobado sobre una solicitud ya PAGADA no vuelve a sellarla.
 *
 * ## Lo que este archivo NO hace
 *
 * **No contabiliza.** No crea `CashDocument`, no crea `AccountingDocument` y no
 * amplía `AccountingEventType`. Un anticipo cobrado por la web es un hecho
 * comercial con prueba; el ingreso sigue naciendo en Caja cuando la venta se
 * factura. Añadir un miembro al enumerado contable sin su estrategia de asiento
 * y su regla de mapeo es justo lo que CLAUDE.md prohíbe.
 */

export type WebhookOutcome =
  | "aplicado"
  | "duplicado"
  | "sin_transaccion"
  | "importe_no_coincide"
  | "moneda_no_coincide"
  | "estado_no_aplicable";

export type ApplyWebhookResult =
  | { ok: true; outcome: WebhookOutcome }
  | { ok: false; error: string };

/** Digest del cuerpo, para auditar sin guardar datos del pagador. */
async function digest(rawBody: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

/**
 * Aplica un aviso del proveedor. Es el único camino por el que una solicitud de
 * pago llega a PAGADA.
 *
 * Devuelve `ok: true` también para los casos que **no** aplican nada
 * (`duplicado`, `sin_transaccion`, …): son respuestas correctas al proveedor,
 * que si recibiera un error seguiría reintentando eternamente un evento que
 * nunca va a poder procesarse. `ok: false` queda para lo que sí es un fallo de
 * autenticidad o de configuración.
 */
export async function applyProviderWebhook(input: {
  provider: string;
  rawBody: string;
  headers: Record<string, string | undefined>;
}): Promise<ApplyWebhookResult> {
  const adapter = getPaymentProvider(input.provider);
  if (!adapter) return { ok: false, error: "Proveedor desconocido." };

  const verification = adapter.verifyWebhook({
    rawBody: input.rawBody,
    headers: input.headers,
  });
  // Un cuerpo sin firma válida NO deja rastro en la base: registrarlo sería
  // permitir que cualquiera escriba filas en `payment_webhook_events` sin
  // autenticarse.
  if (!verification.ok) return { ok: false, error: verification.error };

  const event = verification.event;
  const payloadDigest = await digest(input.rawBody);
  const prisma = getPrisma();

  try {
    return await prisma.$transaction(async (tx) => {
      const transaction = await tx.paymentTransaction.findUnique({
        where: {
          provider_providerReference: {
            provider: adapter.key,
            providerReference: event.providerReference,
          },
        },
        include: { paymentRequest: true },
      });

      if (!transaction) {
        await tx.paymentWebhookEvent.create({
          data: {
            provider: adapter.key,
            eventId: event.eventId,
            outcome: "sin_transaccion",
            payloadDigest,
          },
        });
        return { ok: true as const, outcome: "sin_transaccion" as const };
      }

      const mismatch = detectMismatch(transaction.amount, transaction.currency, event);
      if (mismatch) {
        await tx.paymentWebhookEvent.create({
          data: {
            provider: adapter.key,
            eventId: event.eventId,
            paymentTransactionId: transaction.id,
            outcome: mismatch,
            payloadDigest,
          },
        });
        // El cobro queda marcado para que nadie lo dé por bueno mirando la
        // pantalla: el proveedor dice una cifra y nosotros pedimos otra.
        await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: {
            status: "RECHAZADA",
            failureReason:
              mismatch === "importe_no_coincide"
                ? "El importe informado por la pasarela no coincide con el solicitado."
                : "La moneda informada por la pasarela no coincide con la solicitada.",
          },
        });
        return { ok: true as const, outcome: mismatch };
      }

      // El INSERT del evento va ANTES de aplicar nada. Si choca con el único,
      // la transacción se deshace entera y no se aplicó ningún pago.
      await tx.paymentWebhookEvent.create({
        data: {
          provider: adapter.key,
          eventId: event.eventId,
          paymentTransactionId: transaction.id,
          outcome: outcomeLabel(event.outcome),
          payloadDigest,
        },
      });

      if (event.outcome === "pending") {
        await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: "PENDIENTE" },
        });
        await tx.paymentRequest.updateMany({
          where: { id: transaction.paymentRequestId, status: "PENDIENTE" },
          data: { status: "PROCESANDO" },
        });
        await notify(tx, {
          customerId: transaction.paymentRequest.customerId,
          paymentRequestId: transaction.paymentRequestId,
          kind: "PAGO_PROCESANDO",
          title: "Tu pago está en proceso",
          body: `Estamos confirmando el pago de ${transaction.paymentRequest.requestNumber}.`,
        });
        return { ok: true as const, outcome: "aplicado" as const };
      }

      if (event.outcome !== "approved") {
        await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: {
            status: event.outcome === "cancelled" ? "CANCELADA" : "RECHAZADA",
            failureReason: event.failureReason,
          },
        });
        // La solicitud vuelve a PENDIENTE: un intento fallido no la cierra, el
        // cliente puede volver a pagarla.
        await tx.paymentRequest.updateMany({
          where: { id: transaction.paymentRequestId, status: "PROCESANDO" },
          data: { status: "PENDIENTE" },
        });
        await notify(tx, {
          customerId: transaction.paymentRequest.customerId,
          paymentRequestId: transaction.paymentRequestId,
          kind: event.outcome === "cancelled" ? "PAGO_CANCELADO" : "PAGO_FALLIDO",
          title:
            event.outcome === "cancelled"
              ? "Pago cancelado"
              : "No pudimos procesar tu pago",
          body:
            event.failureReason ??
            "Puedes intentarlo de nuevo desde tu portal cuando quieras.",
        });
        return { ok: true as const, outcome: "aplicado" as const };
      }

      // --- Pago aprobado ---------------------------------------------------

      const request = transaction.paymentRequest;
      if (request.status === "PAGADA") {
        // Otra transacción ya la pagó. El evento queda registrado arriba con su
        // propio identificador, pero nada se vuelve a sellar.
        await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: "APROBADA", settledAt: new Date() },
        });
        return { ok: true as const, outcome: "estado_no_aplicable" as const };
      }
      if (request.status === "CANCELADA" || request.status === "EXPIRADA") {
        await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: {
            status: "APROBADA",
            settledAt: new Date(),
            failureReason:
              "La solicitud ya no estaba vigente cuando llegó la confirmación.",
          },
        });
        return { ok: true as const, outcome: "estado_no_aplicable" as const };
      }

      const settledAt = new Date();
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: { status: "APROBADA", settledAt },
      });
      await tx.paymentRequest.update({
        where: { id: request.id },
        data: { status: "PAGADA", paidAt: settledAt },
      });
      await notify(tx, {
        customerId: request.customerId,
        paymentRequestId: request.id,
        kind: "PAGO_CONFIRMADO",
        title: "Pago confirmado",
        body: `Recibimos tu pago de ${request.requestNumber}. ¡Gracias!`,
      });

      if (request.reservationId) {
        await confirmReservationFromPayment(tx, request.reservationId, request.id);
      }

      return { ok: true as const, outcome: "aplicado" as const };
    });
  } catch (error) {
    // El choque con `payment_webhook_events(provider, event_id)` es el reenvío
    // del proveedor: respuesta correcta, nada aplicado.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: true, outcome: "duplicado" };
    }
    return { ok: false, error: "No se pudo procesar el aviso de pago." };
  }
}

function detectMismatch(
  expectedAmount: Prisma.Decimal,
  expectedCurrency: string,
  event: ProviderWebhookEvent,
): "importe_no_coincide" | "moneda_no_coincide" | null {
  if (!isSupportedCurrency(event.currency)) return "moneda_no_coincide";
  if (event.currency !== expectedCurrency) return "moneda_no_coincide";
  let reported: Prisma.Decimal;
  try {
    reported = new Prisma.Decimal(event.amount);
  } catch {
    return "importe_no_coincide";
  }
  // Comparación decimal exacta. Un pago parcial NO es un pago: el anticipo que
  // libera una unidad es el importe que MotoMas pidió, no una parte de él.
  return reported.equals(expectedAmount) ? null : "importe_no_coincide";
}

function outcomeLabel(outcome: ProviderWebhookEvent["outcome"]): string {
  return `proveedor:${outcome}`;
}

/**
 * Un pago verificado **satisface el requisito de comprobante** de la reserva.
 *
 * Esa es la diferencia documentada entre los dos caminos: el comprobante subido
 * a mano es una foto que un supervisor tiene que creerse, y el aviso firmado del
 * proveedor es una confirmación criptográficamente atribuible. Exigir además la
 * foto habría sido pedir una prueba más débil encima de una más fuerte.
 *
 * Si la unidad ya no está disponible —alguien la vendió mientras la reserva
 * seguía sin pagar— la reserva **no** se confirma y el cliente recibe un aviso
 * que lo dice. El pago queda cobrado y visible: devolverlo es una decisión de
 * caja, no de este código.
 */
async function confirmReservationFromPayment(
  tx: Prisma.TransactionClient,
  reservationId: string,
  paymentRequestId: string,
): Promise<void> {
  const reservation = await tx.reservation.findUnique({
    where: { id: reservationId },
    include: { motorcycleUnit: true },
  });
  if (!reservation || reservation.status !== "PENDIENTE_PAGO") return;

  if (reservation.motorcycleUnit.status !== "AVAILABLE") {
    await notify(tx, {
      customerId: reservation.customerId,
      paymentRequestId,
      reservationId,
      kind: "PAGO_CONFIRMADO",
      title: "Tu pago llegó, pero la unidad ya no está disponible",
      body:
        "Recibimos tu pago y la sucursal te contactará para asignarte otra " +
        "unidad o gestionar la devolución.",
    });
    return;
  }

  await tx.reservation.update({
    where: { id: reservation.id },
    data: {
      status: "ACTIVA",
      confirmedAt: new Date(),
      activeUnitLock: reservation.motorcycleUnitId,
    },
  });
  await tx.motorcycleUnit.update({
    where: { id: reservation.motorcycleUnitId },
    data: { status: "RESERVED" },
  });
  await tx.inventoryMovement.create({
    data: {
      motorcycleUnitId: reservation.motorcycleUnitId,
      branchId: reservation.branchId,
      type: "RESERVA",
      reason: `Reserva ${reservation.reservationNumber} confirmada por pago en línea`,
      notes: null,
      createdByUserId: reservation.sellerId,
      date: new Date(),
    },
  });
  await notify(tx, {
    customerId: reservation.customerId,
    paymentRequestId,
    reservationId: reservation.id,
    kind: "RESERVA_CONFIRMADA",
    title: "Tu reserva está confirmada",
    body: `La unidad de la reserva ${reservation.reservationNumber} queda apartada a tu nombre.`,
  });

  /*
   * Patch CRM-AUD2 — y el vendedor de la reserva.
   *
   * Este es el único de los cinco avisos que **no nace de una acción de un
   * empleado**: lo dispara el webhook del proveedor, sin nadie delante de una
   * pantalla. Sin él, la unidad se bloqueaba sola y el vendedor se enteraba la
   * próxima vez que abriera Reservas — o no se enteraba.
   *
   * Por eso no lleva `exceptUserId`: no hay actor del que excluirse.
   */
  await notifyUsers(tx, {
    userIds: [reservation.sellerId],
    kind: "PAGO_CONFIRMADO",
    title: "Pago en línea confirmado",
    body: `La reserva ${reservation.reservationNumber} quedó activa y la unidad apartada.`,
    reservationId: reservation.id,
    paymentRequestId,
  });
}

/**
 * Escribe un aviso para UN cliente. Siempre dentro de la transacción que provoca
 * el cambio: un aviso que sobreviviera a un `rollback` estaría contándole al
 * cliente algo que no pasó.
 */
export async function notify(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    kind:
      | "PAGO_SOLICITADO"
      | "PAGO_PROCESANDO"
      | "PAGO_CONFIRMADO"
      | "PAGO_FALLIDO"
      | "PAGO_CANCELADO"
      | "RESERVA_CONFIRMADA"
      | "COMPROBANTE_APROBADO"
      | "COMPROBANTE_RECHAZADO";
    title: string;
    body: string;
    paymentRequestId?: string | null;
    reservationId?: string | null;
  },
): Promise<void> {
  await tx.customerNotification.create({
    data: {
      customerId: input.customerId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      paymentRequestId: input.paymentRequestId ?? null,
      reservationId: input.reservationId ?? null,
    },
  });
}
