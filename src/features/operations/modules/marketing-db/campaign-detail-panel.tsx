"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, ChevronUp, History, Scale } from "lucide-react";
import { Fragment, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { Notice } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  confirmCampaignLeadReportAction,
  reviewCampaignLeadReportAction,
  saveCampaignLeadReportAction,
} from "@/server/marketing/actions";
import type {
  CampaignChangeDTO,
  CampaignReconciliationDTO,
  CampaignReconciliationRowDTO,
  MarketingCampaignDTO,
  MarketingCampaignPerformanceDTO,
} from "@/server/marketing/shared";

/**
 * Patch CRM-INT1 — el detalle de una campaña y su conciliación de leads.
 *
 * ## El proceso
 *
 * 1. **Marketing reporta** cuántos leads trajo la campaña en cada sucursal
 *    (su cifra: la plataforma de anuncios, los formularios, los mensajes).
 * 2. **La sucursal confirma** cuántos recibió de verdad (Gerente o Líder).
 * 3. **Marketing revisa** la fila y deja constancia de que vio la diferencia.
 *
 * Al lado, siempre, **los leads del CRM** atribuidos a la campaña en esa
 * sucursal, contados por su identificador. Las tres cifras son distintas y la
 * pantalla no las mezcla: una diferencia se enseña, no se corrige cambiando
 * leads.
 *
 * ## Por qué no se cuenta dos veces
 *
 * Cada lead tiene una sola campaña y una sola sucursal, así que cae en una sola
 * fila. El total de «leads del CRM» es la suma de filas y coincide con el número
 * de leads distintos de la campaña, aunque la campaña cubra tres sucursales.
 */
