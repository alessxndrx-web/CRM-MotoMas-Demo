import { redirect } from "next/navigation";

import { PosLoginForm } from "@/features/pos/pos-login-form";
import { getCurrentPosSession } from "@/server/pos/auth";

export const dynamic = "force-dynamic";

/**
 * Patch POS2.4 — entrada al punto de venta.
 *
 * Pública a propósito: es la única puerta del área. Si ya hay sesión de POS no
 * tiene sentido volver a pedir credenciales, así que redirige a la venta.
 *
 * **No comprueba la sesión administrativa ni ningún permiso de Caja.** Un
 * administrador que llega aquí ve exactamente el mismo formulario que cualquier
 * otro: en el mostrador manda la credencial de mostrador.
 */
export default async function PosLoginPage() {
  if (await getCurrentPosSession()) redirect("/pos/venta");
  return <PosLoginForm />;
}
