"use client";

import Link from "next/link";
import {
  BarChart3,
  Calculator,
  ClipboardList,
  FileText,
  Package,
  Receipt,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  accountingDocumentTypes,
  accountingDocumentStates,
  accountingDocumentOrigins,
  buildMotorcycleInvoiceDescription,
  expenseCategories,
  motorcycleInvoiceDescriptionFields,
  payrollStatuses,
  bankReconciliationStatuses,
  accountingClosureStatuses,
  thirdPartyTypes,
  voucherTypes,
  type AccountingBankAccount,
  type AccountingChartAccount,
  type AccountingClosure,
  type AccountingDocument,
  type AccountingDocumentOrigin,
  type AccountingDocumentState,
  type AccountingDocumentType,
  type AccountingExpense,
  type AccountingInventoryCost,
  type AccountingJournalEntry,
  type AccountingPayrollRecord,
  type AccountingReconciliation,
  type AccountingThirdParty,
  type AccountingVoucher,
  type BankReconciliationStatus,
  type ExpenseCategory,
  type VoucherType,
} from "@/data/operations/accounting";
import { type CashierClosure } from "@/data/operations/cashier";
import {
  desiredBranches,
  type DesiredBranchId,
} from "@/data/operations/leads";
import type { InventoryUnit } from "@/data/operations/inventory";
import {
  addAccountingDocument,
  addExpense,
  addJournalEntry,
  addPayrollRecord,
  addVoucher,
  readAccountingClosures,
  readAccountingDocuments,
  readBankAccounts,
  readChartAccounts,
  readExpenses,
  readInventoryCosts,
  readJournalEntries,
  readPayrollRecords,
  readReconciliations,
  readThirdParties,
  readVouchers,
  updateAccountingDocuments,
} from "@/features/operations/services/accounting-service";
import {
  readCashierClosures,
  updateCashierClosures,
} from "@/features/operations/services/cashier-service";
import { readInventoryUnits } from "@/features/operations/services/inventory-service";
import {
  readDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";
import { cn } from "@/lib/utils";

type AccountingSection =
  | "dashboard"
  | "diarios"
  | "comprobantes"
  | "documentos"
  | "gastos"
  | "inventario"
  | "planilla"
  | "reportes"
  | "catalogo-cuentas"
  | "bancos"
  | "conciliacion"
  | "cierres"
  | "terceros";

type AccountingNavGroup =
  | "Resumen"
  | "Operación diaria"
  | "Documentos"
  | "Control contable"
  | "Soporte"
  | "Análisis";

const accountingNavGroups: AccountingNavGroup[] = [
  "Resumen",
  "Operación diaria",
  "Documentos",
  "Control contable",
  "Soporte",
  "Análisis",
];

const sectionNav: {
  group: AccountingNavGroup;
  href: string;
  label: string;
  section: AccountingSection;
}[] = [
  { group: "Resumen", href: "/panel/contabilidad", label: "Dashboard", section: "dashboard" },
  { group: "Operación diaria", href: "/panel/contabilidad/diarios", label: "Diarios", section: "diarios" },
  { group: "Operación diaria", href: "/panel/contabilidad/comprobantes", label: "Comprobantes", section: "comprobantes" },
  { group: "Documentos", href: "/panel/contabilidad/documentos", label: "Documentos por revisar", section: "documentos" },
  { group: "Operación diaria", href: "/panel/contabilidad/gastos", label: "Gastos", section: "gastos" },
  { group: "Soporte", href: "/panel/contabilidad/inventario", label: "Inventario contable", section: "inventario" },
  { group: "Soporte", href: "/panel/contabilidad/planilla", label: "Planilla", section: "planilla" },
  { group: "Control contable", href: "/panel/contabilidad/catalogo-cuentas", label: "Catálogo de cuentas", section: "catalogo-cuentas" },
  { group: "Control contable", href: "/panel/contabilidad/bancos", label: "Bancos", section: "bancos" },
  { group: "Control contable", href: "/panel/contabilidad/conciliacion", label: "Conciliación", section: "conciliacion" },
  { group: "Control contable", href: "/panel/contabilidad/cierres", label: "Cierres", section: "cierres" },
  { group: "Control contable", href: "/panel/contabilidad/terceros", label: "Terceros", section: "terceros" },
  { group: "Análisis", href: "/panel/contabilidad/reportes", label: "Reportes", section: "reportes" },
];

const creatableAccountingDocumentStates: AccountingDocumentState[] = [
  "Borrador",
  "Emitido",
];

export function AccountingPanel({ section = "dashboard" }: { section?: AccountingSection }) {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [journalEntries, setJournalEntries] = useState<AccountingJournalEntry[]>([]);
  const [vouchers, setVouchers] = useState<AccountingVoucher[]>([]);
  const [documents, setDocuments] = useState<AccountingDocument[]>([]);
  const [expenses, setExpenses] = useState<AccountingExpense[]>([]);
  const [payroll, setPayroll] = useState<AccountingPayrollRecord[]>([]);
  const [costs, setCosts] = useState<AccountingInventoryCost[]>([]);
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [cashierClosures, setCashierClosures] = useState<CashierClosure[]>([]);
  const [chartAccounts, setChartAccounts] = useState<AccountingChartAccount[]>([]);
  const [bankAccounts, setBankAccounts] = useState<AccountingBankAccount[]>([]);
  const [reconciliations, setReconciliations] = useState<AccountingReconciliation[]>([]);
  const [accountingClosures, setAccountingClosures] = useState<AccountingClosure[]>([]);
  const [thirdParties, setThirdParties] = useState<AccountingThirdParty[]>([]);

  useEffect(() => {
    function sync() {
      setSession(readDemoSession());
      setJournalEntries(readJournalEntries());
      setVouchers(readVouchers());
      setDocuments(readAccountingDocuments());
      setExpenses(readExpenses());
      setPayroll(readPayrollRecords());
      setCosts(readInventoryCosts());
      setUnits(readInventoryUnits());
      setCashierClosures(readCashierClosures());
      setChartAccounts(readChartAccounts());
      setBankAccounts(readBankAccounts());
      setReconciliations(readReconciliations());
      setAccountingClosures(readAccountingClosures());
      setThirdParties(readThirdParties());
    }

    sync();
    return subscribeToDemoSession(sync);
  }, []);

  const canUseAccounting =
    session?.role === "Contador" ||
    session?.role === "Administrador" ||
    session?.role === "Gerente";
  const canWriteAccounting =
    session?.role === "Contador" || session?.role === "Administrador";
  const canSeeCost =
    session?.role === "Contador" ||
    session?.role === "Administrador" ||
    session?.role === "Gerente";
  const scopedUnits = useMemo(() => {
    if (!session) return [];
    if (session.role === "Gerente") {
      return units.filter((unit) => unit.sucursalActualId === session.branchId);
    }
    if (session.role === "Vendedor") return [];
    return units;
  }, [session, units]);
  const scopedInventoryRows = useMemo(
    () => buildAccountingInventoryRows(scopedUnits, costs, session),
    [costs, scopedUnits, session],
  );

  if (!session) {
    return (
      <AccountingRestricted
        description="Inicia sesión demo para acceder al área contable interna."
        title="Sesión interna requerida"
      />
    );
  }

  if (!canUseAccounting) {
    return (
      <AccountingRestricted
        description="El Vendedor no tiene acceso a costos, diarios, comprobantes, planilla ni reportes contables."
        title="Contabilidad restringida"
      />
    );
  }

  if (session.role === "Gerente" && section !== "inventario" && section !== "reportes") {
    return (
      <AccountingShell section={section} session={session}>
        <AccountingRestricted
          description="El Gerente solo consulta costos de inventario y reportes contables filtrados por su sucursal."
          title="Vista contable limitada"
        />
      </AccountingShell>
    );
  }

  return (
    <AccountingShell section={section} session={session}>
      {section === "dashboard" ? (
        <AccountingDashboard
          documents={documents}
          expenses={expenses}
          accountingClosures={accountingClosures}
          bankAccounts={bankAccounts}
          cashierClosures={cashierClosures}
          chartAccounts={chartAccounts}
          inventoryRows={scopedInventoryRows}
          journalEntries={journalEntries}
          payroll={payroll}
          reconciliations={reconciliations}
          thirdParties={thirdParties}
          vouchers={vouchers}
        />
      ) : null}
      {section === "diarios" ? (
        <JournalSection
          canWrite={canWriteAccounting}
          entries={journalEntries}
          onCreate={(input) => setJournalEntries(addJournalEntry(journalEntries, input))}
        />
      ) : null}
      {section === "comprobantes" ? (
        <VoucherSection
          canWrite={canWriteAccounting}
          onCreate={(input) => setVouchers(addVoucher(vouchers, input))}
          vouchers={vouchers}
        />
      ) : null}
      {section === "documentos" ? (
        <DocumentsSection
          canWrite={canWriteAccounting}
          documents={documents}
          vouchers={vouchers}
          onCreate={(input) => setDocuments(addAccountingDocument(documents, input))}
          onUpdate={(nextDocuments) =>
            setDocuments(updateAccountingDocuments(nextDocuments))
          }
          session={session}
        />
      ) : null}
      {section === "gastos" ? (
        <ExpensesSection
          canWrite={canWriteAccounting}
          expenses={expenses}
          onCreate={(input) => setExpenses(addExpense(expenses, input))}
        />
      ) : null}
      {section === "inventario" ? (
        <AccountingInventorySection
          canSeeCost={canSeeCost}
          rows={scopedInventoryRows}
          session={session}
        />
      ) : null}
      {section === "planilla" ? (
        <PayrollSection
          canWrite={canWriteAccounting}
          onCreate={(input) => setPayroll(addPayrollRecord(payroll, input))}
          payroll={payroll}
        />
      ) : null}
      {section === "reportes" ? (
        <AccountingReports
          accountingClosures={filterAccountingClosuresBySession(accountingClosures, session)}
          bankAccounts={filterBankAccountsBySession(bankAccounts, session)}
          canWrite={canWriteAccounting}
          cashierClosures={filterCashierClosuresBySession(cashierClosures, session)}
          documents={documents}
          expenses={filterExpensesBySession(expenses, session)}
          inventoryRows={scopedInventoryRows}
          journalEntries={journalEntries}
          payroll={filterPayrollBySession(payroll, session)}
          reconciliations={filterReconciliationsBySession(reconciliations, session)}
          session={session}
          onUpdateClosures={(nextVisibleClosures) => {
            const updatedById = new Map(
              nextVisibleClosures.map((closure) => [closure.id, closure]),
            );
            setCashierClosures(
              updateCashierClosures(
                cashierClosures.map(
                  (closure) => updatedById.get(closure.id) ?? closure,
                ),
              ),
            );
          }}
          vouchers={vouchers}
        />
      ) : null}
      {section === "catalogo-cuentas" ? (
        <ChartAccountsSection accounts={chartAccounts} />
      ) : null}
      {section === "bancos" ? (
        <BanksSection accounts={filterBankAccountsBySession(bankAccounts, session)} />
      ) : null}
      {section === "conciliacion" ? (
        <ReconciliationSection
          documents={filterAccountingDocumentsBySession(documents, session)}
          records={filterReconciliationsBySession(reconciliations, session)}
        />
      ) : null}
      {section === "cierres" ? (
        <AccountingClosuresSection
          accountingClosures={filterAccountingClosuresBySession(accountingClosures, session)}
          cashierClosures={filterCashierClosuresBySession(cashierClosures, session)}
        />
      ) : null}
      {section === "terceros" ? (
        <ThirdPartiesSection parties={filterThirdPartiesBySession(thirdParties, session)} />
      ) : null}
    </AccountingShell>
  );
}

function AccountingShell({
  children,
  section,
  session,
}: {
  children: ReactNode;
  section: AccountingSection;
  session: DemoSession;
}) {
  const visibleNav = session.role === "Gerente"
    ? sectionNav.filter((item) => item.section === "inventario" || item.section === "reportes")
    : sectionNav;
  const visibleGroups = accountingNavGroups
    .map((group) => ({
      group,
      items: visibleNav.filter((item) => item.group === group),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Badge tone="red">Contabilidad</Badge>
          <h2 className="mt-4 text-3xl font-black text-white">
            Base contable MotoMas
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            Área interna separada del flujo comercial. El Contador registra
            diarios, comprobantes, gastos, documentos, inventario con costo y
            planilla demo sin crear leads, reservas ni ventas.
          </p>
        </div>
        <Card className="p-4">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
            Alcance de sesión
          </div>
          <div className="mt-2 text-sm font-black text-white">
            {session.role} / {session.branchName}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <nav className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="NavegaciÃ³n contable">
          {visibleGroups.map(({ group, items }) => (
            <div key={group}>
              <div className="px-2 text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500">
                {group}
              </div>
              <div className="mt-2 grid gap-1">
                {items.map((item) => (
                  <Link
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-sm font-semibold transition",
                      item.section === section
                        ? "border-blue-400/40 bg-blue-500/12 text-white shadow-[0_0_24px_rgba(59,130,246,0.12)]"
                        : "border-transparent text-zinc-400 hover:border-white/10 hover:bg-white/[0.045] hover:text-white",
                    )}
                    href={item.href}
                    key={item.href}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </Card>

      <Card className="hidden">
        <nav className="flex min-w-max gap-2" aria-label="Navegación contable">
          {visibleNav.map((item) => (
            <Link
              className={cn(
                "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                item.section === section
                  ? "border-red-500/40 bg-red-500/12 text-white"
                  : "border-white/10 bg-white/[0.035] text-zinc-400 hover:bg-white/[0.06] hover:text-white",
              )}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </Card>

      {children}
    </section>
  );
}

function AccountingDashboard({
  accountingClosures,
  bankAccounts,
  cashierClosures,
  chartAccounts,
  documents,
  expenses,
  inventoryRows,
  journalEntries,
  payroll,
  reconciliations,
  thirdParties,
  vouchers,
}: {
  accountingClosures: AccountingClosure[];
  bankAccounts: AccountingBankAccount[];
  cashierClosures: CashierClosure[];
  chartAccounts: AccountingChartAccount[];
  documents: AccountingDocument[];
  expenses: AccountingExpense[];
  inventoryRows: AccountingInventoryRow[];
  journalEntries: AccountingJournalEntry[];
  payroll: AccountingPayrollRecord[];
  reconciliations: AccountingReconciliation[];
  thirdParties: AccountingThirdParty[];
  vouchers: AccountingVoucher[];
}) {
  const inventoryCost = inventoryRows.reduce((total, row) => total + row.costoTotal, 0);
  const monthlyExpenses = expenses.reduce((total, expense) => total + expense.total, 0);
  const payrollTotal = payroll.reduce((total, record) => total + record.netoPagar, 0);
  const pendingReview = documents.filter((document) => document.estado === "Borrador" || document.estado === "Emitido").length;
  const pendingAccounting = documents.filter((document) => document.estado === "Revisado").length;
  const pendingConciliation =
    documents.filter((document) => document.estado === "Contabilizado").length +
    reconciliations.filter((record) => record.estado === "Pendiente").length;
  const totalIncome = documents
    .filter((document) => document.tipo === "Factura" || document.tipo === "Recibo Oficial de Caja")
    .reduce((total, document) => total + document.total, 0);
  const totalRetention1 = documents.reduce((total, document) => total + document.retencion1, 0);
  const totalRetention2 = documents.reduce((total, document) => total + document.retencion2, 0);
  const totalAbonos = documents.reduce((total, document) => total + document.abono, 0);
  const lowStockRows = inventoryRows.filter((row) => row.estadoSaldo === "Bajo mínimo");
  const pendingCashierClosures = cashierClosures.filter((closure) => closure.estado === "Cerrado").length;
  const pendingPayroll = payroll.filter((record) => record.estado !== "Pagada").length;
  const documentQueue = documents
    .filter((document) =>
      ["Borrador", "Emitido", "Revisado", "Contabilizado"].includes(document.estado),
    )
    .slice(0, 5);
  const unbalancedJournals = journalEntries.filter(
    (entry) => Math.abs(entry.debe - entry.haber) > 0.01,
  ).length;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-blue-500/15 bg-blue-500/[0.045]">
        <div className="grid gap-0 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="p-6">
            <Badge tone="blue">Centro contable</Badge>
            <h3 className="mt-4 text-2xl font-black text-white">
              Pendientes que requieren accion
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Prioriza revision, contabilizacion y conciliacion antes de
              trabajar reportes o controles de cierre.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <MiniMetric label="Por revisar" value={pendingReview} />
              <MiniMetric label="Por contabilizar" value={pendingAccounting} />
              <MiniMetric label="Por conciliar" value={pendingConciliation} />
            </div>
          </div>
          <div className="border-t border-white/10 bg-black/18 p-6 xl:border-l xl:border-t-0">
            <h4 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-400">
              Cola documental
            </h4>
            <div className="mt-4 space-y-3">
              {documentQueue.length ? documentQueue.map((document) => (
                <div
                  className="rounded-xl border border-white/10 bg-white/[0.035] p-3"
                  key={document.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-white">{document.numero}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {document.tipo} / {document.tercero}
                      </div>
                    </div>
                    <Badge tone={document.estado === "Anulado" ? "gray" : "blue"}>
                      {document.estado}
                    </Badge>
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-zinc-500">
                  No hay documentos pendientes. Cuando Caja emita o
                  Contabilidad registre documentos, apareceran aqui.
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ClipboardList} label="Diarios" value={journalEntries.length} />
        <Metric icon={Receipt} label="Comprobantes" value={vouchers.length} />
        <Metric icon={FileText} label="Documentos" value={documents.length} />
        <Metric icon={Package} label="Costo inventario" value={formatMoney(inventoryCost)} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={Calculator} label="Gastos registrados" value={formatMoney(monthlyExpenses)} />
        <Metric icon={Users} label="Planilla neta" value={formatMoney(payrollTotal)} />
        <Metric
          icon={BarChart3}
          label="Ítems bajo mínimo"
          value={inventoryRows.filter((row) => row.estadoSaldo === "Bajo mínimo").length}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={FileText} label="Pendientes de revision" value={pendingReview} />
        <Metric icon={ClipboardList} label="Pendientes de contabilizar" value={pendingAccounting} />
        <Metric icon={Receipt} label="Pendientes de conciliar" value={pendingConciliation} />
        <Metric icon={Calculator} label="Ingresos del periodo" value={formatMoney(totalIncome)} />
        <Metric icon={Calculator} label="Retencion 1%" value={formatMoney(totalRetention1)} />
        <Metric icon={Calculator} label="Retencion 2%" value={formatMoney(totalRetention2)} />
        <Metric icon={Calculator} label="Abonos" value={formatMoney(totalAbonos)} />
        <Metric icon={Receipt} label="Cierres de caja pendientes" value={pendingCashierClosures} />
      </div>
      <Card className="p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-black text-white">Centro contable MotoMas</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Vista ejecutiva para documentos, comprobantes, catalogo de cuentas,
              bancos, conciliacion, terceros, cierres, inventario valorizado y planilla demo.
            </p>
          </div>
          <Button type="button" variant="secondary">Exportar Excel</Button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <MiniMetric label="Cuentas contables" value={chartAccounts.length} />
          <MiniMetric label="Bancos demo" value={bankAccounts.length} />
          <MiniMetric label="Terceros" value={thirdParties.length} />
          <MiniMetric label="Cierres contables" value={accountingClosures.length} />
          <MiniMetric label="Diarios" value={journalEntries.length} />
          <MiniMetric label="Comprobantes" value={vouchers.length} />
          <MiniMetric label="Conciliaciones" value={reconciliations.length} />
          <MiniMetric label="Planillas pendientes" value={pendingPayroll} />
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <AlertCard title="Revision documental" value={`${pendingReview} documento(s)`} />
        <AlertCard title="Diarios descuadrados" value={`${unbalancedJournals} asiento(s)`} />
        <AlertCard title="Inventario bajo minimo" value={`${lowStockRows.length} item(s)`} />
      </div>
    </div>
  );
}

function JournalSection({
  canWrite,
  entries,
  onCreate,
}: {
  canWrite: boolean;
  entries: AccountingJournalEntry[];
  onCreate: (input: Omit<AccountingJournalEntry, "id">) => void;
}) {
  const totalDebe = entries.reduce((total, entry) => total + entry.debe, 0);
  const totalHaber = entries.reduce((total, entry) => total + entry.haber, 0);
  const difference = totalDebe - totalHaber;

  return (
    <div className="space-y-6">
      {canWrite ? <JournalForm onCreate={onCreate} /> : <ReadOnlyNotice />}
      <div className="grid gap-4 md:grid-cols-4">
        <MiniMetric label="Total debe" value={formatMoney(totalDebe)} />
        <MiniMetric label="Total haber" value={formatMoney(totalHaber)} />
        <MiniMetric label="Diferencia" value={formatMoney(difference)} />
        <MiniMetric label="Estado visual" value={Math.abs(difference) > 0.01 ? "Descuadrado" : "Cuadrado"} />
      </div>
      <DataTable
        columns={["# Factura", "Fecha", "Código Cliente", "Proveedor", "RUC", "# Asiento", "Cuenta Contable", "Concepto Contable", "Debe", "Haber", "Ref Pago Banco", "Conciliación", "Banco", "# Retención", "Fecha de Retención", "# Reembolso", "Observaciones", "Base Impositiva"]}
        rows={entries.map((entry) => [
          entry.factura,
          entry.fecha,
          entry.codigoCliente,
          entry.proveedor,
          entry.ruc,
          entry.asiento,
          entry.cuentaContable,
          entry.conceptoContable,
          formatMoney(entry.debe),
          formatMoney(entry.haber),
          entry.refPagoBanco,
          entry.conciliacion,
          entry.banco,
          entry.retencion,
          entry.fechaRetencion,
          entry.reembolso,
          entry.observaciones,
          formatMoney(entry.baseImpositiva),
        ])}
        title="Diarios contables"
      />
    </div>
  );
}

function JournalForm({ onCreate }: { onCreate: (input: Omit<AccountingJournalEntry, "id">) => void }) {
  const [form, setForm] = useState({
    factura: "",
    fecha: new Date().toISOString().slice(0, 10),
    codigoCliente: "",
    proveedor: "",
    ruc: "",
    asiento: "",
    cuentaContable: "",
    conceptoContable: "",
    debe: "0",
    haber: "0",
    refPagoBanco: "",
    conciliacion: "Pendiente",
    banco: "",
      retencion: "",
      fechaRetencion: "",
      reembolso: "",
      observaciones: "",
      baseImpositiva: "0",
      estado: "Borrador" as const,
    });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      ...form,
      debe: parseAmount(form.debe),
      haber: parseAmount(form.haber),
      baseImpositiva: parseAmount(form.baseImpositiva),
    });
    setForm((current) => ({
      ...current,
      factura: "",
      codigoCliente: "",
      proveedor: "",
      ruc: "",
      asiento: "",
      cuentaContable: "",
      conceptoContable: "",
      debe: "0",
      haber: "0",
      refPagoBanco: "",
      banco: "",
      retencion: "",
      fechaRetencion: "",
      reembolso: "",
      observaciones: "",
      baseImpositiva: "0",
    }));
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#111]/70 p-5">
      <h3 className="text-xl font-black text-white">Registrar diario contable</h3>
      <form className="mt-5 grid gap-4" onSubmit={submit}>
        <FormSectionTitle
          description="Referencia del documento, tercero relacionado y asiento contable."
          title="Referencia documental"
        />
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="# Factura"><TextInput value={form.factura} onChange={(value) => setForm({ ...form, factura: value })} /></Field>
          <Field label="Fecha"><TextInput type="date" value={form.fecha} onChange={(value) => setForm({ ...form, fecha: value })} /></Field>
          <Field label="Código Cliente"><TextInput value={form.codigoCliente} onChange={(value) => setForm({ ...form, codigoCliente: value })} /></Field>
          <Field label="Proveedor"><TextInput value={form.proveedor} onChange={(value) => setForm({ ...form, proveedor: value })} /></Field>
          <Field label="RUC"><TextInput value={form.ruc} onChange={(value) => setForm({ ...form, ruc: value })} /></Field>
          <Field label="# Asiento"><TextInput value={form.asiento} onChange={(value) => setForm({ ...form, asiento: value })} /></Field>
          <Field label="Cuenta Contable"><TextInput value={form.cuentaContable} onChange={(value) => setForm({ ...form, cuentaContable: value })} /></Field>
          <Field label="Concepto Contable"><TextInput value={form.conceptoContable} onChange={(value) => setForm({ ...form, conceptoContable: value })} /></Field>
          <Field label="Debe"><TextInput type="number" value={form.debe} onChange={(value) => setForm({ ...form, debe: value })} /></Field>
          <Field label="Haber"><TextInput type="number" value={form.haber} onChange={(value) => setForm({ ...form, haber: value })} /></Field>
          <Field label="Ref Pago Banco"><TextInput value={form.refPagoBanco} onChange={(value) => setForm({ ...form, refPagoBanco: value })} /></Field>
          <Field label="Banco"><TextInput value={form.banco} onChange={(value) => setForm({ ...form, banco: value })} /></Field>
        </div>
        <FormSectionTitle
          description="Notas internas para seguimiento y revision posterior."
          title="Notas"
        />
        <Field label="Observaciones">
          <Textarea value={form.observaciones} onChange={(value) => setForm({ ...form, observaciones: value })} />
        </Field>
        <Button type="submit">Registrar diario</Button>
      </form>
    </div>
  );
}

function VoucherSection({
  canWrite,
  onCreate,
  vouchers,
}: {
  canWrite: boolean;
  onCreate: (input: Omit<AccountingVoucher, "id">) => void;
  vouchers: AccountingVoucher[];
}) {
  return (
    <div className="space-y-6">
      {canWrite ? <VoucherForm onCreate={onCreate} /> : <ReadOnlyNotice />}
      <DataTable
        columns={["Tipo", "Número", "Fecha", "Beneficiario", "Concepto", "Banco", "Referencia", "Monto", "Estado", "Observaciones"]}
        rows={vouchers.map((voucher) => [
          voucher.tipo,
          voucher.numero,
          voucher.fecha,
          voucher.beneficiario,
          voucher.concepto,
          voucher.banco,
          voucher.referencia,
          formatMoney(voucher.monto),
          voucher.estado,
          voucher.observaciones,
        ])}
        title="Comprobantes"
      />
    </div>
  );
}

function VoucherForm({ onCreate }: { onCreate: (input: Omit<AccountingVoucher, "id">) => void }) {
  const [tipo, setTipo] = useState<VoucherType>("Ingreso");
  const [monto, setMonto] = useState("0");
  const [numero, setNumero] = useState("");
  const [beneficiario, setBeneficiario] = useState("");
  const [concepto, setConcepto] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      tipo,
      numero,
      fecha: new Date().toISOString().slice(0, 10),
      beneficiario,
      concepto,
      banco: "Banco demo",
      referencia: "",
      monto: parseAmount(monto),
      cuentaContable: tipo === "Ingreso" ? "1101-01 Caja general" : "6101-01 Gastos administrativos",
      debe: parseAmount(monto),
      haber: parseAmount(monto),
      total: parseAmount(monto),
      creadoPor: "Contador General",
      fechaCreacion: new Date().toISOString().slice(0, 10),
      estado: "Registrado",
      observaciones: "",
    });
    setNumero("");
    setBeneficiario("");
    setConcepto("");
    setMonto("0");
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#111]/70 p-5">
      <h3 className="text-xl font-black text-white">Registrar comprobante</h3>
      <form className="mt-5 grid gap-4 md:grid-cols-5" onSubmit={submit}>
        <FormSectionTitle
          description="Define el tipo de comprobante, tercero, monto y concepto contable."
          title="Datos del comprobante"
        />
        <Field label="Tipo"><Select value={tipo} onChange={(value) => setTipo(value as VoucherType)}>{voucherTypes.map((item) => <option key={item}>{item}</option>)}</Select></Field>
        <Field label="Número"><TextInput value={numero} onChange={setNumero} /></Field>
        <Field label="Beneficiario"><TextInput value={beneficiario} onChange={setBeneficiario} /></Field>
        <Field label="Monto"><TextInput type="number" value={monto} onChange={setMonto} /></Field>
        <div className="md:pt-7"><Button type="submit">Registrar comprobante</Button></div>
        <FormSectionTitle
          description="Resumen que se muestra en el listado y preview del comprobante."
          title="Concepto contable"
        />
        <div className="md:col-span-5"><Field label="Concepto"><Textarea value={concepto} onChange={setConcepto} /></Field></div>
      </form>
    </div>
  );
}

function ExpensesSection({
  canWrite,
  expenses,
  onCreate,
}: {
  canWrite: boolean;
  expenses: AccountingExpense[];
  onCreate: (input: Omit<AccountingExpense, "id">) => void;
}) {
  return (
    <div className="space-y-6">
      {canWrite ? <ExpenseForm onCreate={onCreate} /> : <ReadOnlyNotice />}
      <DataTable
        columns={["Categoría", "Fecha", "Sucursal", "Proveedor", "Concepto", "Monto", "Comprobante", "Estado", "Observaciones"]}
        rows={expenses.map((expense) => [
          expense.categoria,
          expense.fecha,
          expense.sucursalNombre,
          expense.proveedor,
          expense.concepto,
          formatMoney(expense.monto),
          expense.comprobante,
          expense.estado,
          expense.observaciones,
        ])}
        title="Gastos"
      />
    </div>
  );
}

function ExpenseForm({ onCreate }: { onCreate: (input: Omit<AccountingExpense, "id">) => void }) {
  const [categoria, setCategoria] = useState<ExpenseCategory>("Combustible");
  const [sucursalId, setSucursalId] = useState<DesiredBranchId>("plaza-inter");
  const [proveedor, setProveedor] = useState("");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("0");
  const branch = desiredBranches.find((item) => item.id === sucursalId) ?? desiredBranches[0];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subtotal = parseAmount(monto);
    const retencion1 = subtotal * 0.01;
    const total = Math.max(subtotal - retencion1, 0);
    onCreate({
      categoria,
      fecha: new Date().toISOString().slice(0, 10),
      sucursalId: branch.id,
      sucursalNombre: branch.name,
      proveedor,
      concepto,
      monto: total,
      ruc: "",
      factura: "",
      subtotal,
      iva: 0,
      retencion1,
      retencion2: 0,
      total,
      banco: "Banco demo",
      referencia: "",
      cuentaContable: "6101-01 Gastos administrativos",
      comprobante: "",
      estado: "Registrado",
      observaciones: "",
    });
    setProveedor("");
    setConcepto("");
    setMonto("0");
  }

  return (
    <Card className="p-6">
      <h3 className="text-xl font-black text-white">Registrar gasto</h3>
      <form className="mt-5 grid gap-4 md:grid-cols-5" onSubmit={submit}>
        <FormSectionTitle
          description="Clasifica el gasto por categoria, sucursal y proveedor."
          title="Clasificacion del gasto"
        />
        <Field label="Categoría"><Select value={categoria} onChange={(value) => setCategoria(value as ExpenseCategory)}>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</Select></Field>
        <Field label="Sucursal"><Select value={sucursalId} onChange={(value) => setSucursalId(value as DesiredBranchId)}>{desiredBranches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
        <Field label="Proveedor"><TextInput value={proveedor} onChange={setProveedor} /></Field>
        <Field label="Monto"><TextInput type="number" value={monto} onChange={setMonto} /></Field>
        <div className="md:pt-7"><Button type="submit">Registrar gasto</Button></div>
        <FormSectionTitle
          description="Detalle de soporte para revision contable."
          title="Concepto y soporte"
        />
        <div className="md:col-span-5"><Field label="Concepto"><Textarea value={concepto} onChange={setConcepto} /></Field></div>
      </form>
    </Card>
  );
}

function DocumentsSection({
  canWrite,
  documents,
  onCreate,
  onUpdate,
  session,
  vouchers,
}: {
  canWrite: boolean;
  documents: AccountingDocument[];
  onCreate: (input: Omit<AccountingDocument, "id">) => void;
  onUpdate: (documents: AccountingDocument[]) => void;
  session: DemoSession;
  vouchers: AccountingVoucher[];
}) {
  const [typeFilter, setTypeFilter] = useState<AccountingDocumentType | "Todos">("Todos");
  const [stateFilter, setStateFilter] = useState<AccountingDocumentState | "Todos">("Todos");
  const [branchFilter, setBranchFilter] = useState<DesiredBranchId | "Todos">("Todos");
  const [originFilter, setOriginFilter] = useState<AccountingDocumentOrigin | "Todos">("Todos");
  const [periodFilter, setPeriodFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [annulReason, setAnnulReason] = useState("");
  const [accountingObservation, setAccountingObservation] = useState("");
  const [showManualForm, setShowManualForm] = useState(false);

  const filteredDocuments = useMemo(
    () =>
      documents.filter((document) => {
        const matchesType = typeFilter === "Todos" || document.tipo === typeFilter;
        const matchesState = stateFilter === "Todos" || document.estado === stateFilter;
        const matchesBranch = branchFilter === "Todos" || document.sucursalId === branchFilter;
        const matchesOrigin = originFilter === "Todos" || document.origen === originFilter;
        const matchesPeriod = !periodFilter || document.fecha.startsWith(periodFilter);
        const normalizedSearch = searchTerm.trim().toLowerCase();
        const searchable = [
          document.numero,
          document.tercero,
          document.ruc,
          document.documentoOrigen,
          document.concepto,
        ].join(" ").toLowerCase();
        const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
        return (
          matchesType &&
          matchesState &&
          matchesBranch &&
          matchesOrigin &&
          matchesPeriod &&
          matchesSearch
        );
      }),
    [branchFilter, documents, originFilter, periodFilter, searchTerm, stateFilter, typeFilter],
  );
  const selectedDocument =
    filteredDocuments.find((document) => document.id === selectedDocumentId) ??
    filteredDocuments[0] ??
    null;

  function updateSelectedDocumentState(estado: AccountingDocumentState) {
    if (!selectedDocument) return;
    if (selectedDocument.estado === "Anulado" && estado !== "Anulado") return;
    if (estado === "Contabilizado" && selectedDocument.estado !== "Revisado") return;
    if (estado === "Conciliado" && selectedDocument.estado !== "Contabilizado") return;
    if (estado === "Anulado" && !annulReason.trim()) return;

    const today = new Date().toISOString().slice(0, 10);

    const nextDocuments = documents.map((document) =>
      document.id === selectedDocument.id
        ? buildDocumentStatePatch(document, estado, session.userName, today, annulReason, accountingObservation)
        : document,
    );

    onUpdate(nextDocuments);
    setAnnulReason("");
    setAccountingObservation("");
  }

  const selectedHasVoucher = selectedDocument
    ? hasRelatedVoucher(selectedDocument, vouchers)
    : false;
  const summaryByState = {
    pendingReview: documents.filter((document) => document.estado === "Borrador" || document.estado === "Emitido").length,
    pendingAccounting: documents.filter((document) => document.estado === "Revisado").length,
    pendingConciliation: documents.filter((document) => document.estado === "Contabilizado").length,
    cashierOrigin: documents.filter((document) => document.origen === "Caja").length,
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-black text-white">Documentos contables para revision</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Preparación para Factura, Nota de Débito, Nota de Crédito y Recibo Oficial de Caja. No genera PDF ni factura fiscal.
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Caja emite documentos operativos demo. Contabilidad revisa,
              contabiliza y concilia los registros sincronizados.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {accountingDocumentTypes.map((type) => (
                <Badge key={type} tone="gray">
                  {type}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <MiniMetric label="Documentos por revisar" value={summaryByState.pendingReview} />
        <MiniMetric label="Pendientes de contabilizar" value={summaryByState.pendingAccounting} />
        <MiniMetric label="Pendientes de conciliar" value={summaryByState.pendingConciliation} />
        <MiniMetric label="Origen Caja" value={summaryByState.cashierOrigin} />
      </div>

      {canWrite ? (
        <Card className="border-white/10 bg-white/[0.025] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-black text-white">Registro manual</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
                Solo para ajustes contables o documentos no emitidos por Caja.
                La revision, contabilizacion y conciliacion siguen ocurriendo
                desde el panel de detalle.
              </p>
            </div>
            <Button
              onClick={() => setShowManualForm((current) => !current)}
              type="button"
              variant="secondary"
            >
              {showManualForm ? "Ocultar registro manual" : "Registrar documento manual"}
            </Button>
          </div>
          {showManualForm ? (
            <div className="mt-5">
              <AccountingDocumentForm onCreate={onCreate} />
            </div>
          ) : null}
        </Card>
      ) : <ReadOnlyNotice />}

      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Field label="Tipo">
            <Select value={typeFilter} onChange={(value) => setTypeFilter(value as AccountingDocumentType | "Todos")}>
              <option>Todos</option>
              {accountingDocumentTypes.map((type) => <option key={type}>{type}</option>)}
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={stateFilter} onChange={(value) => setStateFilter(value as AccountingDocumentState | "Todos")}>
              <option>Todos</option>
              {accountingDocumentStates.map((state) => <option key={state}>{state}</option>)}
            </Select>
          </Field>
          <Field label="Sucursal">
            <Select value={branchFilter} onChange={(value) => setBranchFilter(value as DesiredBranchId | "Todos")}>
              <option>Todos</option>
              {desiredBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Origen">
            <Select value={originFilter} onChange={(value) => setOriginFilter(value as AccountingDocumentOrigin | "Todos")}>
              <option>Todos</option>
              {accountingDocumentOrigins.map((origin) => <option key={origin}>{origin}</option>)}
            </Select>
          </Field>
          <Field label="Período">
            <TextInput type="month" value={periodFilter} onChange={setPeriodFilter} />
          </Field>
          <Field label="Buscar">
            <TextInput value={searchTerm} onChange={setSearchTerm} />
          </Field>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
        <Card className="overflow-hidden">
          <div className="border-b border-white/10 p-5">
            <h3 className="text-xl font-black text-white">Listado de documentos</h3>
            <p className="mt-2 text-sm text-zinc-500">
              Registros preparados para revisión contable. No representan emisión fiscal final.
            </p>
          </div>
          <div className="divide-y divide-white/10">
            {filteredDocuments.length ? filteredDocuments.map((document) => {
              const active = selectedDocument?.id === document.id;
              return (
                <button
                  className={cn(
                    "block w-full px-5 py-4 text-left transition",
                    active ? "bg-red-500/10" : "hover:bg-white/[0.04]",
                  )}
                  key={document.id}
                  onClick={() => setSelectedDocumentId(document.id)}
                  type="button"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-white">{document.numero}</div>
                      <div className="mt-1 text-sm text-zinc-500">{document.tipo} / {document.tercero}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Badge tone={document.estado === "Anulado" ? "gray" : "red"}>{document.estado}</Badge>
                      <Badge tone={document.origen === "Caja" ? "blue" : "gray"}>{document.origen}</Badge>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-4">
                    <span>{formatDate(document.fecha)}</span>
                    <span>{document.sucursalNombre}</span>
                    <span className="font-black text-zinc-300">{formatMoney(document.total)}</span>
                    <span>{hasRelatedVoucher(document, vouchers) ? "Con comprobante" : "Pendiente de comprobante"}</span>
                  </div>
                </button>
              );
            }) : (
              <div className="px-5 py-10 text-center text-sm leading-6 text-zinc-500">
                No hay documentos para estos filtros. Cuando Contabilidad registre documentos base,
                aparecerán aquí para revisión y conciliación.
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          {canWrite && selectedDocument ? (
            <Card className="p-5">
              <h3 className="text-lg font-black text-white">
                Revisión contable
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Contabilidad puede revisar, contabilizar y conciliar documentos internos.
                Caja no tiene acceso a estas acciones.
              </p>
              <div className="mt-4 grid gap-3 text-sm text-zinc-400 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">Comprobante</div>
                  <div className="mt-1 font-black text-white">
                    {selectedHasVoucher ? "Documento con comprobante relacionado" : "Pendiente de comprobante"}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">Conciliación</div>
                  <div className="mt-1 font-black text-white">
                    {selectedDocument.estado === "Conciliado" ? "Conciliado" : "Pendiente"}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <Field label="Observación contable">
                  <Textarea value={accountingObservation} onChange={setAccountingObservation} />
                </Field>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  disabled={selectedDocument.estado !== "Emitido" && selectedDocument.estado !== "Borrador"}
                  onClick={() => updateSelectedDocumentState("Revisado")}
                  type="button"
                  variant="secondary"
                >
                  Revisar
                </Button>
                <Button
                  disabled={selectedDocument.estado !== "Revisado"}
                  onClick={() => updateSelectedDocumentState("Contabilizado")}
                  type="button"
                >
                  Contabilizar
                </Button>
                <Button
                  disabled={selectedDocument.estado !== "Contabilizado"}
                  onClick={() => updateSelectedDocumentState("Conciliado")}
                  type="button"
                  variant="secondary"
                >
                  Conciliar
                </Button>
              </div>
              <div className="mt-5 grid gap-3 rounded-xl border border-red-500/20 bg-red-500/8 p-4">
                <Field label="Motivo de anulación interna">
                  <Textarea value={annulReason} onChange={setAnnulReason} />
                </Field>
                <Button
                  disabled={selectedDocument.estado === "Anulado" || !annulReason.trim()}
                  onClick={() => updateSelectedDocumentState("Anulado")}
                  type="button"
                  variant="secondary"
                >
                  Anular internamente
                </Button>
                <p className="text-xs leading-5 text-zinc-500">
                  Esta acción es interna de demo. No representa anulación fiscal ni DGI.
                </p>
              </div>
            </Card>
          ) : null}
          <AccountingDocumentPreview document={selectedDocument} />
        </div>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-black text-white">Orden requerido para factura de motocicleta</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Este orden se genera desde una estructura interna fija mediante `buildMotorcycleInvoiceDescription`.
          No depende de escritura manual del usuario.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {motorcycleInvoiceDescriptionFields.map((field) => (
            <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3 text-sm font-black text-zinc-200" key={field}>
              {field}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function AccountingDocumentForm({
  onCreate,
}: {
  onCreate: (input: Omit<AccountingDocument, "id">) => void;
}) {
  const [tipo, setTipo] = useState<AccountingDocumentType>("Factura");
  const [estado, setEstado] = useState<AccountingDocumentState>("Borrador");
  const [sucursalId, setSucursalId] = useState<DesiredBranchId>("plaza-inter");
  const [tercero, setTercero] = useState("Cliente por completar");
  const [ruc, setRuc] = useState("");
  const [concepto, setConcepto] = useState("Documento contable base para revisión.");
  const [documentoOrigen, setDocumentoOrigen] = useState("");
  const [subtotal, setSubtotal] = useState("0");
  const [retencion1, setRetencion1] = useState("0");
  const [retencion2, setRetencion2] = useState("0");
  const [abono, setAbono] = useState("0");
  const [formaPago, setFormaPago] = useState("Transferencia");
  const [banco, setBanco] = useState("");
  const [referencia, setReferencia] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const branch = desiredBranches.find((item) => item.id === sucursalId) ?? desiredBranches[0];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedSubtotal = parseAmount(subtotal);
    const parsedRetencion1 = parseAmount(retencion1);
    const parsedRetencion2 = parseAmount(retencion2);
    const parsedAbono = parseAmount(abono);
    const total = Math.max(
      parsedSubtotal - parsedAbono - parsedRetencion1 - parsedRetencion2,
      0,
    );

    onCreate({
      tipo,
      numero: `${documentPrefixByType[tipo]}-${Date.now()}`,
      fecha: new Date().toISOString().slice(0, 10),
      tercero,
      ruc,
      sucursalId: branch.id,
      sucursalNombre: branch.name,
      concepto,
      documentoOrigen,
      subtotal: parsedSubtotal,
      retencion1: parsedRetencion1,
      retencion2: parsedRetencion2,
      abono: parsedAbono,
      total,
      estado,
      observaciones,
      creadoPor: "Contador General",
      fechaCreacion: new Date().toISOString().slice(0, 10),
      revisadoPor: ["Revisado", "Contabilizado", "Conciliado"].includes(estado) ? "Administrador General" : "",
      fechaRevision: ["Revisado", "Contabilizado", "Conciliado"].includes(estado)
        ? new Date().toISOString().slice(0, 10)
        : "",
      motivoAnulacion: estado === "Anulado" ? "Anulación interna demo pendiente de detalle." : "",
      contabilizadoPor: estado === "Contabilizado" || estado === "Conciliado" ? "Administrador General" : "",
      fechaContabilizacion: estado === "Contabilizado" || estado === "Conciliado"
        ? new Date().toISOString().slice(0, 10)
        : "",
      conciliadoPor: estado === "Conciliado" ? "Administrador General" : "",
      fechaConciliacion: estado === "Conciliado"
        ? new Date().toISOString().slice(0, 10)
        : "",
      anuladoPor: estado === "Anulado" ? "Administrador General" : "",
      fechaAnulacion: estado === "Anulado" ? new Date().toISOString().slice(0, 10) : "",
      observacionesContables: "",
      formaPago: tipo === "Recibo Oficial de Caja" ? formaPago : "",
      banco: tipo === "Recibo Oficial de Caja" ? banco : "",
      referencia: tipo === "Recibo Oficial de Caja" ? referencia : "",
      descripcionMoto: tipo === "Factura" ? buildMotorcycleInvoiceDescription() : [],
      origen: "Contabilidad demo",
    });

    setTercero("Cliente por completar");
    setRuc("");
    setConcepto("Documento contable base para revisión.");
    setDocumentoOrigen("");
    setSubtotal("0");
    setRetencion1("0");
    setRetencion2("0");
    setAbono("0");
    setBanco("");
    setReferencia("");
    setObservaciones("");
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#111]/70 p-5">
      <h3 className="text-xl font-black text-white">Registrar documento manual</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        Registro demo para revisión contable. No emite PDF, no conecta DGI y no reemplaza los documentos operativos de Caja.
      </p>
      <form className="mt-5 grid gap-4" onSubmit={submit}>
        <FormSectionTitle
          description="Uso secundario para ajustes o documentos no originados en Caja."
          title="Datos del documento"
        />
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Tipo">
            <Select value={tipo} onChange={(value) => setTipo(value as AccountingDocumentType)}>
              {accountingDocumentTypes.map((item) => <option key={item}>{item}</option>)}
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={estado} onChange={(value) => setEstado(value as AccountingDocumentState)}>
              {creatableAccountingDocumentStates.map((item) => <option key={item}>{item}</option>)}
            </Select>
          </Field>
          <Field label="Sucursal">
            <Select value={sucursalId} onChange={(value) => setSucursalId(value as DesiredBranchId)}>
              {desiredBranches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Field>
          <Field label="Cliente / proveedor"><TextInput value={tercero} onChange={setTercero} /></Field>
          <Field label="RUC o cédula"><TextInput value={ruc} onChange={setRuc} /></Field>
          <Field label="Documento origen"><TextInput value={documentoOrigen} onChange={setDocumentoOrigen} /></Field>
          <Field label="Subtotal"><TextInput type="number" value={subtotal} onChange={setSubtotal} /></Field>
          <Field label="Retención 1%"><TextInput type="number" value={retencion1} onChange={setRetencion1} /></Field>
          <Field label="Retención 2%"><TextInput type="number" value={retencion2} onChange={setRetencion2} /></Field>
          <Field label="Abono"><TextInput type="number" value={abono} onChange={setAbono} /></Field>
          <Field label="Forma de pago"><TextInput value={formaPago} onChange={setFormaPago} /></Field>
          <Field label="Banco"><TextInput value={banco} onChange={setBanco} /></Field>
          <Field label="Referencia"><TextInput value={referencia} onChange={setReferencia} /></Field>
        </div>
        <FormSectionTitle
          description="Concepto, notas y soporte visible en la vista previa contable."
          title="Resumen y observaciones"
        />
        <Field label="Concepto"><Textarea value={concepto} onChange={setConcepto} /></Field>
        <Field label="Observaciones"><Textarea value={observaciones} onChange={setObservaciones} /></Field>
        <Button type="submit">Registrar documento manual</Button>
      </form>
    </div>
  );
}

function AccountingDocumentPreview({ document }: { document: AccountingDocument | null }) {
  if (!document) {
    return (
      <Card className="p-8 text-center">
        <FileText className="mx-auto h-10 w-10 text-zinc-600" />
        <h3 className="mt-4 text-xl font-black text-white">Sin documento seleccionado</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
          Selecciona un documento del listado o crea un documento base para ver el preview contable.
        </p>
      </Card>
    );
  }

  const isReceipt = document.tipo === "Recibo Oficial de Caja";
  const isInvoice = document.tipo === "Factura";
  const lineLabel = isReceipt ? "Monto recibido" : document.tipo;

  return (
    <Card className="overflow-hidden border-white/15 bg-[#f7f3ea] text-zinc-950">
      <div className="border-b border-zinc-300/70 bg-zinc-950 px-6 py-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-red-300">MotoMas</div>
            <h3 className="mt-2 text-2xl font-black">{document.tipo}</h3>
            <p className="mt-1 text-sm text-zinc-300">Preview contable interno, no fiscal</p>
          </div>
          <div className="text-right text-sm">
            <div className="font-black">{document.numero}</div>
            <div className="text-zinc-300">{formatDate(document.fecha)}</div>
            <div className="mt-2 inline-flex rounded-full border border-white/20 px-3 py-1 text-xs font-black">
              {document.estado}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <PreviewBlock title={isReceipt ? "Recibimos de" : "Cliente / proveedor"} value={document.tercero} />
          <PreviewBlock title="RUC / cédula" value={document.ruc || "No registrado"} />
          <PreviewBlock title="Sucursal" value={document.sucursalNombre} />
          <PreviewBlock title="Documento origen" value={document.documentoOrigen || "No aplica"} />
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-300">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-[0.12em] text-white">
              <tr>
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-zinc-300">
                <td className="px-4 py-4">
                  <div className="font-black">{lineLabel}</div>
                  <div className="mt-1 text-zinc-600">{document.concepto}</div>
                  {isInvoice && document.descripcionMoto.length ? (
                    <div className="mt-4 grid gap-1 rounded-lg bg-white/70 p-3 font-mono text-xs text-zinc-700">
                      {document.descripcionMoto.map((line) => <span key={line}>{line}</span>)}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-4 text-right font-black">{formatMoney(document.subtotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="ml-auto max-w-sm space-y-2 rounded-xl border border-zinc-300 bg-white/75 p-4 text-sm">
          <TotalRow label="Subtotal" value={document.subtotal} />
          <TotalRow label="Retención 1%" value={document.retencion1} muted />
          <TotalRow label="Retención 2%" value={document.retencion2} muted />
          <TotalRow label="Abono" value={document.abono} muted />
          <div className="border-t border-zinc-300 pt-2">
            <TotalRow label={isReceipt ? "Total aplicado" : "Total"} value={document.total} strong />
          </div>
        </div>

        {isReceipt ? (
          <div className="grid gap-4 rounded-xl border border-zinc-300 bg-white/70 p-4 md:grid-cols-3">
            <PreviewBlock title="Forma de pago" value={document.formaPago || "No registrado"} />
            <PreviewBlock title="Banco" value={document.banco || "No aplica"} />
            <PreviewBlock title="Referencia" value={document.referencia || "No registrada"} />
          </div>
        ) : null}

        <div className="grid gap-4 rounded-xl border border-zinc-300 bg-white/70 p-4 md:grid-cols-3">
          <PreviewBlock title="Creado por" value={document.creadoPor || "No registrado"} />
          <PreviewBlock title="Revisado por" value={document.revisadoPor || "Pendiente"} />
          <PreviewBlock title="Fecha de revisión" value={document.fechaRevision ? formatDate(document.fechaRevision) : "Pendiente"} />
        </div>

        <div className="grid gap-4 rounded-xl border border-zinc-300 bg-white/70 p-4 md:grid-cols-3">
          <PreviewBlock title="Origen" value={document.origen} />
          <PreviewBlock title="Fecha de creacion" value={document.fechaCreacion ? formatDate(document.fechaCreacion) : "No registrada"} />
          <PreviewBlock title="Contabilizado por" value={document.contabilizadoPor || "Pendiente"} />
          <PreviewBlock title="Fecha de contabilizacion" value={document.fechaContabilizacion ? formatDate(document.fechaContabilizacion) : "Pendiente"} />
          <PreviewBlock title="Conciliado por" value={document.conciliadoPor || "Pendiente"} />
          <PreviewBlock title="Fecha de conciliacion" value={document.fechaConciliacion ? formatDate(document.fechaConciliacion) : "Pendiente"} />
          <PreviewBlock title="Forma de pago" value={document.formaPago || "No registrada"} />
          <PreviewBlock title="Banco" value={document.banco || "No aplica"} />
          <PreviewBlock title="Referencia bancaria" value={document.referencia || "No registrada"} />
        </div>

        {document.estado === "Anulado" ? (
          <div className="grid gap-4 rounded-xl border border-zinc-300 bg-white/70 p-4 md:grid-cols-2">
            <PreviewBlock title="Anulado por" value={document.anuladoPor || "No registrado"} />
            <PreviewBlock title="Fecha de anulacion" value={document.fechaAnulacion ? formatDate(document.fechaAnulacion) : "No registrada"} />
          </div>
        ) : null}

        {document.estado === "Anulado" ? (
          <PreviewBlock title="Motivo de anulación" value={document.motivoAnulacion || "No registrado"} />
        ) : null}

        <PreviewBlock title="Observaciones" value={document.observaciones || "Sin observaciones"} />
        <PreviewBlock title="Observaciones contables" value={document.observacionesContables || "Sin observaciones contables"} />
      </div>
    </Card>
  );
}

function PreviewBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">{title}</div>
      <div className="mt-1 font-black text-zinc-950">{value}</div>
    </div>
  );
}

function TotalRow({
  label,
  muted,
  strong,
  value,
}: {
  label: string;
  muted?: boolean;
  strong?: boolean;
  value: number;
}) {
  return (
    <div className={cn("flex justify-between gap-4", muted ? "text-zinc-500" : "text-zinc-800", strong ? "text-lg font-black text-zinc-950" : "")}>
      <span>{label}</span>
      <span>{formatMoney(value)}</span>
    </div>
  );
}

const documentPrefixByType: Record<AccountingDocumentType, string> = {
  Factura: "FAC",
  "Nota de Débito": "ND",
  "Nota de Crédito": "NC",
  "Recibo Oficial de Caja": "ROC",
};

function buildDocumentStatePatch(
  document: AccountingDocument,
  estado: AccountingDocumentState,
  userName: string,
  date: string,
  annulReason: string,
  accountingObservation: string,
): AccountingDocument {
  const base: AccountingDocument = {
    ...document,
    estado,
    observacionesContables:
      accountingObservation.trim() || document.observacionesContables,
  };

  if (estado === "Revisado") {
    return {
      ...base,
      revisadoPor: document.revisadoPor || userName,
      fechaRevision: document.fechaRevision || date,
    };
  }

  if (estado === "Contabilizado") {
    return {
      ...base,
      revisadoPor: document.revisadoPor || userName,
      fechaRevision: document.fechaRevision || date,
      contabilizadoPor: userName,
      fechaContabilizacion: date,
    };
  }

  if (estado === "Conciliado") {
    return {
      ...base,
      contabilizadoPor: document.contabilizadoPor || userName,
      fechaContabilizacion: document.fechaContabilizacion || date,
      conciliadoPor: userName,
      fechaConciliacion: date,
    };
  }

  if (estado === "Anulado") {
    return {
      ...base,
      motivoAnulacion: annulReason.trim(),
      anuladoPor: userName,
      fechaAnulacion: date,
    };
  }

  return base;
}

function hasRelatedVoucher(
  document: AccountingDocument,
  vouchers: AccountingVoucher[],
) {
  const needles = [document.numero, document.documentoOrigen]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return vouchers.some((voucher) => {
    const haystack = [voucher.numero, voucher.referencia, voucher.concepto]
      .join(" ")
      .toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
  });
}

type AccountingInventoryRow = {
  modelo: string;
  modeloSlug: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  cantidad: number;
  costoUnitario: number;
  costoTotal: number;
  saldoMinimo: number;
  estadoSaldo: "Correcto" | "Bajo mínimo";
  ultimoMovimiento: string;
};

function AccountingInventorySection({
  canSeeCost,
  rows,
  session,
}: {
  canSeeCost: boolean;
  rows: AccountingInventoryRow[];
  session: DemoSession;
}) {
  return (
    <DataTable
      columns={["Ítem / modelo", "Sucursal", "Cantidad", "Costo unitario", "Costo total", "Saldo mínimo", "Estado de saldo", "Último movimiento"]}
      rows={rows.map((row) => [
        row.modelo,
        row.sucursalNombre,
        String(row.cantidad),
        canSeeCost ? formatMoney(row.costoUnitario) : "Restringido",
        canSeeCost ? formatMoney(row.costoTotal) : "Restringido",
        String(row.saldoMinimo),
        row.estadoSaldo,
        row.ultimoMovimiento,
      ])}
      subtitle={
        session.role === "Gerente"
          ? `Costos visibles solo para ${session.branchName}.`
          : "Inventario contable con costos demo internos."
      }
      title="Inventario contable"
    />
  );
}

function PayrollSection({
  canWrite,
  onCreate,
  payroll,
}: {
  canWrite: boolean;
  onCreate: (input: Omit<AccountingPayrollRecord, "id" | "netoPagar">) => void;
  payroll: AccountingPayrollRecord[];
}) {
  return (
    <div className="space-y-6">
      {canWrite ? <PayrollForm onCreate={onCreate} /> : <ReadOnlyNotice />}
      <DataTable
        columns={["Empleado", "Cargo", "Sucursal", "Salario base", "Comisiones", "Bonos", "Deducciones", "Anticipos", "Neto a pagar", "Período", "Estado", "Observaciones"]}
        rows={payroll.map((record) => [
          record.empleado,
          record.cargo,
          record.sucursalNombre,
          formatMoney(record.salarioBase),
          formatMoney(record.comisiones),
          formatMoney(record.bonos),
          formatMoney(record.deducciones),
          formatMoney(record.anticipos),
          formatMoney(record.netoPagar),
          record.periodo,
          record.estado,
          record.observaciones,
        ])}
        title="Planilla salarial básica"
      />
    </div>
  );
}

function PayrollForm({ onCreate }: { onCreate: (input: Omit<AccountingPayrollRecord, "id" | "netoPagar">) => void }) {
  const [sucursalId, setSucursalId] = useState<DesiredBranchId>("plaza-inter");
  const [empleado, setEmpleado] = useState("");
  const [cargo, setCargo] = useState("");
  const [salarioBase, setSalarioBase] = useState("0");
  const branch = desiredBranches.find((item) => item.id === sucursalId) ?? desiredBranches[0];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      empleado,
      cargo,
      sucursalId: branch.id,
      sucursalNombre: branch.name,
      salarioBase: parseAmount(salarioBase),
      comisiones: 0,
      bonos: 0,
      deducciones: 0,
      anticipos: 0,
      periodo: "Julio 2026",
      estado: "Borrador",
      observaciones: "",
    });
    setEmpleado("");
    setCargo("");
    setSalarioBase("0");
  }

  return (
    <Card className="p-6">
      <h3 className="text-xl font-black text-white">Elaborar planilla básica</h3>
      <form className="mt-5 grid gap-4 md:grid-cols-5" onSubmit={submit}>
        <FormSectionTitle
          description="Periodo, empleado, sucursal y salario base para planilla demo."
          title="Datos de planilla"
        />
        <Field label="Empleado"><TextInput value={empleado} onChange={setEmpleado} /></Field>
        <Field label="Cargo"><TextInput value={cargo} onChange={setCargo} /></Field>
        <Field label="Sucursal"><Select value={sucursalId} onChange={(value) => setSucursalId(value as DesiredBranchId)}>{desiredBranches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
        <Field label="Salario base"><TextInput type="number" value={salarioBase} onChange={setSalarioBase} /></Field>
        <div className="md:pt-7"><Button type="submit">Agregar planilla</Button></div>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        {payrollStatuses.map((status) => <Badge key={status} tone="gray">{status}</Badge>)}
      </div>
    </Card>
  );
}

function ChartAccountsSection({ accounts }: { accounts: AccountingChartAccount[] }) {
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [searchTerm, setSearchTerm] = useState("");
  const filteredAccounts = accounts.filter((account) => {
    const matchesType = typeFilter === "Todos" || account.tipo === typeFilter;
    const searchable = `${account.codigo} ${account.nombre} ${account.cuentaPadre}`.toLowerCase();
    return matchesType && searchable.includes(searchTerm.trim().toLowerCase());
  });

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Tipo">
            <Select value={typeFilter} onChange={setTypeFilter}>
              <option>Todos</option>
              <option>Activo</option>
              <option>Pasivo</option>
              <option>Patrimonio</option>
              <option>Ingreso</option>
              <option>Gasto</option>
              <option>Costo</option>
            </Select>
          </Field>
          <Field label="Buscar cuenta">
            <TextInput value={searchTerm} onChange={setSearchTerm} />
          </Field>
          <div className="md:pt-7">
            <Button type="button" variant="secondary">Exportar Excel</Button>
          </div>
        </div>
      </Card>
      <DataTable
        columns={["Codigo", "Nombre de cuenta", "Tipo", "Naturaleza", "Cuenta padre", "Estado", "Descripcion"]}
        rows={filteredAccounts.map((account) => [
          account.codigo,
          account.nombre,
          account.tipo,
          account.naturaleza,
          account.cuentaPadre,
          account.estado,
          account.descripcion,
        ])}
        subtitle="Catalogo demo para ordenar diarios y comprobantes. No implementa NIIF real."
        title="Catalogo de cuentas"
      />
    </div>
  );
}

function BanksSection({ accounts }: { accounts: AccountingBankAccount[] }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={Receipt} label="Cuentas bancarias" value={accounts.length} />
        <Metric icon={Calculator} label="Saldo demo" value={formatMoney(accounts.reduce((total, account) => total + account.saldoDemo, 0))} />
        <Metric icon={BarChart3} label="Activas" value={accounts.filter((account) => account.estado === "Activa").length} />
      </div>
      <DataTable
        columns={["Banco", "Cuenta bancaria", "Moneda", "Sucursal", "Saldo demo", "Estado", "Observaciones"]}
        rows={accounts.map((account) => [
          account.banco,
          account.cuentaBancaria,
          account.moneda,
          account.sucursalNombre,
          formatMoney(account.saldoDemo),
          account.estado,
          account.observaciones,
        ])}
        subtitle="Base interna para conciliacion demo. No conecta bancos reales ni importa estados de cuenta."
        title="Bancos y cuentas"
      />
    </div>
  );
}

function ReconciliationSection({
  documents,
  records,
}: {
  documents: AccountingDocument[];
  records: AccountingReconciliation[];
}) {
  const [statusFilter, setStatusFilter] = useState<BankReconciliationStatus | "Todos">("Todos");
  const [searchTerm, setSearchTerm] = useState("");
  const filteredRecords = records.filter((record) => {
    const matchesStatus = statusFilter === "Todos" || record.estado === statusFilter;
    const searchable = `${record.banco} ${record.referencia} ${record.documentoRelacionado}`.toLowerCase();
    return matchesStatus && searchable.includes(searchTerm.trim().toLowerCase());
  });

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Estado">
            <Select value={statusFilter} onChange={(value) => setStatusFilter(value as BankReconciliationStatus | "Todos")}>
              <option>Todos</option>
              {bankReconciliationStatuses.map((status) => <option key={status}>{status}</option>)}
            </Select>
          </Field>
          <Field label="Buscar">
            <TextInput value={searchTerm} onChange={setSearchTerm} />
          </Field>
          <MiniMetric label="Documentos contabilizados" value={documents.filter((document) => document.estado === "Contabilizado").length} />
          <MiniMetric label="Pendientes" value={records.filter((record) => record.estado === "Pendiente").length} />
        </div>
      </Card>
      <DataTable
        columns={["Banco", "Cuenta", "Referencia", "Forma de pago", "Documento", "Monto", "Estado", "Fecha", "Fecha conciliacion", "Sucursal", "Observacion"]}
        rows={filteredRecords.map((record) => [
          record.banco,
          record.cuentaBancaria,
          record.referencia,
          record.formaPago,
          record.documentoRelacionado,
          formatMoney(record.monto),
          record.estado,
          record.fecha,
          record.fechaConciliacion || "Pendiente",
          record.sucursalNombre,
          record.observacion,
        ])}
        subtitle="Conciliacion bancaria interna de demo. No integra bancos reales."
        title="Conciliacion bancaria demo"
      />
    </div>
  );
}

function AccountingClosuresSection({
  accountingClosures,
  cashierClosures,
}: {
  accountingClosures: AccountingClosure[];
  cashierClosures: CashierClosure[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={Receipt} label="Cierres contables" value={accountingClosures.length} />
        <Metric icon={ClipboardList} label="Cierres de caja cerrados" value={cashierClosures.filter((closure) => closure.estado === "Cerrado").length} />
        <Metric icon={Calculator} label="Diferencias caja" value={formatMoney(cashierClosures.reduce((total, closure) => total + closure.diferencias, 0))} />
      </div>
      <DataTable
        columns={["Periodo", "Sucursal", "Ingresos", "Egresos", "Retenciones", "Abonos", "Total caja", "Diferencias", "Estado", "Observaciones"]}
        rows={accountingClosures.map((closure) => [
          closure.periodo,
          closure.sucursalNombre,
          formatMoney(closure.totalIngresos),
          formatMoney(closure.totalEgresos),
          formatMoney(closure.totalRetenciones),
          formatMoney(closure.totalAbonos),
          formatMoney(closure.totalCaja),
          formatMoney(closure.diferencias),
          closure.estado,
          closure.observaciones,
        ])}
        subtitle="Cierres contables demo. Caja prepara cierres diarios; Contabilidad revisa el periodo."
        title="Cierres contables"
      />
    </div>
  );
}

function ThirdPartiesSection({ parties }: { parties: AccountingThirdParty[] }) {
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [searchTerm, setSearchTerm] = useState("");
  const filteredParties = parties.filter((party) => {
    const matchesType = typeFilter === "Todos" || party.tipo === typeFilter;
    const searchable = `${party.nombre} ${party.rucCedula} ${party.telefono}`.toLowerCase();
    return matchesType && searchable.includes(searchTerm.trim().toLowerCase());
  });

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Tipo">
            <Select value={typeFilter} onChange={setTypeFilter}>
              <option>Todos</option>
              {thirdPartyTypes.map((type) => <option key={type}>{type}</option>)}
            </Select>
          </Field>
          <Field label="Buscar tercero">
            <TextInput value={searchTerm} onChange={setSearchTerm} />
          </Field>
          <MiniMetric label="Saldo relacionado" value={formatMoney(filteredParties.reduce((total, party) => total + party.saldoRelacionado, 0))} />
        </div>
      </Card>
      <DataTable
        columns={["Tipo", "Nombre", "RUC / cedula", "Telefono", "Correo", "Sucursal", "Saldo relacionado", "Documentos asociados"]}
        rows={filteredParties.map((party) => [
          party.tipo,
          party.nombre,
          party.rucCedula,
          party.telefono,
          party.correo,
          party.sucursalNombre,
          formatMoney(party.saldoRelacionado),
          String(party.documentosAsociados),
        ])}
        subtitle="Base demo de terceros contables. No duplica ni reemplaza clientes comerciales."
        title="Terceros contables"
      />
    </div>
  );
}

function AccountingReports({
  accountingClosures,
  bankAccounts,
  canWrite,
  cashierClosures,
  documents,
  expenses,
  inventoryRows,
  journalEntries,
  onUpdateClosures,
  payroll,
  reconciliations,
  session,
  vouchers,
}: {
  accountingClosures: AccountingClosure[];
  bankAccounts: AccountingBankAccount[];
  canWrite: boolean;
  cashierClosures: CashierClosure[];
  documents: AccountingDocument[];
  expenses: AccountingExpense[];
  inventoryRows: AccountingInventoryRow[];
  journalEntries: AccountingJournalEntry[];
  onUpdateClosures: (closures: CashierClosure[]) => void;
  payroll: AccountingPayrollRecord[];
  reconciliations: AccountingReconciliation[];
  session: DemoSession;
  vouchers: AccountingVoucher[];
}) {
  const branchScoped = session.role === "Gerente";
  const visibleDocuments = filterAccountingDocumentsBySession(documents, session);
  const visibleJournalEntries = branchScoped ? [] : journalEntries;
  const visibleVouchers = branchScoped ? [] : vouchers;
  const pendingReview = visibleDocuments.filter(
    (document) => document.estado === "Borrador" || document.estado === "Emitido",
  ).length;
  const pendingAccounting = visibleDocuments.filter(
    (document) => document.estado === "Revisado",
  ).length;
  const pendingConciliation = visibleDocuments.filter(
    (document) => document.estado === "Contabilizado",
  ).length;
  const totalRetention1 = visibleDocuments.reduce((total, document) => total + document.retencion1, 0);
  const totalRetention2 = visibleDocuments.reduce((total, document) => total + document.retencion2, 0);
  const totalAbonos = visibleDocuments.reduce((total, document) => total + document.abono, 0);
  const totalSubtotal = visibleDocuments.reduce((total, document) => total + document.subtotal, 0);
  const totalDocumental = visibleDocuments.reduce((total, document) => total + document.total, 0);

  function reviewClosure(closureId: string) {
    if (!canWrite) return;
    onUpdateClosures(
      cashierClosures.map((closure) =>
        closure.id === closureId && closure.estado === "Cerrado"
          ? { ...closure, estado: "Revisado por Contabilidad" as const }
          : closure,
      ),
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {branchScoped ? null : (
        <Chart title="Comprobantes por tipo" data={group(visibleVouchers, (voucher) => voucher.tipo)} />
      )}
      <Chart title="Gastos por categoría" data={group(expenses, (expense) => expense.categoria)} />
      <Chart title="Gastos por sucursal" data={group(expenses, (expense) => expense.sucursalNombre)} />
      <Chart title="Documentos por tipo" data={group(visibleDocuments, (document) => document.tipo)} />
      <Chart title="Documentos por estado" data={group(visibleDocuments, (document) => document.estado)} />
      <Chart title="Documentos por origen" data={group(visibleDocuments, (document) => document.origen)} />
      <Chart title="Planilla por sucursal" data={group(payroll, (record) => record.sucursalNombre)} />
      <Chart title="Estado de saldo" data={group(inventoryRows, (row) => row.estadoSaldo)} />
      <Chart title="Conciliacion bancaria" data={group(reconciliations, (record) => record.estado)} />
      <Chart title="Cierres contables" data={group(accountingClosures, (closure) => closure.estado)} />
      <Chart title="Bancos por sucursal" data={group(bankAccounts, (account) => account.sucursalNombre)} />
      <Card className="p-5 md:col-span-2 xl:col-span-3">
        <h3 className="text-lg font-black text-white">Resumen contable</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <MiniMetric label="Diarios" value={branchScoped ? "Restringido" : visibleJournalEntries.length} />
          <MiniMetric label="Comprobantes" value={branchScoped ? "Restringido" : visibleVouchers.length} />
          <MiniMetric label="Costo inventario" value={formatMoney(inventoryRows.reduce((total, row) => total + row.costoTotal, 0))} />
          <MiniMetric label="Alcance" value={session.role === "Gerente" ? session.branchName : "Global"} />
          <MiniMetric label="Emitidos" value={visibleDocuments.filter((document) => document.estado === "Emitido").length} />
          <MiniMetric label="Revisados" value={visibleDocuments.filter((document) => document.estado === "Revisado").length} />
          <MiniMetric label="Contabilizados" value={visibleDocuments.filter((document) => document.estado === "Contabilizado").length} />
          <MiniMetric label="Conciliados" value={visibleDocuments.filter((document) => document.estado === "Conciliado").length} />
          <MiniMetric label="Anulados" value={visibleDocuments.filter((document) => document.estado === "Anulado").length} />
          <MiniMetric label="Pendientes de revisión" value={pendingReview} />
          <MiniMetric label="Pendientes de contabilizar" value={pendingAccounting} />
          <MiniMetric label="Pendientes de conciliar" value={pendingConciliation} />
          <MiniMetric label="Retención 1%" value={formatMoney(totalRetention1)} />
          <MiniMetric label="Retención 2%" value={formatMoney(totalRetention2)} />
          <MiniMetric label="Abonos" value={formatMoney(totalAbonos)} />
          <MiniMetric label="Subtotal documentos" value={formatMoney(totalSubtotal)} />
          <MiniMetric label="Total documental" value={formatMoney(totalDocumental)} />
          <MiniMetric label="Conciliaciones pendientes" value={reconciliations.filter((record) => record.estado === "Pendiente").length} />
          <MiniMetric label="Cierres abiertos" value={accountingClosures.filter((closure) => closure.estado === "Abierto").length} />
          <MiniMetric label="Saldo bancos demo" value={formatMoney(bankAccounts.reduce((total, account) => total + account.saldoDemo, 0))} />
        </div>
        {branchScoped ? (
          <p className="mt-4 text-sm leading-6 text-zinc-500">
            La vista de Gerente muestra únicamente costos, gastos y planilla de su sucursal. Diarios,
            comprobantes y documentos contables globales quedan reservados para Contador y Administrador.
          </p>
        ) : null}
      </Card>
      <CashierClosuresReport
        canWrite={canWrite}
        closures={cashierClosures}
        onReviewClosure={reviewClosure}
      />
    </div>
  );
}

function CashierClosuresReport({
  canWrite,
  closures,
  onReviewClosure,
}: {
  canWrite: boolean;
  closures: CashierClosure[];
  onReviewClosure: (closureId: string) => void;
}) {
  return (
    <Card className="p-5 md:col-span-2 xl:col-span-3">
      <h3 className="text-lg font-black text-white">Cierres de caja para revisión contable</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        Caja prepara y cierra. Contabilidad revisa cierres cerrados,
        diferencias, recibido y retenciones.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <MiniMetric label="Abiertos" value={closures.filter((closure) => closure.estado === "Abierto").length} />
        <MiniMetric label="Cerrados" value={closures.filter((closure) => closure.estado === "Cerrado").length} />
        <MiniMetric label="Revisados" value={closures.filter((closure) => closure.estado === "Revisado por Contabilidad").length} />
        <MiniMetric label="Total recibido" value={formatMoney(closures.reduce((total, closure) => total + closure.totalRecibido, 0))} />
        <MiniMetric label="Total retenciones" value={formatMoney(closures.reduce((total, closure) => total + closure.totalRetenciones, 0))} />
        <MiniMetric label="Diferencias" value={formatMoney(closures.reduce((total, closure) => total + closure.diferencias, 0))} />
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-zinc-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Sucursal</th>
              <th className="px-4 py-3">Cajero</th>
              <th className="px-4 py-3">Recibido</th>
              <th className="px-4 py-3">Retenciones</th>
              <th className="px-4 py-3">Diferencia</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {closures.length ? closures.map((closure) => (
              <tr key={closure.id}>
                <td className="px-4 py-4 text-zinc-400">{formatDate(closure.fecha)}</td>
                <td className="px-4 py-4 text-zinc-300">{closure.sucursalNombre}</td>
                <td className="px-4 py-4 text-zinc-300">{closure.cajero}</td>
                <td className="px-4 py-4 font-black text-white">{formatMoney(closure.totalRecibido)}</td>
                <td className="px-4 py-4 text-zinc-400">{formatMoney(closure.totalRetenciones)}</td>
                <td className="px-4 py-4 text-zinc-400">{formatMoney(closure.diferencias)}</td>
                <td className="px-4 py-4">
                  <Badge tone={closure.estado === "Revisado por Contabilidad" ? "blue" : "gray"}>{closure.estado}</Badge>
                </td>
                <td className="px-4 py-4">
                  {canWrite && closure.estado === "Cerrado" ? (
                    <Button onClick={() => onReviewClosure(closure.id)} type="button" variant="secondary">
                      Marcar revisado
                    </Button>
                  ) : (
                    <span className="text-xs text-zinc-500">Sin acción</span>
                  )}
                </td>
              </tr>
            )) : (
              <tr>
                <td className="px-4 py-8 text-center text-zinc-500" colSpan={8}>
                  Aún no hay cierres para este alcance. Cuando Caja cierre el día, aparecerán aquí para revisión.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number | string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-zinc-500">{label}</div>
          <div className="mt-2 text-3xl font-black text-white">{value}</div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-500/15 text-blue-300">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function AlertCard({ title, value }: { title: string; value: string }) {
  return (
    <Card className="border-orange-500/20 bg-orange-500/8 p-5">
      <div className="text-xs font-black uppercase tracking-[0.12em] text-orange-300">
        Alerta contable
      </div>
      <h3 className="mt-3 text-lg font-black text-white">{title}</h3>
      <p className="mt-2 text-sm text-zinc-400">{value}</p>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function DataTable({
  columns,
  rows,
  subtitle,
  title,
}: {
  columns: string[];
  rows: string[][];
  subtitle?: string;
  title: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-white/10 p-5">
        <h3 className="text-xl font-black text-white">{title}</h3>
        {subtitle ? <p className="mt-2 text-sm text-zinc-500">{subtitle}</p> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-[#181018] text-xs uppercase tracking-[0.12em] text-zinc-400">
            <tr>
              {columns.map((column) => (
                <th
                  className={cn(
                    "whitespace-nowrap px-4 py-3",
                    isMoneyColumn(column) ? "text-right" : "text-left",
                  )}
                  key={column}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <tr className="border-t border-white/7 transition hover:bg-white/[0.025]" key={`${title}-${index}`}>
                {row.map((cell, cellIndex) => {
                  const column = columns[cellIndex] ?? "";
                  return (
                    <td
                      className={cn(
                        "max-w-[280px] px-4 py-4 align-top text-zinc-300",
                        isMoneyColumn(column) ? "text-right font-mono text-zinc-100" : "text-left",
                      )}
                      key={`${title}-${index}-${cellIndex}`}
                    >
                      {renderTableCell(cell, column)}
                    </td>
                  );
                })}
              </tr>
            )) : (
              <tr><td className="px-4 py-8 text-center text-zinc-500" colSpan={columns.length}>Aún no hay registros para esta sección. Cuando se registren datos contables, aparecerán aquí.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function isMoneyColumn(column: string) {
  return /monto|costo|total|debe|haber|retencion|abono|salario|neto|diferencia|egreso|ingreso|base/i.test(column);
}

function renderTableCell(cell: string, column: string) {
  if (!cell) return "-";
  const looksLikeState = /estado|conciliacion|saldo/i.test(column);
  if (looksLikeState) {
    const normalized = cell.toLowerCase();
    const isDanger = normalized.includes("anulado") || normalized.includes("bajo") || normalized.includes("descuadrado");
    const isInfo = normalized.includes("conciliado") || normalized.includes("contabilizado") || normalized.includes("activa");
    return <Badge tone={isDanger ? "red" : isInfo ? "blue" : "gray"}>{cell}</Badge>;
  }
  return <span className="line-clamp-2">{cell}</span>;
}

function Chart({ title, data }: { title: string; data: [string, number][] }) {
  const max = Math.max(...data.map(([, value]) => value), 1);

  return (
    <Card className="p-5">
      <h3 className="text-lg font-black text-white">{title}</h3>
      <div className="mt-4 space-y-3">
        {data.length ? data.map(([label, value]) => (
          <div key={label}>
            <div className="flex justify-between gap-3 text-xs">
              <span className="truncate text-zinc-400">{label}</span>
              <span className="font-black text-white">{value}</span>
            </div>
            <div className="mt-1 h-2 rounded bg-white/10">
              <div className="h-full rounded bg-blue-500" style={{ width: `${Math.round((value / max) * 100)}%` }} />
            </div>
          </div>
        )) : <div className="text-sm text-zinc-500">Aún no hay datos para este reporte.</div>}
      </div>
    </Card>
  );
}

function AccountingRestricted({ description, title }: { description: string; title: string }) {
  return (
    <Card className="p-8 text-center">
      <Calculator className="mx-auto h-10 w-10 text-zinc-600" />
      <h2 className="mt-4 text-2xl font-black text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">{description}</p>
    </Card>
  );
}

function ReadOnlyNotice() {
  return (
    <Card className="border-blue-500/20 bg-blue-500/8 p-5 text-sm leading-6 text-zinc-300">
      Tu rol tiene acceso de consulta en esta sección. El registro contable queda limitado a Contador y Administrador.
    </Card>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function FormSectionTitle({ description, title }: { description?: string; title: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 md:col-span-full">
      <div className="text-xs font-black uppercase tracking-[0.14em] text-zinc-400">
        {title}
      </div>
      {description ? <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p> : null}
    </div>
  );
}

function TextInput({ onChange, type = "text", value }: { onChange: (value: string) => void; type?: string; value: string }) {
  return (
    <input
      className="h-11 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm font-semibold text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15"
      onChange={(event) => onChange(event.target.value)}
      type={type}
      value={value}
    />
  );
}

function Textarea({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  return (
    <textarea
      className="min-h-[92px] w-full rounded-xl border border-white/10 bg-[#141414] px-4 py-3 text-sm font-semibold text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  );
}

function Select({ children, onChange, value }: { children: ReactNode; onChange: (value: string) => void; value: string }) {
  return (
    <select
      className="h-11 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm font-semibold text-zinc-100 outline-none transition focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {children}
    </select>
  );
}

function buildAccountingInventoryRows(
  units: InventoryUnit[],
  costs: AccountingInventoryCost[],
  session: DemoSession | null,
): AccountingInventoryRow[] {
  const grouped = new Map<string, InventoryUnit[]>();

  units.forEach((unit) => {
    const key = `${unit.modeloSlug}::${unit.sucursalActualId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), unit]);
  });

  return Array.from(grouped.entries())
    .map(([key, groupedUnits]) => {
      const [modeloSlug, sucursalId] = key.split("::") as [string, DesiredBranchId];
      const firstUnit = groupedUnits[0];
      const cost = costs.find(
        (item) => item.modeloSlug === modeloSlug && item.sucursalId === sucursalId,
      );
      const costoUnitario = cost?.costoUnitario ?? 0;
      const saldoMinimo = cost?.saldoMinimo ?? 0;
      const lastMovement = groupedUnits
        .flatMap((unit) => unit.historialMovimientos)
        .sort((left, right) => right.fecha.localeCompare(left.fecha))[0];

      const estadoSaldo: AccountingInventoryRow["estadoSaldo"] =
        groupedUnits.length <= saldoMinimo ? "Bajo mínimo" : "Correcto";

      return {
        modelo: firstUnit?.modelo ?? cost?.modelo ?? "Modelo no encontrado",
        modeloSlug,
        sucursalId,
        sucursalNombre: firstUnit?.sucursalActual ?? cost?.sucursalNombre ?? "Sucursal no encontrada",
        cantidad: groupedUnits.length,
        costoUnitario,
        costoTotal: groupedUnits.length * costoUnitario,
        saldoMinimo,
        estadoSaldo,
        ultimoMovimiento: lastMovement
          ? `${lastMovement.tipo} / ${formatDate(lastMovement.fecha)}`
          : "Sin movimiento",
      };
    })
    .filter((row) => {
      if (session?.role !== "Gerente") return true;
      return row.sucursalId === session.branchId;
    })
    .sort((left, right) => left.modelo.localeCompare(right.modelo));
}

function filterExpensesBySession(expenses: AccountingExpense[], session: DemoSession) {
  if (session.role !== "Gerente") return expenses;
  return expenses.filter((expense) => expense.sucursalId === session.branchId);
}

function filterAccountingDocumentsBySession(
  documents: AccountingDocument[],
  session: DemoSession,
) {
  if (session.role !== "Gerente") return documents;
  return documents.filter((document) => document.sucursalId === session.branchId);
}

function filterCashierClosuresBySession(
  closures: CashierClosure[],
  session: DemoSession,
) {
  if (session.role !== "Gerente") return closures;
  return closures.filter((closure) => closure.sucursalId === session.branchId);
}

function filterPayrollBySession(payroll: AccountingPayrollRecord[], session: DemoSession) {
  if (session.role !== "Gerente") return payroll;
  return payroll.filter((record) => record.sucursalId === session.branchId);
}

function filterBankAccountsBySession(accounts: AccountingBankAccount[], session: DemoSession) {
  if (session.role !== "Gerente") return accounts;
  return accounts.filter((account) => account.sucursalId === session.branchId);
}

function filterReconciliationsBySession(records: AccountingReconciliation[], session: DemoSession) {
  if (session.role !== "Gerente") return records;
  return records.filter((record) => record.sucursalId === session.branchId);
}

function filterAccountingClosuresBySession(closures: AccountingClosure[], session: DemoSession) {
  if (session.role !== "Gerente") return closures;
  return closures.filter((closure) => closure.sucursalId === session.branchId);
}

function filterThirdPartiesBySession(parties: AccountingThirdParty[], session: DemoSession) {
  if (session.role !== "Gerente") return parties;
  return parties.filter((party) => party.sucursalId === session.branchId);
}

function group<T>(items: T[], key: (item: T) => string) {
  return Object.entries(
    items.reduce<Record<string, number>>((accumulator, item) => {
      const label = key(item) || "Sin dato";
      accumulator[label] = (accumulator[label] ?? 0) + 1;
      return accumulator;
    }, {}),
  ).sort((left, right) => right[1] - left[1]);
}

function parseAmount(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
