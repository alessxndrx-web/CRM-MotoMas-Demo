"use client";

import { useRouter } from "next/navigation";
import { Link2, PackageSearch } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/feedback";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  bulkLinkExactUnitsAction,
  linkUnitToCatalogModelAction,
} from "@/server/catalog/actions";
import type { CatalogAdminDTO, UnlinkedUnitDTO } from "@/server/catalog/shared";
import {
  unitStatusLabels,
  type MotorcycleUnitStatusValue,
} from "@/server/inventory/shared";

/**
 * Patch CRM-INT2 — conciliación de unidades históricas con el catálogo.
 *
 * ## Sugerido no es enlazado
 *
 * Todo lo que esta tabla muestra está **sin enlazar**. La columna «Sugerencia»
 * es una propuesta calculada con marca, modelo y año en texto; la unidad cuenta
 * para su modelo sólo cuando un Administrador pulsa «Enlazar». Por eso la
 * sugerencia exacta se pinta en azul («en curso») y nunca en verde.
 *
 * ## Qué se puede hacer en bloque
 *
 * Sólo las sugerencias **exactas**, y el servidor las vuelve a calcular: lo
 * que esta pantalla marcó no cuenta. Las posibles y las que no tienen
 * sugerencia se enlazan de una en una, eligiendo el modelo a mano; el
 * selector empieza vacío para que nadie confirme una duda con un clic.
 */

type Filter = "TODAS" | "EXACTA" | "POSIBLE" | "NINGUNA";

const confidenceBadge = {
  EXACTA: { tone: "blue", label: "Sugerencia exacta" },
  POSIBLE: { tone: "amber", label: "Posible: elige" },
  NINGUNA: { tone: "slate", label: "Sin sugerencia" },
} as const;

