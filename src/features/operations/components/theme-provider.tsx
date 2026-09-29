"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useState, useTransition } from "react";

import { setThemePreferenceAction } from "@/server/appearance/actions";
import { themeAttribute, type ThemePreferenceValue } from "@/server/appearance/shared";

/**
 * Patch CRM-INT4 — el tema del panel interno, en un solo sitio.
 *
 * ## Cómo cambia el color sin tocar ningún componente
 *
 * Este proveedor sólo pone `data-mm-theme` en el contenedor del chasis. La hoja
 * de estilos (`src/app/globals.css`, «Tema del panel») lleva ese atributo al
 * `color-scheme` del documento con `:root:has(...)`, y cada token y cada color
 * de la paleta está escrito con `light-dark(claro, oscuro)`: el valor lo elige
 * el esquema del documento. `sistema` es `color-scheme: light dark`, que sigue
 * al sistema operativo **y cambia con él en vivo**, sin JavaScript.
 *
 * ## Sin parpadeo ni desajuste de hidratación
 *
 * El valor inicial llega del servidor (el `layout` lo lee de la base antes de
 * pintar) y el primer render del cliente usa ese mismo valor. Nada se lee del
 * navegador al montar.
 *
 * ## Por qué sólo el panel
 *
 * El contenedor envuelve el chasis del panel y nada más: el mostrador del POS,
 * el portal y el inicio de sesión no tienen el atributo y siguen en su tema de
 * siempre, aunque compartan componentes.
 */

type ThemeContextValue = {
  preference: ThemePreferenceValue;
  /** Aplica el tema al instante y lo guarda para esta persona. */
  choose: (next: ThemePreferenceValue) => void;
  saving: boolean;
  error: string;
  saved: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initialPreference,
}: {
  children: ReactNode;
  initialPreference: ThemePreferenceValue;
}) {
  const [preference, setPreference] = useState<ThemePreferenceValue>(initialPreference);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function choose(next: ThemePreferenceValue) {
    if (next === preference) return;
    const previous = preference;
    setPreference(next);
    setError("");
    setSaved(false);
    startSaving(async () => {
      const result = await setThemePreferenceAction({ preference: next });
      if (!result.ok) {
        // Lo que no se guardó no se queda puesto: al volver a entrar no estaría.
        setPreference(previous);
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <ThemeContext.Provider value={{ preference, choose, saving, error, saved }}>
      <div className="contents" data-mm-theme={themeAttribute(preference)}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useThemePreference(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useThemePreference se usa dentro del panel, bajo ThemeProvider.");
  }
  return value;
}
