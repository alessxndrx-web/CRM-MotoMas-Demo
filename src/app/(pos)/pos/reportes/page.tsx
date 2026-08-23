import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { PosTerminalHeader } from "@/features/pos/pos-terminal-header";
import { requirePosSession } from "@/server/pos/auth";
import { getPosCounterReport } from "@/server/pos/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Patch POS7.0-B — el informe operativo del mostrador.
 *
 * ## Es un informe de turno, no un tablero
 *
 * Responde a lo que un cajero pregunta al cerrar: cuánto vendí, cuántas ventas,
 * en qué formas de pago y qué se movió. **No hay gráficas, ni comparativas, ni
 * tendencias**: eso es análisis y vive en el panel, con la sesión y el alcance
 * que el análisis necesita.
 *
 * ## El alcance no se elige
 *
 * Es la sucursal de la sesión, siempre. No hay selector, no hay parámetro y no
 * hay forma de pedir la de otro mostrador: el único parámetro de la URL es el
 * periodo, y un periodo no cruza sucursales.
 *
 * ## Efectivo y tarjeta se enseñan como se registraron
 *
 * `byMethod` suma `PosPayment.amount` por método. **No afirma cuánto hay en el
 * cajón**: eso exigiría fondo inicial, entradas, salidas y arqueo, que es CB4 y
 * sigue sin decidirse. La pantalla lo dice en vez de dejar que se confunda un
 * total de ventas en efectivo con un saldo de caja.
 */
const PERIODS = [
  { id: "hoy", label: "Hoy", days: 0 },
  { id: "7d", label: "7 días", days: 6 },
  { id: "30d", label: "30 días", days: 29 },
] as const;

function resolvePeriod(value: string | undefined) {
  return PERIODS.find((period) => period.id === value) ?? PERIODS[0];
}

export default async function PosReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo } = await searchParams;
  const session = await requirePosSession();
  const period = resolvePeriod(periodo);

  // El día del mostrador, no un día UTC: se corta a medianoche local del
  // servidor, que es la zona en la que el turno se abre y se cierra.
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - period.days);
  from.setHours(0, 0, 0, 0);

  const report = await getPosCounterReport({
    branchCode: session.branchCode,
    from,
    to,
  });

  return (
    <>
      <PosTerminalHeader
        branchName={session.branchName}
        username={session.username}
      />
      <main className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-6">
        <PageHeader
          description={`Ventas completadas en ${session.branchName}. El alcance es esta sucursal y no se puede cambiar.`}
          eyebrow="Mostrador"
          title="Reportes"
        />

        <div className="flex flex-wrap gap-2" data-testid="pos-reportes-periodos">
          {PERIODS.map((option) => (
            <Link
              aria-current={option.id === period.id ? "page" : undefined}
              className={cn(
                "sb-focus flex h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                option.id === period.id
                  ? "border-blue-600 bg-blue-600 font-semibold text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
              )}
              data-testid={`pos-reportes-periodo-${option.id}`}
              href={`/pos/reportes?periodo=${option.id}`}
              key={option.id}
            >
              {option.label}
            </Link>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3" data-testid="pos-reportes-resumen">
          <Metric
            label="Vendido"
            testId="pos-reporte-total"
            value={formatAmount(report.salesTotal)}
          />
          <Metric
            label="Ventas"
            testId="pos-reporte-conteo"
            value={String(report.salesCount)}
          />
          <Metric
            label="Ticket promedio"
            testId="pos-reporte-promedio"
            value={report.salesCount ? formatAmount(report.averageTicket) : "—"}
          />
        </div>

        <Card className="p-5">
          <h2 className="text-base font-bold text-slate-900">Por forma de pago</h2>
          {report.byMethod.length ? (
            <div className="mt-3 space-y-2" data-testid="pos-reporte-metodos">
              {report.byMethod.map((row) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                  data-testid="pos-reporte-metodo"
                  key={row.method}
                >
                  <span className="text-sm text-slate-700">{row.label}</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {formatAmount(row.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              No se registraron pagos en este periodo.
            </p>
          )}
          <Notice className="mt-4" tone="info">
            <span data-testid="pos-reporte-aviso-caja">
              Esto es <strong>lo cobrado</strong>, no lo que hay en el cajón. El
              mostrador todavía no lleva fondo inicial, entradas, salidas ni
              arqueo, así que ninguna cifra de aquí puede leerse como un saldo de
              caja.
            </span>
          </Notice>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-bold text-slate-900">
            Artículos más vendidos
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {/* Explicar por qué no hay un «total de unidades» evita que alguien
                lo eche en falta y lo añada. */}
            La cantidad va por artículo: sumar litros con piezas no daría ninguna
            magnitud real.
          </p>
          {report.topProducts.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <caption className="sr-only">Artículos más vendidos</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 font-semibold" scope="col">
                      Artículo
                    </th>
                    <th className="pb-2 text-right font-semibold" scope="col">
                      Cantidad
                    </th>
                    <th className="pb-2 text-right font-semibold" scope="col">
                      Importe
                    </th>
                  </tr>
                </thead>
                <tbody data-testid="pos-reporte-articulos">
                  {report.topProducts.map((row) => (
                    <tr
                      className="border-b border-slate-100"
                      data-testid="pos-reporte-articulo"
                      key={`${row.sku}-${row.name}`}
                    >
                      <td className="py-2">
                        <span className="font-mono text-xs text-slate-500">
                          {row.sku}
                        </span>
                        <span className="ml-2 text-slate-900">{row.name}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-700">
                        {formatQuantity(row.quantity)}
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums text-slate-900">
                        {formatAmount(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Todavía no se vendió nada en este periodo.
            </p>
          )}
        </Card>
      </main>
    </>
  );
}

function Metric({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <Card className="p-4" data-testid={testId}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </Card>
  );
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-NI", { maximumFractionDigits: 3 }).format(value);
}