export function CampaignDetailPanel({
  campaign,
  canViewBudget,
  changes,
  performance,
  reconciliation,
}: {
  campaign: MarketingCampaignDTO;
  canViewBudget: boolean;
  /** Vacío si quien mira no ve el historial (sólo Marketing y Administrador). */
  changes: CampaignChangeDTO[];
  performance: MarketingCampaignPerformanceDTO | null;
  reconciliation: CampaignReconciliationDTO | null;
}) {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge
              tone={
                campaign.status === "ACTIVE"
                  ? "green"
                  : campaign.status === "PAUSED"
                    ? "yellow"
                    : "gray"
              }
            >
              {campaign.statusLabel}
            </Badge>
            <p className="mt-2 text-sm text-slate-500">
              {campaign.channelLabel} · {campaign.objectiveLabel}
            </p>
          </div>
          {performance ? (
            <div className="flex flex-wrap gap-3 text-sm">
              <Kpi label="Leads" value={performance.leads} />
              <Kpi label="Convertidos" value={performance.converted} />
              <Kpi label="Reservas" value={performance.reservations} />
              <Kpi label="Ventas" value={performance.sales} />
            </div>
          ) : null}
        </div>
        <DetailList
          className="mt-5"
          items={[
            {
              label: "Sucursales",
              value: campaign.branches.length
                ? campaign.branches.map((branch) => branch.name).join(", ")
                : "Todas las sucursales",
            },
            {
              label: "Modelos",
              value: campaign.models.length
                ? campaign.models.map((model) => model.label).join(", ")
                : campaign.legacyMotorcycleSlug
                  ? `Modelo anterior sin catálogo: ${campaign.legacyMotorcycleSlug}`
                  : "Todos los modelos",
            },
            {
              label: "Vigencia",
              value: `${formatDate(campaign.startsAt)}${
                campaign.endsAt ? ` – ${formatDate(campaign.endsAt)}` : " · sin fecha de fin"
              }`,
            },
            ...(canViewBudget
              ? [
                  {
                    label: "Presupuesto estimado",
                    value:
                      campaign.estimatedBudget !== null
                        ? new Intl.NumberFormat("es-NI", { maximumFractionDigits: 2 }).format(
                            campaign.estimatedBudget,
                          )
                        : "Sin presupuesto",
                  },
                ]
              : []),
            { label: "Cuenta publicitaria", value: campaign.metaAdAccountLabel ?? "Sin cuenta" },
            { label: "Creada por", value: campaign.createdByName ?? "—" },
          ]}
        />
        {campaign.description ? (
          <p className="mt-4 text-sm text-slate-600">{campaign.description}</p>
        ) : null}
      </Card>

      {reconciliation ? (
        <ReconciliationCard campaignId={campaign.id} reconciliation={reconciliation} />
      ) : null}

      {changes.length ? (
        <Card className="p-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <History aria-hidden className="h-4 w-4 text-slate-400" />
            Historial de la campaña
          </h3>
          <ol className="mt-4 space-y-2">
            {changes.map((change) => (
              <li className="rounded-lg border border-slate-200 px-4 py-3 text-sm" key={change.id}>
                <p className="text-slate-800">{change.description}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {change.actorName} · {formatDateTime(change.at)}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}

function ReconciliationCard({
  campaignId,
  reconciliation,
}: {
  campaignId: string;
  reconciliation: CampaignReconciliationDTO;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [historyRow, setHistoryRow] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"report" | "confirm">("report");

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la acción.");
        return;
      }
      setMessage(done);
      setOpenRow(null);
      router.refresh();
    });
  }

  function open(row: CampaignReconciliationRowDTO, next: "report" | "confirm") {
    setMode(next);
    setOpenRow(row.branchCode);
    setError("");
    setNotes("");
    setValue(
      String(
        next === "report"
          ? (row.reportedLeads ?? "")
          : (row.confirmedLeads ?? row.crmLeads),
      ),
    );
  }

  const { rows, totals } = reconciliation;

  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Scale aria-hidden className="h-4 w-4 text-slate-400" />
        Conciliación de leads por sucursal
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Marketing reporta, la sucursal confirma y Marketing revisa. Los «leads del
        CRM» son los registrados y atribuidos a esta campaña; cada lead cuenta una
        sola vez.
      </p>

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

      {rows.length ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Sucursal</th>
                <th className="px-4 py-3 text-right font-semibold">Reportado por Marketing</th>
                <th className="px-4 py-3 text-right font-semibold">Confirmado por sucursal</th>
                <th className="px-4 py-3 text-right font-semibold">Leads en el CRM</th>
                <th className="px-4 py-3 text-right font-semibold">Diferencia (Mkt − CRM)</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const canReview =
                  row.canReport && row.confirmedLeads !== null && !row.reviewedAt;
                return (
                  <Fragment key={row.branchCode}>
                    <tr className={row.covered ? "" : "bg-amber-50/40"}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{row.branchName}</p>
                        {!row.covered ? (
                          <p className="text-xs text-amber-700">
                            Fuera de la campaña: leads atribuidos igualmente
                          </p>
                        ) : null}
                        {row.reviewedAt ? (
                          <p className="text-xs text-emerald-700">
                            Revisado por {row.reviewedByName ?? "Marketing"} ·{" "}
                            {formatDate(row.reviewedAt)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.reportedLeads ?? "—"}
                        {row.reportedByName ? (
                          <p className="text-xs text-slate-400">{row.reportedByName}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.confirmedLeads ?? "—"}
                        {row.confirmedByName ? (
                          <p className="text-xs text-slate-400">{row.confirmedByName}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {row.crmLeads}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <DifferenceValue value={row.differenceVsCrm} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            row.status === "CONFIRMADO"
                              ? "green"
                              : row.status === "CON_DIFERENCIA"
                                ? "red"
                                : row.status === "PENDIENTE_CONFIRMACION"
                                  ? "orange"
                                  : "slate"
                          }
                        >
                          {row.statusLabel}
                        </Badge>
                        {row.differenceVsConfirmed !== null && row.differenceVsConfirmed !== 0 ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Marketing − sucursal: {signed(row.differenceVsConfirmed)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {row.canReport ? (
                            <Button onClick={() => open(row, "report")} size="sm" variant="secondary">
                              {row.reportedLeads === null ? "Reportar" : "Corregir"}
                            </Button>
                          ) : null}
                          {row.canConfirm ? (
                            <Button onClick={() => open(row, "confirm")} size="sm" variant="secondary">
                              {row.confirmedLeads === null ? "Confirmar" : "Corregir confirmación"}
                            </Button>
                          ) : null}
                          {canReview ? (
                            <Button
                              disabled={pending}
                              onClick={() =>
                                run(
                                  () =>
                                    reviewCampaignLeadReportAction({
                                      campaignId,
                                      branchCode: row.branchCode,
                                    }),
                                  `Conciliación de ${row.branchName} revisada.`,
                                )
                              }
                              size="sm"
                              variant="ghost"
                            >
                              <CheckCircle2 aria-hidden className="h-4 w-4" />
                              Marcar revisada
                            </Button>
                          ) : null}
                          {row.events.length ? (
                            <Button
                              aria-expanded={historyRow === row.branchCode}
                              onClick={() =>
                                setHistoryRow(historyRow === row.branchCode ? null : row.branchCode)
                              }
                              size="sm"
                              variant="ghost"
                            >
                              {historyRow === row.branchCode ? (
                                <ChevronUp aria-hidden className="h-4 w-4" />
                              ) : (
                                <ChevronDown aria-hidden className="h-4 w-4" />
                              )}
                              Historial
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {openRow === row.branchCode ? (
                      <tr>
                        <td className="bg-slate-50 px-4 py-4" colSpan={7}>
                          <div className="flex flex-wrap items-end gap-3">
                            <Field
                              className="w-48"
                              hint={
                                mode === "confirm"
                                  ? `El CRM tiene ${row.crmLeads} lead(s) atribuidos.`
                                  : "Tu cifra, no la del CRM."
                              }
                              label={
                                mode === "report"
                                  ? `Leads reportados en ${row.branchName}`
                                  : `Leads recibidos en ${row.branchName}`
                              }
                              required
                            >
                              <Input
                                inputMode="numeric"
                                min="0"
                                onChange={(event) => setValue(event.target.value)}
                                type="number"
                                value={value}
                              />
                            </Field>
                            <Field className="min-w-[240px] flex-1" label="Nota">
                              <Input
                                maxLength={500}
                                onChange={(event) => setNotes(event.target.value)}
                                placeholder={
                                  mode === "report"
                                    ? "Fuente: formularios de Meta, mensajes…"
                                    : "Aclaración para Marketing"
                                }
                                value={notes}
                              />
                            </Field>
                            <Button
                              disabled={pending || value.trim() === ""}
                              onClick={() =>
                                run(
                                  () =>
                                    mode === "report"
                                      ? saveCampaignLeadReportAction({
                                          campaignId,
                                          branchCode: row.branchCode,
                                          reportedLeads: value,
                                          notes: notes || null,
                                        })
                                      : confirmCampaignLeadReportAction({
                                          campaignId,
                                          branchCode: row.branchCode,
                                          confirmedLeads: value,
                                          notes: notes || null,
                                        }),
                                  mode === "report" ? "Cifra reportada." : "Cifra confirmada.",
                                )
                              }
                            >
                              {pending ? "Guardando…" : "Guardar"}
                            </Button>
                            <Button onClick={() => setOpenRow(null)} variant="ghost">
                              Cancelar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    {historyRow === row.branchCode ? (
                      <tr>
                        <td className="bg-slate-50 px-4 py-3" colSpan={7}>
                          <ul className="space-y-1 text-xs text-slate-600">
                            {row.events.map((event) => (
                              <li key={event.id}>
                                {formatDateTime(event.at)} · {event.kindLabel}
                                {event.value !== null ? ` ${event.value}` : ""}
                                {event.previousValue !== null && event.kindLabel !== "Marketing revisó"
                                  ? ` (antes ${event.previousValue})`
                                  : ""}
                                {event.actorName ? ` · ${event.actorName}` : ""}
                                {event.notes ? ` · «${event.notes}»` : ""}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
            {reconciliation.consolidated ? (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                <tr>
                  <td className="px-4 py-3">Total consolidado</td>
                  <td className="px-4 py-3 text-right tabular-nums">{totals.reportedLeads}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{totals.confirmedLeads}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{totals.crmLeads}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <DifferenceValue value={totals.differenceVsCrm} />
                  </td>
                  <td className="px-4 py-3" colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          Esta campaña todavía no tiene sucursales con cifras ni leads atribuidos.
        </p>
      )}
    </Card>
  );
}

function DifferenceValue({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-400">—</span>;
  if (value === 0) return <span className="text-emerald-700">0</span>;
  return <span className="font-semibold text-red-700">{signed(value)}</span>;
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-base font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-NI", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-NI", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
