import Link from "next/link";
import { CreditCard, Database } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import type {
  CreditApplicationDTO,
  CreditStatusValue,
} from "@/server/expedientes/shared";

/**
 * Database-backed credit follow-up section for `/panel/creditos`. Read-only
 * here: editing happens on the owning expediente, which is where the server
 * actions scope their permission check. Additive to the legacy `CreditsPanel`
 * below it.
 */

export function CreditsDbPanel({
  applications,
  dbConfigured,
  scopeLabel,
}: {
  applications: CreditApplicationDTO[];
  dbConfigured: boolean;
  scopeLabel: string;
}) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PrimarySectionBadge
            businessLabel="Crédito · Registros"
            technicalLabel="Créditos · Base de datos (fuente principal)"
          />
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
            {scopeLabel}
          </span>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Database className="h-5 w-5" />
        </div>
      </div>

      <PrimarySectionDescription
        businessText="Seguimiento de crédito por expediente. Abre el expediente para actualizar el estado, los montos o los requisitos pendientes."
        technicalText="Seguimientos de crédito respaldados por PostgreSQL. Esta es la fuente
        principal; el seguimiento local sigue disponible debajo mientras se
        completa su migración."
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
          <div className="hidden grid-cols-[1.1fr_1fr_1fr_1fr_0.9fr] border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 lg:grid">
            <div>Expediente</div>
            <div>Cliente</div>
            <div>Financiera</div>
            <div>Sucursal</div>
            <div>Estado</div>
          </div>

          {applications.length ? (
            applications.map((application) => (
              <Link
                className="grid gap-2 border-b border-slate-100 px-5 py-4 transition-colors last:border-b-0 hover:bg-slate-50 lg:grid-cols-[1.1fr_1fr_1fr_1fr_0.9fr] lg:items-center"
                href={`/panel/expedientes?expediente=${application.customerFileId}`}
                key={application.id}
              >
                <div>
                  <div className="font-mono text-sm font-semibold text-slate-900">
                    {application.fileNumber ?? "—"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {application.financingTypeLabel ?? "Sin tipo de financiamiento"}
                  </div>
                </div>
                <div className="text-sm text-slate-500">
                  {application.customerName ?? "Cliente"}
                </div>
                <div className="text-sm text-slate-500">
                  {application.financialInstitution ?? "Sin registrar"}
                </div>
                <div className="text-sm text-slate-500">{application.branchName}</div>
                <div>
                  <Badge tone={creditTone(application.status)}>
                    {application.statusLabel}
                  </Badge>
                </div>
              </Link>
            ))
          ) : (
            <div className="flex items-center gap-3 p-6 text-sm text-slate-500">
              <CreditCard className="h-5 w-5 text-slate-400" />
              Aún no hay seguimientos de crédito para este alcance. Inicia uno
              desde el expediente del cliente.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function creditTone(status: CreditStatusValue) {
  if (status === "APROBADO") return "green" as const;
  if (status === "PREAPROBADO") return "blue" as const;
  if (status === "RECHAZADO" || status === "CANCELADO") return "red" as const;
  if (status === "DOCUMENTACION_PENDIENTE" || status === "EN_REVISION") {
    return "yellow" as const;
  }
  return "slate" as const;
}
