"use server";

import { buildReceiptJob, type PaperWidth, type ReceiptPrintJob } from "@/server/pos/escpos";
import { getCurrentPosSession } from "@/server/pos/auth";
import { getPosSaleDetail } from "@/server/pos/queries";

/**
 * Patch POS2.6 — el recibo, resuelto en el servidor.
 *
 * ## Por qué no lo arma el navegador
 *
 * El terminal tiene el carrito, pero el carrito **no es la venta**: los totales
 * autoritativos los derivó el servidor de las líneas al cobrar. Imprimir desde
 * el estado del navegador produciría un papel que dice algo distinto de lo que
 * quedó guardado — el error exacto que POS2.2 se cuidó de no cometer con los
 * totales.
 *
 * Así que el recibo se lee de la venta persistida, por `getPosSaleDetail`, que
 * ya existía. **No se consulta nada nuevo ni se recalcula nada.**
 *
 * ## Autorización
 *
 * Sesión de POS, como el resto del mostrador, y **acotado a la sucursal del
 * operador**: un terminal no imprime el ticket de otra sucursal. Es la misma
 * frontera de POS2.4, sin permisos nuevos.
 *
 * ## Esto no es una factura
 *
 * El pie lo dice en el papel. El recibo lleva solo lo que el dominio tiene:
 * ni RUC, ni serie, ni número de autorización, ni impuesto derivado de una tasa
 * que el repositorio no declara. Ver P-39.
 */

const NOT_FOUND = "La venta no existe o no pertenece a este mostrador.";
const NO_SESSION = "Inicia sesión en el punto de venta.";

/** Aviso fijo e intencional: quien reciba el papel debe saber qué es. */
const RECEIPT_FOOTER = "Documento no fiscal";
const BUSINESS_NAME = "MotoMas";

export type ReceiptResult =
  | { ok: true; job: ReceiptPrintJob }
  | { ok: false; error: string };

export async function buildPosReceiptAction(input: {
  saleId: string;
  paperWidth?: PaperWidth;
}): Promise<ReceiptResult> {
  const session = await getCurrentPosSession();
  if (!session) return { ok: false, error: NO_SESSION };

  const sale = await getPosSaleDetail(input.saleId);
  if (!sale) return { ok: false, error: NOT_FOUND };

  // **El alcance se comprueba aquí, no en la consulta.** `getPosSaleDetail` es
  // genérica y la usan otras pantallas; filtrar dentro de ella cambiaría su
  // contrato para todas.
  if (sale.branchCode !== session.branchCode) {
    // Mismo mensaje que «no existe»: para este operador, efectivamente no
    // existe, y distinguirlo revelaría que hay ventas en otras sucursales.
    return { ok: false, error: NOT_FOUND };
  }

  // Solo se imprime lo que se cobró. Un borrador no tiene por qué existir en
  // papel, y una anulada en papel sería un recibo que miente.
  if (sale.status !== "COMPLETADA") {
    return { ok: false, error: "Solo se puede imprimir una venta completada." };
  }

  return {
    ok: true,
    job: buildReceiptJob(sale, {
      businessName: BUSINESS_NAME,
      operatorName: session.username,
      paperWidth: input.paperWidth === 32 ? 32 : 42,
      footer: RECEIPT_FOOTER,
    }),
  };
}
