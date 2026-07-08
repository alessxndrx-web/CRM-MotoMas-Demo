"use client";

import { useRouter } from "next/navigation";
import { Database, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  assignLeadAction,
  updateLeadStatusAction,
} from "@/server/crm/actions";
import {
  leadStatusLabels,
  leadStatusValues,
  type LeadDTO,
  type LeadStatusValue,
} from "@/server/crm/shared";

/**
 * Database-backed leads section for `/panel/leads`. Additive to the existing
 * localStorage-driven `LeadsInbox` below it (same pattern already used by
 * `/panel/inventario/movimientos` next to `/panel/inventario`): it does not
 * replace or read the existing bandeja, so manual lead registration, activity
 * history and lead -> expediente conversion there keep working unchanged.
 */

export type SellerOption = { id: string; name: string; branchCode: string | null };

const assignableStatuses = leadStatusValues.filter((status) => status !== "EXPEDIENTE");

export function LeadsDbPanel({
  canAssign,
  canChangeStatus,
  dbConfigured,
  leads,
  scopeLabel,
  sellers,
}: {
  canAssign: boolean;
  canChangeStatus: boolean;
  dbConfigured: boolean;
  leads: LeadDTO[];
  scopeLabel: string;
  sellers: SellerOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);
  const [error, setError] = useState("");

  function assign(leadId: string, sellerId: string) {
    if (!sellerId) return;
    setError("");
    setPendingLeadId(leadId);
    startTransition(async () => {
      const result = await assignLeadAction({ leadId, sellerId });
      if (!result.ok) setError(result.error);
      setPendingLeadId(null);
      router.refresh();
    });
  }

  function changeStatus(leadId: string, status: LeadStatusValue) {
    setError("");
    setPendingLeadId(leadId);
    startTransition(async () => {
      const result = await updateLeadStatusAction({ leadId, status });
      if (!result.ok) setError(result.error);
      setPendingLeadId(null);
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="green">Leads · Base de datos (fuente principal)</Badge>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
            {scopeLabel}
          </span>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
          <Database className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-500">
        Leads creados a través de la solicitud pública, respaldados por
        PostgreSQL. Esta es la fuente principal para leads nuevos. El registro
        manual, las actividades y la bandeja de seguimiento previa siguen
        disponibles debajo mientras se completa su migración.
      </p>

      {!dbConfigured ? (
        <div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100/90">
          Esta sección requiere <code>DATABASE_URL</code> configurado.
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
          <div className="hidden grid-cols-[1.3fr_1fr_1fr_1fr_1fr] border-b border-white/10 bg-white/[0.03] px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-zinc-500 lg:grid">
            <div>Lead</div>
            <div>Sucursal</div>
            <div>Estado</div>
            <div>Vendedor</div>
            <div>Asignar</div>
          </div>

          {leads.length ? (
            leads.map((lead) => {
              const rowPending = pending && pendingLeadId === lead.id;
              const branchSellers = sellers.filter(
                (seller) => seller.branchCode === lead.branchCode,
              );

              return (
                <div
                  className="grid gap-3 border-b border-white/7 px-5 py-4 last:border-b-0 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr] lg:items-center"
                  key={lead.id}
                >
                  <div>
                    <div className="font-black text-white">{lead.name}</div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-zinc-500">
                      <span>{lead.phone}</span>
                      <span className="font-mono">{lead.trackingCode}</span>
                    </div>
                  </div>
                  <div className="text-sm text-zinc-400">{lead.branchName}</div>
                  <div>
                    {canChangeStatus ? (
                      <select
                        className="h-9 w-full min-w-[150px] rounded-lg border border-white/10 bg-[#141414] px-3 text-xs font-semibold text-zinc-100 outline-none transition focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15 disabled:opacity-50"
                        disabled={rowPending}
                        onChange={(event) =>
                          changeStatus(lead.id, event.target.value as LeadStatusValue)
                        }
                        value={lead.status}
                      >
                        {assignableStatuses.map((status) => (
                          <option key={status} value={status}>
                            {leadStatusLabels[status]}
                          </option>
                        ))}
                        {lead.status === "EXPEDIENTE" ? (
                          <option value="EXPEDIENTE">
                            {leadStatusLabels.EXPEDIENTE}
                          </option>
                        ) : null}
                      </select>
                    ) : (
                      <Badge tone={statusTone(lead.status)}>{lead.statusLabel}</Badge>
                    )}
                  </div>
                  <div className="text-sm text-zinc-400">
                    {lead.assignedSellerName ?? "Sin asignar"}
                  </div>
                  <div>
                    {canAssign ? (
                      <select
                        className="h-9 w-full min-w-[150px] rounded-lg border border-white/10 bg-[#141414] px-3 text-xs font-semibold text-zinc-100 outline-none transition focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15 disabled:opacity-50"
                        disabled={rowPending || !branchSellers.length}
                        onChange={(event) => assign(lead.id, event.target.value)}
                        value={lead.assignedSellerId ?? ""}
                      >
                        <option value="">
                          {branchSellers.length ? "Sin asignar" : "Sin vendedores"}
                        </option>
                        {branchSellers.map((seller) => (
                          <option key={seller.id} value={seller.id}>
                            {seller.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex items-center gap-3 p-6 text-sm text-zinc-500">
              <UserPlus className="h-5 w-5 text-zinc-600" />
              Aún no hay leads en la base de datos para este alcance.
            </div>
          )}
        </div>
      )}

      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm font-semibold text-red-200">
          {error}
        </div>
      ) : null}
    </Card>
  );
}

function statusTone(status: LeadStatusValue) {
  if (status === "INTERESADO" || status === "EXPEDIENTE") return "green" as const;
  if (status === "CONTACTADO" || status === "ASIGNADO") return "blue" as const;
  if (status === "DESCARTADO") return "gray" as const;
  return "red" as const;
}
