"use client";

import { Copy, Megaphone, Pencil, Plus, Archive } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
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
 * Admin/MARKETING role server-side. No localStorage is read here. The legacy client
 * Marketing panel remains available behind the 3.7B legacy gate.
 */

export type BranchOption = { code: string; name: string };
export type ModelOption = { slug: string; name: string };

export type MarketingDbPanelProps = {
  attribution: MarketingLeadAttributionDTO[];
  campaigns: MarketingCampaignDTO[];
  performance: MarketingCampaignPerformanceDTO[];
  summary: MarketingSummaryDTO;
  canManage: boolean;
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
    targetBranchCode: null,
    motorcycleSlug: null,
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
  canManage,
  canViewAttribution,
  canViewBudget,
  branches,
  models,
  adAccounts,
}: MarketingDbPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<MarketingCampaignInput>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState("todas");
  const [statusFilter, setStatusFilter] = useState("todas");
  const [branchFilter, setBranchFilter] = useState("todas");
  const [modelFilter, setModelFilter] = useState("todos");
  const [message, setMessage] = useState("");

  const performanceById = useMemo(
    () => new Map(performance.map((row) => [row.campaignId, row])),
    [performance],
  );

  // Client-side narrowing only — the server already scoped the list, so a filter
  // can never widen it beyond what the caller may already see.
  const visibleCampaigns = useMemo(
    () =>
      campaigns.filter(
        (campaign) =>
          (channelFilter === "todas" || campaign.channel === channelFilter) &&
          (statusFilter === "todas" || campaign.status === statusFilter) &&
          (branchFilter === "todas" ||
            campaign.targetBranchCode === branchFilter) &&
          (modelFilter === "todos" || campaign.motorcycleSlug === modelFilter),
      ),
    [campaigns, channelFilter, statusFilter, branchFilter, modelFilter],
  );

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft());
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    setMessage("");
    startTransition(async () => {
      const result = editingId
        ? await updateMarketingCampaignAction(editingId, draft)
        : await createMarketingCampaignAction(draft);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      resetForm();
      setMessage(editingId ? "Campaña actualizada." : "Campaña creada.");
      router.refresh();
    });
  }

  function edit(campaign: MarketingCampaignDTO) {
    setEditingId(campaign.id);
    setDraft({
      name: campaign.name,
      channel: campaign.channel,
      targetBranchCode: campaign.targetBranchCode,
      motorcycleSlug: campaign.motorcycleSlug,
      estimatedBudget: campaign.estimatedBudget,
      startsAt: campaign.startsAt.slice(0, 10),
      endsAt: campaign.endsAt ? campaign.endsAt.slice(0, 10) : null,
      status: campaign.status,
      objective: campaign.objective,
      description: campaign.description,
      metaAdAccountId: campaign.metaAdAccountId,
    });
  }

  function archive(campaign: MarketingCampaignDTO) {
    if (!canManage) return;
    setMessage("");
    startTransition(async () => {
      const result = await archiveMarketingCampaignAction(campaign.id);
      if (!result.ok) {
        setMessage(result.error);
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
      setMessage("Enlace de formulario copiado.");
    } catch {
      setMessage(href);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        description="Atribución de solicitudes por canal, campaña y parámetros de enlace."
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

      {canManage ? (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">
            {editingId ? "Editar campaña" : "Nueva campaña"}
          </h3>
          <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={submit}>
            <Input
              placeholder="Nombre de campaña"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Select
              value={draft.channel}
              onChange={(value) =>
                setDraft({ ...draft, channel: value as MarketingChannelValue })
              }
            >
              {marketingChannelValues.map((value) => (
                <option key={value} value={value}>
                  {marketingChannelLabels[value]}
                </option>
              ))}
            </Select>
            {/*
              Patch Attribution-1 — de qué cuenta publicitaria real sale el gasto
              de esta campaña. Opcional a propósito: no toda campaña tiene detrás
              una cuenta conectada, y obligar a elegir una forzaría a inventar el
              enlace. Sin cuentas conectadas el desplegable lo dice en vez de
              quedarse vacío y mudo.
            */}
            {adAccounts.length ? (
              <Select
                value={draft.metaAdAccountId ?? ""}
                onChange={(value) =>
                  setDraft({ ...draft, metaAdAccountId: value || null })
                }
              >
                <option value="">Sin cuenta publicitaria</option>
                {adAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label ?? account.accountName ?? account.adAccountId}
                  </option>
                ))}
              </Select>
            ) : null}
            <Select
              value={draft.targetBranchCode ?? ""}
              onChange={(value) =>
                setDraft({ ...draft, targetBranchCode: value || null })
              }
            >
              <option value="">Todas las sucursales</option>
              {branches.map((branch) => (
                <option key={branch.code} value={branch.code}>
                  {branch.name}
                </option>
              ))}
            </Select>
            <Select
              value={draft.motorcycleSlug ?? ""}
              onChange={(value) =>
                setDraft({ ...draft, motorcycleSlug: value || null })
              }
            >
              <option value="">Todos los modelos</option>
              {models.map((model) => (
                <option key={model.slug} value={model.slug}>
                  {model.name}
                </option>
              ))}
            </Select>
            {canViewBudget ? (
              <Input
                min="0"
                placeholder="Presupuesto estimado"
                type="number"
                value={draft.estimatedBudget ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    estimatedBudget: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            ) : null}
            <Select
              value={draft.status}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  status: value as MarketingCampaignStatusValue,
                })
              }
            >
              {marketingCampaignStatusValues.map((value) => (
                <option key={value} value={value}>
                  {marketingCampaignStatusLabels[value]}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={draft.startsAt}
              onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
            />
            <Input
              type="date"
              value={draft.endsAt ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, endsAt: e.target.value || null })
              }
            />
            <Select
              value={draft.objective}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  objective: value as MarketingCampaignInput["objective"],
                })
              }
            >
              {marketingCampaignObjectiveValues.map((value) => (
                <option key={value} value={value}>
                  {marketingCampaignObjectiveLabels[value]}
                </option>
              ))}
            </Select>
            <textarea
              className="min-h-[80px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 md:col-span-2"
              placeholder="Descripción opcional"
              value={draft.description ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value || null })
              }
            />
            <div className="flex gap-3 md:col-span-2">
              <Button disabled={isPending} type="submit">
                <Plus className="h-4 w-4" />
                {editingId ? "Guardar cambios" : "Crear campaña"}
              </Button>
              {editingId ? (
                <Button variant="secondary" onClick={resetForm}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Select value={channelFilter} onChange={setChannelFilter}>
            <option value="todas">Todos los canales</option>
            {marketingChannelValues.map((value) => (
              <option key={value} value={value}>
                {marketingChannelLabels[value]}
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={setStatusFilter}>
            <option value="todas">Todos los estados</option>
            {marketingCampaignStatusValues.map((value) => (
              <option key={value} value={value}>
                {marketingCampaignStatusLabels[value]}
              </option>
            ))}
          </Select>
          <Select value={branchFilter} onChange={setBranchFilter}>
            <option value="todas">Todas las sucursales</option>
            {branches.map((branch) => (
              <option key={branch.code} value={branch.code}>
                {branch.name}
              </option>
            ))}
          </Select>
          <Select value={modelFilter} onChange={setModelFilter}>
            <option value="todos">Todos los modelos</option>
            {models.map((model) => (
              <option key={model.slug} value={model.slug}>
                {model.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {visibleCampaigns.length ? (
          visibleCampaigns.map((campaign) => (
            <CampaignCard
              campaign={campaign}
              canManage={canManage}
              canViewBudget={canViewBudget}
              key={campaign.id}
              onArchive={archive}
              onCopy={copyLink}
              onEdit={edit}
              performance={performanceById.get(campaign.id)}
            />
          ))
        ) : (
          <Card className="p-8 text-center text-sm text-slate-500">
            Sin campañas para los filtros actuales.
          </Card>
        )}
      </div>
    </section>
  );
}

function CampaignCard({
  campaign,
  performance,
  canManage,
  canViewBudget,
  onEdit,
  onArchive,
  onCopy,
}: {
  campaign: MarketingCampaignDTO;
  performance: MarketingCampaignPerformanceDTO | undefined;
  canManage: boolean;
  canViewBudget: boolean;
  onEdit: (campaign: MarketingCampaignDTO) => void;
  onArchive: (campaign: MarketingCampaignDTO) => void;
  onCopy: (campaign: MarketingCampaignDTO) => void;
}) {
  const tone =
    campaign.status === "ACTIVE"
      ? "green"
      : campaign.status === "PAUSED"
        ? "yellow"
        : "gray";
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Badge tone={tone}>{campaign.statusLabel}</Badge>
          <h3 className="mt-3 text-lg font-semibold text-slate-900">
            {campaign.name}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {campaign.channelLabel} / {campaign.objectiveLabel}
            {campaign.targetBranchName ? ` / ${campaign.targetBranchName}` : ""}
          </p>
          {canViewBudget && campaign.estimatedBudget !== null ? (
            <p className="mt-1 text-xs text-slate-400">
              Presupuesto estimado: {formatAmount(campaign.estimatedBudget)}
            </p>
          ) : null}
          {/*
            Patch Attribution-1 — el presupuesto de arriba es lo que Marketing
            PLANEÓ gastar; esta cuenta es de dónde sale lo que se gastó de
            verdad. Verlas juntas es lo que hace evidente cuándo una campaña
            quedó sin enlazar y por eso no aparece en el informe.
          */}
          {campaign.metaAdAccountLabel ? (
            <p className="mt-1 text-xs text-slate-400">
              Gasto real: {campaign.metaAdAccountLabel}
            </p>
          ) : null}
        </div>
        <Megaphone className="h-6 w-6 text-red-600" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Metric label="Leads" value={performance?.leads ?? campaign.leadCount} />
        <Metric label="Convertidos" value={performance?.converted ?? 0} />
        <Metric label="Reservas" value={performance?.reservations ?? 0} />
        <Metric label="Ventas" value={performance?.sales ?? 0} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => onCopy(campaign)}>
          <Copy className="h-4 w-4" />
          Copiar enlace
        </Button>
        {canManage ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => onEdit(campaign)}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
            {campaign.status !== "COMPLETED" ? (
              <Button size="sm" variant="secondary" onClick={() => onArchive(campaign)}>
                <Archive className="h-4 w-4" />
                Finalizar
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </Card>
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

function Select({
  children,
  onChange,
  value,
}: {
  children: React.ReactNode;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <select
      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
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
