"use client";

import { Link2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MetaAdAccountsSection } from "@/features/operations/modules/marketing-db/meta-ad-accounts-section";
import { MetaAdMetricsSection } from "@/features/operations/modules/marketing-db/meta-ad-metrics-section";
import {
  createMetaPageBranchMapping,
  deleteMetaPageBranchMapping,
  resolveUnmappedMetaLead,
  updateMetaPageBranchMapping,
} from "@/server/meta/actions";
import type {
  BranchChoice,
  MetaPageBranchDTO,
  MetaPageBranchInput,
  MetaUnmappedLeadDTO,
} from "@/server/meta/shared";
import type {
  MetaAdAccountDTO,
  MetaAdMetricsBoardDTO,
} from "@/server/meta-ads/shared";

/**
 * Panel de la integración de Meta Lead Ads, dentro del módulo `marketing-db`.
 *
 * Dos tablas que responden dos preguntas distintas:
 *
 *   1. **Qué página atiende qué sucursal.** El webhook de Meta trae un
 *      `page_id` y nada más; sin esta tabla no hay forma de saber a qué
 *      sucursal pertenece el lead. Se llena aquí, no en el código, para que
 *      conectar una página nueva no exija un despliegue.
 *   2. **Qué leads quedaron esperando.** Los que llegaron de una página todavía
 *      sin mapear. No se descartan ni se les adivina sucursal: esperan a que
 *      alguien elija una.
 *
 * Las dos empiezan vacías y eso es lo normal hasta que Marketing conecte las
 * páginas reales en el panel de Meta. Toda escritura pasa por las Server
 * Actions, que vuelven a comprobar el rol en el servidor.
 *
 * La lista de pendientes **no muestra respuestas del formulario**, sólo qué
 * preguntas llegaron: la sucursal la decide la página de origen, no la persona.
 *
 * Debajo cuelga una tercera sección (Meta-3): las cuentas publicitarias que
 * MotoMas sigue. Es otro producto de Meta y otro mecanismo —se lee del Graph
 * API, no llega por webhook—, pero es la misma pregunta para quien administra
 * Marketing: qué tenemos conectado. Por eso comparte panel y no abre una ruta.
 */

export type MetaIntegrationsPanelProps = {
  mappings: MetaPageBranchDTO[];
  pending: MetaUnmappedLeadDTO[];
  branches: BranchChoice[];
  adAccounts: MetaAdAccountDTO[];
  metricsBoard: MetaAdMetricsBoardDTO;
  canManage: boolean;
};

function emptyDraft(branches: BranchChoice[]): MetaPageBranchInput {
  return {
    pageId: "",
    branchCode: branches[0]?.code ?? "",
    label: null,
    isActive: true,
  };
}

