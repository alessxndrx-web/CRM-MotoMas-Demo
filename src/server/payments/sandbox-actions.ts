"use server";

import { randomUUID } from "node:crypto";

import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  getActivePaymentProvider,
  signSandboxPayload,
} from "@/server/payments/providers";
import { applyProviderWebhook } from "@/server/payments/service";

/**
 * Patch CRM-QA1 — la pasarela de pruebas, por dentro.
 *
 * ## Qué es y qué no es
 *
 * **No finge un cobro.** Es un proveedor de pago explícito cuyo «banco» es una
 * persona pulsando un botón. Lo que sí hace de verdad, byte a byte, es todo lo
 * demás: construye el cuerpo del aviso, lo firma con HMAC-SHA256 usando
 * `PAYMENTS_SANDBOX_SECRET` y lo entrega a {@link applyProviderWebhook}, que es
 * exactamente el mismo manejador que atenderá al proveedor real.
 *
 * Eso significa que la verificación de firma, la idempotencia por evento, la
 * comprobación de importe y moneda y la aplicación atómica del pago **quedan
 * ejercitadas** antes de que exista ninguna integración real.
 *
 * ## Por qué no da el rodeo por HTTP
 *
 * Llamar a la propia ruta con `fetch` exigiría conocer la URL pública del
 * despliegue, que no siempre está configurada, y añadiría un fallo de red a un
 * camino de pruebas. Lo único que se salta es el transporte; la ruta
 * `/api/webhooks/pagos/[provider]` existe y hace exactamente esto mismo con el
 * cuerpo que recibe.
 *
 * ## Producción
 *
 * `isConfigured()` del adaptador devuelve falso en producción salvo que alguien
 * ponga `PAYMENTS_ALLOW_SANDBOX=true` a propósito, y sin proveedor activo estas
 * acciones no hacen nada. La interfaz, además, rotula la pasarela como de
 * pruebas allí donde aparece.
 */

export type SandboxSettleResult = { ok: true } | { ok: false; error: string };

async function requireSandbox(): Promise<string | null> {
  const adapter = getActivePaymentProvider();
  if (!adapter || !adapter.isSandbox) return null;
  return adapter.key;
}

/**
 * Lo que la página de pruebas necesita mostrar: qué se está pagando.
 *
 * Devuelve `null` para una referencia desconocida sin decir por qué, igual que
 * el resto del portal: una referencia es adivinable y no debe servir para
 * comprobar si un cobro existe.
 */
export async function getSandboxCheckoutAction(input: {
  providerReference: string;
}): Promise<
  | { ok: true; concept: string; amount: string; currency: string; requestNumber: string }
  | { ok: false; error: string }
> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "No disponible." };
  }
  const provider = await requireSandbox();
  if (!provider) return { ok: false, error: "No disponible." };

  const transaction = await getPrisma().paymentTransaction.findUnique({
    where: {
      provider_providerReference: {
        provider,
        providerReference: input.providerReference,
      },
    },
    include: { paymentRequest: true },
  });
  if (!transaction) return { ok: false, error: "No disponible." };

  return {
    ok: true,
    concept: transaction.paymentRequest.concept,
    amount: transaction.amount.toFixed(2),
    currency: transaction.currency,
    requestNumber: transaction.paymentRequest.requestNumber,
  };
}

/**
 * Emite un aviso firmado como lo haría el proveedor.
 *
 * El importe y la moneda salen de la **transacción**, no de la entrada: así el
 * flujo normal produce un evento que cuadra, y las pruebas que necesitan un
 * descuadre lo fuerzan llamando directamente a `applyProviderWebhook` con otro
 * cuerpo, que es donde esa comprobación se debe ejercitar.
 */
export async function settleSandboxPaymentAction(input: {
  providerReference: string;
  outcome: "approved" | "rejected";
}): Promise<SandboxSettleResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "No disponible." };
  }
  const provider = await requireSandbox();
  if (!provider) return { ok: false, error: "No disponible." };

  const transaction = await getPrisma().paymentTransaction.findUnique({
    where: {
      provider_providerReference: {
        provider,
        providerReference: input.providerReference,
      },
    },
  });
  if (!transaction) return { ok: false, error: "No disponible." };

  const rawBody = JSON.stringify({
    eventId: `evt-${randomUUID()}`,
    providerReference: input.providerReference,
    outcome: input.outcome,
    amount: transaction.amount.toFixed(2),
    currency: transaction.currency,
    failureReason:
      input.outcome === "rejected" ? "Pago rechazado en la pasarela de pruebas." : null,
  });

  const signature = signSandboxPayload(rawBody);
  if (!signature) {
    return { ok: false, error: "La pasarela de pruebas no está configurada." };
  }

  const result = await applyProviderWebhook({
    provider,
    rawBody,
    headers: { "x-motomas-signature": signature },
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}
