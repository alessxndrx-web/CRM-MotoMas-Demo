import { Database, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CustomerDTO } from "@/server/crm/shared";

/**
 * Database-backed customers section for `/panel/clientes`. Additive to the
 * existing localStorage-driven `CustomersList` below it; reservations, sales
 * and quotes still reference the localStorage customer records, which this
 * section does not touch.
 */

export function CustomersDbPanel({
  customers,
  dbConfigured,
  scopeLabel,
}: {
  customers: CustomerDTO[];
  dbConfigured: boolean;
  scopeLabel: string;
}) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="green">Clientes · Base de datos (fuente principal)</Badge>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
            {scopeLabel}
          </span>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
          <Database className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-500">
        Clientes creados desde expedientes, respaldados por PostgreSQL. Esta
        es la fuente principal para clientes nuevos. El listado con historial
        de interacciones previo sigue disponible debajo mientras se completa
        su migración.
      </p>

      {!dbConfigured ? (
        <div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100/90">
          Esta sección requiere <code>DATABASE_URL</code> configurado.
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
          <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr] border-b border-white/10 bg-white/[0.03] px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-zinc-500 lg:grid">
            <div>Cliente</div>
            <div>Cédula</div>
            <div>Sucursal</div>
            <div>Correo</div>
          </div>

          {customers.length ? (
            customers.map((customer) => (
              <div
                className="grid gap-2 border-b border-white/7 px-5 py-4 last:border-b-0 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:items-center"
                key={customer.id}
              >
                <div>
                  <div className="font-black text-white">{customer.name}</div>
                  <div className="mt-1 text-xs text-zinc-500">{customer.phone}</div>
                </div>
                <div className="text-sm text-zinc-400">
                  {customer.cedula ?? "No registrada"}
                </div>
                <div className="text-sm text-zinc-400">{customer.branchName}</div>
                <div className="text-sm text-zinc-400">
                  {customer.email ?? "No indicado"}
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-3 p-6 text-sm text-zinc-500">
              <Users className="h-5 w-5 text-zinc-600" />
              Aún no hay clientes en la base de datos para este alcance.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
