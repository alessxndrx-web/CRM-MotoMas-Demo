"use client";

import Link from "next/link";
import { Archive, ClipboardCheck, Copy, Megaphone, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/fields";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { MultiSelectList } from "@/features/operations/components/multi-select-list";
import {
  archiveMarketingCampaignAction,
  createMarketingCampaignAction,
  updateMarketingCampaignAction,
} from "@/server/marketing/actions";
import {
  marketingCampaignObjectiveLabels,
  marketingCampaignObjectiveValues,
  marketingCampaignStatusLabels,
  marketingCampaignStatusValues,
  marketingChannelLabels,
  marketingChannelValues,
  type MarketingCampaignDTO,
  type MarketingCampaignInput,
  type MarketingCampaignPerformanceDTO,
  type MarketingCampaignStatusValue,
  type MarketingChannelValue,
  type MarketingLeadAttributionDTO,
  type MarketingSummaryDTO,
} from "@/server/marketing/shared";
import type { MetaAdAccountDTO } from "@/server/meta-ads/shared";

/**
 * Server-fed Marketing panel (Patch 3.7C.3). The campaign list, performance and
 * summary come from DB-backed, already-scoped DTOs; every mutation goes through
 * the marketing server actions (create/update/archive) which re-check the
 * role — and, since CRM-INT1, the delegated grant — server-side. No
 * localStorage is read here. The legacy client Marketing panel remains
 * available behind the 3.7B legacy gate.
 *
 * ## Patch CRM-INT1
 *
 * - **Edición completa.** El formulario vivía arriba de la página, sin
 *   etiquetas, y «Editar» lo rellenaba sin llevar a él: parecía que las
 *   campañas sólo se podían pausar o finalizar. Ahora crear y editar abren el
 *   mismo panel lateral, con cada campo rotulado.
 * - **Varias sucursales y varios modelos** por campaña, del catálogo general.
 * - **Campañas finalizadas**: el panel bloquea lo que ya es historia y lo dice;
 *   el servidor aplica la misma regla.
 * - **Conciliación**: cada campaña enlaza a su detalle, donde Marketing reporta
 *   leads por sucursal y cada sucursal los confirma.
 */

export type BranchOption = { code: string; name: string };
export type ModelOption = { id: string; label: string };

export type MarketingDbPanelProps = {
  attribution: MarketingLeadAttributionDTO[];
  campaigns: MarketingCampaignDTO[];
  performance: MarketingCampaignPerformanceDTO[];
  summary: MarketingSummaryDTO;
  /** Rol y concesión permiten crear al menos alguna campaña. */
  canCreate: boolean;
  canViewAttribution: boolean;
  canViewBudget: boolean;
  branches: BranchOption[];
  models: ModelOption[];
  /**
   * Patch Attribution-1 — las cuentas publicitarias conectadas, para elegir de
   * cuál sale el gasto real de una campaña. Llega vacía cuando quien mira no
   * administra Marketing, y entonces el desplegable no se dibuja.
   */
  adAccounts: MetaAdAccountDTO[];
};

function emptyDraft(): MarketingCampaignInput {
  return {
    name: "",
    channel: "FACEBOOK_ADS",
    branchCodes: [],
    catalogModelIds: [],
    estimatedBudget: null,
    startsAt: new Date().toISOString().slice(0, 10),
    endsAt: null,
    status: "ACTIVE",
    objective: "LEADS",
    description: null,
    metaAdAccountId: null,
  };
}

const channelToSource: Partial<Record<MarketingChannelValue, string>> = {
  FACEBOOK_ADS: "facebook",
  INSTAGRAM_ADS: "instagram",
};

export function MarketingDbPanel({
  attribution,
  campaigns,
  performance,
  summary,
  canCreate,
  canViewAttribution,
  canViewBudget,
  branches,
  models,
  adAccounts,
}: MarketingDbPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<MarketingCampaignInput>(emptyDraft);
  const [editing, setEditing] = useState<MarketingCampaignDTO | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [channelFilter, setChannelFilter] = useState("todas");
  const [statusFilter, setStatusFilter] = useState("todas");
  const [branchFilter, setBranchFilter] = useState("todas");
  const [modelFilter, setModelFilter] = useState("todos");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const performanceById = useMemo(
    () => new Map(performance.map((row) => [row.campaignId, row])),
    [performance],
  );

  // Client-side narrowing only — the server already scoped the list, so a filter
  // can never widen it beyond what the caller may already see. Una campaña sin
  // sucursales cubre todas, y sin modelos promociona todos.
  const visibleCampaigns = useMemo(
    () =>
      campaigns.filter(
        (campaign) =>
          (channelFilter === "todas" || campaign.channel === channelFilter) &&
          (statusFilter === "todas" || campaign.status === statusFilter) &&
          (branchFilter === "todas" ||
            campaign.branches.length === 0 ||
            campaign.branches.some((branch) => branch.code === branchFilter)) &&
          (modelFilter === "todos" ||
            campaign.models.length === 0 ||
            campaign.models.some((model) => model.id === modelFilter)),
      ),
    [campaigns, channelFilter, statusFilter, branchFilter, modelFilter],
  );

  // Una campaña finalizada es historia: sólo nombre, descripción y estado.
  const locked = editing?.status === "COMPLETED";

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft());
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(campaign: MarketingCampaignDTO) {
    setEditing(campaign);
    setFormError("");
    setDraft({
      name: campaign.name,
      channel: campaign.channel,
      branchCodes: campaign.branches.map((branch) => branch.code),
      catalogModelIds: campaign.models.map((model) => model.id),
      estimatedBudget: campaign.estimatedBudget,
      startsAt: campaign.startsAt.slice(0, 10),
      endsAt: campaign.endsAt ? campaign.endsAt.slice(0, 10) : null,
      status: campaign.status,
      objective: campaign.objective,
      description: campaign.description,
      metaAdAccountId: campaign.metaAdAccountId,
    });
    setFormOpen(true);
  }

  function submit() {
    setFormError("");
    setMessage("");
    startTransition(async () => {
      const result = editing
        ? await updateMarketingCampaignAction(editing.id, draft)
        : await createMarketingCampaignAction(draft);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setMessage(editing ? "Campaña actualizada." : "Campaña creada.");
      setFormOpen(false);
      setEditing(null);
      setDraft(emptyDraft());
      router.refresh();
    });
  }

  function archive(campaign: MarketingCampaignDTO) {
    setMessage("");
    setError("");
    startTransition(async () => {
      const result = await archiveMarketingCampaignAction(campaign.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Campaña finalizada.");
      router.refresh();
    });
  }

  async function copyLink(campaign: MarketingCampaignDTO) {
    const source =
      channelToSource[campaign.channel] ??
      campaign.channelLabel.toLowerCase().replace(/\s+/g, "-");
    const href = `/solicitar-informacion?campaignId=${encodeURIComponent(
      campaign.id,
    )}&utm_source=${encodeURIComponent(source)}&utm_medium=paid&utm_campaign=${encodeURIComponent(
      campaign.name,
    )}`;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${href}`);
      setMessage("Enlace de formulario copiado. Los leads que entren por él quedan atribuidos a la campaña.");
    } catch {
      setMessage(href);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          canCreate ? (
            <Button onClick={openCreate}>
              <Plus aria-hidden className="h-4 w-4" />
              Nueva campaña
            </Button>
          ) : null
        }
        description="Campañas por sucursal y modelo, su atribución de leads y la conciliación con lo que cada sucursal recibió."
        eyebrow="Marketing comercial"
        title="Campañas"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Campañas activas" value={summary.activeCampaigns} />
        <SummaryTile label="Campañas totales" value={summary.totalCampaigns} />
        <SummaryTile label="Leads atribuidos" value={summary.attributedLeads} />
        <SummaryTile label="Finalizadas" value={summary.completedCampaigns} />
      </div>

      {canViewAttribution ? (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <h3 className="text-lg font-semibold text-slate-900">
              Atribución de leads
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Vista reducida para medir campañas. No incluye identidad, contacto,
              notas privadas, expedientes, créditos ni conversaciones.
            </p>
          </div>
          {attribution.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Código / fecha</th>
                    <th className="px-5 py-3 font-semibold">Campaña / canal</th>
                    <th className="px-5 py-3 font-semibold">Sucursal / moto</th>
                    <th className="px-5 py-3 font-semibold">Estado</th>
                    <th className="px-5 py-3 font-semibold">Resultado / conversión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attribution.map((lead) => (
                    <tr key={lead.leadCode}>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">
                          {lead.leadCode}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatDate(lead.createdAt)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-900">
                          {lead.campaignName}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {lead.channelLabel}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-900">
                          {lead.branchName}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {lead.motorcycleInterest ?? "Sin modelo indicado"}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone="slate">{lead.statusLabel}</Badge>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        <div>{lead.finalResult ?? "En proceso"}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {lead.conversionDate
                            ? formatDate(lead.conversionDate)
                            : "Sin fecha de conversión"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-500">
              Aún no hay leads atribuidos a campañas.
            </div>
          )}
        </Card>
      ) : null}

      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Canal">
            <Select onChange={(event) => setChannelFilter(event.target.value)} value={channelFilter}>
              <option value="todas">Todos los canales</option>
              {marketingChannelValues.map((value) => (
                <option key={value} value={value}>
                  {marketingChannelLabels[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estado">
            <Select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="todas">Todos los estados</option>
              {marketingCampaignStatusValues.map((value) => (
                <option key={value} value={value}>
                  {marketingCampaignStatusLabels[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sucursal">
            <Select onChange={(event) => setBranchFilter(event.target.value)} value={branchFilter}>
              <option value="todas">Todas las sucursales</option>
              {branches.map((branch) => (
                <option key={branch.code} value={branch.code}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Modelo">
            <Select onChange={(event) => setModelFilter(event.target.value)} value={modelFilter}>
              <option value="todos">Todos los modelos</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {visibleCampaigns.length ? (
          visibleCampaigns.map((campaign) => (
            <CampaignCard
              campaign={campaign}
              canViewBudget={canViewBudget}
              key={campaign.id}
              onArchive={archive}
              onCopy={copyLink}
              onEdit={openEdit}
              pending={isPending}
              performance={performanceById.get(campaign.id)}
            />
          ))
        ) : (
          <div className="lg:col-span-2">
            <EmptyState
              description={
                campaigns.length
                  ? "Cambia los filtros para ver otras campañas."
                  : "Todavía no hay campañas en tu alcance."
              }
              icon={Megaphone}
              title="Sin campañas para mostrar"
              variant={campaigns.length ? "no-results" : "empty"}
            />
          </div>
        )}
      </div>

      <Drawer
        description={
          editing
            ? `Creada el ${formatDate(editing.createdAt)}. Los cambios quedan en el historial de la campaña.`
            : "Sin sucursales la campaña cubre todas; sin modelos, promociona todos."
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setFormOpen(false)} variant="secondary">
              Cancelar
            </Button>
            <Button disabled={isPending || !draft.name.trim()} onClick={submit}>
              {isPending ? "Guardando…" : editing ? "Guardar cambios" : "Crear campaña"}
            </Button>
          </div>
        }
        onClose={() => setFormOpen(false)}
        open={formOpen}
        size="lg"
        title={editing ? `Editar «${editing.name}»` : "Nueva campaña"}
      >
        <div className="space-y-4">
          {formError ? <Notice tone="danger">{formError}</Notice> : null}
          {locked ? (
            <Notice tone="info" title="Campaña finalizada">
              Sus sucursales, modelos, fechas, canal, objetivo, presupuesto y
              cuenta son historia y no se editan. Puedes corregir el nombre y la
              descripción, o cambiar el estado para reabrirla.
            </Notice>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2" label="Nombre de la campaña" required>
              <Input
                maxLength={120}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                value={draft.name}
              />
            </Field>
            <Field label="Canal">
              <Select
                disabled={locked}
                onChange={(event) =>
                  setDraft({ ...draft, channel: event.target.value as MarketingChannelValue })
                }
                value={draft.channel}
              >
                {marketingChannelValues.map((value) => (
                  <option key={value} value={value}>
                    {marketingChannelLabels[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Objetivo">
              <Select
                disabled={locked}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    objective: event.target.value as MarketingCampaignInput["objective"],
                  })
                }
                value={draft.objective}
              >
                {marketingCampaignObjectiveValues.map((value) => (
                  <option key={value} value={value}>
                    {marketingCampaignObjectiveLabels[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estado">
              <Select
                onChange={(event) =>
                  setDraft({ ...draft, status: event.target.value as MarketingCampaignStatusValue })
                }
                value={draft.status}
              >
                {marketingCampaignStatusValues.map((value) => (
                  <option key={value} value={value}>
                    {marketingCampaignStatusLabels[value]}
                  </option>
                ))}
              </Select>
            </Field>
            {canViewBudget ? (
              <Field hint="Planificado. El gasto real sale de la cuenta publicitaria." label="Presupuesto estimado">
                <Input
                  disabled={locked}
                  inputMode="decimal"
                  min="0"
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      estimatedBudget: event.target.value ? Number(event.target.value) : null,
                    })
                  }
                  type="number"
                  value={draft.estimatedBudget ?? ""}
                />
              </Field>
            ) : null}
            <Field label="Inicio" required>
              <Input
                disabled={locked}
                onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
                type="date"
                value={draft.startsAt}
              />
            </Field>
            <Field hint="Opcional" label="Fin">
              <Input
                disabled={locked}
                onChange={(event) => setDraft({ ...draft, endsAt: event.target.value || null })}
                type="date"
                value={draft.endsAt ?? ""}
              />
            </Field>
            {/*
              Patch Attribution-1 — de qué cuenta publicitaria real sale el gasto
              de esta campaña. Opcional a propósito: no toda campaña tiene detrás
              una cuenta conectada, y obligar a elegir una forzaría a inventar el
              enlace.
            */}
            {adAccounts.length ? (
              <Field className="sm:col-span-2" label="Cuenta publicitaria (gasto real)">
                <Select
                  disabled={locked}
                  onChange={(event) =>
                    setDraft({ ...draft, metaAdAccountId: event.target.value || null })
                  }
                  value={draft.metaAdAccountId ?? ""}
                >
                  <option value="">Sin cuenta publicitaria</option>
                  {adAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label ?? account.accountName ?? account.adAccountId}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <MultiSelectList
              allLabel="Todas las sucursales"
              disabled={locked}
              label="Sucursales"
              onChange={(next) => setDraft({ ...draft, branchCodes: next })}
              options={branches.map((branch) => ({ value: branch.code, label: branch.name }))}
              searchPlaceholder="Buscar sucursal"
              selected={draft.branchCodes}
            />
            <MultiSelectList
              allLabel="Todos los modelos"
              disabled={locked}
              emptyText="El catálogo no tiene modelos activos."
              label="Modelos promocionados"
              onChange={(next) => setDraft({ ...draft, catalogModelIds: next })}
              options={models.map((model) => ({ value: model.id, label: model.label }))}
              searchPlaceholder="Buscar modelo"
              selected={draft.catalogModelIds}
            />
          </div>
          {editing?.legacyMotorcycleSlug ? (
            <p className="text-xs text-slate-500">
              Esta campaña guardaba el modelo «{editing.legacyMotorcycleSlug}», que
              no está en el catálogo. Elige el equivalente si existe.
            </p>
          ) : null}

          <Field label="Descripción">
            <Textarea
              maxLength={500}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value || null })
              }
              rows={3}
              value={draft.description ?? ""}
            />
          </Field>
        </div>
      </Drawer>
    </section>
  );
}

function CampaignCard({
  campaign,
  performance,
  canViewBudget,
  onEdit,
  onArchive,
  onCopy,
  pending,
}: {
  campaign: MarketingCampaignDTO;
  performance: MarketingCampaignPerformanceDTO | undefined;
  canViewBudget: boolean;
  onEdit: (campaign: MarketingCampaignDTO) => void;
  onArchive: (campaign: MarketingCampaignDTO) => void;
  onCopy: (campaign: MarketingCampaignDTO) => void;
  pending: boolean;
}) {
  const tone =
    campaign.status === "ACTIVE"
      ? "green"
      : campaign.status === "PAUSED"
        ? "yellow"
        : "gray";
  return (
    <Card className="flex flex-col p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Badge tone={tone}>{campaign.statusLabel}</Badge>
          <h3 className="mt-3 text-lg font-semibold text-slate-900">
            {campaign.name}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {campaign.channelLabel} / {campaign.objectiveLabel} ·{" "}
            {formatDate(campaign.startsAt)}
            {campaign.endsAt ? ` – ${formatDate(campaign.endsAt)}` : ""}
          </p>
          {canViewBudget && campaign.estimatedBudget !== null ? (
            <p className="mt-1 text-xs text-slate-400">
              Presupuesto estimado: {formatAmount(campaign.estimatedBudget)}
            </p>
          ) : null}
          {/*
            Patch Attribution-1 — el presupuesto de arriba es lo que Marketing
            PLANEÓ gastar; esta cuenta es de dónde sale lo que se gastó de
            verdad.
          */}
          {campaign.metaAdAccountLabel ? (
            <p className="mt-1 text-xs text-slate-400">
              Gasto real: {campaign.metaAdAccountLabel}
            </p>
          ) : null}
        </div>
        <Megaphone aria-hidden className="h-6 w-6 shrink-0 text-red-600" />
      </div>

      <div className="mt-4 space-y-2 text-xs">
        <ChipRow
          empty="Todas las sucursales"
          items={campaign.branches.map((branch) => branch.name)}
          label="Sucursales"
        />
        <ChipRow
          empty={
            campaign.legacyMotorcycleSlug
              ? `Modelo anterior sin catálogo: ${campaign.legacyMotorcycleSlug}`
              : "Todos los modelos"
          }
          items={campaign.models.map((model) => model.label)}
          label="Modelos"
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Metric label="Leads" value={performance?.leads ?? campaign.leadCount} />
        <Metric label="Convertidos" value={performance?.converted ?? 0} />
        <Metric label="Reservas" value={performance?.reservations ?? 0} />
        <Metric label="Ventas" value={performance?.sales ?? 0} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={`/panel/marketing/campanas/${campaign.id}`}>
          <Button size="sm" variant="secondary">
            <ClipboardCheck aria-hidden className="h-4 w-4" />
            Detalle y conciliación
          </Button>
        </Link>
        <Button size="sm" variant="ghost" onClick={() => onCopy(campaign)}>
          <Copy aria-hidden className="h-4 w-4" />
          Copiar enlace
        </Button>
        {campaign.canEdit ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => onEdit(campaign)}>
              <Pencil aria-hidden className="h-4 w-4" />
              Editar
            </Button>
            {campaign.status !== "COMPLETED" ? (
              <Button
                disabled={pending}
                size="sm"
                variant="ghost"
                onClick={() => onArchive(campaign)}
              >
                <Archive aria-hidden className="h-4 w-4" />
                Finalizar
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </Card>
  );
}

function ChipRow({ label, items, empty }: { label: string; items: string[]; empty: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-semibold uppercase tracking-wide text-slate-400">{label}:</span>
      {items.length ? (
        items.map((item) => (
          <span
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600"
            key={item}
          >
            {item}
          </span>
        ))
      ) : (
        <span className="text-slate-500">{empty}</span>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <div className="text-sm font-semibold text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("es-NI", { maximumFractionDigits: 2 }).format(
    value,
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-NI", { dateStyle: "medium" }).format(
    new Date(value),
  );
}
