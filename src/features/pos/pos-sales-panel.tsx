"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/feedback";
import type { PosSaleDTO } from "@/server/pos/shared";

/**
 * Patch POS6.0-C — el historial de ventas del mostrador.
 *
 * ## Lo que esta pantalla **no** hace
 *
 * No anula y no devuelve. No es un olvido: el repositorio no tiene ninguna
 * acción que revierta una `PosSale` —P-4 sigue abierta— y una anulación honesta
 * tendría que devolver existencias, revertir pagos y decidir qué pasa con el
 * recibo ya impreso. Dibujar los botones sin eso sería prometer una operación
 * que al pulsarla no ocurre, que es peor que no ofrecerla. La pantalla lo dice
 * en voz alta en vez de esconderlo.
 *
 * ## El filtro es sobre lo que ya se trajo
 *
 * La consulta devuelve las últimas ventas de **esta** sucursal, y el buscador
 * las filtra en el navegador. Por eso el encabezado dice cuántas hay: un campo
 * de búsqueda que solo alcanza las últimas N y no lo advierte haría creer que
 * una venta antigua no existe.
 */
export function PosSalesPanel({ sales }: { sales: PosSaleDTO[] }) {
  const router = useRouter();
  const [term, setTerm] = useState("");

  const filtered = useMemo(() => {
    const clean = term.trim().toLowerCase();
    if (!clean) return sales;
    return sales.filter(
      (sale) =>
        sale.saleNumber.toLowerCase().includes(clean) ||
        (sale.customerName?.toLowerCase().includes(clean) ?? false),
    );
  }, [sales, term]);

  const columns: Array<DataTableColumn<PosSaleDTO>> = [
    {
      id: "sale",
      header: "Venta",
      cell: (sale) => (
        <span className="font-mono text-xs text-slate-700">{sale.saleNumber}</span>
      ),
    },
    {
      id: "when",
      header: "Fecha",
      hideOnMobile: true,
      cell: (sale) => (
        <span className="text-xs text-slate-600">
          {formatMoment(sale.completedAt ?? sale.createdAt)}
        </span>
      ),
    },
    {
      id: "customer",
      header: "Cliente",
      cell: (sale) => (
        <span className="text-sm text-slate-700">
          {/* Sin cliente es lo normal en un mostrador, y se dice así. */}
          {sale.customerName ?? "Mostrador"}
        </span>
      ),
    },
    {
      id: "cashier",
      header: "Operador",
      hideOnMobile: true,
      cell: (sale) => (
        <span className="text-xs text-slate-600">{sale.cashierName}</span>
      ),
    },
    {
      id: "status",
      header: "Estado",
      width: "8rem",
      cell: (sale) => (
        <Badge tone={sale.status === "COMPLETADA" ? "green" : "slate"}>
          {sale.statusLabel}
        </Badge>
      ),
    },
    {
      id: "total",
      header: "Total",
      numeric: true,
      cell: (sale) => (
        <span className="font-semibold text-slate-900">
          {formatAmount(sale.total)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <Field
              hint={`Número de venta o cliente, sobre las ${sales.length} más recientes.`}
              label="Buscar venta"
            >
              <Input
                onChange={(event) => setTerm(event.target.value)}
                placeholder="POS-000123 o nombre"
                value={term}
              />
            </Field>
          </div>
          <span className="pb-2 text-sm text-slate-500">
            <Search aria-hidden className="mr-1 inline h-4 w-4" />
            {filtered.length} de {sales.length}
          </span>
        </div>
      </Card>

      <Card className="p-0">
        <DataTable
          caption="Ventas recientes de esta sucursal"
          columns={columns}
          emptyMessage="Todavía no hay ventas registradas en esta sucursal."
          onRowClick={(sale) => router.push(`/pos/ventas/${sale.id}`)}
          rowKey={(sale) => sale.id}
          rows={filtered}
        />
      </Card>

      <Notice tone="info">
        <span data-testid="pos-ventas-limites">
          Desde aquí se consulta y se reimprime. <strong>Anular y devolver no
          están disponibles</strong>, y conviene saber exactamente qué falta:
          ninguna acción escribe <code>ANULADA</code> sobre una venta, no existe
          documento de devolución, no hay reverso de pago y el movimiento{" "}
          <code>DEVOLUCION</code> del inventario pertenece al retorno a
          proveedor, que descuenta en vez de reponer. Revertir una venta es una
          decisión contable pendiente, no un botón que falte.
        </span>
      </Notice>
    </div>
  );
}

/** Fecha corta y hora: en un mostrador el año casi nunca es la pregunta. */
function formatMoment(iso: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
