import Link from "next/link";
import { ClipboardList, Database } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ExpedienteCreateForm } from "@/features/operations/modules/customer-files-db/expediente-create-form";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import type {
  CustomerDTO,
  CustomerFileDTO,
  CustomerFileStatusValue,
  LeadDTO,
} from "@/server/crm/shared";
import { cn } from "@/lib/utils";

/**
 * Database-backed expedientes section for `/panel/expedientes`. Additive to
 * the existing localStorage-driven `CustomerFilesList` below it.
 *
 * Selecting a row sets `?expediente=<id>`, which the page resolves server-side
 * into the scoped proforma / documents / credit follow-up panel. The legacy
 * list below keeps its own localStorage-backed detail, untouched.
 *
 * Patch CRM-QA1 añade el alta. El vacío de esta lista prometía que «cuando
 * conviertas un lead en expediente, aparecerá aquí» y **no existía ninguna
 * pantalla que convirtiera nada**: `createExpedienteAction` llevaba desde 3.1B
 * sin un solo llamador. Ahora hay dos caminos hasta ella —el botón de aquí y la
 * ficha del lead— y los dos usan esa misma acción.
 */

export function CustomerFilesDbPanel({
  branches,
  canChooseSeller,
  catalogModels,
  customers,
  dbConfigured,
  files,
  leads,
  scopeLabel,
  sellers,
  selectedFileId,
}: {
  branches: Array<{ code: string; name: string }>;
  canChooseSeller: boolean;
  /** Patch CRM-INT1 — catálogo general para la moto del expediente. */
  catalogModels: Array<{ id: string; label: string }>;
  customers: CustomerDTO[];
  dbConfigured: boolean;
  files: CustomerFileDTO[];
  leads: LeadDTO[];
  scopeLabel: string;
  sellers: Array<{ id: string; name: string; branchCode: string | null }>;
  selectedFileId?: string | null;
}) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PrimarySectionBadge
            businessLabel="Expedientes · Registros"
            technicalLabel="Expedientes · Base de datos (fuente principal)"
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
        businessText="Selecciona un expediente para ver y actualizar su proforma, documentos y seguimiento de crédito."
        technicalText="Expedientes respaldados por PostgreSQL. Esta es la fuente principal
        para expedientes nuevos. El detalle con proforma, documentos y
        seguimiento de crédito previo sigue disponible debajo mientras se
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
          <ExpedienteCreateForm
            branches={branches}
            canChooseSeller={canChooseSeller}
            catalogModels={catalogModels}
            customers={customers}
            leads={leads}
            sellers={sellers}
          />
        </div>
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
          <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_1fr] border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 lg:grid">
            <div>Expediente</div>
            <div>Cliente</div>
            <div>Sucursal</div>
            <div>Vendedor</div>
            <div>Estado</div>
          </div>

          {files.length ? (
            files.map((file) => {
              const active = file.id === selectedFileId;
              return (
                <Link
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "grid gap-2 border-b border-slate-100 px-5 py-4 transition-colors last:border-b-0 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr] lg:items-center",
                    active ? "bg-blue-50" : "hover:bg-slate-50",
                  )}
                  href={
                    active ? "/panel/expedientes" : `/panel/expedientes?expediente=${file.id}`
                  }
                  key={file.id}
                  scroll={false}
                >
                  <div>
                    <div className="font-mono text-sm font-semibold text-slate-900">
                      {file.fileNumber}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {file.motorcycleInterest ?? "Sin moto de interés"}
                    </div>
                  </div>
                  <div className="text-sm text-slate-500">{file.customerName}</div>
                  <div className="text-sm text-slate-500">{file.branchName}</div>
                  <div className="text-sm text-slate-500">
                    {file.sellerName ?? "Sin asignar"}
                  </div>
                  <div>
                    <Badge tone={statusTone(file.status)}>{file.statusLabel}</Badge>
                  </div>
                </Link>
              );
            })
          ) : (
            <EmptyState
              description="Créalo con el botón de arriba, o desde la ficha de un lead que ya tenga cliente."
              icon={ClipboardList}
              title="Aún no hay expedientes en tu alcance"
            />
          )}
        </div>
        </>
      )}
    </Card>
  );
}

function statusTone(status: CustomerFileStatusValue) {
  if (status === "COMPLETADO") return "green" as const;
  if (status === "EN_PROCESO") return "blue" as const;
  if (status === "CANCELADO") return "gray" as const;
  return "red" as const;
}
