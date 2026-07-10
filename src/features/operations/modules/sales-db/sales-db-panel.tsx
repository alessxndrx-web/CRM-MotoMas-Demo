"use client";

import { useRouter } from "next/navigation";
import { BadgeCheck, Database } from "lucide-react";
import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import { createSale, markSaleDelivered } from "@/server/operations/actions";
import {
  saleTypeLabels,
  saleTypeValues,
  type SaleDTO,
  type SaleStatusValue,
} from "@/server/operations/shared";
import type { ReservationDTO } from "@/server/operations/shared";
import type { CustomerDTO, CustomerFileDTO } from "@/server/crm/shared";
import type { InventoryUnitDTO } from "@/server/inventory/shared";

/**
 * Database-backed sales section for `/panel/ventas`. Additive to the existing
 * localStorage-driven `SalesPanel` below it (same pattern as Patch 3.1C/3.2C):
 * it does not touch Caja or the existing localStorage sale records.
 */

export function SalesDbPanel({
  activeReservations,
  canManage,
  customers,
  dbConfigured,
  files,
  sales,
  scopeLabel,
  units,
}: {
  activeReservations: ReservationDTO[];
  canManage: boolean;
  customers: CustomerDTO[];
  dbConfigured: boolean;
  files: CustomerFileDTO[];
  sales: SaleDTO[];
  scopeLabel: string;
  units: InventoryUnitDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [reservationId, setReservationId] = useState("");

  const availableUnits = units.filter((unit) => unit.status === "AVAILABLE");
  const selectedReservation = useMemo(
    () => activeReservations.find((reservation) => reservation.id === reservationId) ?? null,
    [activeReservations, reservationId],
  );

  function deliver(saleId: string) {
    setError("");
    setPendingId(saleId);
    startTransition(async () => {
      const result = await markSaleDelivered({ saleId });
      if (!result.ok) setError(result.error);
      setPendingId(null);
      router.refresh();
    });
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const type = String(form.get("type") ?? "CONTADO");
    const notes = String(form.get("notes") ?? "") || null;

    const customerId = selectedReservation
      ? selectedReservation.customerId
      : String(form.get("customerId") ?? "");
    const motorcycleUnitId = selectedReservation
      ? selectedReservation.motorcycleUnitId
      : String(form.get("motorcycleUnitId") ?? "");
    const customerFileId = selectedReservation
      ? selectedReservation.customerFileId
      : String(form.get("customerFileId") ?? "") || null;

    if (!customerId || !motorcycleUnitId) {
      setError("Selecciona una reserva activa o un cliente y una unidad.");
      return;
    }

    startTransition(async () => {
      const result = await createSale({
        customerId,
        motorcycleUnitId,
        type,
        customerFileId,
        reservationId: reservationId || null,
        notes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShowForm(false);
      setReservationId("");
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PrimarySectionBadge
            businessLabel="Ventas · Registros"
            technicalLabel="Ventas · Base de datos (fuente principal)"
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
        businessText="Ventas registradas por el equipo comercial. El panel local previo sigue disponible debajo. Caja no forma parte de esta sección."
        technicalText="Ventas respaldadas por PostgreSQL. Esta es la fuente principal para
        ventas nuevas. El panel local previo sigue disponible debajo mientras
        se completa su migración. Caja no forma parte de esta sección."
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
                <BadgeCheck className="h-4 w-4" />
                {showForm ? "Ocultar formulario" : "Nueva venta"}
              </Button>
              {showForm ? (
                <form className="mt-4 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5" onSubmit={submitCreate}>
                  <Field label="Desde reserva activa (opcional)">
                    <select
                      className={selectClass}
                      onChange={(event) => setReservationId(event.target.value)}
                      value={reservationId}
                    >
                      <option value="">Venta directa (sin reserva)</option>
                      {activeReservations.map((reservation) => (
                        <option key={reservation.id} value={reservation.id}>
                          {reservation.reservationNumber} · {reservation.customerName} · {reservation.unitName}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {!selectedReservation ? (
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
                  ) : null}

                  {!selectedReservation ? (
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
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                      Unidad: {selectedReservation.unitName} ({selectedReservation.chassisNumber})
                    </div>
                  )}

                  <Field label="Tipo de venta">
                    <select className={selectClass} name="type">
                      {saleTypeValues.map((value) => (
                        <option key={value} value={value}>
                          {saleTypeLabels[value]}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Notas (opcional)">
                    <textarea
                      className="min-h-[80px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      name="notes"
                      placeholder="Contexto de la venta"
                    />
                  </Field>

                  <Button disabled={pending} type="submit">
                    Registrar venta
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
              <div>Tipo</div>
              <div>Estado</div>
              <div>Acción</div>
            </div>

            {sales.length ? (
              sales.map((sale) => {
                const rowPending = pending && pendingId === sale.id;
                return (
                  <div
                    className="grid gap-2 border-b border-slate-100 px-5 py-4 last:border-b-0 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr] lg:items-center"
                    key={sale.id}
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{sale.customerName}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {sale.reservationNumber ?? "Sin reserva"}
                      </div>
                    </div>
                    <div className="text-sm text-slate-500">
                      {sale.unitName}
                      <div className="text-xs text-slate-400">{sale.chassisNumber}</div>
                    </div>
                    <div className="text-sm text-slate-500">{sale.branchName}</div>
                    <div className="text-sm text-slate-500">{sale.typeLabel}</div>
                    <div>
                      <Badge tone={statusTone(sale.status)}>{sale.statusLabel}</Badge>
                    </div>
                    <div>
                      {canManage && sale.status === "COMPLETADA" ? (
                        <Button
                          disabled={rowPending}
                          onClick={() => deliver(sale.id)}
                          size="sm"
                          variant="success"
                        >
                          Marcar entregada
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
                Aún no hay ventas para este alcance. Cuando se complete una
                venta, aparecerá aquí.
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

function statusTone(status: SaleStatusValue) {
  if (status === "ENTREGADA") return "green" as const;
  return "blue" as const;
}
