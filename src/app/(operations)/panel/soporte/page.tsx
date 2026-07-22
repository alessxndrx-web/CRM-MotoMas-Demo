import {
  Activity,
  ClipboardList,
  Database,
  KeyRound,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  canOperateSupport,
  canViewTechnicalAudit,
  getSupportScopeForUser,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { getSupportDashboard } from "@/server/support/queries";

export const dynamic = "force-dynamic";

function formatAuditDate(value: string): string {
  return new Intl.DateTimeFormat("es-NI", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function SupportPage() {
  const session = await requireAuth();
  const canOperate = canOperateSupport(session.roleEnum);

  if (!canOperate) {
    return (
      <Card className="p-8 text-center">
        <Badge tone="gray">Soporte Técnico</Badge>
        <ShieldCheck className="mx-auto mt-5 h-10 w-10 text-slate-400" />
        <h2 className="mt-4 text-2xl font-black text-slate-900">
          Acceso restringido
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Este panel está reservado para Soporte Técnico y la supervisión de
          Administrador.
        </p>
      </Card>
    );
  }

  const scope = getSupportScopeForUser(session.roleEnum);
  const dashboard = await getSupportDashboard(
    scope,
    canViewTechnicalAudit(session.roleEnum),
  );
  const databaseStatus = !dashboard.databaseConfigured
    ? "No configurada"
    : dashboard.databaseReachable
      ? "Disponible"
      : "No disponible";

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Badge tone={scope.level === "supervisory" ? "blue" : "emerald"}>
            {scope.level === "supervisory"
              ? "Supervisión de Administrador"
              : "Soporte activo"}
          </Badge>
        }
        description="Diagnóstico seguro y auditoría técnica de solo lectura, aislados de la operación comercial y financiera."
        eyebrow="Soporte Técnico"
        title="Centro de soporte técnico"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <Wrench className="h-5 w-5 text-orange-600" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Área de soporte
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">Activa</p>
          <p className="mt-1 text-sm text-slate-500">Acceso confinado y seguro.</p>
        </Card>

        <Card className="p-5">
          <Database className="h-5 w-5 text-blue-600" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Conectividad
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {databaseStatus}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Estado general, sin detalles de conexión.
          </p>
        </Card>

        <Card className="p-5">
          <Activity className="h-5 w-5 text-emerald-600" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Auditoría técnica
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {dashboard.technicalAuditAvailable
              ? `${dashboard.totalTechnicalEvents ?? 0} eventos`
              : "Preparada"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Resumen sanitizado y de solo lectura.
          </p>
        </Card>

        <Card className="p-5">
          <ClipboardList className="h-5 w-5 text-violet-600" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Tickets / Ayuda
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">Pendiente</p>
          <p className="mt-1 text-sm text-slate-500">Patches 4.0E–4.0G.</p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
                Auditoría técnica
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">
                Actividad reciente sanitizada
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Solo se muestran categorías, tipo general y fecha. Los detalles
                privados e identificadores permanecen excluidos.
              </p>
            </div>
            <Badge tone="slate">Solo lectura</Badge>
          </div>

          {dashboard.recentEvents.length > 0 ? (
            <div className="mt-5 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {dashboard.recentEvents.map((event, index) => (
                <div
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  key={`${event.createdAt}-${index}`}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {event.actionLabel}
                    </p>
                    <p className="text-xs text-slate-500">{event.targetLabel}</p>
                  </div>
                  <time className="text-xs text-slate-500" dateTime={event.createdAt}>
                    {formatAuditDate(event.createdAt)}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
              No hay eventos sanitizados disponibles en este momento.
            </div>
          )}

          {dashboard.eventCounts.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {dashboard.eventCounts.map((item) => (
                <Badge key={item.label} tone="gray">
                  {item.label}: {item.count}
                </Badge>
              ))}
            </div>
          ) : null}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <h3 className="mt-3 font-semibold text-slate-900">Diagnóstico seguro</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Indicadores no sensibles preparados. No hay consola, controles de
              infraestructura ni acciones de mantenimiento.
            </p>
          </Card>

          <Card className="p-5">
            <KeyRound className="h-5 w-5 text-amber-600" />
            <h3 className="mt-3 font-semibold text-slate-900">Soporte de acceso</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              El flujo de solicitudes con aprobación de Administrador está
              planificado. Este panel no cambia cuentas, roles ni sesiones.
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
}
