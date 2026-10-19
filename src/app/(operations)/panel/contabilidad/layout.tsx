import Link from "next/link";
import { getContabilidadPageContext } from "@/server/contabilidad/context";
import { crmFinanceSections } from "@/server/finance/crm/shared";

export default async function AccountingLayout({ children }: { children: React.ReactNode }) {
  const context = await getContabilidadPageContext();
  if (!context.canViewLedger) return children;
  return <div className="grid items-start gap-5 xl:grid-cols-[190px_minmax(0,1fr)]"><nav aria-label="Navegación contable del CRM" className="flex flex-wrap gap-1 rounded-xl border border-sb-border bg-sb-surface p-3 xl:sticky xl:top-4 xl:flex-col">
    <strong className="mb-2 text-sm">Contabilidad CRM</strong>
    {Object.entries(crmFinanceSections).map(([key, label]) => <Link key={key} href={`/panel/contabilidad/gestion/${key}`} className="sb-focus rounded px-2 py-2 text-sm hover:bg-sb-canvas">{label}</Link>)}
    {[["catalogo-cuentas", "Catálogo de cuentas"], ["diarios", "Asientos manuales"], ["documentos", "Documentos de origen"], ["terceros", "Terceros"], ["gastos", "Gastos"], ["planilla", "Planilla"], ["liquidaciones", "Liquidaciones IVA"], ["inventario", "Inventario contable"], ["comprobantes", "Comprobantes"], ["reportes", "Libro y estados"], ["bancos", "Cuentas bancarias"]].map(([key, label]) => <Link key={key} href={`/panel/contabilidad/${key}`} className="sb-focus rounded px-2 py-2 text-sm hover:bg-sb-canvas">{label}</Link>)}
  </nav><div className="min-w-0">{children}</div></div>;
}