export function UnitReconciliationPanel({
  models,
  total,
  units,
}: {
  models: CatalogAdminDTO[];
  /** Total real sin enlazar; `units` puede venir recortado. */
  total: number;
  units: UnlinkedUnitDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("TODAS");
  const [selected, setSelected] = useState<string[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const exactIds = useMemo(
    () => units.filter((unit) => unit.suggestion.confidence === "EXACTA").map((unit) => unit.id),
    [units],
  );
  const visible = units.filter(
    (unit) => filter === "TODAS" || unit.suggestion.confidence === filter,
  );
  const counts = {
    TODAS: units.length,
    EXACTA: exactIds.length,
    POSIBLE: units.filter((unit) => unit.suggestion.confidence === "POSIBLE").length,
    NINGUNA: units.filter((unit) => unit.suggestion.confidence === "NINGUNA").length,
  };
  // Activos primero; los dados de baja siguen elegibles para unidades antiguas.
  const options = [...models].sort(
    (a, b) => Number(b.isActive) - Number(a.isActive) || a.label.localeCompare(b.label, "es"),
  );

  function report(result: Awaited<ReturnType<typeof bulkLinkExactUnitsAction>>, done: string) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(
      result.skipped
        ? `${done} ${result.skipped} se omitieron: ya estaban enlazadas o su sugerencia dejó de ser exacta.`
        : done,
    );
    setSelected([]);
    router.refresh();
  }

  function linkOne(unit: UnlinkedUnitDTO) {
    const catalogModelId =
      choice[unit.id] ??
      (unit.suggestion.confidence === "EXACTA" ? unit.suggestion.candidates[0].id : "");
    if (!catalogModelId) {
      setError(`Elige el modelo para el chasis ${unit.chassisNumber}.`);
      return;
    }
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await linkUnitToCatalogModelAction({ unitId: unit.id, catalogModelId });
      report(result, `Chasis ${unit.chassisNumber} enlazado.`);
    });
  }

  function linkSelected() {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await bulkLinkExactUnitsAction({ unitIds: selected });
      report(result, result.ok ? `${result.linked} unidades enlazadas.` : "");
    });
  }

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <PackageSearch aria-hidden className="h-5 w-5 text-slate-400" />
        Unidades sin modelo del catálogo
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Registradas antes de que el alta exigiera el modelo. Una sugerencia no enlaza nada: la
        unidad cuenta para su modelo cuando la enlazas. Enlazar no cambia su estado ni su sucursal.
      </p>
      {total > units.length ? (
        <p className="mt-2 text-xs text-slate-500">
          Se muestran las {units.length} más recientes de {total}. Al enlazarlas aparecen las
          siguientes.
        </p>
      ) : null}

      {error ? (
        <div className="mt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
      {message ? (
        <div className="mt-4">
          <Notice tone="success">{message}</Notice>
        </div>
      ) : null}

      {units.length ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(["TODAS", "EXACTA", "POSIBLE", "NINGUNA"] as const).map((value) => (
              <Button
                key={value}
                onClick={() => setFilter(value)}
                size="sm"
                variant={filter === value ? "default" : "secondary"}
              >
                {value === "TODAS" ? "Todas" : confidenceBadge[value].label} ({counts[value]})
              </Button>
            ))}
          </div>
          {exactIds.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
              <span>
                En bloque sólo se enlazan sugerencias exactas: misma marca, mismo modelo y año
                compatible, con un único candidato.
              </span>
              <Button
                disabled={pending}
                onClick={() =>
                  setSelected(selected.length === exactIds.length ? [] : exactIds)
                }
                size="sm"
                variant="secondary"
              >
                {selected.length === exactIds.length ? "Quitar selección" : "Seleccionar las exactas"}
              </Button>
              <Button disabled={pending || !selected.length} onClick={linkSelected} size="sm">
                {pending ? "Enlazando…" : `Enlazar ${selected.length} seleccionadas`}
              </Button>
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <Table>
              <THead>
                <tr>
                  <TH align="center">
                    <span className="sr-only">Seleccionar</span>
                  </TH>
                  <TH>Chasis</TH>
                  <TH>Registrada como</TH>
                  <TH>Sucursal · estado</TH>
                  <TH>Sugerencia</TH>
                  <TH>Modelo a enlazar</TH>
                  <TH align="right">
                    <span className="sr-only">Acción</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {visible.map((unit) => {
                  const exact = unit.suggestion.confidence === "EXACTA";
                  const badge = confidenceBadge[unit.suggestion.confidence];
                  const value =
                    choice[unit.id] ?? (exact ? unit.suggestion.candidates[0].id : "");
                  return (
                    <TR key={unit.id}>
                      <TD align="center">
                        {exact ? (
                          <input
                            aria-label={`Seleccionar ${unit.chassisNumber}`}
                            checked={selected.includes(unit.id)}
                            onChange={() => toggle(unit.id)}
                            type="checkbox"
                          />
                        ) : null}
                      </TD>
                      <TD className="font-mono text-xs">{unit.chassisNumber}</TD>
                      <TD>
                        {unit.brand} {unit.model} · {unit.year}
                        {unit.color ? <span className="text-slate-400"> · {unit.color}</span> : null}
                      </TD>
                      <TD>
                        {unit.branchName}
                        <span className="block text-xs text-slate-500">
                          {unitStatusLabels[unit.status as MotorcycleUnitStatusValue] ?? unit.status}
                        </span>
                      </TD>
                      <TD>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                        {unit.suggestion.candidates.map((candidate) => (
                          <span className="mt-1 block text-xs text-slate-500" key={candidate.id}>
                            {candidate.label} — {candidate.reason}
                          </span>
                        ))}
                      </TD>
                      <TD>
                        <select
                          aria-label={`Modelo para ${unit.chassisNumber}`}
                          className="h-9 w-full min-w-48 rounded-lg border border-slate-200 bg-sb-surface px-2 text-sm"
                          onChange={(event) =>
                            setChoice((current) => ({ ...current, [unit.id]: event.target.value }))
                          }
                          value={value}
                        >
                          <option value="">Elige el modelo</option>
                          {options.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label}
                              {model.isActive ? "" : " (dado de baja)"}
                            </option>
                          ))}
                        </select>
                      </TD>
                      <TD align="right">
                        <Button
                          disabled={pending || !value}
                          onClick={() => linkOne(unit)}
                          size="sm"
                          variant="secondary"
                        >
                          <Link2 aria-hidden className="h-4 w-4" />
                          Enlazar
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </>
      ) : (
        <div className="mt-5">
          <EmptyState
            description="Todas las unidades del inventario están enlazadas a su modelo."
            icon={PackageSearch}
            title="Nada que conciliar"
          />
        </div>
      )}
    </Card>
  );
}
