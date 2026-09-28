/**
 * Patch CRM-INT4 — la apariencia del panel interno, sin base de datos.
 *
 * Puro para que el selector del navegador y el servidor hablen de lo mismo.
 * El valor viaja a la página como atributo `data-mm-theme` del contenedor del
 * chasis; la hoja de estilos (`src/app/globals.css`, «Tema») decide los colores
 * a partir de él.
 */

export type ThemePreferenceValue = "CLARO" | "OSCURO" | "SISTEMA";

export const themePreferenceValues: ThemePreferenceValue[] = ["CLARO", "OSCURO", "SISTEMA"];

export const themePreferenceLabels: Record<ThemePreferenceValue, string> = {
  CLARO: "Claro",
  OSCURO: "Oscuro",
  SISTEMA: "Automático (sistema)",
};

export const themePreferenceHints: Record<ThemePreferenceValue, string> = {
  CLARO: "El aspecto de siempre.",
  OSCURO: "Superficies oscuras, para trabajar con poca luz.",
  SISTEMA: "Sigue el tema de tu equipo y cambia con él.",
};

/** Lo que toman quienes no han elegido: el aspecto de siempre. */
export const DEFAULT_THEME_PREFERENCE: ThemePreferenceValue = "CLARO";

export function isThemePreference(value: unknown): value is ThemePreferenceValue {
  return typeof value === "string" && (themePreferenceValues as string[]).includes(value);
}

/** El valor del atributo `data-mm-theme` que lee la hoja de estilos. */
export function themeAttribute(value: ThemePreferenceValue): "claro" | "oscuro" | "sistema" {
  return value === "OSCURO" ? "oscuro" : value === "SISTEMA" ? "sistema" : "claro";
}
