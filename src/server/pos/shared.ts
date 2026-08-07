import {
  roundFinancialMoney as roundPosMoney,
  sanitizeFinancialMoney as sanitizePosMoney,
} from "@/server/finance/money";
import { sanitizeFinancialText as sanitizePosText } from "@/server/finance/text";

export { roundPosMoney, sanitizePosMoney, sanitizePosText };

/**
 * Patch POS1.0-A — client-safe vocabulary of the Point of Sale.
 *
 * Pure values: no Prisma client, no session, no database access.
 *
 * The POS is a **separate bounded context from Caja**. `CashDocument` models an
 * accounting document — review, issue, posting, reversal, receivables, tax — and
 * this models a retail checkout. Nothing here posts to the ledger, so the
 * repository still has exactly one posting path per economic event.
 *
 * Money arithmetic reuses `finance/money`, the same helpers the accounting layer
 * uses, rather than a private copy. TD-01 spent a patch removing duplicated
 * money helpers and this context does not reintroduce them.
 */

export type PosSaleStatusValue = "BORRADOR" | "COMPLETADA" | "ANULADA";

export const posSaleStatusValues: PosSaleStatusValue[] = [
  "BORRADOR",
  "COMPLETADA",
  "ANULADA",
];

export const posSaleStatusLabels: Record<PosSaleStatusValue, string> = {
  BORRADOR: "Borrador",
  COMPLETADA: "Completada",
  ANULADA: "Anulada",
};

/** Reused from Caja: the payment vocabulary is shared across the business. */
export type PosPaymentMethodValue =
  | "EFECTIVO"
  | "TRANSFERENCIA"
  | "CHEQUE"
  | "TARJETA";

export const posPaymentMethodValues: PosPaymentMethodValue[] = [
  "EFECTIVO",
  "TRANSFERENCIA",
  "CHEQUE",
  "TARJETA",
];

export const posPaymentMethodLabels: Record<PosPaymentMethodValue, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  CHEQUE: "Cheque",
  TARJETA: "Tarjeta",
};

export function isPosPaymentMethodValue(
  value: string,
): value is PosPaymentMethodValue {
  return (posPaymentMethodValues as string[]).includes(value);
}

// --- Arithmetic ----------------------------------------------------------

/**
 * One line: `cantidad × precio − descuento + impuesto`, floored at zero.
 *
 * The tax **adds** and the discount subtracts, the same shape the expense and
 * document formulas already use. A line whose discount exceeds its gross is
 * floored rather than negative: a negative line would mean "swap the sides",
 * which is not something a till sale expresses.
 */
export function calculatePosLineTotal(input: {
  quantity: number;
  unitPrice: number;
  discount?: number;
  tax?: number;
}): number {
  const gross = input.quantity * input.unitPrice;
  return roundPosMoney(
    Math.max(gross - (input.discount ?? 0) + (input.tax ?? 0), 0),
  );
}

/** Gross of a line before its own discount and tax. */
export function calculatePosLineSubtotal(input: {
  quantity: number;
  unitPrice: number;
}): number {
  return roundPosMoney(input.quantity * input.unitPrice);
}

export type PosSaleTotals = {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
};

/**
 * The sale's stored figures are **the sum of its lines** — every one of them.
 *
 * That is the only reading of the model that needs no extra decision. The
 * aggregate carries `discount` and so does each line; treating the header value
 * as anything other than the sum of the lines would require inventing an order
 * between two discount layers, and a header-level discount is not something this
 * patch was asked to define. If the business later wants one, it is an explicit
 * addition, not an interpretation. See `docs/POS.md`.
 */
export function calculatePosSaleTotals(
  lines: Array<{
    quantity: number;
    unitPrice: number;
    discount?: number;
    tax?: number;
  }>,
): PosSaleTotals {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  for (const line of lines) {
    subtotal += calculatePosLineSubtotal(line);
    discount += line.discount ?? 0;
    tax += line.tax ?? 0;
  }
  return {
    subtotal: roundPosMoney(subtotal),
    discount: roundPosMoney(discount),
    tax: roundPosMoney(tax),
    total: roundPosMoney(Math.max(subtotal - discount + tax, 0)),
  };
}

export function calculatePosPaidTotal(
  payments: Array<{ amount: number }>,
): number {
  return roundPosMoney(
    payments.reduce((sum, payment) => sum + payment.amount, 0),
  );
}

/** Quantities are three-decimal and strictly positive, like Caja's. */
export function sanitizePosQuantity(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0 || value > 999_999) return null;
  return Math.round(value * 1_000) / 1_000;
}

