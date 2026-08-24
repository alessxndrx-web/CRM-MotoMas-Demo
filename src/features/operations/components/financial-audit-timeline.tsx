import { Clock3 } from "lucide-react";

import type { FinancialAuditEventDTO } from "@/server/financial-audit/shared";

function formatAuditTimestamp(value: string) {
  return new Intl.DateTimeFormat("es-NI", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function FinancialAuditTimeline({
  events,
  title = "Actividad auditada",
}: {
  events: FinancialAuditEventDTO[];
  title?: string;
}) {
  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>

      {events.length ? (
        <ol className="mt-3 space-y-3">
          {events.map((event, index) => (
            <li
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
              key={`${event.timestamp}-${event.actionLabel}-${index}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {event.actionLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {event.actorLabel} · {formatAuditTimestamp(event.timestamp)}
                  </p>
                </div>
                {event.entityCode ? (
                  <span className="font-mono text-[11px] text-slate-500">
                    {event.entityCode}
                  </span>
                ) : null}
              </div>

              {event.reason ? (
                <p className="mt-2 text-xs leading-5 text-slate-700">
                  <span className="font-semibold">Motivo:</span> {event.reason}
                </p>
              ) : null}

              {event.changes.length ? (
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {event.changes.map((change, changeIndex) => (
                    <li key={`${change.fieldLabel}-${changeIndex}`}>
                      <span className="font-medium text-slate-700">
                        {change.fieldLabel}:
                      </span>{" "}
                      {change.before ?? "—"} → {change.after ?? "—"}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          Aún no hay eventos financieros registrados para este elemento.
        </p>
      )}
    </section>
  );
}
