import {
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  type ThemePreferenceValue,
} from "@/server/appearance/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

/**
 * Patch CRM-INT4 — el tema guardado de un usuario.
 *
 * Lo lee el `layout` del panel en el servidor, antes de pintar nada: por eso el
 * primer HTML ya sale con el tema correcto y no hay parpadeo. Sin base de datos
 * (modo demostración) o ante un fallo de lectura, el tema de siempre: la
 * apariencia nunca puede impedir que el panel cargue.
 */
export async function getThemePreference(userId: string): Promise<ThemePreferenceValue> {
  if (!isDatabaseConfigured()) return DEFAULT_THEME_PREFERENCE;
  try {
    const user = await getPrisma().user.findUnique({
      where: { id: userId },
      select: { themePreference: true },
    });
    return isThemePreference(user?.themePreference) ? user.themePreference : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}
