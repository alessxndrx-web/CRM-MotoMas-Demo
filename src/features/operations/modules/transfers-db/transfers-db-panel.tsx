"use client";

import { useRouter } from "next/navigation";
import { Database, Truck } from "lucide-react";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  approveTransfer,
  cancelTransfer,
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
} from "@/server/operations/actions";
import type { TransferDTO, TransferStatusValue } from "@/server/operations/shared";
import type { InventoryUnitDTO } from "@/server/inventory/shared";

/**
 * Database-backed transfers section for `/panel/traslados`. Additive to the
 * existing localStorage-driven `TransfersPanel` below it (same pattern as
 * Patch 3.1C/3.2C).
 */

export function TransfersDbPanel({
  branches,
  canApprove,
  canRequest,
  dbConfigured,
  scopeLabel,
  transfers,
  units,
}: {
  branches: { code: string; name: string }[];
  canApprove: boolean;
  canRequest: boolean;
  dbConfigured: boolean;
  scopeLabel: string;
  transfers: TransferDTO[];
  units: InventoryUnitDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const availableUnits = units.filter((unit) => unit.status === "AVAILABLE");

  function runAction(
    transferId: string,
    action: (input: { transferId: string }) => Promise<{ ok: boolean; error?: string }>,
  ) {
    setError("");
    setPendingId(transferId);
    startTransition(async () => {
      const result = await action({ transferId });
      if (!result.ok && result.error) setError(result.error);
      setPendingId(null);
      router.refresh();
    });
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const motorcycleUnitId = String(form.get("motorcycleUnitId") ?? "");
    const destinationBranchCode = String(form.get("destinationBranchCode") ?? "");
    const reason = String(form.get("reason") ?? "");

    if (!motorcycleUnitId || !destinationBranchCode || !reason.trim()) {
      setError("Completa unidad, sucursal destino y motivo.");
      return;
    }

    startTransition(async () => {
      const result = await createTransfer({
        motorcycleUnitId,
        destinationBranchCode,
        reason,
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
          <Badge tone="green">Traslados · Base de datos (fuente principal)</Badge>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
            {scopeLabel}
          </span>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
          <Database className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-500">
        Traslados respaldados por PostgreSQL. Esta es la fuente principal para
        traslados nuevos. El panel local previo sigue disponible debajo mientras
        se completa su migración.
      </p>

      {!dbConfigured ? (
        <div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100/90">
          Esta sección requiere <code>DATABASE_URL</code> configurado.
        </div>
      ) : (
        <>
          {canRequest ? (
            <div className="mt-5">
              <Button onClick={() => setShowForm((value) => !value)} variant="secondary">
                <Truck className="h-4 w-4" />
                {showForm ? "Ocultar formulario" : "Nuevo traslado"}
              </Button>
              {showForm ? (
                <form className="mt-4 grid gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5" onSubmit={submitCreate}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Unidad disponible (origen)">
                      <select className={selectClass} name="motorcycleUnitId" required>
                        <option value="">Selecciona una unidad</option>
                        {availableUnits.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name} · {unit.chassisNumber} · {unit.branchName}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Sucursal destino">
                      <select className={selectClass} name="destinationBranchCode" required>
                        <option value="">Selecciona sucursal destino</option>
                        {branches.map((branch) => (
                          <option key={branch.code} value={branch.code}>
                            {branch.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="Motivo">
                    <textarea
                      className="min-h-[80px] w-full rounded-xl border border-white/10 bg-white/[0.055] px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15"
                      name="reason"
                      placeholder="Motivo del traslado"
                      required
                    />
                  </Field>
                  <Button disabled={pending} type="submit">
                    Solicitar traslado
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
            <div className="hidden grid-cols-[1.1fr_1fr_1fr_1fr_1.4fr] border-b border-white/10 bg-white/[0.03] px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-zinc-500 lg:grid">
              <div>Unidad</div>
              <div>Origen</div>
              <div>Destino</div>
              <div>Estado</div>
              <div>Acciones</div>
            </div>

            {transfers.length ? (
              transfers.map((transfer) => {
                const rowPending = pending && pendingId === transfer.id;
                return (
                  <div
                    className="grid gap-2 border-b border-white/7 px-5 py-4 last:border-b-0 lg:grid-cols-[1.1fr_1fr_1fr_1fr_1.4fr] lg:items-center"
                    key={transfer.id}
                  >
                    <div>
                      <div className="font-black text-white">{transfer.unitName}</div>
                      <div className="mt-1 text-xs text-zinc-500">{transfer.chassisNumber}</div>
                    </div>
                    <div className="text-sm text-zinc-400">{transfer.originBranchName}</div>
                    <div className="text-sm text-zinc-400">{transfer.destinationBranchName}</div>
                    <div>
                      <Badge tone={statusTone(transfer.status)}>{transfer.statusLabel}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canApprove && transfer.status === "PENDIENTE" ? (
                        <Button
                          disabled={rowPending}
                          onClick={() => runAction(transfer.id, approveTransfer)}
                          size="sm"
                          variant="secondary"
                        >
                          Aprobar
                        </Button>
                      ) : null}
                      {canApprove && transfer.status === "APROBADO" ? (
                        <Button
                          disabled={rowPending}
                          onClick={() => runAction(transfer.id, dispatchTransfer)}
                          size="sm"
                          variant="secondary"
                        >
                          Despachar
                        </Button>
                      ) : null}
                      {canApprove && transfer.status === "EN_TRANSITO" ? (
                        <Button
                          disabled={rowPending}
                          onClick={() => runAction(transfer.id, receiveTransfer)}
                          size="sm"
                          variant="success"
                        >
                          Recibir
                        </Button>
                      ) : null}
                      {canApprove &&
                      transfer.status !== "RECIBIDO" &&
                      transfer.status !== "CANCELADO" ? (
                        <Button
                          disabled={rowPending}
                          onClick={() => runAction(transfer.id, cancelTransfer)}
                          size="sm"
                          variant="danger"
                        >
                          Cancelar
                        </Button>
                      ) : null}
                      {!canApprove ? <span className="text-xs text-zinc-600">—</span> : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-sm text-zinc-500">
                Aún no hay traslados en la base de datos para este alcance.
              </div>
            )}
          </div>
        </>
      )}

      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm font-semibold text-red-200">
          {error}
        </div>
      ) : null}
    </Card>
  );
}

const selectClass =
  "h-11 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm font-semibold text-zinc-100 outline-none transition focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function statusTone(status: TransferStatusValue) {
  if (status === "RECIBIDO") return "green" as const;
  if (status === "CANCELADO") return "gray" as const;
  if (status === "PENDIENTE") return "red" as const;
  return "blue" as const;
}
