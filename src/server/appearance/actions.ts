"use server";

import { isThemePreference, type ThemePreferenceValue } from "@/server/appearance/shared";
import { getCurrentUserSession } from "@/server/auth/context";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

export type ThemePreferenceActionResult = { ok: true } | { ok: false; error: string };

/**
 * Patch CRM-INT4 — guarda el tema de **quien tiene la sesión**.
 *
 * No recibe ningún id de usuario: la persona se resuelve de la sesión firmada,
 * así que nadie puede cambiar la apariencia de otro. No hace falta ningún
 * permiso más: es una preferencia personal y la puede cambiar cualquier rol del
 * panel.
 *
 * No revalida rutas: la pantalla ya cambió al elegir (el selector actualiza el
 * atributo del tema al instante) y la próxima carga completa lee este valor.
 */
export async function setThemePreferenceAction(input: {
  preference: ThemePreferenceValue;
}): Promise<ThemePreferenceActionResult> {
  if (!isThemePreference(input?.preference)) {
    return { ok: false, error: "Elige Claro, Oscuro o Automático." };
  }
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      error: "Sin base de datos no se puede guardar el tema, así que se queda el que tenías.",
    };
  }
  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: "Tu sesión terminó. Vuelve a iniciar sesión." };

  try {
    await getPrisma().user.update({
      where: { id: session.uid },
      data: { themePreference: input.preference },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo guardar tu preferencia de apariencia." };
  }
}
