import type { ReactNode } from "react";

/**
 * Patch POS2.4 — el chasis del punto de venta.
 *
 * **Deliberadamente no es `OperationsShell`.** El panel administrativo tiene
 * barra lateral, dieciséis módulos y navegación comercial; una terminal de
 * mostrador no tiene nada de eso y no debe insinuar que lo tiene. Compartir el
 * chasis habría vuelto a mezclar los dos productos justo después de separarlos.
 *
 * Este grupo de rutas **no llama a `requireAuth`**: la sesión administrativa no
 * autoriza aquí. Cada página protegida exige `requirePosSession`, y el `/login`
 * es público a propósito.
 */
export default function PosLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-100 text-slate-900">{children}</div>;
}
