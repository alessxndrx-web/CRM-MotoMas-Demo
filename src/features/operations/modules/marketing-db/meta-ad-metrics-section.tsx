"use client";

import { BarChart3, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import {
  refreshAllMetaAdMetrics,
  refreshMetaAdMetrics,
} from "@/server/meta-ads/actions";
import {
  formatRelativeTime,
  metaAdDatePresetLabels,
  metaAdDatePresetValues,
  type MetaAdDatePresetValue,
  type MetaAdMetricRowDTO,
  type MetaAdMetricsBoardDTO,
} from "@/server/meta-ads/shared";

/**
 * Tablero de métricas de las cuentas publicitarias, dentro del mismo panel de
 * integraciones de Marketing.
 *
 * ## Lo que muestra es una foto, no un directo
 *
 * Los números vienen de `MetaAdMetricSnapshot`, guardados por el botón
 * «Actualizar». Esta pantalla **nunca** llama al Graph API al cargar: la
 * Marketing API limita la frecuencia con dureza y un tablero que consultara en
 * cada carga se quedaría sin cuota justo cuando más se mira.
 *
 * Por eso cada fila lleva su edad («actualizado hace X»): un número sin fecha
 * invita a creer que es de ahora mismo.
 *
 * ## Sin datos ≠ sin gasto
 *
 * Una cuenta que nunca se consultó para ese periodo muestra «Sin datos», no
 * ceros. Son dos cosas distintas y colapsarlas haría que una cuenta olvidada
 * pareciera una cuenta que no gastó nada.
 */

export type MetaAdMetricsSectionProps = {
  board: MetaAdMetricsBoardDTO;
  canManage: boolean;
};

export function MetaAdMetricsSection({
  board,
  canManage,
}: MetaAdMetricsSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [preset, setPreset] = useState<MetaAdDatePresetValue>(board.datePreset);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  function report(text: string, failed: boolean) {
    setMessage(text);
    setIsError(failed);
  }

  /*
   * Cambiar de periodo NO consulta a Meta: recarga la página, que vuelve a leer
   * las fotos ya guardadas de ese periodo. Si no hay ninguna, la fila lo dice y
   * queda a un clic de refrescarse.
   */
  function changePreset(value: string) {
    const next = value as MetaAdDatePresetValue;
    setPreset(next);
    report("", false);
    router.push(`/panel/marketing?periodo=${encodeURIComponent(next)}`);
  }

  function refreshOne(row: MetaAdMetricRowDTO) {
    if (!canManage) return;
    report("", false);
    startTransition(async () => {
      const result = await refreshMetaAdMetrics(row.adAccountId, preset);
      if (!result.ok) {
        report(result.error, true);
        return;
      }
      report("Métricas actualizadas desde Meta.", false);
      router.refresh();
    });
  }

  function refreshAll() {
    if (!canManage) return;
    report("", false);
    startTransition(async () => {
      const summary = await refreshAllMetaAdMetrics(preset);
      if (summary.ok) {
        report(
          `${summary.refreshed} ${
            summary.refreshed === 1 ? "cuenta actualizada" : "cuentas actualizadas"
          }.`,
          false,
        );
      } else {
        // El fallo de una cuenta no impide las demás: se dice cuántas sí
        // entraron y cuáles no, en vez de un "falló" que ocultaría el avance.
        report(
          `${summary.refreshed} actualizadas · ${summary.failures.length} con problemas: ` +
            summary.failures
              .map((failure) => `${failure.adAccountId} (${failure.error})`)
              .join(" · "),
          true,
        );
      }
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
        <div>
          <h4 className="font-semibold text-slate-900">Métricas por cuenta</h4>
          <p className="mt-1 text-sm text-slate-500">
            Cifras guardadas la última vez que se consultó a Meta. Esta pantalla
            no consulta al cargar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            size="sm"
            value={preset}
            onChange={(event) => changePreset(event.target.value)}
          >
            {metaAdDatePresetValues.map((value) => (
              <option key={value} value={value}>
                {metaAdDatePresetLabels[value]}
              </option>
            ))}
          </Select>
          {canManage && board.rows.length ? (
            <Button
              disabled={isPending}
              size="sm"
              variant="secondary"
              onClick={refreshAll}
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar todo
            </Button>
          ) : null}
        </div>
      </div>

      {message ? (
        <p
          className={`border-b border-slate-200 px-5 py-3 text-sm font-medium ${
            isError ? "text-red-600" : "text-emerald-600"
          }`}
        >
          {message}
        </p>
      ) : null}

      {board.rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Cuenta</th>
                <th className="px-5 py-3 text-right font-semibold">Impresiones</th>
                <th className="px-5 py-3 text-right font-semibold">Clics</th>
                <th className="px-5 py-3 text-right font-semibold">Gasto</th>
                <th className="px-5 py-3 text-right font-semibold">CTR</th>
                <th className="px-5 py-3 text-right font-semibold">CPC</th>
                <th className="px-5 py-3 font-semibold">Actualizado</th>
                {canManage ? <th className="px-5 py-3 font-semibold" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {board.rows.map((row) => (
                <tr key={row.adAccountId}>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900">
                      {row.label ?? row.accountName ?? "Sin nombre"}
                    </div>
                    <div className="mt-1 font-mono text-xs text-slate-500">
                      {row.adAccountId}
                    </div>
                  </td>
                  {row.snapshot ? (
                    <>
                      <td className="px-5 py-4 text-right tabular-nums text-slate-700">
                        {formatInteger(row.snapshot.impressions)}
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums text-slate-700">
                        {formatInteger(row.snapshot.clicks)}
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums font-semibold text-slate-900">
                        {formatMoney(row.snapshot.spend)} {row.snapshot.currency}
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums text-slate-700">
                        {row.snapshot.ctr.toFixed(2)}%
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums text-slate-700">
                        {row.snapshot.cpc === null
                          ? "—"
                          : formatMoney(row.snapshot.cpc)}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {formatRelativeTime(row.snapshot.fetchedAt)}
                      </td>
                    </>
                  ) : (
                    <td className="px-5 py-4 text-slate-500" colSpan={6}>
                      <Badge tone="amber">Sin datos — actualizar</Badge>
                      <span className="ml-2 text-xs">
                        Este periodo no se ha consultado nunca para esta cuenta.
                        No es lo mismo que cero gasto.
                      </span>
                    </td>
                  )}
                  {canManage ? (
                    <td className="px-5 py-4">
                      <Button
                        disabled={isPending}
                        size="sm"
                        variant="secondary"
                        onClick={() => refreshOne(row)}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Actualizar
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          className="border-0"
          description="Conecta una cuenta publicitaria arriba y sus métricas aparecerán aquí después del primer «Actualizar»."
          icon={BarChart3}
          title="Ninguna cuenta activa que medir"
        />
      )}
    </Card>
  );
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("es-NI").format(value);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-NI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
