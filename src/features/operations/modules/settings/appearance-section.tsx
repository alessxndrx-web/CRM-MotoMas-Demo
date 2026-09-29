import { Palette } from "lucide-react";

import { Card } from "@/components/ui/card";
import { ThemePreferenceControl } from "@/features/operations/components/theme-preference-control";

/**
 * Patch CRM-INT4 — la sección «Apariencia» de Configuración.
 *
 * Es una preferencia de cada persona, no una opción del sistema: la ve y la
 * cambia cualquier rol, y lo que elige no afecta a nadie más. Por eso vive
 * también en `/panel/configuracion/apariencia`, donde entran los roles que no
 * administran usuarios.
 */
export function AppearanceSection() {
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <Palette aria-hidden className="h-5 w-5 text-slate-400" />
        Apariencia
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Elige cómo se ve el panel. El cambio es inmediato y se guarda para tu usuario: lo
        encontrarás igual cuando vuelvas a entrar, desde cualquier equipo.
      </p>
      <div className="mt-5">
        <ThemePreferenceControl variant="full" />
      </div>
    </Card>
  );
}