/**
 * Patch POS1.1-A — un umbral de existencias.
 *
 * Se distingue de `sanitizePosQuantity` en que **cero es válido**: un artículo
 * sin umbral declarado es el caso normal, mientras que vender cero unidades no
 * significa nada. Negativo se rechaza: un umbral bajo cero no tiene lectura.
 */
export function sanitizePosStockLevel(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > 999_999) return null;
  return Math.round(value * 1_000) / 1_000;
}

/**
 * Patch POS1.1-A — una tasa en **porcentaje**, de 0 a 100.
 *
 * Porcentaje y no fracción porque es lo que teclea una persona: 15, no 0.15.
 * El tope de 100 es aritmético, no fiscal — impide un 1500 por dedazo sin
 * pronunciarse sobre qué tasa es correcta, que es una decisión que el
 * repositorio no ha tomado en ninguna parte.
 */
export function sanitizePosTaxRate(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 100) / 100;
}

// --- Unidad de medida ----------------------------------------------------

export type PosProductUnitValue =
  | "UNIDAD"
  | "PAR"
  | "JUEGO"
  | "CAJA"
  | "LITRO"
  | "GALON"
  | "METRO"
  | "KILOGRAMO";

export const posProductUnitValues: PosProductUnitValue[] = [
  "UNIDAD",
  "PAR",
  "JUEGO",
  "CAJA",
  "LITRO",
  "GALON",
  "METRO",
  "KILOGRAMO",
];

export const posProductUnitLabels: Record<PosProductUnitValue, string> = {
  UNIDAD: "Unidad",
  PAR: "Par",
  JUEGO: "Juego",
  CAJA: "Caja",
  LITRO: "Litro",
  GALON: "Galón",
  METRO: "Metro",
  KILOGRAMO: "Kilogramo",
};

export function isPosProductUnitValue(
  value: string,
): value is PosProductUnitValue {
  return (posProductUnitValues as string[]).includes(value);
}

// --- Inventario (POS1.1-B) -----------------------------------------------

/**
 * Tipos de movimiento de existencias del mostrador.
 *
 * **En español**, como `InventoryMovementType`. El encargo los enunció en inglés;
 * la correspondencia es exacta y está en `docs/POS.md`.
 */
export type PosInventoryMovementTypeValue =
  | "INICIAL"
  | "COMPRA"
  | "VENTA"
  | "AJUSTE"
  | "TRASLADO_ENTRADA"
  | "TRASLADO_SALIDA"
  | "DEVOLUCION";

export const posInventoryMovementTypeValues: PosInventoryMovementTypeValue[] = [
  "INICIAL",
  "COMPRA",
  "VENTA",
  "AJUSTE",
  "TRASLADO_ENTRADA",
  "TRASLADO_SALIDA",
  "DEVOLUCION",
];

export const posInventoryMovementTypeLabels: Record<
  PosInventoryMovementTypeValue,
  string
> = {
  INICIAL: "Saldo inicial",
  COMPRA: "Compra",
  VENTA: "Venta",
  AJUSTE: "Ajuste",
  TRASLADO_ENTRADA: "Traslado (entrada)",
  TRASLADO_SALIDA: "Traslado (salida)",
  DEVOLUCION: "Devolución",
};

export function isPosInventoryMovementTypeValue(
  value: string,
): value is PosInventoryMovementTypeValue {
  return (posInventoryMovementTypeValues as string[]).includes(value);
}

/**
 * Una cantidad de movimiento: **con signo y distinta de cero**.
 *
 * Con signo para que `saldoDespués = saldoAntes + cantidad` valga para todo tipo
 * sin que el tipo tenga que codificar la dirección. Distinta de cero porque un
 * movimiento que no mueve nada no es un movimiento; el repositorio ya aplica ese
 * criterio en el motor de contabilización, donde un componente en cero no genera
 * líneas.
 *
 * **No se pronuncia sobre si el saldo puede quedar negativo**: eso es P-8, y no
 * es asunto de un saneador de forma.
 */
export function sanitizePosMovementQuantity(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value === 0) return null;
  if (Math.abs(value) > 999_999) return null;
  return Math.round(value * 1_000) / 1_000;
}

/**
 * Un saldo de existencias. **Admite cero y admite negativo.**
 *
 * Cero es el saldo correcto de un producto del que no ha entrado nada. Y el
 * negativo no se rechaza aquí porque **el repositorio no contiene ninguna regla
 * que diga si las existencias pueden bajar de cero** (P-8): rechazarlo sería
 * inventar esa regla en un saneador, que es el peor sitio para esconderla.
 */
export function sanitizePosInventoryQuantity(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || Math.abs(value) > 999_999_999) return null;
  return Math.round(value * 1_000) / 1_000;
}

