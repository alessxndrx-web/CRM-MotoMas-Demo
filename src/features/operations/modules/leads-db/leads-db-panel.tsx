"use client";

import { useRouter } from "next/navigation";
import { Database, MessageCircle, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import { WhatsAppConversationDrawer } from "@/features/operations/modules/whatsapp/whatsapp-conversation-drawer";
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
import type { WhatsAppConversationDTO } from "@/server/whatsapp/shared";

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
  conversations,
  dbConfigured,
  leads,
  scopeLabel,
  sellers,
}: {
  canAssign: boolean;
  canChangeStatus: boolean;
  /** Hilos de WhatsApp por teléfono, ya cargados por el servidor. */
  conversations: Record<string, WhatsAppConversationDTO>;
  dbConfigured: boolean;
  leads: LeadDTO[];
  scopeLabel: string;
  sellers: SellerOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [chatLead, setChatLead] = useState<LeadDTO | null>(null);

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
          <PrimarySectionBadge
            businessLabel="Leads · Gestión comercial"
            technicalLabel="Leads · Base de datos (fuente principal)"
          />
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
            {scopeLabel}
          </span>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Database className="h-5 w-5" />
        </div>
      </div>

      <PrimarySectionDescription
        businessText="Leads creados a través de la solicitud pública. El registro manual, las actividades y el seguimiento adicional siguen disponibles debajo."
        technicalText="Leads creados a través de la solicitud pública, respaldados por
        PostgreSQL. Esta es la fuente principal para leads nuevos. El registro
        manual, las actividades y la bandeja de seguimiento previa siguen
        disponibles debajo mientras se completa su migración."
      />

      {!dbConfigured ? (
        <SectionUnavailableNotice
          businessText="Esta sección aún no está disponible."
          technicalText={
            <>
              Esta sección requiere <code>DATABASE_URL</code> configurado.
            </>
          }
        />
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
          <div className="hidden grid-cols-[1.3fr_1fr_1fr_1fr_1fr_auto] border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 lg:grid">
            <div>Lead</div>
            <div>Sucursal</div>
            <div>Estado</div>
            <div>Vendedor</div>
            <div>Asignar</div>
            <div>WhatsApp</div>
          </div>

          {leads.length ? (
            leads.map((lead) => {
              const rowPending = pending && pendingLeadId === lead.id;
              const branchSellers = sellers.filter(
                (seller) => seller.branchCode === lead.branchCode,
              );

              return (
                <div
                  className="grid gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_auto] lg:items-center"
                  key={lead.id}
                >
                  <div>
                    <div className="font-semibold text-slate-900">{lead.name}</div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{lead.phone}</span>
                      <span className="font-mono">{lead.trackingCode}</span>
                    </div>
                  </div>
                  <div className="text-sm text-slate-500">{lead.branchName}</div>
                  <div>
                    {canChangeStatus ? (
                      <select
                        className="h-9 w-full min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
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
                  <div className="text-sm text-slate-500">
                    {lead.assignedSellerName ?? "Sin asignar"}
                  </div>
                  <div>
                    {canAssign ? (
                      <select
                        className="h-9 w-full min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
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
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>
                  <div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setChatLead(lead)}
                    >
                      <MessageCircle className="h-4 w-4" />
                      {(conversations[lead.phone]?.messages.length ?? 0) || ""}
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex items-center gap-3 p-6 text-sm text-slate-500">
              <UserPlus className="h-5 w-5 text-slate-400" />
              Aún no hay leads para este alcance. Cuando recibas o asignes
              una solicitud, aparecerá aquí.
            </div>
          )}
        </div>
      )}

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <WhatsAppConversationDrawer
        contactName={chatLead?.name ?? ""}
        conversation={chatLead ? conversations[chatLead.phone] ?? null : null}
        onClose={() => setChatLead(null)}
        open={chatLead !== null}
        phone={chatLead?.phone ?? ""}
      />
    </Card>
  );
}

function statusTone(status: LeadStatusValue) {
  if (status === "INTERESADO" || status === "EXPEDIENTE") return "green" as const;
  if (status === "CONTACTADO" || status === "ASIGNADO") return "blue" as const;
  if (status === "DESCARTADO") return "gray" as const;
  return "red" as const;
}
