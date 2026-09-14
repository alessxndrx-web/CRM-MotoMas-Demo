"use client";

import type { DemoSession } from "@/features/operations/types";
import { storageKeys } from "@/shared/persistence/storage-keys";

export const DEMO_SESSION_STORAGE_KEY = storageKeys.demoSession;
export const DEMO_SESSION_CHANGE_EVENT = "motomas-demo-session-change";

/**
 * ## Patch CRM-AUD2 — se evaluó retirar este espejo y se decidió conservarlo
 *
 * CRM-AUD1 dejó establecido que `motomas-demo-session-v1` **no autoriza nada**:
 * la sesión real es una cookie `httpOnly` firmada, y cada página y cada acción
 * del servidor vuelven a autorizar. Editar esta clave a mano cambia lo que se
 * pinta, no lo que se puede hacer.
 *
 * Retirarlo se descartó por tres razones concretas, no por comodidad:
 *
 * 1. **Dieciséis paneles lo leen**, todos detrás de
 *    `LegacyOperationalPanelGate`. Esa puerta es el camino de recuperación
 *    documentado cuando no hay `DATABASE_URL`; sin el espejo, el arranque sin
 *    base deja de funcionar.
 * 2. **El chasis lo usa para propagar el cierre de sesión entre pestañas.**
 *    `subscribeToDemoSession` escucha el evento `storage`, que es lo que hace
 *    que salir en una pestaña saque de todas.
 * 3. **Un espejo obsoleto no puede llegar a verse.** El `layout` de `/panel`
 *    redirige a `/login` sin sesión válida, así que el chasis nunca se pinta sin
 *    una sesión del servidor, y ésa es la que manda en el primer render.
 *
 * Ganancia de seguridad al quitarlo: ninguna. Riesgo: romper el arranque sin
 * base y el cierre entre pestañas. Queda como deuda de arquitectura P3, que se
 * salda cuando se borre la capa de `localStorage` entera — su propio parche.
 *
 * Reads the mirrored session written by SessionBridge (real login) or by the
 * legacy demo login. Both already store the full DemoSession shape, so this
 * only needs to validate the stored shape — it must NOT re-derive the user
 * from the fixed `demoInternalUsers` list, since a real database user id
 * never appears there and would make every authenticated Seller/Manager
 * session look logged out to the legacy panels.
 */
export function readDemoSession(): DemoSession | null {
  try {
    const raw = window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<DemoSession>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.userName !== "string" ||
      typeof parsed.role !== "string" ||
      typeof parsed.branchId !== "string" ||
      typeof parsed.branchName !== "string"
    ) {
      return null;
    }

    return parsed as DemoSession;
  } catch {
    return null;
  }
}

export function saveDemoSession(session: DemoSession) {
  window.localStorage.setItem(
    DEMO_SESSION_STORAGE_KEY,
    JSON.stringify(session),
  );
  emitDemoSessionChange();
}

export function clearDemoSession() {
  window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
  emitDemoSessionChange();
}

export function emitDemoSessionChange() {
  window.dispatchEvent(new Event(DEMO_SESSION_CHANGE_EVENT));
}

export function subscribeToDemoSession(callback: () => void) {
  window.addEventListener(DEMO_SESSION_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(DEMO_SESSION_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
