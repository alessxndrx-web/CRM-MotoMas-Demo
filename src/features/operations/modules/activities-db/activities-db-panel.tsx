"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Database,
  Plus,
  XCircle,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import {
  activityPriorityLabels,
  activityPriorityValues,
  activityTypeLabels,
  activityTypeValues,
  isActivityOverdue,
  type ActivityListItemDTO,
  type ActivityPriorityValue,
  type ActivitySummaryDTO,
  type ActivityStatusValue,
} from "@/server/crm/shared";
import {
  cancelActivityAction,
  completeActivityAction,
  createActivityAction,
  rescheduleActivityAction,
} from "@/server/expedientes/actions";
import { cn } from "@/lib/utils";

/**
 * Database-backed activities section for `/panel/actividades`. Additive to the
 * existing localStorage-driven `ActivitiesPanel` below it.
 *
 * Every mutation goes through a server action, which re-checks the session role
 * and re-resolves scope against the activity. The filters here are presentation
 * only — the list already arrives scoped from the server.
 *
 * `now` comes from the server so the "Vencidas" count is identical on both
 * render passes.
 */

const ALL = "todas";

const selectClass =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

/** The status filter mixes a real status with the derived "overdue" bucket. */
type StatusFilter = typeof ALL | ActivityStatusValue | "VENCIDAS";

const statusFilterLabels: Record<StatusFilter, string> = {
  [ALL]: "Todas",
  PENDIENTE: "Pendientes",
  VENCIDAS: "Vencidas",
  COMPLETADA: "Completadas",
  CANCELADA: "Canceladas",
};

export type ActivityFileOption = {
  id: string;
  fileNumber: string;
  customerName: string;
};

export type ActivityBranchOption = { code: string; name: string };