export function MetaIntegrationsPanel({
  mappings,
  pending,
  branches,
  adAccounts,
  metricsBoard,
  canManage,
}: MetaIntegrationsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<MetaPageBranchInput>(() =>
    emptyDraft(branches),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [resolveBranch, setResolveBranch] = useState<Record<string, string>>({});

  function report(text: string, failed: boolean) {
    setMessage(text);
    setIsError(failed);
  }

  function resetForm() {
    setEditingId(null);
    setShowForm(false);
    setDraft(emptyDraft(branches));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    report("", false);
    startTransition(async () => {
      const result = editingId
        ? await updateMetaPageBranchMapping(editingId, draft)
        : await createMetaPageBranchMapping(draft);
      if (!result.ok) {
        report(result.error, true);
        return;
      }
      resetForm();
      report(editingId ? "Mapeo actualizado." : "Página conectada.", false);
      router.refresh();
    });
  }

  function edit(mapping: MetaPageBranchDTO) {
    setEditingId(mapping.id);
    setShowForm(true);
    setDraft({
      pageId: mapping.pageId,
      branchCode: mapping.branchCode,
      label: mapping.label,
      isActive: mapping.isActive,
    });
  }

  function toggleActive(mapping: MetaPageBranchDTO) {
    if (!canManage) return;
    report("", false);
    startTransition(async () => {
      const result = await updateMetaPageBranchMapping(mapping.id, {
        pageId: mapping.pageId,
        branchCode: mapping.branchCode,
        label: mapping.label,
        isActive: !mapping.isActive,
      });
      if (!result.ok) {
        report(result.error, true);
        return;
      }
      report(
        mapping.isActive
          ? "Página desactivada. Los leads nuevos quedarán pendientes."
          : "Página reactivada.",
        false,
      );
      router.refresh();
    });
  }

  function remove(mapping: MetaPageBranchDTO) {
    if (!canManage) return;
    report("", false);
    startTransition(async () => {
      const result = await deleteMetaPageBranchMapping(mapping.id);
      if (!result.ok) {
        report(result.error, true);
        return;
      }
      report("Mapeo eliminado. Los leads ya registrados no cambian.", false);
      router.refresh();
    });
  }

  function resolve(row: MetaUnmappedLeadDTO) {
    if (!canManage) return;
    const branchCode = resolveBranch[row.id] ?? branches[0]?.code ?? "";
    if (!branchCode) return;
    report("", false);
    startTransition(async () => {
      const result = await resolveUnmappedMetaLead(row.id, branchCode);
      if (!result.ok) {
        report(result.error, true);
        return;
      }
      report("Lead creado en la sucursal elegida.", false);
      router.refresh();
    });
  }

  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">
          Meta Lead Ads
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Qué página de Facebook atiende qué sucursal, y los leads que llegaron
          de una página todavía sin conectar.
        </p>
      </div>

      {message ? (
        <p
          className={
            isError
              ? "text-sm font-medium text-red-600"
              : "text-sm font-medium text-emerald-600"
          }
        >
          {message}
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <h4 className="font-semibold text-slate-900">Páginas conectadas</h4>
            <p className="mt-1 text-sm text-slate-500">
              Una página responde a una sola sucursal.
            </p>
          </div>
          {canManage && !showForm ? (
            <Button size="sm" variant="secondary" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              Conectar página
            </Button>
          ) : null}
        </div>

        {canManage && showForm ? (
          <form className="grid gap-4 border-b border-slate-200 p-5 md:grid-cols-2" onSubmit={submit}>
            <Input
              placeholder="ID de página de Meta (sólo dígitos)"
              value={draft.pageId}
              onChange={(e) => setDraft({ ...draft, pageId: e.target.value })}
            />
            <Input
              placeholder="Nombre de la página (opcional)"
              value={draft.label ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, label: e.target.value || null })
              }
            />
            <Select
              value={draft.branchCode}
              onChange={(e) => setDraft({ ...draft, branchCode: e.target.value })}
            >
              {branches.map((branch) => (
                <option key={branch.code} value={branch.code}>
                  {branch.name}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                checked={draft.isActive}
                type="checkbox"
                onChange={(e) =>
                  setDraft({ ...draft, isActive: e.target.checked })
                }
              />
              Activa (recibe leads)
            </label>
            <div className="flex gap-2 md:col-span-2">
              <Button disabled={isPending} type="submit">
                {editingId ? "Guardar cambios" : "Conectar página"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm}>
                <X className="h-4 w-4" />
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        {mappings.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Página</th>
                  <th className="px-5 py-3 font-semibold">Sucursal</th>
                  <th className="px-5 py-3 font-semibold">Estado</th>
                  {canManage ? (
                    <th className="px-5 py-3 font-semibold">Acciones</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mappings.map((mapping) => (
                  <tr key={mapping.id}>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">
                        {mapping.label ?? "Sin nombre"}
                      </div>
                      <div className="mt-1 font-mono text-xs text-slate-500">
                        {mapping.pageId}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {mapping.branchName}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={mapping.isActive ? "green" : "slate"}>
                        {mapping.isActive ? "Activa" : "Inactiva"}
                      </Badge>
                    </td>
                    {canManage ? (
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={isPending}
                            size="sm"
                            variant="secondary"
                            onClick={() => edit(mapping)}
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Button>
                          <Button
                            disabled={isPending}
                            size="sm"
                            variant="secondary"
                            onClick={() => toggleActive(mapping)}
                          >
                            {mapping.isActive ? "Desactivar" : "Activar"}
                          </Button>
                          <Button
                            disabled={isPending}
                            size="sm"
                            variant="secondary"
                            onClick={() => remove(mapping)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Eliminar
                          </Button>
                        </div>
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
            description="Cuando tengas los ID de página reales del panel de Meta, conéctalos aquí. Hasta entonces los leads que lleguen quedan pendientes, no se pierden."
            icon={Link2}
            title="Ninguna página conectada todavía"
          />
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h4 className="font-semibold text-slate-900">
            Leads pendientes de sucursal
          </h4>
          <p className="mt-1 text-sm text-slate-500">
            Llegaron de una página sin conectar. Sus respuestas están guardadas;
            elige la sucursal y se crean como lead.
          </p>
        </div>

        {pending.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Página / formulario</th>
                  <th className="px-5 py-3 font-semibold">Recibido</th>
                  <th className="px-5 py-3 font-semibold">Datos capturados</th>
                  {canManage ? (
                    <th className="px-5 py-3 font-semibold">Resolver</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pending.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-4">
                      <div className="font-mono text-xs text-slate-900">
                        {row.pageId}
                      </div>
                      <div className="mt-1 font-mono text-xs text-slate-500">
                        form {row.formId}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatDate(row.receivedAt)}
                    </td>
                    <td className="px-5 py-4">
                      {row.isComplete ? (
                        <Badge tone="green">
                          {row.capturedFields.length} campos
                        </Badge>
                      ) : (
                        <Badge tone="amber">
                          Falta {row.missingFields.join(" y ")}
                        </Badge>
                      )}
                    </td>
                    {canManage ? (
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            size="sm"
                            value={
                              resolveBranch[row.id] ?? branches[0]?.code ?? ""
                            }
                            onChange={(e) =>
                              setResolveBranch({
                                ...resolveBranch,
                                [row.id]: e.target.value,
                              })
                            }
                          >
                            {branches.map((branch) => (
                              <option key={branch.code} value={branch.code}>
                                {branch.name}
                              </option>
                            ))}
                          </Select>
                          <Button
                            disabled={isPending || !row.isComplete}
                            size="sm"
                            onClick={() => resolve(row)}
                          >
                            Crear lead
                          </Button>
                        </div>
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
            description="Es el estado normal mientras no lleguen entregas de Meta o mientras todas las páginas estén conectadas."
            icon={Link2}
            title="Sin leads pendientes"
          />
        )}
      </Card>

      <div className="pt-2">
        <h3 className="text-lg font-semibold text-slate-900">
          Cuentas publicitarias de Meta
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Registro de consulta. Los datos se leen con un token de sólo lectura
          (<code>ads_read</code>); nada de aquí puede gastar dinero.
        </p>
      </div>

      <MetaAdAccountsSection accounts={adAccounts} canManage={canManage} />
      <MetaAdMetricsSection board={metricsBoard} canManage={canManage} />
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-NI", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
