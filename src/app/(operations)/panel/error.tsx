"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Patch CRM-AUD2 — la pantalla de error del panel.
 *
 * ## Qué reemplaza
 *
 * La auditoría CRM-AUD1 encontró que **no había ni un solo `error.tsx` en toda
 * la aplicación**. Un fallo de consulta en cualquier pantalla del CRM —una base
 * que no responde, una consulta que revienta— caía en la pantalla de error de
 * Next: en desarrollo, una traza; en producción, una página en blanco en inglés
 * sin ninguna salida de vuelta.
 *
 * ## Qué NO hace
 *
 * **No se traga el error.** `useEffect` lo deja en la consola del navegador y
 * Next ya lo registró en el servidor: esta pantalla es la salida para el
 * usuario, no un silenciador para el equipo.
 *
 * **No enseña el detalle interno.** El mensaje de un fallo de Prisma puede traer
 * nombres de tabla, fragmentos de consulta o datos de una fila. Lo único que se
 * muestra es el `digest`, que es el identificador con el que alguien puede
 * buscar ese error en los registros del servidor sin que la pantalla revele
 * nada.
 *
 * ## Por qué está en `/panel` y no en cada ruta
 *
 * Un límite de error cubre todos sus segmentos anidados. Uno aquí protege las
 * treinta y tantas pantallas del panel; ponerlo en cada una sería repetir el
 * mismo archivo sin ganar nada, porque el mensaje útil es el mismo: algo falló
 * al cargar, reintenta o vuelve.
 *
 * **Los 403 y 404 no llegan aquí.** `notFound()` tiene su propia pantalla y las
 * denegaciones se resuelven antes, en la página. Esto es el fallo inesperado.
 */
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Que quede en la consola del navegador: quien reporta la incidencia suele
    // tener esa pestaña abierta, y el `digest` por sí solo no basta para
    // depurar desde el otro lado.
    console.error("[panel] error no controlado", error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-xl p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-amber-50 text-amber-600">
        <AlertTriangle aria-hidden className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-xl font-semibold text-slate-900">
        No pudimos cargar esta pantalla
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        Algo falló al traer la información. No se perdió nada de lo que ya habías
        guardado. Reintenta; si vuelve a ocurrir, repórtalo y lo revisamos.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw aria-hidden className="h-4 w-4" />
          Reintentar
        </Button>
        <Link href="/panel">
          <Button variant="secondary">Volver al inicio</Button>
        </Link>
        <Link
          href={`/panel/ayuda/nuevo-ticket${
            error.digest ? `?referencia=${encodeURIComponent(error.digest)}` : ""
          }`}
        >
          <Button variant="ghost">Reportar problema</Button>
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-5 text-xs text-slate-400">
          Referencia para soporte:{" "}
          <span className="font-mono text-slate-500">{error.digest}</span>
        </p>
      ) : null}
    </Card>
  );
}