export function ActivitiesDbPanel({
  activities,
  branches,
  dbConfigured,
  files,
  nowIso,
  scopeLabel,
  summary,
}: {
  activities: ActivityListItemDTO[];
  /** Only a global role picks a branch; others inherit their own. */
  branches: ActivityBranchOption[];
  dbConfigured: boolean;
  files: ActivityFileOption[];
  nowIso: string;
  scopeLabel: string;
  summary: ActivitySummaryDTO;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL);
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [priorityFilter, setPriorityFilter] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  const now = useMemo(() => new Date(nowIso), [nowIso]);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la operación.");
        return;
      }
      router.refresh();
    });
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return activities.filter((activity) => {
      if (statusFilter === "VENCIDAS" && !isActivityOverdue(activity, now)) {
        return false;
      }
      if (
        statusFilter !== ALL &&
        statusFilter !== "VENCIDAS" &&
        activity.status !== statusFilter
      ) {
        return false;
      }
      if (typeFilter !== ALL && activity.type !== typeFilter) return false;
      if (priorityFilter !== ALL && activity.priority !== priorityFilter) {
        return false;
      }
      if (!needle) return true;
      return [
        activity.description,
        activity.customerName,
        activity.fileNumber,
        activity.userName,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle));
    });
  }, [activities, now, priorityFilter, query, statusFilter, typeFilter]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={ClipboardList}
          label="Pendientes"
          value={summary.pendientes}
        />
        <StatCard
          hint="Requieren atención inmediata"
          icon={AlertCircle}
          label="Vencidas"
          value={summary.vencidas}
        />
        <StatCard
          icon={CalendarClock}
          label="Próximas acciones"
          value={summary.proximas}
        />
        <StatCard
          icon={CheckCircle2}
          label="Completadas"
          value={summary.completadas}
        />
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <PrimarySectionBadge
              businessLabel="Actividades · Seguimiento"
              technicalLabel="Actividades · Base de datos (fuente principal)"
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
          businessText="Registra llamadas, visitas, notas y próximas acciones. Completa,
          cancela o reprograma un seguimiento sin salir de esta vista."
          technicalText="Actividades respaldadas por PostgreSQL. Esta es la fuente principal
          para seguimientos nuevos. El historial anterior sigue disponible debajo
          mientras se completa su migración."
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
            {error ? (
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            ) : null}

            <div className="mt-6">
              <CreateActivityForm
                branches={branches}
                disabled={pending}
                files={files}
                onRun={run}
              />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Estado
                </span>
                <select
                  className={selectClass}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as StatusFilter)
                  }
                  value={statusFilter}
                >
                  {(
                    [
                      ALL,
                      "PENDIENTE",
                      "VENCIDAS",
                      "COMPLETADA",
                      "CANCELADA",
                    ] as StatusFilter[]
                  ).map((value) => (
                    <option key={value} value={value}>
                      {statusFilterLabels[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Tipo
                </span>
                <select
                  className={selectClass}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  value={typeFilter}
                >
                  <option value={ALL}>Todos</option>
                  {activityTypeValues.map((value) => (
                    <option key={value} value={value}>
                      {activityTypeLabels[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Prioridad
                </span>
                <select
                  className={selectClass}
                  onChange={(event) => setPriorityFilter(event.target.value)}
                  value={priorityFilter}
                >
                  <option value={ALL}>Todas</option>
                  {activityPriorityValues.map((value) => (
                    <option key={value} value={value}>
                      {activityPriorityLabels[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Buscar
                </span>
                <Input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Contacto, expediente o contenido"
                  value={query}
                />
              </label>
            </div>

            {visible.length ? (
              <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {visible.map((activity) => (
                  <ActivityRow
                    activity={activity}
                    disabled={pending}
                    key={activity.id}
                    now={now}
                    onRun={run}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                className="mt-5"
                description="Registra una llamada, una visita o una próxima acción para dar seguimiento a tus clientes."
                icon={CalendarClock}
                title={
                  activities.length
                    ? "Ninguna actividad coincide con los filtros"
                    : "Aún no hay actividades en este alcance"
                }
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}

type Runner = (action: () => Promise<{ ok: boolean; error?: string }>) => void;

// --- Registrar actividad -------------------------------------------------

function CreateActivityForm({
  branches,
  disabled,
  files,
  onRun,
}: {
  branches: ActivityBranchOption[];
  disabled: boolean;
  files: ActivityFileOption[];
  onRun: Runner;
}) {
  const [type, setType] = useState<string>("SEGUIMIENTO");
  const [priority, setPriority] = useState<string>("MEDIA");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [customerFileId, setCustomerFileId] = useState("");
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");

  // A global role must say where a standalone activity lives; when it hangs off
  // an expediente, the server takes the branch from that expediente.
  const needsBranch = branches.length > 0 && !customerFileId;

  function submit() {
    onRun(async () => {
      const result = await createActivityAction({
        type,
        priority,
        description,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        customerFileId: customerFileId || null,
        branchCode: needsBranch ? branchCode : null,
      });
      if (result.ok) {
        setDescription("");
        setScheduledAt("");
      }
      return result;
    });
  }

  return (
    <>
      <FormSection
        description="La fecha programada es opcional: una nota o un contacto ya realizado puede registrarse sin agenda."
        title="Registrar actividad"
      >
        <Field label="Tipo">
          <select
            className={selectClass}
            onChange={(event) => setType(event.target.value)}
            value={type}
          >
            {activityTypeValues.map((value) => (
              <option key={value} value={value}>
                {activityTypeLabels[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prioridad">
          <select
            className={selectClass}
            onChange={(event) => setPriority(event.target.value)}
            value={priority}
          >
            {activityPriorityValues.map((value) => (
              <option key={value} value={value}>
                {activityPriorityLabels[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field className="sm:col-span-2" label="Descripción" required>
          <Input
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ej. Llamar para confirmar documentación"
            value={description}
          />
        </Field>
        <Field label="Fecha programada">
          <Input
            onChange={(event) => setScheduledAt(event.target.value)}
            type="date"
            value={scheduledAt}
          />
        </Field>
        <Field hint="Opcional." label="Expediente relacionado">
          <select
            className={selectClass}
            onChange={(event) => setCustomerFileId(event.target.value)}
            value={customerFileId}
          >
            <option value="">Sin expediente</option>
            {files.map((file) => (
              <option key={file.id} value={file.id}>
                {file.fileNumber} · {file.customerName}
              </option>
            ))}
          </select>
        </Field>
        {needsBranch ? (
          <Field label="Sucursal">
            <select
              className={selectClass}
              onChange={(event) => setBranchCode(event.target.value)}
              value={branchCode}
            >
              {branches.map((branch) => (
                <option key={branch.code} value={branch.code}>
                  {branch.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </FormSection>

      <div className="mt-4">
        <Button
          disabled={disabled || !description.trim()}
          onClick={submit}
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Registrar actividad
        </Button>
      </div>
    </>
  );
}

// --- Fila de actividad ---------------------------------------------------

function ActivityRow({
  activity,
  disabled,
  now,
  onRun,
}: {
  activity: ActivityListItemDTO;
  disabled: boolean;
  now: Date;
  onRun: Runner;
}) {
  const [reschedule, setReschedule] = useState("");
  const overdue = isActivityOverdue(activity, now);
  const open = activity.status === "PENDIENTE";

  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 px-4 py-4",
        overdue && "bg-red-50/40",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="slate">{activity.typeLabel}</Badge>
          <Badge tone={priorityTone(activity.priority)}>
            {activity.priorityLabel}
          </Badge>
          <Badge tone={statusTone(activity.status, overdue)}>
            {overdue ? "Vencida" : activity.statusLabel}
          </Badge>
        </div>

        <p className="mt-2 text-sm font-medium text-slate-900">
          {activity.description ?? "Sin descripción"}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {activity.fileNumber && activity.customerFileId ? (
            <Link
              className="font-mono font-medium text-blue-600 hover:underline"
              href={`/panel/expedientes?expediente=${activity.customerFileId}`}
            >
              {activity.fileNumber}
            </Link>
          ) : null}
          {activity.customerName ? <span>{activity.customerName}</span> : null}
          <span>{activity.branchName}</span>
          {activity.userName ? <span>{activity.userName}</span> : null}
          <span>{formatSchedule(activity.scheduledAt)}</span>
        </div>

        {activity.result ? (
          <p className="mt-1 text-xs text-slate-500">{activity.result}</p>
        ) : null}
      </div>

      {open ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Reprogramar actividad"
            className="h-8 w-auto text-xs"
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value;
              setReschedule(value);
              if (!value) return;
              onRun(() =>
                rescheduleActivityAction({
                  activityId: activity.id,
                  scheduledAt: new Date(value).toISOString(),
                }),
              );
            }}
            type="date"
            value={reschedule}
          />
          <Button
            disabled={disabled}
            onClick={() =>
              onRun(() => completeActivityAction({ activityId: activity.id }))
            }
            size="sm"
            variant="success"
          >
            <CheckCircle2 className="h-4 w-4" />
            Completar
          </Button>
          <Button
            disabled={disabled}
            onClick={() =>
              onRun(() => cancelActivityAction({ activityId: activity.id }))
            }
            size="sm"
            variant="secondary"
          >
            <XCircle className="h-4 w-4" />
            Cancelar
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function priorityTone(priority: ActivityPriorityValue) {
  if (priority === "ALTA") return "orange" as const;
  if (priority === "BAJA") return "slate" as const;
  return "blue" as const;
}

function statusTone(status: ActivityStatusValue, overdue: boolean) {
  if (overdue) return "red" as const;
  if (status === "COMPLETADA") return "green" as const;
  if (status === "CANCELADA") return "gray" as const;
  return "amber" as const;
}

function formatSchedule(scheduledAt: string | null) {
  if (!scheduledAt) return "Sin fecha programada";
  return new Date(scheduledAt).toLocaleDateString("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
