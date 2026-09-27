"use client";

import { useRouter } from "next/navigation";
import { Bike, PackageSearch, Pencil, Plus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/feedback";
import { SearchField, Textarea } from "@/components/ui/fields";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import {
  createCatalogModelAction,
  setCatalogModelActiveAction,
  updateCatalogModelAction,
} from "@/server/catalog/actions";
import type { CatalogAdminDTO } from "@/server/catalog/shared";

/**
 * Patch CRM-INT1 — el catálogo general de motocicletas, mantenido por el
 * Administrador.
 *
 * ## Catálogo no es inventario
 *
 * Esta pantalla dice **qué modelos vende MotoMas**. La columna «Existencias»
 * cuenta unidades AVAILABLE del inventario, sucursal por sucursal, y está al
 * lado precisamente para que no se confundan: un modelo activo sin unidades se
 * puede ofrecer a un lead, no apartar en una reserva.
 *
 * ## Lo que se puede hacer
 *
 * Dar de alta, completar marca/versión/año —los modelos sembrados sin marca
 * aparecen señalados— y dar de baja o reactivar. Nunca borrar: leads, campañas
 * y unidades apuntan a cada modelo.
 */

type Draft = {
  brand: string;
  model: string;
  version: string;
  year: string;
  description: string;
};

const emptyDraft: Draft = { brand: "", model: "", version: "", year: "", description: "" };

export function CatalogAdminPanel({
  models,
  unitsWithoutModel,
}: {
  models: CatalogAdminDTO[];
  /** Unidades del inventario sin modelo del catálogo enlazado. */
  unitsWithoutModel: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);

  const active = models.filter((model) => model.isActive);
  const pendingBrand = active.filter((model) => model.brandPending).length;

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return models.filter(
      (model) =>
        (showInactive || model.isActive) &&
        (!text ||
          model.label.toLowerCase().includes(text) ||
          model.slug.includes(text)),
    );
  }, [models, query, showInactive]);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la acción.");
        return;
      }
      setMessage(done);
      after?.();
      router.refresh();
    });
  }

  function startEdit(model: CatalogAdminDTO) {
    setEditingId(model.id);
    setEditDraft({
      brand: model.brandPending ? "" : model.rawBrand,
      model: model.model,
      version: model.version ?? "",
      year: model.year ? String(model.year) : "",
      description: model.description ?? "",
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Bike} label="Modelos activos" value={active.length} />
        <StatCard
          hint="Sembrados sin marca: complétala para que los selectores la muestren."
          label="Con marca pendiente"
          value={pendingBrand}
        />
        <StatCard
          hint="Registradas antes de que el alta exigiera el modelo. Concílialas abajo."
          icon={PackageSearch}
          label="Unidades sin modelo"
          value={unitsWithoutModel}
        />
      </div>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      <Card className="p-6">
        {creating ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <FormSection
              description="Un modelo nuevo no crea existencias: las unidades entran por el ingreso de inventario."
              title="Nuevo modelo"
            >
              <DraftFields draft={draft} onChange={setDraft} />
            </FormSection>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={pending || !draft.brand.trim() || !draft.model.trim()}
                onClick={() =>
                  run(
                    () => createCatalogModelAction(draft),
                    "Modelo registrado en el catálogo.",
                    () => {
                      setDraft(emptyDraft);
                      setCreating(false);
                    },
                  )
                }
              >
                {pending ? "Guardando…" : "Guardar modelo"}
              </Button>
              <Button onClick={() => setCreating(false)} variant="secondary">
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SearchField
              className="min-w-[240px] flex-1"
              onValueChange={setQuery}
              placeholder="Buscar por marca, modelo o slug"
              value={query}
            />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                checked={showInactive}
                className="h-4 w-4"
                onChange={(event) => setShowInactive(event.target.checked)}
                type="checkbox"
              />
              Mostrar dados de baja
            </label>
            <Button onClick={() => setCreating(true)} size="sm">
              <Plus aria-hidden className="h-4 w-4" />
              Nuevo modelo
            </Button>
          </div>
        )}

        <div className="mt-5 overflow-x-auto">
          <div className="min-w-[860px] overflow-hidden rounded-xl border border-slate-200">
            <div className="grid grid-cols-[1.6fr_0.7fr_1.2fr_0.8fr_auto] border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <div>Modelo</div>
              <div>Estado</div>
              <div>Existencias (disponibles)</div>
              <div>Uso</div>
              <div className="text-right">Acciones</div>
            </div>
            {visible.length ? (
              visible.map((model) =>
                editingId === model.id ? (
                  <div className="border-b border-slate-100 bg-slate-50 px-5 py-4" key={model.id}>
                    <FormSection title={`Editar ${model.label}`}>
                      <DraftFields draft={editDraft} onChange={setEditDraft} />
                    </FormSection>
                    <p className="mt-2 text-xs text-slate-500">
                      Slug fijo: <code>{model.slug}</code>. No cambia al editar,
                      porque leads y campañas antiguas lo guardan.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              updateCatalogModelAction({
                                ...editDraft,
                                id: model.id,
                              }),
                            "Modelo actualizado.",
                            () => setEditingId(null),
                          )
                        }
                        size="sm"
                      >
                        Guardar cambios
                      </Button>
                      <Button onClick={() => setEditingId(null)} size="sm" variant="secondary">
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="grid grid-cols-[1.6fr_0.7fr_1.2fr_0.8fr_auto] items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0"
                    key={model.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{model.label}</p>
                      <p className="mt-0.5 truncate font-mono text-xs text-slate-400">{model.slug}</p>
                      {model.brandPending ? (
                        <Badge className="mt-1" tone="orange">
                          Marca pendiente
                        </Badge>
                      ) : null}
                    </div>
                    <div>
                      <Badge tone={model.isActive ? "green" : "gray"}>
                        {model.isActive ? "Activo" : "Dado de baja"}
                      </Badge>
                    </div>
                    <div className="min-w-0 text-sm text-slate-600">
                      {model.availableUnits ? (
                        <>
                          <span className="font-semibold">{model.availableUnits}</span>{" "}
                          <span className="text-xs text-slate-400">
                            {model.unitsByBranch
                              .map((row) => `${row.branchName}: ${row.count}`)
                              .join(" · ")}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">Sin unidades disponibles</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {model.leads} lead(s)
                      <br />
                      {model.campaigns} campaña(s)
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => startEdit(model)} size="sm" variant="ghost">
                        <Pencil aria-hidden className="h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              setCatalogModelActiveAction({
                                id: model.id,
                                isActive: !model.isActive,
                              }),
                            model.isActive ? "Modelo dado de baja." : "Modelo reactivado.",
                          )
                        }
                        size="sm"
                        variant="secondary"
                      >
                        {model.isActive ? "Dar de baja" : "Reactivar"}
                      </Button>
                    </div>
                  </div>
                ),
              )
            ) : (
              <EmptyState
                description={
                  query
                    ? "Ningún modelo coincide con la búsqueda."
                    : "Registra el primer modelo con «Nuevo modelo»."
                }
                icon={Bike}
                title="Sin modelos que mostrar"
                variant={query ? "no-results" : "empty"}
              />
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function DraftFields({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
}) {
  return (
    <>
      <Field label="Marca" required>
        <Input
          onChange={(event) => onChange({ ...draft, brand: event.target.value })}
          placeholder="Bajaj"
          value={draft.brand}
        />
      </Field>
      <Field label="Modelo" required>
        <Input
          onChange={(event) => onChange({ ...draft, model: event.target.value })}
          placeholder="Pulsar NS200"
          value={draft.model}
        />
      </Field>
      <Field hint="Opcional: ABS, UG, FI…" label="Versión o variante">
        <Input
          onChange={(event) => onChange({ ...draft, version: event.target.value })}
          value={draft.version}
        />
      </Field>
      <Field hint="Opcional" label="Año">
        <Input
          inputMode="numeric"
          onChange={(event) => onChange({ ...draft, year: event.target.value })}
          placeholder="2026"
          value={draft.year}
        />
      </Field>
      <Field className="sm:col-span-2" label="Descripción">
        <Textarea
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
          rows={2}
          value={draft.description}
        />
      </Field>
    </>
  );
}
