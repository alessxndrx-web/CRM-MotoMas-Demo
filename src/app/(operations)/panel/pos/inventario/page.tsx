import { redirect } from "next/navigation";

/**
 * Patch POS2.4 — las existencias del mostrador se mudaron con él.
 *
 * Mismo criterio que el cobro: la URL sobrevive como redirección, la
 * autorización se resuelve ya en `/pos/inventario`.
 */
export default function PosInventarioRedirect() {
  redirect("/pos/inventario");
}
