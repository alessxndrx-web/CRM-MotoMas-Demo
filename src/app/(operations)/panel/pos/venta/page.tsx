import { redirect } from "next/navigation";

/**
 * Patch POS2.4 — el cobro se mudó fuera del panel administrativo.
 *
 * La URL se conserva y redirige en vez de desaparecer: enlaces guardados y
 * marcadores del mostrador siguen funcionando. Lo que ya no existe es la
 * posibilidad de cobrar con la sesión administrativa — `/pos/venta` exige
 * credenciales de mostrador, y sin ellas manda a `/pos/login`.
 */
export default function PosVentaRedirect() {
  redirect("/pos/venta");
}
