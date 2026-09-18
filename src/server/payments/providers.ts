import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Patch CRM-QA1 — el adaptador de pasarela de pago.
 *
 * ## Por qué hay una abstracción y no una integración
 *
 * **Este repositorio no tiene ningún proveedor de pago.** Se buscó: no hay
 * Stripe, ni PayPal, ni BAC, ni Tilopay, ni CyberSource, ni ninguna credencial
 * de comercio en `.env.example`. Elegir uno y escribir su cliente HTTP habría
 * sido inventar una decisión de negocio que nadie ha tomado, y peor: habría
 * dejado código que no se puede ejecutar ni probar contra nada.
 *
 * Lo que sí se puede construir entero y correcto es **todo lo que rodea al
 * proveedor**: el dominio del cobro, la máquina de estados, la idempotencia, la
 * verificación de firma y la aplicación atómica del pago. Eso es lo que hay
 * aquí, detrás de una interfaz de cuatro métodos.
 *
 * ## Qué falta para producción
 *
 * Escribir un `PaymentProviderAdapter` para el proveedor que MotoMas contrate y
 * registrarlo abajo. Nada más del sistema cambia. Ver docs/PAYMENTS.md §7.
 *
 * ## El adaptador `sandbox`
 *
 * **No finge cobrar.** Es un proveedor de pruebas explícito: su página de pago
 * dice que lo es, y confirma o rechaza porque una persona pulsa un botón. Lo que
 * sí ejercita de verdad es el camino que importa — firma HMAC real, evento con
 * identificador propio, reenvío que no aplica dos veces, importe y moneda
 * comprobados contra la fila. Está **apagado en producción** salvo que alguien
 * ponga `PAYMENTS_ALLOW_SANDBOX=true` a propósito.
 */

export type ProviderCheckout = {
  /** A dónde se manda al cliente para pagar. */
  redirectUrl: string;
  /** Identificador del cobro en el proveedor. */
  providerReference: string;
};

/** Lo que un aviso verificado del proveedor afirma. */
export type ProviderWebhookEvent = {
  /** Identificador del EVENTO, no del cobro. Es la clave de idempotencia. */
  eventId: string;
  providerReference: string;
  outcome: "approved" | "rejected" | "cancelled" | "pending";
  /** Importe tal y como el proveedor lo reporta, en texto con dos decimales. */
  amount: string;
  currency: string;
  failureReason: string | null;
};

export type WebhookVerification =
  | { ok: true; event: ProviderWebhookEvent }
  | { ok: false; error: string };

export type PaymentProviderAdapter = {
  key: string;
  label: string;
  /** Si es un proveedor de pruebas. La interfaz lo dice en pantalla. */
  isSandbox: boolean;
  /** Falso mientras falten credenciales: sin esto no se ofrece pagar en línea. */
  isConfigured(): boolean;
  createCheckout(input: {
    paymentRequestId: string;
    transactionId: string;
    amount: string;
    currency: string;
    concept: string;
    returnUrl: string;
  }): Promise<ProviderCheckout>;
  /**
   * Verifica la autenticidad del cuerpo recibido. Recibe el cuerpo **en crudo**:
   * cualquier firma se calcula sobre los bytes exactos, y volver a serializar un
   * objeto ya parseado produce otros bytes y otra firma.
   */
  verifyWebhook(input: {
    rawBody: string;
    headers: Record<string, string | undefined>;
  }): WebhookVerification;
};

const SANDBOX_SIGNATURE_HEADER = "x-motomas-signature";

function sandboxSecret(): string | null {
  return process.env.PAYMENTS_SANDBOX_SECRET?.trim() || null;
}

function sandboxAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.PAYMENTS_ALLOW_SANDBOX === "true";
}

/**
 * Firma de pruebas: HMAC-SHA256 del cuerpo en crudo, en hexadecimal.
 *
 * Exportada porque la página de pago de pruebas la necesita para producir un
 * aviso **genuinamente firmado**. Si esa página pudiera saltarse la firma, la
 * verificación no estaría probada por nada.
 */
export function signSandboxPayload(rawBody: string): string | null {
  const secret = sandboxSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

const sandboxAdapter: PaymentProviderAdapter = {
  key: "sandbox",
  label: "Pasarela de pruebas",
  isSandbox: true,
  isConfigured() {
    return sandboxAllowed() && sandboxSecret() !== null;
  },
  async createCheckout(input) {
    const providerReference = `SBX-${randomUUID()}`;
    const params = new URLSearchParams({
      ref: providerReference,
      tx: input.transactionId,
      volver: input.returnUrl,
    });
    return {
      providerReference,
      redirectUrl: `/pago/pruebas?${params.toString()}`,
    };
  },
  verifyWebhook({ rawBody, headers }) {
    if (!sandboxAllowed()) {
      return { ok: false, error: "La pasarela de pruebas está deshabilitada." };
    }
    const expected = signSandboxPayload(rawBody);
    if (!expected) {
      return { ok: false, error: "La pasarela de pruebas no está configurada." };
    }

    const provided = headers[SANDBOX_SIGNATURE_HEADER];
    if (!provided || !equalsConstantTime(provided, expected)) {
      return { ok: false, error: "Firma no válida." };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, error: "Cuerpo no válido." };
    }
    const event = readSandboxPayload(payload);
    if (!event) return { ok: false, error: "Evento incompleto." };
    return { ok: true, event };
  },
};

function readSandboxPayload(payload: unknown): ProviderWebhookEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const raw = payload as Record<string, unknown>;
  const eventId = typeof raw.eventId === "string" ? raw.eventId : null;
  const providerReference =
    typeof raw.providerReference === "string" ? raw.providerReference : null;
  const outcome = typeof raw.outcome === "string" ? raw.outcome : null;
  const amount = typeof raw.amount === "string" ? raw.amount : null;
  const currency = typeof raw.currency === "string" ? raw.currency : null;

  if (!eventId || !providerReference || !amount || !currency) return null;
  if (
    outcome !== "approved" &&
    outcome !== "rejected" &&
    outcome !== "cancelled" &&
    outcome !== "pending"
  ) {
    return null;
  }

  return {
    eventId,
    providerReference,
    outcome,
    amount,
    currency,
    failureReason:
      typeof raw.failureReason === "string" ? raw.failureReason : null,
  };
}

/**
 * Comparación en tiempo constante sobre cadenas de longitud posiblemente
 * distinta. `timingSafeEqual` exige longitudes iguales, así que la diferencia de
 * longitud se resuelve antes — que no filtra nada útil: la longitud de una firma
 * HMAC-SHA256 es pública y siempre la misma.
 */
function equalsConstantTime(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * El registro. Cada adaptador nuevo se añade a esta lista y a
 * `docs/PAYMENTS.md`; no hace falta tocar nada más.
 */
const adapters: PaymentProviderAdapter[] = [sandboxAdapter];

export function getPaymentProvider(key: string): PaymentProviderAdapter | null {
  return adapters.find((adapter) => adapter.key === key) ?? null;
}

/**
 * El proveedor que atiende los cobros ahora mismo, o `null`.
 *
 * `null` es una respuesta legítima y frecuente: significa que MotoMas todavía no
 * ha contratado pasarela. La interfaz **no muestra ningún botón de pagar en
 * línea** en ese caso, en lugar de mostrar uno que fallaría.
 */
export function getActivePaymentProvider(): PaymentProviderAdapter | null {
  const key = process.env.PAYMENTS_PROVIDER?.trim();
  if (!key) return null;
  const adapter = getPaymentProvider(key);
  if (!adapter || !adapter.isConfigured()) return null;
  return adapter;
}
