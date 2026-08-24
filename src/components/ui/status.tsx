import * as React from "react";

import { Badge } from "@/components/ui/badge";

/**
 * SmartBitz Design System — estados de negocio (Patch POS2.0-C).
 *
 * ## El problema que resuelve
 *
 * Diez módulos declaran hoy su propio `statusTone: Record<string, ...>` y su
 * propio mapa de rótulos. Son diez sitios donde el mismo estado puede acabar
 * ámbar aquí y azul allá, y diez sitios que hay que tocar cuando el sistema de
 * diseño decida qué significa «ámbar».
 *
 * ## Lo que este módulo **no** hace
 *
 * **No conoce ningún estado de negocio.** No hay `BORRADOR` ni `RECIBIDA` aquí
 * dentro. El módulo declara su diccionario con `defineStatuses` y el componente
 * lo consume; el sistema de diseño aporta la semántica visual, no el vocabulario.
 *
 * ```tsx
 * const orderStatus = defineStatuses({
 *   BORRADOR: { label: "Borrador", tone: "slate" },
 *   RECIBIDA:  { label: "Recibida", tone: "success" },
 * });
 *
 * <StatusBadge map={orderStatus} value={order.status} />
 * ```
 *
 * ## Los tonos son semánticos, no colores
 *
 * `neutral` existe pero no actúa · `progress` en curso · `success` liquidado ·
 * `warning` requiere atención · `danger` fallido o anulado. El color concreto lo
 * decide `Badge`; quien declara un diccionario nombra el **significado**, y así
 * un cambio de paleta no obliga a revisar diez módulos buscando `"amber"`.
 *
 * **[R] El color nunca es el único portador.** `StatusBadge` siempre muestra el
 * rótulo, y `dot` añade forma además de tono.
 */
export type StatusTone = "neutral" | "progress" | "success" | "warning" | "danger";

const toneToBadge: Record<StatusTone, "slate" | "blue" | "green" | "amber" | "red"> = {
  neutral: "slate",
  progress: "blue",
  success: "green",
  warning: "amber",
  danger: "red",
};

export type StatusDefinition = {
  label: string;
  tone: StatusTone;
  /** Por qué el documento está así. Se ofrece como `title` al pasar el ratón. */
  hint?: string;
};

export type StatusMap<K extends string> = Record<K, StatusDefinition>;

/**
 * Declara el diccionario de estados de un módulo.
 *
 * Es identidad en tiempo de ejecución y estrechamiento de tipos en compilación:
 * lo único que aporta es que `StatusBadge` sepa qué claves admite, de modo que
 * un estado mal escrito falle en `tsc` y no en pantalla.
 */
export function defineStatuses<K extends string>(map: StatusMap<K>): StatusMap<K> {
  return map;
}

export function StatusBadge<K extends string>({
  map,
  value,
  dot = true,
  className,
}: {
  map: StatusMap<K>;
  value: K | (string & {});
  /** El punto se puede quitar donde el tono ya basta, como una fila resaltada. */
  dot?: boolean;
  className?: string;
}) {
  const definition = (map as Record<string, StatusDefinition | undefined>)[value];

  // **Un estado desconocido se muestra, no se esconde.** Un documento con un
  // estado que la pantalla no sabe nombrar sigue siendo un documento que el
  // usuario tiene delante; ocultarlo lo dejaría sin explicación.
  if (!definition) {
    return (
      <Badge className={className} dot={dot} tone="slate" title="Estado no reconocido">
        {value}
      </Badge>
    );
  }

  return (
    <Badge
      className={className}
      dot={dot}
      title={definition.hint}
      tone={toneToBadge[definition.tone]}
    >
      {definition.label}
    </Badge>
  );
}

/**
 * ¿Debe la fila leerse apagada?
 *
 * Los documentos que existen pero ya no actúan se atenúan, **nunca se ocultan**:
 * un ERP que esconde lo anulado es un ERP que no se puede auditar. La regla la
 * decide el diccionario a través del tono, no cada tabla por su cuenta.
 */
export function isInactiveStatus<K extends string>(
  map: StatusMap<K>,
  value: K | (string & {}),
): boolean {
  return (map as Record<string, StatusDefinition | undefined>)[value]?.tone === "danger";
}
