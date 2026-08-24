import Link from "next/link";
import { ClipboardList, Database } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import type { CustomerFileDTO, CustomerFileStatusValue } from "@/server/crm/shared";
import { cn } from "@/lib/utils";

/**
 * Database-backed expedientes section for `/panel/expedientes`. Additive to
 * the existing localStorage-driven `CustomerFilesList` below it.
 *
 * Selecting a row sets `?expediente=<id>`, which the page resolves server-side
 * into the scoped proforma / documents / credit follow-up panel. The legacy
 * list below keeps its own localStorage-backed detail, untouched.
 */

export function CustomerFilesDbPanel({
  dbConfigured,
  files,
  scopeLabel,
  selectedFileId,
}: {
  dbConfigured: boolean;
  files: CustomerFileDTO[];
  scopeLabel: string;
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
            <div className="flex items-center gap-3 p-6 text-sm text-slate-500">
              <ClipboardList className="h-5 w-5 text-slate-400" />
              Aún no hay expedientes para este alcance. Cuando conviertas un
              lead en expediente, aparecerá aquí.
            </div>
          )}
        </div>
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
