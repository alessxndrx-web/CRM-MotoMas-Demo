"use client";

import { Coins } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import type { MarketingAttributionReportDTO } from "@/server/marketing/shared";
import {
  metaAdDatePresetLabels,
  metaAdDatePresetValues,
  type MetaAdDatePresetValue,
} from "@/server/meta-ads/shared";

/**
 * Gasto, leads, ventas y coste por lead — una fila por canal.
 *
 * ## Por qué cuelga del panel de integraciones de Meta
 *
 * Porque la mitad izquierda de la tabla es dinero de Meta. Quien puede ver el
 * gasto de una cuenta publicitaria es quien administra Marketing, que es la
 * misma puerta que ya cierra el tablero de métricas de arriba.
 *
 * ## Comparte el periodo con el tablero de métricas
 *
 * El mismo parámetro `?periodo=` de Meta-4, a propósito. Dos periodos distintos
 * en la misma pantalla —gasto de 7 días arriba, atribución de 30 abajo— es una
 * lectura equivocada esperando a ocurrir. Este selector es el de arriba, puesto
 * también aquí para no obligar a subir.
 *
 * ## Un guion no es un cero
 *
 * Es la misma disciplina que Meta-4 aplica a su `cpc`: sin leads, el coste por
 * lead **no es cero, es nada**, y una cuenta sin foto de este periodo no es una
 * cuenta que no gastó. Los dos casos se dibujan distintos de un número real.
 */

export type MarketingAttributionSectionProps = {
  report: MarketingAttributionReportDTO;
};

export function MarketingAttributionSection({
  report,
}: MarketingAttributionSectionProps) {
  const router = useRouter();
  const [preset, setPreset] = useState<MetaAdDatePresetValue>(report.datePreset);

  function changePreset(value: string) {
    const next = value as MetaAdDatePresetValue;
    setPreset(next);
    router.push(`/panel/marketing?periodo=${encodeURIComponent(next)}`);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
        <div>
          <h4 className="font-semibold text-slate-900">
            Atribución por canal
          </h4>
          <p className="mt-1 text-sm text-slate-500">
            Lo que costó cada canal, cuántos leads trajo y qué vendió.{" "}
            {formatRange(report.from, report.to)}.
          </p>
        </div>
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
      </div>

      {/*
        El gasto no se acota por sucursal —una cuenta publicitaria no pertenece a
        ninguna— así que con el filtro activo el coste por lead mezcla gasto de
        toda la empresa con leads de una sucursal. Se dice; no se disimula.
      */}
      {report.branchCode ? (
        <p className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800">
          Leads y ventas están acotados a tu sucursal, pero el gasto es de toda
          la empresa: el coste por lead de esta tabla mezcla las dos escalas.
        </p>
      ) : null}

      {report.rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Canal</th>
                <th className="px-5 py-3 text-right font-semibold">Gasto</th>
                <th className="px-5 py-3 text-right font-semibold">Leads</th>
                <th className="px-5 py-3 text-right font-semibold">Ventas</th>
                <th className="px-5 py-3 text-right font-semibold">
                  Importe vendido
                </th>
                <th className="px-5 py-3 text-right font-semibold">
                  Coste por lead
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row) => (
                <tr key={row.channel}>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900">
                      {row.channel}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {row.linkedAccounts === 0
                        ? "Sin cuenta publicitaria enlazada"
                        : `${row.linkedAccounts} ${
                            row.linkedAccounts === 1
                              ? "cuenta enlazada"
                              : "cuentas enlazadas"
                          }`}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    {row.spend === null ? (
                      <Badge tone="amber">
                        {row.mixedCurrency ? "Monedas mixtas" : "Sin datos"}
                      </Badge>
                    ) : (
                      <span className="tabular-nums font-semibold text-slate-900">
                        {formatMoney(row.spend)} {row.spendCurrency}
                      </span>
                    )}
                    {/*
                      Gasto parcial: hay cuentas enlazadas sin foto de este
                      periodo. Enseñar la suma a secas la haría pasar por
                      completa.
                    */}
                    {row.spend !== null && row.accountsWithoutSnapshot > 0 ? (
                      <div className="mt-1 text-xs text-amber-700">
                        Parcial: {row.accountsWithoutSnapshot} sin datos
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-slate-700">
                    {formatInteger(row.leads)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-slate-700">
                    {formatInteger(row.salesCount)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-slate-700">
                    {formatMoney(row.salesTotal)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums font-semibold text-slate-900">
                    {row.costPerLead === null ? "—" : formatMoney(row.costPerLead)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
            El gasto lo calculó Meta en la zona horaria de la cuenta; los leads y
            las ventas se cuentan con la hora del servidor. Comparten el nombre
            del periodo, no el reloj.
          </p>
        </div>
      ) : (
        <EmptyState
          className="border-0"
          description="Ningún canal tuvo leads, ventas ni cuenta publicitaria enlazada en este periodo. Enlaza una cuenta desde el formulario de campañas para que su gasto aparezca aquí."
          icon={Coins}
          title="Nada que atribuir en este periodo"
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

/** «Del 1 al 7 de septiembre». `to` es exclusivo, así que se resta un día. */
function formatRange(from: string, to: string): string {
  const format = new Intl.DateTimeFormat("es-NI", { dateStyle: "medium" });
  const start = new Date(from);
  const endExclusive = new Date(to);
  const lastDay = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000);
  if (format.format(start) === format.format(lastDay)) {
    return format.format(start);
  }
  return `${format.format(start)} – ${format.format(lastDay)}`;
}
