"use client";

import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Plus,
  XCircle,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  activityPriorities,
  activityTypes,
  type ActivityPriority,
  type ActivityRecord,
  type ActivityType,
} from "@/data/operations/activities";
import type { DesiredBranchId } from "@/data/operations/leads";
import {
  cancelActivity,
  completeActivity,
  createActivity,
  filterActivitiesForRelationship,
  getLastCompletedActivity,
  getNextPendingActivity,
  isActivityOverdue,
  readActivities,
  subscribeToActivities,
} from "@/features/operations/services/activity-service";
import { filterActivitiesBySession } from "@/features/operations/services/operation-scope-service";
import type { DemoSession } from "@/features/operations/types";

type ActivityRelationshipPanelProps = {
  allowedTypes?: readonly ActivityType[];
  branchId: DesiredBranchId;
  branchName: string;
  customerId?: string | null;
  expedienteId?: string | null;
  leadIds?: string[];
  session: DemoSession;
  title?: string;
};

export function ActivityRelationshipPanel({
  allowedTypes = activityTypes,
  branchId,
  branchName,
  customerId = null,
  expedienteId = null,
  leadIds = [],
  session,
  title = "Actividades comerciales",
}: ActivityRelationshipPanelProps) {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [tipo, setTipo] = useState<ActivityType>(allowedTypes[0] ?? "Seguimiento");
  const [prioridad, setPrioridad] = useState<ActivityPriority>("Media");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fechaProgramada, setFechaProgramada] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    function syncActivities() {
      setActivities(readActivities());
    }

    syncActivities();
    return subscribeToActivities(syncActivities);
  }, []);

  const relatedActivities = useMemo(
    () =>
      filterActivitiesForRelationship(filterActivitiesBySession(activities, session), {
        leadIds,
        customerId,
        expedienteId,
      }),
    [activities, customerId, expedienteId, leadIds, session],
  );
  const nextActivity = getNextPendingActivity(relatedActivities);
  const lastActivity = getLastCompletedActivity(relatedActivities);
  const canCreate = session.role !== "Administrador";

  function submitActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const result = createActivity(
      {
        tipo,
        prioridad,
        titulo,
        descripcion,
        fechaProgramada,
        leadId: leadIds[0] ?? null,
        customerId,
        expedienteId,
        sucursalId: branchId,
        sucursalNombre: branchName,
      },
      session,
    );

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setActivities(result.activities);
    setTitulo("");
    setDescripcion("");
    setFechaProgramada(null);
  }

  function complete(activityId: string) {
    const result = completeActivity(activityId, "", session);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setActivities(result.activities);
  }

  function cancel(activityId: string) {
    const result = cancelActivity(activityId, session);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setActivities(result.activities);
  }

  return (
    <section className="mt-6 border-t border-slate-200 pt-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-5 w-5 text-red-600" />
        <h4 className="text-lg font-black text-slate-900">{title}</h4>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {lastActivity ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              Ultima actividad completada
            </div>
            <div className="mt-2 font-black text-slate-900">{lastActivity.titulo}</div>
            <div className="mt-1 text-sm text-slate-500">
              {lastActivity.estado} / {formatDate(lastActivity.fechaCompletada ?? lastActivity.fechaCreacion)}
            </div>
          </div>
        ) : null}
        {nextActivity ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-amber-700">
              Próxima acción
            </div>
            <div className="mt-2 font-black text-slate-900">{nextActivity.titulo}</div>
            <div className="mt-1 text-sm text-slate-500">
              {nextActivity.tipo} / {formatDate(nextActivity.fechaProgramada)}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No hay actividad pendiente. Registrá la próxima acción para mantener el seguimiento.
          </div>
        )}
      </div>

      {canCreate ? (
        <form className="mt-4 space-y-3" onSubmit={submitActivity}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              <select
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
                onChange={(event) => setTipo(event.target.value as ActivityType)}
                value={tipo}
              >
                {allowedTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prioridad">
              <select
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
                onChange={(event) => setPrioridad(event.target.value as ActivityPriority)}
                value={prioridad}
              >
                {activityPriorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Input
            maxLength={120}
            onChange={(event) => setTitulo(event.target.value)}
            placeholder="Titulo de la actividad"
            value={titulo}
          />
          <textarea
            className="min-h-[76px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            maxLength={500}
            onChange={(event) => setDescripcion(event.target.value)}
            placeholder="Detalle o proxima accion"
            value={descripcion}
          />
          <Field label="Fecha programada (opcional)">
            <Input
              onChange={(event) => setFechaProgramada(event.target.value || null)}
              type="datetime-local"
              value={fechaProgramada ?? ""}
            />
          </Field>
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}
          <Button className="w-full" type="submit" variant="secondary">
            <Plus className="h-4 w-4" />
            Agregar actividad
          </Button>
        </form>
      ) : null}

      <div className="mt-5 space-y-3">
        {relatedActivities.length ? (
          relatedActivities.map((activity) => (
            <ActivityItem
              activity={activity}
              canManage={canManage(activity, session)}
              key={activity.id}
              onCancel={cancel}
              onComplete={complete}
            />
          ))
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Aún no hay actividades registradas. Creá una nota o seguimiento para iniciar el historial comercial.
          </div>
        )}
      </div>
    </section>
  );
}

function ActivityItem({
  activity,
  canManage,
  onCancel,
  onComplete,
}: {
  activity: ActivityRecord;
  canManage: boolean;
  onCancel: (activityId: string) => void;
  onComplete: (activityId: string) => void;
}) {
  const overdue = isActivityOverdue(activity);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={activityTone(activity.estado)}>{activity.estado}</Badge>
            <Badge tone={priorityTone(activity.prioridad)}>{activity.prioridad}</Badge>
            {overdue ? <Badge tone="red">Vencida</Badge> : null}
          </div>
          <div className="mt-3 font-black text-slate-900">{activity.titulo}</div>
          <div className="mt-1 text-sm text-slate-500">
            {activity.tipo} / {formatDate(activity.fechaProgramada)}
          </div>
        </div>
        <CalendarClock className="h-5 w-5 shrink-0 text-red-600" />
      </div>
      {activity.descripcion ? (
        <p className="mt-3 text-sm leading-6 text-slate-500">{activity.descripcion}</p>
      ) : null}
      {activity.resultado ? (
        <p className="mt-3 text-sm leading-6 text-emerald-700">
          Resultado: {activity.resultado}
        </p>
      ) : null}
      {canManage && activity.estado === "Pendiente" ? (
        <div className="mt-4 flex gap-2">
          <Button onClick={() => onComplete(activity.id)} size="sm" variant="success">
            <CheckCircle2 className="h-4 w-4" />
            Completar
          </Button>
          <Button onClick={() => onCancel(activity.id)} size="sm" variant="danger">
            <XCircle className="h-4 w-4" />
            Cancelar
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function canManage(activity: ActivityRecord, session: DemoSession) {
  if (session.role === "Administrador") return false;
  if (session.role === "Gerente") return activity.sucursalId === session.branchId;
  return activity.vendedorId === session.userId;
}

function activityTone(status: ActivityRecord["estado"]) {
  if (status === "Completada") return "green" as const;
  if (status === "Cancelada") return "gray" as const;
  return "yellow" as const;
}

function priorityTone(priority: ActivityPriority) {
  if (priority === "Alta") return "red" as const;
  if (priority === "Media") return "blue" as const;
  return "gray" as const;
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha programada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
