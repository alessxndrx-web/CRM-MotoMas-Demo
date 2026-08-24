"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Wallet } from "lucide-react";
import { reviewPosCashShiftAction } from "@/server/pos/cash-actions";
import type { PosCashShiftDTO } from "@/server/pos/cash";

/**
 * Patch CB4-B — la revisión del arqueo del mostrador.
 *
 * **Contar y aprobar son actos distintos.** El cajero cuenta el cajón desde
 * `/pos/caja`; aquí un supervisor mira la cuenta ya cerrada. Es la misma
 * separación que Caja establece con `canReviewCaja` —«nunca acción de cajero»—,
 * reutilizada sin cambiarle el significado.
 *
 * **No se recalcula nada.** Las cifras llegan congeladas del turno cerrado. Si
 * esta pantalla las volviera a derivar, una venta posterior cambiaría una
 * diferencia que el supervisor ya vio, que es exactamente lo que
 * `CashClosing.expected*` documenta que no debe ocurrir.
 */
export function PosCashReviewPanel({ shifts }: { shifts: PosCashShiftDTO[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<PosCashShiftDTO | null>(null);
  const [notes, setNotes] = useState("");

  function review() {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const result = await reviewPosCashShiftAction({
        shiftId: target.id,
        notes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTarget(null);
      setNotes("");
      router.refresh();
    });
  }

  if (!shifts.length) {
    return (
      <EmptyState
        description="Cuando un cajero cierre su turno, el arqueo aparecerá aquí."
        icon={Wallet}
        title="No hay turnos cerrados"
      />
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Notice tone="danger">
          <span data-testid="pos-arqueo-error">{error}</span>
        </Notice>
      ) : null}

      <div className="space-y-3" data-testid="pos-arqueos">
        {shifts.map((shift) => (
          <Card className="p-5" data-testid="pos-arqueo" key={shift.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {shift.reviewedAt ? (
                  <Badge tone="blue">Revisado</Badge>
                ) : (
                  <Badge tone="amber">Sin revisar</Badge>
                )}
                <span className="text-sm font-semibold text-slate-900">
                  {shift.operatorUsername}
                </span>
                <span className="text-xs text-slate-500">{shift.branchName}</span>
              </div>
              <span className="text-xs text-slate-500">
                Cerrado {formatMoment(shift.closedAt ?? shift.openedAt)}
              </span>
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
              <Figure label="Fondo" value={shift.openingFloat} />
              <Figure label="Ventas efectivo" value={shift.cashSales} />
              <Figure label="Entradas" value={shift.cashIn} />
              <Figure label="Salidas" value={shift.cashOut} />
            </dl>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <span className="text-sm tabular-nums text-slate-700">
                Esperado <strong>{formatAmount(shift.expectedCash)}</strong> ·
                Contado <strong>{formatAmount(shift.countedCash ?? 0)}</strong> ·
                Diferencia{" "}
                <strong
                  className={
                    (shift.difference ?? 0) === 0
                      ? "text-emerald-700"
                      : (shift.difference ?? 0) > 0
                        ? "text-blue-700"
                        : "text-amber-700"
                  }
                  data-testid="pos-arqueo-diferencia"
                >
                  {formatAmount(shift.difference ?? 0)}
                </strong>
              </span>

              {shift.reviewedAt ? (
                <span className="text-xs text-slate-500">
                  {shift.reviewedByName} · {formatMoment(shift.reviewedAt)}
                  {shift.reviewNotes ? ` · ${shift.reviewNotes}` : ""}
                </span>
              ) : (
                <Button
                  data-testid="pos-arqueo-revisar"
                  onClick={() => setTarget(shift)}
                  size="sm"
                >
                  Revisar arqueo
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Drawer
        description="La revisión anota; no cambia las cifras del turno."
        footer={
          <>
            <Button onClick={() => setTarget(null)} variant="secondary">
              Cancelar
            </Button>
            <Button
              data-testid="pos-arqueo-confirmar"
              disabled={pending}
              onClick={review}
            >
              Registrar revisión
            </Button>
          </>
        }
        onClose={() => setTarget(null)}
        open={target !== null}
        title="Revisar arqueo"
      >
        {target ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Turno de <strong>{target.operatorUsername}</strong> en{" "}
              {target.branchName}, con diferencia de{" "}
              <strong>{formatAmount(target.difference ?? 0)}</strong>.
            </p>
            <Field hint="Opcional." label="Observaciones">
              <Input
                data-testid="pos-arqueo-notas"
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </Field>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 tabular-nums text-slate-800">{formatAmount(value)}</dd>
    </div>
  );
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatMoment(iso: string) {
  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
