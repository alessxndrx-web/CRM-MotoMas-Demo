"use client";

import { useEffect } from "react";

import { saveDemoSession } from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";

/**
 * Mirrors the authenticated server session into the localStorage session that
 * every existing internal panel already reads. This keeps the current
 * role/branch-scoped UX working unchanged on top of the real cookie auth.
 *
 * **El espejo nunca autoriza.** Es estado de interfaz: la autorización sale del
 * testigo firmado y de los predicados del servidor, que vuelven a comprobarse en
 * cada página y en cada acción. Editar esta clave a mano en el navegador cambia
 * lo que se pinta, no lo que se puede hacer.
 *
 * Patch CRM-AUD1 — **el espejo se refresca cuando cambia cualquier campo, no
 * sólo el usuario.** La condición era `current.userId !== session.userId`, así
 * que a un usuario promovido de Vendedor a Líder de ventas le quedaba el rol
 * viejo guardado: los paneles que leen el espejo seguían tratándolo como
 * vendedor aunque el servidor ya dijera otra cosa. El identificador es
 * justamente lo único que NO cambia en una promoción.
 */
export function SessionBridge({ session }: { session: DemoSession }) {
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("motomas-demo-session-v1");
      const current = raw ? (JSON.parse(raw) as Partial<DemoSession>) : null;
      const stale =
        !current ||
        current.userId !== session.userId ||
        current.role !== session.role ||
        current.branchId !== session.branchId ||
        current.userName !== session.userName ||
        current.branchName !== session.branchName;
      if (stale) saveDemoSession(session);
    } catch {
      saveDemoSession(session);
    }
  }, [session]);

  return null;
}
