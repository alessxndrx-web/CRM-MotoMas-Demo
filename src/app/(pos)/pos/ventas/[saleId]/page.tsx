import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PosReprintButton } from "@/features/pos/pos-reprint-button";
import { PosSaleReturnPanel } from "@/features/pos/pos-sale-return-panel";
import { PosTerminalHeader } from "@/features/pos/pos-terminal-header";
import { requirePosSession } from "@/server/pos/auth";
import {
  getPosSaleDetail,
  getPosSaleReturnState,
  listPosWarehouses,
} from "@/server/pos/queries";

export const dynamic = "force-dynamic";

/**
 * Patch POS6.0-C — el detalle de una venta del mostrador.
 *
 * ## La sucursal se comprueba aquí, no se confía
 *
 * `getPosSaleDetail` toma un id y **no filtra por sucursal**: es una lectura de
 * la capa de consultas y no conoce quién pregunta. Esta página sí, así que
 * compara la sucursal de la venta con la de la sesión y responde `notFound` si
 * no coinciden. Un id ajeno no revela ni que existe.
 *
 * Es el mismo criterio que ya aplica `receipt-actions.ts` antes de construir un
 * recibo, y por la misma razón: el id de una venta no es un secreto.
 *
 * ## Las líneas se leen de la instantánea
 *
 * `productName` y `productSku` son los que se vendieron, no los que el catálogo
 * diga hoy. Renombrar un artículo no reescribe una venta pasada.
 */
export default async function PosVentaDetallePage({
  params,
}: {
  params: Promise<{ saleId: string }>;
}) {
  const { saleId } = await params;
  const session = await requirePosSession();
  const sale = await getPosSaleDetail(saleId);

  if (!sale || sale.branchCode !== session.branchCode) notFound();

  // Patch DEV-A — el estado de devolución, **derivado** de las devoluciones
  // hechas contra esta venta. No hay columna de estado que pueda desincronizarse.
  const [returnState, warehouses] = await Promise.all([
    getPosSaleReturnState(sale.id),
    listPosWarehouses({ branchCode: session.branchCode }),
  ]);

  return (
    <>
      <PosTerminalHeader
        branchName={session.branchName}
        username={session.username}
      />
      <main className="mx-auto max-w-[1000px] space-y-6 px-4 py-6 sm:px-6">
        <PageHeader
          breadcrumbs={[
            { label: "Ventas", href: "/pos/ventas" },
            { label: sale.saleNumber },
          ]}
          description={`${sale.cashierName} · ${formatMoment(sale.completedAt ?? sale.createdAt)}`}
          eyebrow="Venta"
          title={sale.saleNumber}
        />

        <Card className="p-5" data-testid="pos-venta-detalle">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={sale.status === "COMPLETADA" ? "green" : "slate"}>
                {sale.statusLabel}
              </Badge>
              <span className="text-sm text-slate-600">
                {sale.customerName ?? "Mostrador"}
              </span>
            </div>
            <span className="text-2xl font-bold tabular-nums text-slate-900">
              {formatAmount(sale.total)}
            </span>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">Artículos de la venta</caption>
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 font-semibold" scope="col">
                    Artículo
                  </th>
                  <th className="pb-2 text-right font-semibold" scope="col">
                    Cant.
                  </th>
                  <th className="pb-2 text-right font-semibold" scope="col">
                    Precio
                  </th>
                  <th className="pb-2 text-right font-semibold" scope="col">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item) => (
                  <tr className="border-b border-slate-100" key={item.id}>
                    <td className="py-2">
                      <span className="font-mono text-xs text-slate-500">
                        {item.productSku}
                      </span>
                      <span className="ml-2 text-slate-900">{item.productName}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-700">
                      {item.quantity}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-700">
                      {formatAmount(item.unitPrice)}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums text-slate-900">
                      {formatAmount(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="mt-5 grid gap-2 border-t border-slate-200 pt-4 text-sm sm:max-w-xs sm:justify-self-end">
            <Row label="Subtotal" value={formatAmount(sale.subtotal)} />
            <Row label="Descuento" value={formatAmount(sale.discount)} />
            <Row label="Impuesto" value={formatAmount(sale.tax)} />
            <Row emphasis label="Total" value={formatAmount(sale.total)} />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Pagos</h2>
          <div className="mt-3 space-y-2">
            {sale.payments.map((payment) => (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                key={payment.id}
              >
                <span className="text-sm text-slate-700">{payment.methodLabel}</span>
                <span className="text-sm font-semibold tabular-nums text-slate-900">
                  {formatAmount(payment.amount)}
                </span>
              </div>
            ))}
            {sale.payments.length ? null : (
              <p className="text-sm text-slate-500">
                Esta venta se registró sin pagos asignados.
              </p>
            )}
          </div>
          {/*
            El saldo se dice tal cual, sin bautizarlo. **P-1 sigue abierta**: que
            el mostrador cobrase de más o de menos es un hecho registrado, no un
            «vuelto» que nadie modeló.
          */}
          <p className="mt-3 text-sm tabular-nums text-slate-600">
            Pagado {formatAmount(sale.paidTotal)} · Saldo{" "}
            {formatAmount(sale.balance)}
          </p>
        </Card>

        {sale.notes ? (
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">Notas</h2>
            <p className="mt-2 text-sm text-slate-700">{sale.notes}</p>
          </Card>
        ) : null}

        <PosSaleReturnPanel
          sale={sale}
          state={returnState}
          warehouses={warehouses}
        />

        <PosReprintButton saleId={sale.id} />
      </main>
    </>
  );
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={
          emphasis
            ? "text-base font-bold tabular-nums text-slate-900"
            : "tabular-nums text-slate-700"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function formatMoment(iso: string) {
  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
