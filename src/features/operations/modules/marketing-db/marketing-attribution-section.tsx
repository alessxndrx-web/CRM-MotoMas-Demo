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
 * Leads, ventas y —para quien puede verlo— gasto y coste por lead, una fila por
 * canal.
 *
 * ## Cuelga de la página, no del panel de Meta (Patch Marketing-P1)
 *
 * Attribution-1 la metió dentro de `MetaIntegrationsPanel` porque su columna de
 * gasto es dinero de Meta. El efecto secundario fue que **el Gerente no la veía
 * en absoluto**: ese panel sólo se dibuja para quien administra Marketing.
 *
 * Pero lo que hay aquí es un agregado por canal, sin ninguna fila a nivel de
 * lead, y `canViewLeadAttribution` dice justo eso — «Managers keep aggregate
 * campaign metrics but do not receive lead-level rows». Así que la tabla subió a
 * la página y lo que cambia por rol son **sus columnas**, no su existencia.
 *
 * ## Las columnas de dinero no vienen vacías: no vienen
 *
 * El servidor decide con `includeCost`. Cuando es falso, ni el gasto ni el coste
 * por lead existen en la respuesta, y esta pantalla no dibuja sus columnas.
 * Enseñarlas con un guion habría sugerido «no hay datos», que es una frase que
 * esta tabla usa para otra cosa muy distinta.
 *
 * Se retiran **las dos juntas**, siempre: el coste por lead es el gasto dividido
 * entre unos leads que sí se ven, así que dejarlo devolvería el gasto
 * multiplicando.
 *
 * ## Comparte el periodo con el tablero de métricas
 *
 * El mismo parámetro `?periodo=` de Meta-4. Para quien ve los dos, tener dos
 * periodos distintos en la misma pantalla es una lectura equivocada esperando a
 * ocurrir; para quien sólo ve esta tabla, es sencillamente el periodo de la
 * página.
 *
 * ## Un guion no es un cero
 *
 * Es la misma disciplina que Meta-4 aplica a su `cpc`: sin leads, el coste por
 * lead **no es cero, es nada**, y una cuenta sin foto de este periodo no es una
 * cuenta que no gastó.
 */

export type MarketingAttributionSectionProps = {
  report: MarketingAttributionReportDTO;
};

export function MarketingAttributionSection({
  report,
}: MarketingAttributionSectionProps) {
  const router = useRouter();
  const [preset, setPreset] = useState<MetaAdDatePresetValue>(report.datePreset);
  const { includesCost } = report;

  function changePreset(value: string) {
    const next = value as MetaAdDatePresetValue;
    setPreset(next);
    router.push(`/panel/marketing?periodo=${encodeURIComponent(next)}`);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
        <div>
          <h4 className="font-semibold text-slate-900">Atribución por canal</h4>
          <p className="mt-1 text-sm text-slate-500">
            {includesCost
              ? "Lo que costó cada canal, cuántos leads trajo y qué vendió."
              : "Cuántos leads trajo cada canal y qué vendió."}{" "}
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
        Dos avisos distintos para dos situaciones distintas.

        Con gasto a la vista, lo que hay que advertir es la mezcla de escalas: el
        gasto no se acota por sucursal —una cuenta publicitaria no pertenece a
        ninguna— mientras que los leads y las ventas sí. Sin gasto no hay mezcla
        que advertir, y repetir esa frase confundiría; basta con decir qué se está
        contando.
      */}
      {report.branchCode && includesCost ? (
        <p className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800">
          Leads y ventas están acotados a tu sucursal, pero el gasto es de toda
          la empresa: el coste por lead de esta tabla mezcla las dos escalas.
        </p>
      ) : null}
      {report.branchCode && !includesCost ? (
        <p className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600">
          Leads y ventas de tu sucursal.
        </p>
      ) : null}

      {report.rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Canal</th>
                {includesCost ? (
                  <th className="px-5 py-3 text-right font-semibold">Gasto</th>
                ) : null}
                <th className="px-5 py-3 text-right font-semibold">Leads</th>
                <th className="px-5 py-3 text-right font-semibold">Ventas</th>
                <th className="px-5 py-3 text-right font-semibold">
                  Importe vendido
                </th>
                {includesCost ? (
                  <th className="px-5 py-3 text-right font-semibold">
                    Coste por lead
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row) => (
                <tr key={row.channel}>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900">
                      {row.channel}
                    </div>
                    {row.cost ? (
                      <div className="mt-1 text-xs text-slate-500">
                        {row.cost.linkedAccounts === 0
                          ? "Sin cuenta publicitaria enlazada"
                          : `${row.cost.linkedAccounts} ${
                              row.cost.linkedAccounts === 1
                                ? "cuenta enlazada"
                                : "cuentas enlazadas"
                            }`}
                      </div>
                    ) : null}
                  </td>
                  {row.cost ? (
                    <td className="px-5 py-4 text-right">
                      {row.cost.spend === null ? (
                        <Badge tone="amber">
                          {row.cost.mixedCurrency
                            ? "Monedas mixtas"
                            : "Sin datos"}
                        </Badge>
                      ) : (
                        <span className="tabular-nums font-semibold text-slate-900">
                          {formatMoney(row.cost.spend)} {row.cost.spendCurrency}
                        </span>
                      )}
                      {/*
                        Gasto parcial: hay cuentas enlazadas sin foto de este
                        periodo. Enseñar la suma a secas la haría pasar por
                        completa.
                      */}
                      {row.cost.spend !== null &&
                      row.cost.accountsWithoutSnapshot > 0 ? (
                        <div className="mt-1 text-xs text-amber-700">
                          Parcial: {row.cost.accountsWithoutSnapshot} sin datos
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                  <td className="px-5 py-4 text-right tabular-nums text-slate-700">
                    {formatInteger(row.leads)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-slate-700">
                    {formatInteger(row.salesCount)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-slate-700">
                    {formatMoney(row.salesTotal)}
                  </td>
                  {row.cost ? (
                    <td className="px-5 py-4 text-right tabular-nums font-semibold text-slate-900">
                      {row.cost.costPerLead === null
                        ? "—"
                        : formatMoney(row.cost.costPerLead)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {includesCost ? (
            <p className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
              El gasto lo calculó Meta en la zona horaria de la cuenta; los leads
              y las ventas se cuentan con la hora del servidor. Comparten el
              nombre del periodo, no el reloj.
            </p>
          ) : null}
        </div>
      ) : (
        <EmptyState
          className="border-0"
          description={
            includesCost
              ? "Ningún canal tuvo leads, ventas ni cuenta publicitaria enlazada en este periodo. Enlaza una cuenta desde el formulario de campañas para que su gasto aparezca aquí."
              : "Ningún canal tuvo leads ni ventas en este periodo."
          }
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
