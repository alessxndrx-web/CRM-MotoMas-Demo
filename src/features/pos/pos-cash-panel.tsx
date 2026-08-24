"use client";

import { ArrowDownLeft, ArrowUpRight, Lock, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Notice } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  closePosCashShiftAction,
  openPosCashShiftAction,
  registerPosCashMovementAction,
} from "@/server/pos/cash-actions";
import type { PosCashShiftDTO } from "@/server/pos/cash";

/**
 * Patch CB4-B — el cajón del mostrador.
 *
 * ## Ninguna cifra se calcula aquí
 *
 * El fondo, el efectivo de las ventas, las entradas, las salidas y el esperado
 * **llegan derivados del servidor** en `PosCashShiftDTO`. Lo único que esta
 * pantalla calcula es la diferencia mientras el cajero teclea lo contado, y es
 * una vista previa declarada como tal: **la diferencia que se guarda la calcula
 * el servidor** dentro de la transacción del cierre, contra su propio esperado.
 *
 * Es la misma razón por la que el carrito no manda totales al cobrar: una cifra
 * de dinero que nace en el navegador es una cifra que se puede manipular.
 *
 * ## Un turno cerrado no se recalcula
 *
 * Cuando el turno está cerrado, el DTO trae las columnas congeladas. La pantalla
 * las enseña tal cual; no vuelve a pedir el esperado ni lo recompone.
 */
