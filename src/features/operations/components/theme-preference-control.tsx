"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { Notice } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { useThemePreference } from "@/features/operations/components/theme-provider";
import {
  themePreferenceHints,
  themePreferenceLabels,
  themePreferenceValues,
  type ThemePreferenceValue,
} from "@/server/appearance/shared";

/**
 * Patch CRM-INT4 — el selector de tema, en dos tamaños que comparten estado.
 *
 * `full` es la sección «Apariencia» de Configuración: tres opciones con su
 * explicación. `compact` es el acceso rápido del pie de la barra lateral, para
 * que cualquier rol —también los que no entran a Configuración— elija su tema.
 * Los dos leen y escriben el mismo `ThemeProvider`.
 */

const icons: Record<ThemePreferenceValue, LucideIcon> = {
  CLARO: Sun,
  OSCURO: Moon,
  SISTEMA: Monitor,
};

/** Muestra de cada tema, con los valores fijos del tema que representa. */
const swatches: Record<ThemePreferenceValue, { canvas: string; card: string; line: string }> = {
  CLARO: { canvas: "#e9edf4", card: "#ffffff", line: "#cbd5e1" },
  OSCURO: { canvas: "#0b1120", card: "#121a2b", line: "#3a4861" },
  SISTEMA: { canvas: "linear-gradient(135deg, #e9edf4 50%, #0b1120 50%)", card: "transparent", line: "#7f8ca5" },
};

export function ThemePreferenceControl({ variant }: { variant: "full" | "compact" }) {
  const { preference, choose, saving, error, saved } = useThemePreference();

  if (variant === "compact") {
    return (
      <div aria-label="Tema del panel" className="flex items-center gap-1" role="group">
        {themePreferenceValues.map((value) => {
          const Icon = icons[value];
          const active = value === preference;
          return (
            <button
              aria-label={`Tema: ${themePreferenceLabels[value]}`}
              aria-pressed={active}
              className={cn(
                "sb-focus grid h-8 flex-1 place-items-center rounded-md border text-slate-500 transition-colors",
                active
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 hover:bg-slate-100 hover:text-slate-900",
              )}
              disabled={saving}
              key={value}
              onClick={() => choose(value)}
              title={themePreferenceLabels[value]}
              type="button"
            >
              <Icon aria-hidden className="h-4 w-4" />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <fieldset>
        <legend className="sr-only">Tema del panel</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {themePreferenceValues.map((value) => {
            const Icon = icons[value];
            const active = value === preference;
            const swatch = swatches[value];
            return (
              <label
                className={cn(
                  "relative flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors",
                  active
                    ? "border-blue-500 bg-blue-50 shadow-[inset_0_0_0_1px_var(--color-blue-500)]"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                )}
                key={value}
              >
                <input
                  checked={active}
                  className="sr-only"
                  disabled={saving}
                  name="tema-del-panel"
                  onChange={() => choose(value)}
                  type="radio"
                  value={value}
                />
                <span
                  aria-hidden
                  className="flex h-14 items-end gap-1.5 overflow-hidden rounded-md border border-slate-200 p-2"
                  style={{ background: swatch.canvas }}
                >
                  <span className="h-8 w-8 rounded" style={{ background: swatch.card, border: `1px solid ${swatch.line}` }} />
                  <span className="h-5 flex-1 rounded" style={{ background: swatch.card, border: `1px solid ${swatch.line}` }} />
                </span>
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Icon aria-hidden className={cn("h-4 w-4", active ? "text-blue-600" : "text-slate-400")} />
                  {themePreferenceLabels[value]}
                </span>
                <span className="text-xs text-slate-500">{themePreferenceHints[value]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <p aria-live="polite" className="mt-3 min-h-5 text-xs text-slate-500">
        {saving ? "Guardando tu preferencia…" : saved ? "Guardado. Se aplicará cada vez que entres." : ""}
      </p>
      {error ? (
        <div className="mt-2">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
    </div>
  );
}
