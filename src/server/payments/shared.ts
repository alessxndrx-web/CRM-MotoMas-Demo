/**
 * Patch CRM-QA1 — tipos, etiquetas y reglas de dinero del cobro al cliente.
 *
 * Puro y sin base de datos, como el resto de los `shared.ts` del repositorio,
 * para que el portal público y el panel compartan las mismas etiquetas sin
 * arrastrar Prisma al navegador.
 */

export type PaymentRequestPurposeValue = "RESERVA" | "SOLICITUD";

export const paymentRequestPurposeLabels: Record<
  PaymentRequestPurposeValue,
  string
> = {
  RESERVA: "Reserva de unidad",
  SOLICITUD: "Solicitud de pago",
};

export type PaymentRequestStatusValue =
  | "PENDIENTE"
  | "PROCESANDO"
  | "PAGADA"
  | "CANCELADA"
  | "EXPIRADA";

export const paymentRequestStatusValues: PaymentRequestStatusValue[] = [
  "PENDIENTE",
  "PROCESANDO",
  "PAGADA",
  "CANCELADA",
  "EXPIRADA",
];

export const paymentRequestStatusLabels: Record<
  PaymentRequestStatusValue,
  string
> = {
  PENDIENTE: "Pendiente de pago",
  PROCESANDO: "Pago en proceso",
  PAGADA: "Pagada",
  CANCELADA: "Cancelada",
  EXPIRADA: "Expirada",
};

/**
 * Estados desde los que una solicitud todavía admite un intento de cobro.
 *
 * Se declara aquí y no en cada sitio que lo necesita porque lo consultan la
 * acción del cliente, la del empleado y el manejador del webhook: tres puntos en
 * los que la misma pregunta tiene que dar la misma respuesta.
 */
export const payablePaymentRequestStatuses: PaymentRequestStatusValue[] = [
  "PENDIENTE",
  "PROCESANDO",
];

export type PaymentTransactionStatusValue =
  | "INICIADA"
  | "PENDIENTE"
  | "APROBADA"
  | "RECHAZADA"
  | "CANCELADA";

export const paymentTransactionStatusLabels: Record<
  PaymentTransactionStatusValue,
  string
> = {
  INICIADA: "Iniciada",
  PENDIENTE: "Pendiente en la pasarela",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  CANCELADA: "Cancelada",
};

export type CustomerNotificationKindValue =
  | "PAGO_SOLICITADO"
  | "PAGO_PROCESANDO"
  | "PAGO_CONFIRMADO"
  | "PAGO_FALLIDO"
  | "PAGO_CANCELADO"
  | "RESERVA_CONFIRMADA"
  | "COMPROBANTE_APROBADO"
  | "COMPROBANTE_RECHAZADO";

/**
 * Monedas admitidas. Dos, las que este negocio usa. No hay conversión en
 * ninguna parte: una solicitud se cobra en la moneda en la que se emitió, y el
 * webhook rechaza un pago cuya moneda no coincida.
 */
export const supportedCurrencies = ["NIO", "USD"] as const;
export type SupportedCurrency = (typeof supportedCurrencies)[number];

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (supportedCurrencies as readonly string[]).includes(value);
}

export const currencySymbols: Record<SupportedCurrency, string> = {
  NIO: "C$",
  USD: "US$",
};

export function formatMoney(amount: string, currency: string): string {
  const symbol = isSupportedCurrency(currency) ? currencySymbols[currency] : currency;
  return `${symbol} ${amount}`;
}

/**
 * Importe máximo de una solicitud. Una moto de gama alta en córdobas no llega
 * a siete cifras largas; el tope existe para que un cero de más al teclear no
 * llegue a la pasarela, no porque el negocio tenga ese límite.
 */
export const MAX_PAYMENT_AMOUNT = 9_999_999;

/**
 * Valida el importe **como texto** y devuelve su forma canónica con dos
 * decimales, o `null`.
 *
 * **[R] Texto de principio a fin, sin pasar por `number`.** CLAUDE.md exige
 * `Prisma.Decimal` para el dinero; convertir a coma flotante para validar y
 * volver a texto reintroduce por la puerta de atrás justo el error que el
 * decimal evita. Aquí sólo se comprueba la forma y se normaliza la cadena.
 */
export function parseAmountInput(raw: string): string | null {
  const clean = (raw ?? "").trim().replace(/,/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, decimals = ""] = clean.split(".");
  if (Number(whole) > MAX_PAYMENT_AMOUNT) return null;
  if (Number(whole) === 0 && Number(decimals || "0") === 0) return null;
  return `${whole}.${decimals.padEnd(2, "0")}`;
}

/** Lo que una pantalla autorizada ve de una solicitud de pago. */
export type PaymentRequestDTO = {
  id: string;
  requestNumber: string;
  customerId: string;
  customerName: string;
  branchName: string;
  purpose: PaymentRequestPurposeValue;
  purposeLabel: string;
  concept: string;
  /** Serializado como cadena: un Decimal no cruza al cliente como número. */
  amount: string;
  currency: string;
  status: PaymentRequestStatusValue;
  statusLabel: string;
  dueDate: string | null;
  reservationId: string | null;
  reservationNumber: string | null;
  createdByName: string | null;
  paidAt: string | null;
  createdAt: string;
};

/** La misma solicitud, vista desde el portal del cliente. */
export type CustomerPaymentRequestDTO = {
  id: string;
  requestNumber: string;
  concept: string;
  amount: string;
  currency: string;
  status: PaymentRequestStatusValue;
  statusLabel: string;
  dueDate: string | null;
  branchName: string;
  createdAt: string;
  /** Si el cliente todavía puede pagarla ahora mismo. */
  payable: boolean;
};

export type CustomerNotificationDTO = {
  id: string;
  kind: CustomerNotificationKindValue;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};
