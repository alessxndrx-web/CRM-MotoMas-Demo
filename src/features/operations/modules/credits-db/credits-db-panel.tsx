import Link from "next/link";
import { CreditCard, Database } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import { CreditCreateForm } from "@/features/operations/modules/credits-db/credit-create-form";
import type { CustomerFileDTO } from "@/server/crm/shared";
import type {
  CreditApplicationDTO,
  CreditStatusValue,
} from "@/server/expedientes/shared";

/**
 * Database-backed credit follow-up section for `/panel/creditos`.
 *
 * Editar sigue ocurriendo en el expediente dueño, que es donde las acciones
 * acotan su permiso. Patch CRM-QA1 añade sólo **abrir** la solicitud: la QA
 * reportó «no hay opción de crear créditos» porque el único camino hasta
 * `saveCreditApplicationAction` era entrar al detalle de un expediente ya
 * seleccionado, y desde esta pantalla no había ninguno.
 */

export function CreditsDbPanel({
  applications,
  dbConfigured,
  filesWithoutCredit,
  scopeLabel,
}: {
  applications: CreditApplicationDTO[];
  dbConfigured: boolean;
  /** Expedientes del alcance que aún no tienen solicitud: una por expediente. */
  filesWithoutCredit: CustomerFileDTO[];
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
        <>
        <div className="mt-5">
          <CreditCreateForm files={filesWithoutCredit} />
        </div>
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
            <EmptyState
              description="Ábrela con el botón de arriba eligiendo el expediente, o desde el expediente del cliente."
              icon={CreditCard}
              title="Aún no hay solicitudes de crédito en tu alcance"
            />
          )}
        </div>
        </>
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
