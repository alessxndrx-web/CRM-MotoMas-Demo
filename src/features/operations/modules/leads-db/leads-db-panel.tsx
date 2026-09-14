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
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { LeadCreateForm } from "@/features/operations/modules/leads-db/lead-create-form";
import {
  LeadDetailDrawer,
  type LeadCatalogOption,
} from "@/features/operations/modules/leads-db/lead-detail-drawer";
import { WhatsAppConversationDrawer } from "@/features/operations/modules/whatsapp/whatsapp-conversation-drawer";
import {
  assignLeadAction,
  updateLeadStatusAction,
} from "@/server/crm/actions";
import {
  leadStatusLabels,
  leadStatusValues,
  type ActivityListItemDTO,
  type LeadDTO,
  type LeadStatusValue,
} from "@/server/crm/shared";
import type { WhatsAppConversationDTO } from "@/server/whatsapp/shared";

/**
 * Database-backed leads section for `/panel/leads`.
 *
 * Patch CRM-QA1 — **esta sección ya no delega nada en la bandeja local.**
 *
 * El comentario anterior decía que el registro manual, el historial de
 * actividades y la conversión a expediente «siguen funcionando» en la bandeja
 * local de abajo. Era cierto cuando se escribió y dejó de serlo en cuanto
 * `LegacyOperationalPanelGate` empezó a esconder esa bandeja siempre que hay
 * `DATABASE_URL` — o sea, en toda instalación real. Lo que la QA vio como «el
 * vendedor no puede entrar a Leads» y «no hay botón para registrar un lead» era
 * eso: las tres funciones existían en una pantalla que ya nadie veía.
 *
 * Ahora las tres viven aquí, contra la base de datos: `LeadCreateForm` da de
 * alta, `LeadDetailDrawer` muestra la moto, registra seguimientos y convierte a
 * expediente. La bandeja local sigue debajo como camino de recuperación, no como
 * complemento.
 */

export type SellerOption = { id: string; name: string; branchCode: string | null };

const assignableStatuses = leadStatusValues.filter((status) => status !== "EXPEDIENTE");

export function LeadsDbPanel({
  activitiesByLead,
  branches,
  canAssign,
  canChangeStatus,
  canCreateExpediente,
  catalogModels,
  conversations,
  dbConfigured,
  leads,
  scopeLabel,
  sellers,
}: {
  /** Seguimientos de los leads ya visibles, cargados por el servidor. */
  activitiesByLead: Record<string, ActivityListItemDTO[]>;
  /** Vacío salvo para un rol global. */
  branches: Array<{ code: string; name: string }>;
  canAssign: boolean;
  canChangeStatus: boolean;
  canCreateExpediente: boolean;
  catalogModels: LeadCatalogOption[];
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
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);

  // La ficha se resuelve por id y no se guarda la fila: tras `router.refresh()`
  // la lista trae datos nuevos y un objeto guardado seguiría mostrando los
  // viejos, que es como una ficha acaba contradiciendo a su propia lista.
  const detailLead = leads.find((lead) => lead.id === detailLeadId) ?? null;

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
        businessText="Leads del portal público y los que registras tú. Abre uno para ver su motocicleta, registrar seguimiento o convertirlo en expediente."
        technicalText="Leads respaldados por PostgreSQL. Alta manual, ficha con
        motocicleta del catálogo, seguimiento y conversión a expediente, todo
        contra la base de datos."
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
        <>
          <div className="mt-5 flex flex-wrap items-start gap-3">
            <LeadCreateForm
              branches={branches}
              canAssign={canAssign}
              catalogModels={catalogModels}
              onCreated={(leadId) => setDetailLeadId(leadId)}
              sellers={sellers}
            />
          </div>
          <div className="mt-5 overflow-x-auto">
        <div className="min-w-[980px] overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[1.3fr_1.1fr_0.9fr_1fr_1fr_1fr_auto] border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <div>Lead</div>
            <div>Motocicleta</div>
            <div>Sucursal</div>
            <div>Estado</div>
            <div>Vendedor</div>
            <div>Asignar</div>
            <div className="text-right">Acciones</div>
          </div>

          {leads.length ? (
            leads.map((lead) => {
              const rowPending = pending && pendingLeadId === lead.id;
              const branchSellers = sellers.filter(
                (seller) => seller.branchCode === lead.branchCode,
              );

              return (
                <div
                  className="grid grid-cols-[1.3fr_1.1fr_0.9fr_1fr_1fr_1fr_auto] items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0"
                  key={lead.id}
                >
                  <div className="min-w-0">
                    <button
                      className="sb-focus rounded text-left font-semibold text-slate-900 hover:text-blue-700"
                      onClick={() => setDetailLeadId(lead.id)}
                      type="button"
                    >
                      {lead.name}
                    </button>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{lead.phone}</span>
                      <span className="font-mono">{lead.trackingCode}</span>
                    </div>
                  </div>
                  <div className="min-w-0 text-sm text-slate-500">
                    {lead.motorcycle ? (
                      <>
                        <span className="block truncate text-slate-700">
                          {lead.motorcycle.brand} {lead.motorcycle.model}
                        </span>
                        <span className="text-xs text-slate-400">
                          {lead.motorcycle.availableUnitsInBranch > 0
                            ? `${lead.motorcycle.availableUnitsInBranch} disponible(s)`
                            : "Sin unidades"}
                        </span>
                      </>
                    ) : (
                      <span className="block truncate text-slate-400">
                        {lead.motorcycleInterest ?? "Sin definir"}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-sm text-slate-500">{lead.branchName}</div>
                  <div>
                    {canChangeStatus ? (
                      <Select
                        disabled={rowPending}
                        onChange={(event) =>
                          changeStatus(lead.id, event.target.value as LeadStatusValue)
                        }
                        size="sm"
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
                      </Select>
                    ) : (
                      <Badge tone={statusTone(lead.status)}>{lead.statusLabel}</Badge>
                    )}
                  </div>
                  <div className="text-sm text-slate-500">
                    {lead.assignedSellerName ?? "Sin asignar"}
                  </div>
                  <div>
                    {canAssign ? (
                      <Select
                        disabled={rowPending || !branchSellers.length}
                        onChange={(event) => assign(lead.id, event.target.value)}
                        size="sm"
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
                      </Select>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      onClick={() => setChatLead(lead)}
                      size="sm"
                      variant="secondary"
                    >
                      <MessageCircle aria-hidden className="h-4 w-4" />
                      {(conversations[lead.phone]?.messages.length ?? 0) || ""}
                    </Button>
                    <Button
                      onClick={() => setDetailLeadId(lead.id)}
                      size="sm"
                      variant="ghost"
                    >
                      Ver ficha
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyState
              description="Los del portal público llegan solos; los de mostrador los registras tú con el botón de arriba."
              icon={UserPlus}
              title="Aún no hay leads en tu alcance"
            />
          )}
        </div>
        </div>
        </>
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

      {detailLead ? (
        <LeadDetailDrawer
          activities={activitiesByLead[detailLead.id] ?? []}
          canCreateExpediente={canCreateExpediente}
          catalogModels={catalogModels}
          lead={detailLead}
          onClose={() => setDetailLeadId(null)}
        />
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