export function PosCashPanel({
  shift,
  history,
}: {
  /** El turno abierto de este operador, o `null` si no tiene ninguno. */
  shift: PosCashShiftDTO | null;
  history: PosCashShiftDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openingFloat, setOpeningFloat] = useState("");
  const [movement, setMovement] = useState<"ENTRADA" | "SALIDA" | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [closing, setClosing] = useState(false);
  const [counted, setCounted] = useState("");

  /** Vista previa. La que cuenta la calcula el servidor al cerrar. */
  const previewDifference = useMemo(() => {
    if (!shift) return null;
    const value = Number(counted.trim().replace(",", "."));
    if (!counted.trim() || !Number.isFinite(value)) return null;
    return Math.round((value - shift.expectedCash) * 100) / 100;
  }, [counted, shift]);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la operación.");
        return;
      }
      setMovement(null);
      setClosing(false);
      setAmount("");
      setReason("");
      setCounted("");
      setOpeningFloat("");
      router.refresh();
    });
  }

  // --- Sin turno abierto ---------------------------------------------------
  if (!shift) {
    return (
      <div className="space-y-4">
        {error ? (
          <Notice tone="danger">
            <span data-testid="pos-caja-error">{error}</span>
          </Notice>
        ) : null}

        <Card className="p-6" data-testid="pos-caja-sin-turno">
          <div className="flex items-center gap-3">
            <Wallet aria-hidden className="h-6 w-6 text-slate-400" />
            <h2 className="text-lg font-bold text-slate-900">
              No hay turno abierto
            </h2>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Declara el efectivo con el que abres el cajón. Ese monto forma parte
            del efectivo esperado al cierre y{" "}
            <strong>no se puede cambiar después</strong>.
          </p>

          <div className="mt-5 max-w-xs">
            <Field hint="Puede ser 0 si abres sin cambio." label="Fondo inicial">
              <Input
                autoFocus
                className="h-12 text-lg"
                data-testid="pos-caja-fondo"
                inputMode="decimal"
                onChange={(event) => setOpeningFloat(event.target.value)}
                placeholder="0.00"
                value={openingFloat}
              />
            </Field>
          </div>

          <Button
            className="mt-5 h-12 px-8 text-base"
            data-testid="pos-caja-abrir"
            disabled={pending}
            onClick={() =>
              run(() =>
                openPosCashShiftAction({
                  openingFloat: Number(openingFloat.trim().replace(",", ".")),
                }),
              )
            }
          >
            Abrir turno
          </Button>
        </Card>

        <ShiftHistory history={history} />
      </div>
    );
  }

  // --- Turno abierto -------------------------------------------------------
  return (
    <div className="space-y-4">
      {error ? (
        <Notice tone="danger">
          <span data-testid="pos-caja-error">{error}</span>
        </Notice>
      ) : null}

      <Card className="p-5" data-testid="pos-caja-turno">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Badge tone="green">Turno abierto</Badge>
            <span className="text-sm text-slate-600">
              {shift.operatorUsername} · {shift.branchName}
            </span>
          </div>
          <span className="text-xs text-slate-500">
            Apertura {formatMoment(shift.openedAt)}
          </span>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Fondo inicial" testId="pos-caja-fondo-inicial" value={shift.openingFloat} />
          <Figure label="Ventas en efectivo" testId="pos-caja-ventas" value={shift.cashSales} />
          <Figure label="Entradas" testId="pos-caja-entradas" value={shift.cashIn} />
          <Figure label="Salidas" testId="pos-caja-salidas" value={shift.cashOut} />
        </dl>

        <div
          className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4"
          data-testid="pos-caja-esperado"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Efectivo esperado en el cajón
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
            {formatAmount(shift.expectedCash)}
          </p>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">Movimientos</h2>
          <div className="flex gap-2">
            <Button
              data-testid="pos-caja-nueva-entrada"
              onClick={() => setMovement("ENTRADA")}
              variant="secondary"
            >
              <ArrowDownLeft aria-hidden className="h-4 w-4" />
              Entrada
            </Button>
            <Button
              data-testid="pos-caja-nueva-salida"
              onClick={() => setMovement("SALIDA")}
              variant="secondary"
            >
              <ArrowUpRight aria-hidden className="h-4 w-4" />
              Salida
            </Button>
          </div>
        </div>

        {shift.movements.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">Movimientos manuales del turno</caption>
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 font-semibold" scope="col">Hora</th>
                  <th className="pb-2 font-semibold" scope="col">Tipo</th>
                  <th className="pb-2 font-semibold" scope="col">Motivo</th>
                  <th className="pb-2 text-right font-semibold" scope="col">Monto</th>
                  <th className="pb-2 font-semibold" scope="col">Operador</th>
                </tr>
              </thead>
              <tbody data-testid="pos-caja-movimientos">
                {shift.movements.map((item) => (
                  <tr
                    className="border-b border-slate-100"
                    data-testid="pos-caja-movimiento"
                    key={item.id}
                  >
                    <td className="py-2 text-xs text-slate-600">
                      {formatTime(item.createdAt)}
                    </td>
                    <td className="py-2">
                      <Badge tone={item.type === "ENTRADA" ? "green" : "amber"}>
                        {item.type === "ENTRADA" ? "Entrada" : "Salida"}
                      </Badge>
                    </td>
                    <td className="py-2 text-slate-700">{item.reason}</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-slate-900">
                      {item.type === "SALIDA" ? "−" : "+"}
                      {formatAmount(item.amount)}
                    </td>
                    <td className="py-2 text-xs text-slate-600">
                      {item.createdByName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Sin movimientos manuales en este turno.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-bold text-slate-900">Arqueo</h2>
        <p className="mt-1 text-sm text-slate-500">
          Cuenta el efectivo físico del cajón. Una diferencia{" "}
          <strong>no impide cerrar</strong>: se registra y queda para revisión.
        </p>
        <Button
          className="mt-4 h-12 px-8 text-base"
          data-testid="pos-caja-cerrar"
          onClick={() => setClosing(true)}
        >
          <Lock aria-hidden className="h-5 w-5" />
          Cerrar turno
        </Button>
      </Card>

      <ShiftHistory history={history} />

      {/* --- Entrada / salida --- */}
      <Drawer
        description={
          movement === "ENTRADA"
            ? "Dinero que entra al cajón y no viene de una venta."
            : "Dinero que sale del cajón."
        }
        footer={
          <>
            <Button onClick={() => setMovement(null)} variant="secondary">
              Cancelar
            </Button>
            <Button
              className="h-11 px-6"
              data-testid="pos-caja-guardar-movimiento"
              disabled={pending}
              onClick={() =>
                run(() =>
                  registerPosCashMovementAction({
                    shiftId: shift.id,
                    type: movement ?? "ENTRADA",
                    amount: Number(amount.trim().replace(",", ".")),
                    reason,
                  }),
                )
              }
            >
              Registrar
            </Button>
          </>
        }
        onClose={() => setMovement(null)}
        open={movement !== null}
        title={movement === "ENTRADA" ? "Entrada de efectivo" : "Salida de efectivo"}
      >
        <div className="space-y-4">
          <Field hint="Siempre positivo." label="Monto">
            <Input
              className="h-12 text-lg"
              data-testid="pos-caja-monto"
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              value={amount}
            />
          </Field>
          <Field hint="Obligatorio. Queda en la bitácora." label="Motivo">
            <Input
              data-testid="pos-caja-motivo"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Depósito al banco, cambio adicional…"
              value={reason}
            />
          </Field>
        </div>
      </Drawer>

      {/* --- Cierre --- */}
      <Drawer
        description="Lo contado no se recalcula después."
        footer={
          <>
            <Button onClick={() => setClosing(false)} variant="secondary">
              Cancelar
            </Button>
            <Button
              className="h-12 px-8 text-base"
              data-testid="pos-caja-confirmar-cierre"
              disabled={pending}
              onClick={() =>
                run(() =>
                  closePosCashShiftAction({
                    shiftId: shift.id,
                    countedCash: Number(counted.trim().replace(",", ".")),
                  }),
                )
              }
            >
              Confirmar cierre
            </Button>
          </>
        }
        onClose={() => setClosing(false)}
        open={closing}
        title="Cerrar turno"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Efectivo esperado
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {formatAmount(shift.expectedCash)}
            </p>
          </div>

          <Field hint="El efectivo físico que contaste." label="Efectivo contado">
            <Input
              className="h-12 text-lg"
              data-testid="pos-caja-contado"
              inputMode="decimal"
              onChange={(event) => setCounted(event.target.value)}
              placeholder="0.00"
              value={counted}
            />
          </Field>

          {previewDifference !== null ? (
            <p
              className={
                previewDifference === 0
                  ? "text-sm font-medium text-emerald-700"
                  : previewDifference > 0
                    ? "text-sm font-medium text-blue-700"
                    : "text-sm font-medium text-amber-700"
              }
              data-testid="pos-caja-diferencia-previa"
              role="status"
            >
              Diferencia prevista: {formatAmount(previewDifference)}
              {previewDifference === 0
                ? " · cuadra"
                : previewDifference > 0
                  ? " · sobrante"
                  : " · faltante"}
            </p>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}

/** Turnos cerrados: lo que quedó registrado, sin recalcular. */
function ShiftHistory({ history }: { history: PosCashShiftDTO[] }) {
  const closed = history.filter((item) => item.status === "CERRADO");
  if (!closed.length) return null;
  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-slate-900">Turnos cerrados</h2>
      <div className="mt-3 space-y-2" data-testid="pos-caja-historial">
        {closed.map((item) => (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
            data-testid="pos-caja-historial-turno"
            key={item.id}
          >
            <span className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>{formatMoment(item.closedAt ?? item.openedAt)}</span>
              <span className="text-slate-400">·</span>
              <span>{item.operatorUsername}</span>
              {item.reviewedAt ? (
                <Badge tone="blue">Revisado</Badge>
              ) : (
                <Badge tone="slate">Sin revisar</Badge>
              )}
            </span>
            <span className="text-sm tabular-nums text-slate-700">
              Esperado {formatAmount(item.expectedCash)} · Contado{" "}
              {formatAmount(item.countedCash ?? 0)} ·{" "}
              <strong
                className={
                  (item.difference ?? 0) === 0
                    ? "text-emerald-700"
                    : (item.difference ?? 0) > 0
                      ? "text-blue-700"
                      : "text-amber-700"
                }
              >
                {formatAmount(item.difference ?? 0)}
              </strong>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Figure({
  label,
  value,
  testId,
}: {
  label: string;
  value: number;
  testId: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3" data-testid={testId}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900">
        {formatAmount(value)}
      </dd>
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

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("es-NI", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