// --- Compras (POS1.2-A) ---------------------------------------------------

/**
 * Estados de una orden de compra.
 *
 * **En español**, como todos los enums de estado del repositorio. La
 * correspondencia con el encargo está en `docs/POS.md`.
 */
export type PosPurchaseOrderStatusValue =
  | "BORRADOR"
  | "APROBADA"
  | "RECIBIDA_PARCIAL"
  | "RECIBIDA"
  | "ANULADA";

export const posPurchaseOrderStatusValues: PosPurchaseOrderStatusValue[] = [
  "BORRADOR",
  "APROBADA",
  "RECIBIDA_PARCIAL",
  "RECIBIDA",
  "ANULADA",
];

export const posPurchaseOrderStatusLabels: Record<
  PosPurchaseOrderStatusValue,
  string
> = {
  BORRADOR: "Borrador",
  APROBADA: "Aprobada",
  RECIBIDA_PARCIAL: "Recibida parcial",
  RECIBIDA: "Recibida",
  ANULADA: "Anulada",
};

export function isPosPurchaseOrderStatusValue(
  value: string,
): value is PosPurchaseOrderStatusValue {
  return (posPurchaseOrderStatusValues as string[]).includes(value);
}

/**
 * **Solo un borrador es editable.**
 *
 * Un único predicado, en el vocabulario compartido, para que la pantalla y el
 * servidor no puedan discrepar sobre qué se puede tocar. Aprobada, recibida —
 * total o parcialmente— y anulada están congeladas.
 */
export function isPosPurchaseOrderEditable(
  status: PosPurchaseOrderStatusValue,
): boolean {
  return status === "BORRADOR";
}

// --- DTOs ----------------------------------------------------------------

/** Patch POS1.1-A — categoría o marca del catálogo. Misma forma, dos tablas. */
export type PosLookupDTO = {
  id: string;
  name: string;
  isActive: boolean;
  notes: string | null;
};

export type PosProductDTO = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unitPrice: number;
  isActive: boolean;
  // Patch POS1.1-A. Metadatos inertes: nada del cobro los lee.
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  brandId: string | null;
  brandName: string | null;
  unit: PosProductUnitValue;
  unitLabel: string;
  /** Porcentaje 0–100. **Ningún cálculo lo usa**; ver `docs/POS.md`. */
  defaultTaxRate: number;
  minimumStock: number;
  reorderPoint: number;
  cost: number;
  imageUrl: string | null;
};

/** Patch POS1.1-B — una bodega. No guarda existencias: solo dice dónde. */
export type PosWarehouseDTO = {
  id: string;
  branchCode: string;
  branchName: string;
  code: string;
  name: string;
  isActive: boolean;
  notes: string | null;
  /** Cuántos productos tienen saldo aquí. Cuenta de filas, no suma de unidades. */
  productCount: number;
};

/** Patch POS1.1-B — el saldo de un producto en una bodega. */
export type PosInventoryDTO = {
  id: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  branchCode: string;
  productId: string;
  productSku: string;
  productName: string;
  /** Unidad del catálogo: una cantidad sin unidad no significa nada. */
  unit: PosProductUnitValue;
  unitLabel: string;
  quantity: number;
  /** Umbrales del catálogo, para que quien lea el saldo pueda compararlos. */
  minimumStock: number;
  reorderPoint: number;
};

/** Patch POS1.1-B — un hecho de inventario. Solo se añade; nunca se edita. */
export type PosInventoryMovementDTO = {
  id: string;
  warehouseId: string;
  warehouseName: string;
  productId: string;
  productSku: string;
  productName: string;
  type: PosInventoryMovementTypeValue;
  typeLabel: string;
  /** Con signo: `quantityAfter = quantityBefore + quantity`. */
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  notes: string | null;
  createdByName: string;
  createdAt: string;
};

/**
 * Patch POS1.2-E — tipos de evento del ciclo de vida de una orden de compra.
 *
 * El vocabulario que la pantalla enseña. **Los movimientos de inventario son un
 * detalle de implementación**: el historial dice «Recibió 40 unidades», no
 * `PosInventoryMovement type=COMPRA`.
 */
export type PosPurchaseEventTypeValue =
  | "CREADA"
  | "APROBADA"
  | "RECEPCION_PARCIAL"
  | "RECEPCION_TOTAL"
  | "DEVOLUCION"
  | "ANULADA";

export const posPurchaseEventTypeValues: PosPurchaseEventTypeValue[] = [
  "CREADA",
  "APROBADA",
  "RECEPCION_PARCIAL",
  "RECEPCION_TOTAL",
  "DEVOLUCION",
  "ANULADA",
];

