"use client";

import { Database, MessageCircle, Users } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import { WhatsAppConversationDrawer } from "@/features/operations/modules/whatsapp/whatsapp-conversation-drawer";
import type { CustomerDTO } from "@/server/crm/shared";
import type { WhatsAppConversationDTO } from "@/server/whatsapp/shared";

/**
 * Database-backed customers section for `/panel/clientes`. Additive to the
 * existing localStorage-driven `CustomersList` below it; reservations, sales
 * and quotes still reference the localStorage customer records, which this
 * section does not touch.
 */

export function CustomersDbPanel({
  conversations,
  customers,
  dbConfigured,
  scopeLabel,
}: {
  /** Hilos de WhatsApp por teléfono, ya cargados por el servidor. */
  conversations: Record<string, WhatsAppConversationDTO>;
  customers: CustomerDTO[];
  dbConfigured: boolean;
  scopeLabel: string;
}) {
  const [chatCustomer, setChatCustomer] = useState<CustomerDTO | null>(null);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PrimarySectionBadge
            businessLabel="Clientes · Historial comercial"
            technicalLabel="Clientes · Base de datos (fuente principal)"
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
        businessText="Clientes creados desde expedientes. El listado con historial de interacciones previo sigue disponible debajo."
        technicalText="Clientes creados desde expedientes, respaldados por PostgreSQL. Esta
        es la fuente principal para clientes nuevos. El listado con historial
        de interacciones previo sigue disponible debajo mientras se completa
        su migración."
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
          <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_auto] border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 lg:grid">
            <div>Cliente</div>
            <div>Cédula</div>
            <div>Sucursal</div>
            <div>Correo</div>
            <div>WhatsApp</div>
          </div>

          {customers.length ? (
            customers.map((customer) => (
              <div
                className="grid gap-2 border-b border-slate-100 px-5 py-4 last:border-b-0 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] lg:items-center"
                key={customer.id}
              >
                <div>
                  <div className="font-semibold text-slate-900">{customer.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{customer.phone}</div>
                </div>
                <div className="text-sm text-slate-500">
                  {customer.cedula ?? "No registrada"}
                </div>
                <div className="text-sm text-slate-500">{customer.branchName}</div>
                <div className="text-sm text-slate-500">
                  {customer.email ?? "No indicado"}
                </div>
                <div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setChatCustomer(customer)}
                  >
                    <MessageCircle className="h-4 w-4" />
                    {(conversations[customer.phone]?.messages.length ?? 0) || ""}
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-3 p-6 text-sm text-slate-500">
              <Users className="h-5 w-5 text-slate-400" />
              Aún no hay clientes para este alcance. Cuando conviertas un
              lead en expediente, aparecerá aquí.
            </div>
          )}
        </div>
      )}

      <WhatsAppConversationDrawer
        contactName={chatCustomer?.name ?? ""}
        conversation={
          chatCustomer ? conversations[chatCustomer.phone] ?? null : null
        }
        onClose={() => setChatCustomer(null)}
        open={chatCustomer !== null}
        phone={chatCustomer?.phone ?? ""}
      />
    </Card>
  );
}
