"use client";

import { useRouter } from "next/navigation";
import { CalendarCheck, Database } from "lucide-react";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import { cancelReservation, createReservation } from "@/server/operations/actions";
import type { ReservationDTO, ReservationStatusValue } from "@/server/operations/shared";
import type { CustomerDTO, CustomerFileDTO } from "@/server/crm/shared";
import type { InventoryUnitDTO } from "@/server/inventory/shared";

/**
 * Database-backed reservations section for `/panel/reservas`. Additive to the
 * existing localStorage-driven `ReservationsPanel` below it (same pattern
 * already used by Patch 3.1C): it does not replace the existing panel, so
 * sales/quote/expediente flows that still key off localStorage reservation
 * ids keep working unchanged.
 */

export function ReservationsDbPanel({
  canManage,
  customers,
  dbConfigured,
  files,
  reservations,
  scopeLabel,
  units,
}: {
  canManage: boolean;
  customers: CustomerDTO[];
  dbConfigured: boolean;
  files: CustomerFileDTO[];
  reservations: ReservationDTO[];
  scopeLabel: string;
  units: InventoryUnitDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const availableUnits = units.filter((unit) => unit.status === "AVAILABLE");

  function cancel(reservationId: string) {
    setError("");
    setPendingId(reservationId);
    startTransition(async () => {
      const result = await cancelReservation({ reservationId });
      if (!result.ok) setError(result.error);
      setPendingId(null);
      router.refresh();
    });
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const customerId = String(form.get("customerId") ?? "");
    const motorcycleUnitId = String(form.get("motorcycleUnitId") ?? "");
    const customerFileId = String(form.get("customerFileId") ?? "") || null;
    const notes = String(form.get("notes") ?? "") || null;

    if (!customerId || !motorcycleUnitId) {
      setError("Selecciona un cliente y una unidad disponible.");
      return;
    }

    startTransition(async () => {
      const result = await createReservation({
        customerId,
        motorcycleUnitId,
        customerFileId,
        notes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShowForm(false);
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PrimarySectionBadge
            businessLabel="Reservas · Seguimiento operativo"
            technicalLabel="Reservas · Base de datos (fuente principal)"
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
        businessText="Reservas de unidades disponibles. El panel local previo sigue disponible debajo."
        technicalText="Reservas respaldadas por PostgreSQL. Esta es la fuente principal para
        reservas nuevas. El panel local previo sigue disponible debajo mientras
        se completa su migración."
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
          {canManage ? (
            <div className="mt-5">
              <Button onClick={() => setShowForm((value) => !value)} variant="secondary">
                <CalendarCheck className="h-4 w-4" />
                {showForm ? "Ocultar formulario" : "Nueva reserva"}
              </Button>
              {showForm ? (
                <form className="mt-4 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5" onSubmit={submitCreate}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Cliente">
                      <select className={selectClass} name="customerId" required>
                        <option value="">Selecciona un cliente</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name} · {customer.phone}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Expediente (opcional)">
                      <select className={selectClass} name="customerFileId">
                        <option value="">Sin expediente</option>
                        {files.map((file) => (
                          <option key={file.id} value={file.id}>
                            {file.fileNumber} · {file.customerName}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="Unidad disponible">
                    <select className={selectClass} name="motorcycleUnitId" required>
                      <option value="">Selecciona una unidad</option>
                      {availableUnits.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name} · {unit.chassisNumber} · {unit.branchName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Notas (opcional)">
                    <textarea
                      className="min-h-[80px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      name="notes"
                      placeholder="Contexto de la reserva"
                    />
                  </Field>
                  <Button disabled={pending} type="submit">
                    Crear reserva
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
            <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 lg:grid">
              <div>Cliente</div>
              <div>Unidad</div>
              <div>Sucursal</div>
              <div>Vendedor</div>
              <div>Estado</div>
              <div>Acción</div>
            </div>

            {reservations.length ? (
              reservations.map((reservation) => {
                const rowPending = pending && pendingId === reservation.id;
                return (
                  <div
                    className="grid gap-2 border-b border-slate-100 px-5 py-4 last:border-b-0 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] lg:items-center"
                    key={reservation.id}
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{reservation.customerName}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {reservation.fileNumber ?? "Sin expediente"}
                      </div>
                    </div>
                    <div className="text-sm text-slate-500">
                      {reservation.unitName}
                      <div className="text-xs text-slate-400">{reservation.chassisNumber}</div>
                    </div>
                    <div className="text-sm text-slate-500">{reservation.branchName}</div>
                    <div className="text-sm text-slate-500">{reservation.sellerName ?? "—"}</div>
                    <div>
                      <Badge tone={statusTone(reservation.status)}>{reservation.statusLabel}</Badge>
                    </div>
                    <div>
                      {canManage && reservation.status === "ACTIVA" && !reservation.hasSale ? (
                        <Button
                          disabled={rowPending}
                          onClick={() => cancel(reservation.id)}
                          size="sm"
                          variant="danger"
                        >
                          Cancelar
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-sm text-slate-500">
                Aún no hay reservas para este alcance. No hay seguimientos
                registrados todavía.
              </div>
            )}
          </div>
        </>
      )}

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}
    </Card>
  );
}

const selectClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function statusTone(status: ReservationStatusValue) {
  if (status === "COMPLETADA") return "green" as const;
  if (status === "CANCELADA") return "gray" as const;
  return "blue" as const;
}