export const posPurchaseEventTypeLabels: Record<
  PosPurchaseEventTypeValue,
  string
> = {
  CREADA: "Orden creada",
  APROBADA: "Orden aprobada",
  RECEPCION_PARCIAL: "Recepción parcial",
  RECEPCION_TOTAL: "Recepción completa",
  DEVOLUCION: "Devolución al proveedor",
  ANULADA: "Orden anulada",
};

/** El tono del cronograma. Verde cierra, ámbar avanza, rojo revierte. */
export const posPurchaseEventTones: Record<
  PosPurchaseEventTypeValue,
  "slate" | "blue" | "amber" | "green" | "red"
> = {
  CREADA: "slate",
  APROBADA: "blue",
  RECEPCION_PARCIAL: "amber",
  RECEPCION_TOTAL: "green",
  DEVOLUCION: "red",
  ANULADA: "red",
};

/** Patch POS1.2-E — un hecho del ciclo de vida, ya legible. */
export type PosPurchaseEventDTO = {
  id: string;
  type: PosPurchaseEventTypeValue;
  typeLabel: string;
  tone: "slate" | "blue" | "amber" | "green" | "red";
  /** Quién. Nombre, no identificador. */
  actorName: string;
  /** Cuándo, en ISO. La pantalla decide el formato. */
  at: string;
  /** Cuánto, cuando aplica. */
  quantity: number | null;
  /** De qué artículo, cuando aplica. Nombre y SKU, nunca el id. */
  productName: string | null;
  productSku: string | null;
  unitLabel: string | null;
  /** Por qué, cuando aplica. */
  reason: string | null;
};

/** Patch POS1.2-A — una línea de la orden de compra. */
export type PosPurchaseOrderItemDTO = {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  quantity: number;
  /** Patch POS1.2-B — cuánto ha llegado ya. */
  receivedQuantity: number;
  /** Patch POS1.2-D — cuánto se devolvió al proveedor. */
  returnedQuantity: number;
  /**
   * `receivedQuantity − returnedQuantity`. **Derivado**, como lo pendiente: es
   * el tope de la próxima devolución.
   */
  returnableQuantity: number;
  /**
   * `quantity − receivedQuantity`. **Derivado, nunca guardado**: dos cifras que
   * deben sumar siempre lo mismo son dos sitios donde pueden divergir.
   */
  pendingQuantity: number;
  /** Costo **negociado** en esta orden, no el de catálogo. */
  unitCost: number;
  discount: number;
  tax: number;
  subtotal: number;
  total: number;
  notes: string | null;
  position: number;
};

/** Patch POS1.2-A — una orden de compra: la intención, no la mercancía. */
export type PosPurchaseOrderDTO = {
  id: string;
  /** La identidad de negocio. Los ids de base siguen siendo detalle interno. */
  orderNumber: string;
  branchCode: string;
  branchName: string;
  supplierId: string;
  supplierName: string;
  status: PosPurchaseOrderStatusValue;
  statusLabel: string;
  /** Derivado del estado, para que la pantalla no lo recalcule por su cuenta. */
  editable: boolean;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  itemCount: number;
  /** Patch POS1.2-B — true cuando ninguna línea tiene nada pendiente. */
  fullyReceived: boolean;
  expectedAt: string | null;
  notes: string | null;
  createdByName: string;
  approvedByName: string | null;
  approvedAt: string | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
  /** Patch POS1.2-C — motivo declarado al anular. */
  cancelledReason: string | null;
  /**
   * Derivado del estado y de lo recibido, para que la pantalla no reimplemente
   * la regla y pueda discrepar del servidor.
   */
  cancellable: boolean;
  createdAt: string;
};

export type PosPurchaseOrderDetailDTO = PosPurchaseOrderDTO & {
  items: PosPurchaseOrderItemDTO[];
};

export type PosSaleItemDTO = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  subtotal: number;
  total: number;
  position: number;
};

export type PosPaymentDTO = {
  id: string;
  method: PosPaymentMethodValue;
  methodLabel: string;
  amount: number;
  reference: string | null;
};

export type PosSaleDTO = {
  id: string;
  /** The business identity. Database ids stay implementation details. */
  saleNumber: string;
  branchCode: string | null;
  branchName: string;
  cashierName: string;
  customerName: string | null;
  status: PosSaleStatusValue;
  statusLabel: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidTotal: number;
  /** `total − paidTotal`; negative when the till took more than the sale. */
  balance: number;
  notes: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

export type PosSaleDetailDTO = PosSaleDTO & {
  items: PosSaleItemDTO[];
  payments: PosPaymentDTO[];
};
