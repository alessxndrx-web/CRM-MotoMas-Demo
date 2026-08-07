import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — contenedor de página (Patch POS2.0-B).
 *
 * Una pantalla no debe volver a decidir su margen horizontal. Antes cada página
 * repetía `px-4 sm:px-6 lg:px-8` o inventaba el suyo, y una diferencia de 4px
 * entre dos rutas del mismo módulo se lee como un salto al navegar.
 *
 * ## Tres anchos, porque un ERP no tiene una sola densidad
 *
 * **[R] No se fuerza todo a un `max-width` único.** Una tabla de compras quiere
 * el ancho que haya; un formulario de una columna a 1400px produce líneas que el
 * ojo pierde al volver.
 *
 * | Ancho | Para | Por qué |
 * |---|---|---|
 * | `wide` | Listados, tablas, tableros | El dato manda; capar el ancho esconde columnas |
 * | `default` | Detalle, pantallas mixtas | Suficiente para dos columnas sin desparramar |
 * | `form` | Formularios de captura | Longitud de línea legible; el resto es aire |
 *
 * El desplazamiento vertical lo posee el área de contenido, no este contenedor:
 * aquí no hay `overflow`, y por eso la barra lateral no se mueve mientras la
 * página baja.
 */
const widths = {
  wide: "max-w-[1600px]",
  default: "max-w-[1400px]",
  form: "max-w-[860px]",
};

export function PageContainer({
  width = "default",
  className,
  children,
}: {
  width?: keyof typeof widths;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full px-4 py-6 sm:px-6 lg:px-8", widths[width], className)}>
      {children}
    </div>
  );
}
