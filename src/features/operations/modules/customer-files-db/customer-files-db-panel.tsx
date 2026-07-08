import { ClipboardList, Database } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CustomerFileDTO, CustomerFileStatusValue } from "@/server/crm/shared";

/**
 * Database-backed expedientes section for `/panel/expedientes`. Additive to
 * the existing localStorage-driven `CustomerFilesList` below it; quotes,
 * documents and credit follow-ups still key off the localStorage expediente
 * id, which this section does not touch.
 */

export function CustomerFilesDbPanel({
  dbConfigured,
  files,
  scopeLabel,
}: {
  dbConfigured: boolean;
  files: CustomerFileDTO[];
  scopeLabel: string;
}) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="green">Expedientes · Base de datos (fuente principal)</Badge>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
            {scopeLabel}
          </span>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
          <Database className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-500">
        Expedientes respaldados por PostgreSQL. Esta es la fuente principal
        para expedientes nuevos. El detalle con proforma, documentos y
        seguimiento de crédito previo sigue disponible debajo mientras se
        completa su migración.
      </p>

      {!dbConfigured ? (
        <div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100/90">
          Esta sección requiere <code>DATABASE_URL</code> configurado.
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
          <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_1fr] border-b border-white/10 bg-white/[0.03] px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-zinc-500 lg:grid">
            <div>Expediente</div>
            <div>Cliente</div>
            <div>Sucursal</div>
            <div>Vendedor</div>
            <div>Estado</div>
          </div>

          {files.length ? (
            files.map((file) => (
              <div
                className="grid gap-2 border-b border-white/7 px-5 py-4 last:border-b-0 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr] lg:items-center"
                key={file.id}
              >
                <div>
                  <div className="font-mono text-sm font-black text-white">
                    {file.fileNumber}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {file.motorcycleInterest ?? "Sin moto de interés"}
                  </div>
                </div>
                <div className="text-sm text-zinc-400">{file.customerName}</div>
                <div className="text-sm text-zinc-400">{file.branchName}</div>
                <div className="text-sm text-zinc-400">
                  {file.sellerName ?? "Sin asignar"}
                </div>
                <div>
                  <Badge tone={statusTone(file.status)}>{file.statusLabel}</Badge>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-3 p-6 text-sm text-zinc-500">
              <ClipboardList className="h-5 w-5 text-zinc-600" />
              Aún no hay expedientes en la base de datos para este alcance.
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
