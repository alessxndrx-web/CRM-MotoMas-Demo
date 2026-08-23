import { notFound } from "next/navigation";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { PageHeader } from "@/components/ui/page-header";
import { PosTerminalHeader } from "@/features/pos/pos-terminal-header";
import { requirePosSession } from "@/server/pos/auth";
import { getPosCustomer, listPosSales } from "@/server/pos/queries";

export const dynamic = "force-dynamic";

/**
 * Patch POS7.0-C — la ficha de un cliente y sus compras **en este mostrador**.
 *
 * ## Dos alcances, no uno
 *
 * `getPosCustomer` exige que el cliente sea de la sucursal de la sesión, y
 * `listPosSales` vuelve a acotar las ventas por esa misma sucursal. Podría
 * parecer redundante y no lo es: sin el primero, un id ajeno confirmaría que el
 * cliente existe; sin el segundo, la ficha de un cliente propio enseñaría lo que
 * compró en **otras** sucursales, que es historial que este mostrador no tiene
 * por qué leer.
 *
 * El historial es, por tanto, «lo que este cliente compró aquí» — y la pantalla
 * lo dice con esas palabras, porque llamarlo «historial de compras» a secas
 * sugeriría que es todo lo que compró en la empresa.
 */
export default async function PosClienteDetallePage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const session = await requirePosSession();
  const customer = await getPosCustomer(customerId, session.branchCode);
  if (!customer) notFound();

  const sales = await listPosSales({
    branchCode: session.branchCode,
    customerId: customer.id,
  });
  const spent = sales
    .filter((sale) => sale.status === "COMPLETADA")
    .reduce((total, sale) => total + sale.total, 0);

  return (
    <>
      <PosTerminalHeader
        branchName={session.branchName}
        username={session.username}
      />
      <main className="mx-auto max-w-[900px] space-y-6 px-4 py-6 sm:px-6">
        <PageHeader
          breadcrumbs={[
            { label: "Clientes", href: "/pos/clientes" },
            { label: customer.name },
          ]}
          eyebrow="Cliente"
          title={customer.name}
        />

        <Card className="p-5" data-testid="pos-cliente-detalle">
          <DetailList
            items={[
              { label: "Teléfono", value: customer.phone ?? "—" },
              { label: "Cédula", value: customer.cedula ?? "—" },
              { label: "Correo", value: customer.email ?? "—", wide: true },
            ]}
          />
        </Card>

        <Card className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">
              Compras en este mostrador
            </h2>
            <span className="text-sm text-slate-600" data-testid="pos-cliente-total">
              {sales.length} venta{sales.length === 1 ? "" : "s"} ·{" "}
              <strong className="tabular-nums">{formatAmount(spent)}</strong>
            </span>
          </div>

          {sales.length ? (
            <div className="mt-4 space-y-2" data-testid="pos-cliente-ventas">
              {sales.map((sale) => (
                <Link
                  className="sb-focus flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 transition-colors hover:border-blue-300 hover:bg-blue-50/30"
                  data-testid="pos-cliente-venta"
                  href={`/pos/ventas/${sale.id}`}
                  key={sale.id}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={sale.status === "COMPLETADA" ? "green" : "slate"}>
                      {sale.statusLabel}
                    </Badge>
                    <span className="font-mono text-xs text-slate-600">
                      {sale.saleNumber}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatMoment(sale.completedAt ?? sale.createdAt)}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {formatAmount(sale.total)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Este cliente todavía no ha comprado en este mostrador.
            </p>
          )}
        </Card>
      </main>
    </>
  );
}

function formatMoment(iso: string) {
  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
