"use client";

import Link from "next/link";
import {
  Banknote,
  ClipboardList,
  CreditCard,
  FileText,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  buildMotorcycleInvoiceDescription,
} from "@/data/operations/accounting";
import {
  calculateCashierTotal,
  calculateRetention,
  cashierClosureStates,
  cashierDocumentStates,
  cashierNoteTypes,
  cashierPaymentMethods,
  roundMoney,
  type CashierClosure,
  type CashierDocumentState,
  type CashierInvoice,
  type CashierNote,
  type CashierNoteType,
  type CashierReceipt,
} from "@/data/operations/cashier";
import {
  desiredBranches,
  getDesiredBranch,
  type DesiredBranchId,
} from "@/data/operations/leads";
import {
  addCashierClosure,
  addCashierInvoice,
  addCashierNote,
  addCashierReceipt,
  readCashierClosures,
  readCashierInvoices,
  readCashierNotes,
  readCashierReceipts,
  updateCashierClosures,
} from "@/features/operations/services/cashier-service";
import {
  readDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";
import { cn } from "@/lib/utils";

type CashierSection =
  | "dashboard"
  | "facturacion"
  | "recibos"
  | "notas"
  | "cierres";
type CashierBranch = (typeof desiredBranches)[number];

const sectionNav: { href: string; label: string; section: CashierSection }[] = [
  { href: "/panel/caja", label: "Dashboard", section: "dashboard" },
  { href: "/panel/caja/facturacion", label: "Facturación", section: "facturacion" },
  { href: "/panel/caja/recibos", label: "Recibos", section: "recibos" },
  { href: "/panel/caja/notas", label: "Notas", section: "notas" },
  { href: "/panel/caja/cierres", label: "Cierres", section: "cierres" },
];

export function CashierPanel({ section = "dashboard" }: { section?: CashierSection }) {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [invoices, setInvoices] = useState<CashierInvoice[]>([]);
  const [receipts, setReceipts] = useState<CashierReceipt[]>([]);
  const [notes, setNotes] = useState<CashierNote[]>([]);
  const [closures, setClosures] = useState<CashierClosure[]>([]);
  const [stateFilter, setStateFilter] = useState("Todos");
  const [branchFilter, setBranchFilter] = useState("Todos");
  const [noteTypeFilter, setNoteTypeFilter] = useState("Todos");

  useEffect(() => {
    function sync() {
      setSession(readDemoSession());
      setInvoices(readCashierInvoices());
      setReceipts(readCashierReceipts());
      setNotes(readCashierNotes());
      setClosures(readCashierClosures());
    }

    sync();
    return subscribeToDemoSession(sync);
  }, []);

  const canUseCashier =
    session?.role === "Cajero" || session?.role === "Administrador";
  const scopedBranches = useMemo(() => {
    if (!session) return [];
    if (session.role === "Cajero" && session.branchId !== "all") {
      return desiredBranches.filter((branch) => branch.id === session.branchId);
    }
    return desiredBranches;
  }, [session]);

  const scopedInvoices = useMemo(
    () => filterByScope(invoices, session),
    [invoices, session],
  );
  const scopedReceipts = useMemo(
    () => filterByScope(receipts, session),
    [receipts, session],
  );
  const scopedNotes = useMemo(() => filterByScope(notes, session), [notes, session]);
  const scopedClosures = useMemo(
    () => filterByScope(closures, session),
    [closures, session],
  );

  if (!session) {
    return (
      <CashierRestricted
        description="Inicia sesión demo para acceder al área operativa de caja."
        title="Sesión interna requerida"
      />
    );
  }

  if (!canUseCashier) {
    return (
      <CashierRestricted
        description="Caja es un área separada. Este rol no puede emitir documentos operativos, ver cierres de caja ni modificar documentos de caja."
        title="Caja restringida"
      />
    );
  }

  const filteredInvoices = applyDocumentFilters(scopedInvoices, stateFilter, branchFilter);
  const filteredReceipts = applyDocumentFilters(scopedReceipts, stateFilter, branchFilter);
  const filteredNotes = applyDocumentFilters(scopedNotes, stateFilter, branchFilter).filter(
    (note) => noteTypeFilter === "Todos" || note.tipo === noteTypeFilter,
  );
  const filteredClosures = applyClosureFilters(scopedClosures, stateFilter, branchFilter);

  return (
    <CashierShell section={section} session={session}>
      <div className="grid gap-6">
        <CashierSummary
          closures={scopedClosures}
          invoices={scopedInvoices}
          notes={scopedNotes}
          receipts={scopedReceipts}
        />

        {section === "dashboard" ? (
          <CashierDashboard
            closures={scopedClosures}
            invoices={scopedInvoices}
            notes={scopedNotes}
            receipts={scopedReceipts}
          />
        ) : null}

        {section !== "dashboard" ? (
          <CashierFilters
            branchFilter={branchFilter}
            branches={scopedBranches}
            noteTypeFilter={noteTypeFilter}
            onBranchFilter={setBranchFilter}
            onNoteTypeFilter={setNoteTypeFilter}
            onStateFilter={setStateFilter}
            section={section}
            stateFilter={stateFilter}
          />
        ) : null}

        {section === "facturacion" ? (
          <InvoicesSection
            branches={scopedBranches}
            invoices={filteredInvoices}
            session={session}
            onCreate={(input) => setInvoices(addCashierInvoice(invoices, input))}
          />
        ) : null}

        {section === "recibos" ? (
          <ReceiptsSection
            branches={scopedBranches}
            receipts={filteredReceipts}
            session={session}
            onCreate={(input) => setReceipts(addCashierReceipt(receipts, input))}
          />
        ) : null}

        {section === "notas" ? (
          <NotesSection
            branches={scopedBranches}
            notes={filteredNotes}
            session={session}
            onCreate={(input) => setNotes(addCashierNote(notes, input))}
          />
        ) : null}

        {section === "cierres" ? (
          <ClosuresSection
            branches={scopedBranches}
            closures={filteredClosures}
            session={session}
            onCreate={(input) => setClosures(addCashierClosure(closures, input))}
            onUpdate={(nextVisibleClosures) => {
              const updatedById = new Map(
                nextVisibleClosures.map((closure) => [closure.id, closure]),
              );
              setClosures(
                updateCashierClosures(
                  closures.map((closure) => updatedById.get(closure.id) ?? closure),
                ),
              );
            }}
          />
        ) : null}
      </div>
    </CashierShell>
  );
}

function CashierShell({
  children,
  section,
  session,
}: {
  children: ReactNode;
  section: CashierSection;
  session: DemoSession;
}) {
  return (
    <section className="grid gap-6">
      <Card className="overflow-hidden">
        <div className="border-b border-white/10 bg-white/[0.035] p-6">
          <Badge tone="blue">Caja</Badge>
          <h2 className="mt-4 text-2xl font-black text-white">
            Emisión operativa de documentos
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-500">
            Caja emite documentos demo, registra abonos y prepara cierres.
            Contabilidad revisa, contabiliza y concilia los documentos
            sincronizados. No hay facturación fiscal, PDF ni integración DGI.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-zinc-500">
            <Badge tone="gray">{session.userName}</Badge>
            <Badge tone="gray">{session.branchName}</Badge>
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto p-3" aria-label="Caja">
          {sectionNav.map((item) => (
            <Link
              className={cn(
                "min-w-max rounded-xl border px-4 py-2 text-sm font-bold transition",
                section === item.section
                  ? "border-blue-500/40 bg-blue-500/12 text-blue-300"
                  : "border-white/10 bg-white/[0.035] text-zinc-400 hover:bg-white/[0.065] hover:text-white",
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

function CashierSummary({
  closures,
  invoices,
  notes,
  receipts,
}: {
  closures: CashierClosure[];
  invoices: CashierInvoice[];
  notes: CashierNote[];
  receipts: CashierReceipt[];
}) {
  const totalFacturado = invoices.reduce((sum, invoice) => sum + invoice.subtotal, 0);
  const totalRecibido = receipts.reduce((sum, receipt) => sum + receipt.totalAplicado, 0);
  const totalRetenciones =
    invoices.reduce((sum, invoice) => sum + invoice.retencion1 + invoice.retencion2, 0) +
    receipts.reduce((sum, receipt) => sum + receipt.retencion1 + receipt.retencion2, 0) +
    notes.reduce((sum, note) => sum + note.retencion1 + note.retencion2, 0);
  const cierresAbiertos = closures.filter((closure) => closure.estado === "Abierto").length;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={FileText} label="Facturas emitidas" value={invoices.length} />
      <MetricCard icon={Receipt} label="Recibos emitidos" value={receipts.length} />
      <MetricCard icon={Banknote} label="Total recibido" value={formatAmount(totalRecibido)} />
      <MetricCard icon={ClipboardList} label="Retenciones registradas" value={formatAmount(totalRetenciones)} />
      <MetricCard icon={CreditCard} label="Total facturado" value={formatAmount(totalFacturado)} />
      <MetricCard icon={FileText} label="Notas emitidas" value={notes.length} />
      <MetricCard icon={ClipboardList} label="Cierres abiertos" value={cierresAbiertos} />
      <MetricCard icon={Receipt} label="Documentos a contabilidad" value={invoices.length + receipts.length + notes.length} />
    </div>
  );
}

function CashierDashboard(props: {
  closures: CashierClosure[];
  invoices: CashierInvoice[];
  notes: CashierNote[];
  receipts: CashierReceipt[];
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Badge tone="gray">Flujo Caja → Contabilidad</Badge>
          <h3 className="mt-4 text-xl font-black text-white">Dashboard de caja</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            Usa las subrutas para emitir documentos, registrar pagos y preparar
            cierres diarios. Los documentos emitidos quedan visibles en
            Contabilidad como documentos internos para revisión.
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <RecentDocuments title="Últimas facturas" rows={props.invoices.slice(0, 4)} />
        <RecentDocuments title="Últimos recibos" rows={props.receipts.slice(0, 4)} />
        <RecentDocuments title="Últimas notas" rows={props.notes.slice(0, 4)} />
        <RecentClosures rows={props.closures.slice(0, 4)} />
      </div>
    </Card>
  );
}

function CashierFilters({
  branchFilter,
  branches,
  noteTypeFilter,
  onBranchFilter,
  onNoteTypeFilter,
  onStateFilter,
  section,
  stateFilter,
}: {
  branchFilter: string;
  branches: readonly CashierBranch[];
  noteTypeFilter: string;
  onBranchFilter: (value: string) => void;
  onNoteTypeFilter: (value: string) => void;
  onStateFilter: (value: string) => void;
  section: CashierSection;
  stateFilter: string;
}) {
  const stateOptions = section === "cierres" ? cashierClosureStates : cashierDocumentStates;

  return (
    <Card className="grid gap-4 p-5 md:grid-cols-3">
      {section === "notas" ? (
        <SelectField
          label="Tipo"
          onChange={onNoteTypeFilter}
          options={["Todos", ...cashierNoteTypes]}
          value={noteTypeFilter}
        />
      ) : null}
      <SelectField
        label="Estado"
        onChange={onStateFilter}
        options={["Todos", ...stateOptions]}
        value={stateFilter}
      />
      <SelectField
        label="Sucursal"
        onChange={onBranchFilter}
        options={["Todos", ...branches.map((branch) => branch.name)]}
        value={branchFilter}
      />
    </Card>
  );
}

function InvoicesSection({
  branches,
  invoices,
  onCreate,
  session,
}: {
  branches: readonly CashierBranch[];
  invoices: CashierInvoice[];
  onCreate: (input: Omit<CashierInvoice, "id" | "numero"> & { numero?: string }) => void;
  session: DemoSession;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <InvoiceForm branches={branches} onCreate={onCreate} session={session} />
      <DocumentsTable
        empty="Aún no hay facturas para este alcance. Cuando Caja emita una factura operativa, aparecerá aquí y pasará a revisión contable."
        rows={invoices}
        title="Facturas operativas"
      />
    </div>
  );
}

function ReceiptsSection({
  branches,
  receipts,
  onCreate,
  session,
}: {
  branches: readonly CashierBranch[];
  receipts: CashierReceipt[];
  onCreate: (input: Omit<CashierReceipt, "id" | "numero"> & { numero?: string }) => void;
  session: DemoSession;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <ReceiptForm branches={branches} onCreate={onCreate} session={session} />
      <DocumentsTable
        empty="Aún no hay recibos para este alcance. Cuando Caja registre un pago o abono, aparecerá aquí y quedará disponible para Contabilidad."
        rows={receipts}
        title="Recibos oficiales de caja"
      />
    </div>
  );
}

function NotesSection({
  branches,
  notes,
  onCreate,
  session,
}: {
  branches: readonly CashierBranch[];
  notes: CashierNote[];
  onCreate: (input: Omit<CashierNote, "id" | "numero"> & { numero?: string }) => void;
  session: DemoSession;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <NoteForm branches={branches} onCreate={onCreate} session={session} />
      <NotesTable rows={notes} />
    </div>
  );
}

function ClosuresSection({
  branches,
  closures,
  onCreate,
  onUpdate,
  session,
}: {
  branches: readonly CashierBranch[];
  closures: CashierClosure[];
  onCreate: (input: Omit<CashierClosure, "id">) => void;
  onUpdate: (closures: CashierClosure[]) => void;
  session: DemoSession;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <ClosureForm branches={branches} onCreate={onCreate} session={session} />
      <ClosuresTable onUpdate={onUpdate} rows={closures} />
    </div>
  );
}

function InvoiceForm({
  branches,
  onCreate,
  session,
}: {
  branches: readonly CashierBranch[];
  onCreate: (input: Omit<CashierInvoice, "id" | "numero"> & { numero?: string }) => void;
  session: DemoSession;
}) {
  const initialBranch = getInitialBranch(branches, session);
  const [cliente, setCliente] = useState("");
  const [rucCedula, setRucCedula] = useState("");
  const [branchId, setBranchId] = useState<DesiredBranchId>(initialBranch.id);
  const [descripcion, setDescripcion] = useState("Factura operativa de motocicleta.");
  const [subtotal, setSubtotal] = useState(0);
  const [abono, setAbono] = useState(0);
  const [ret1, setRet1] = useState(false);
  const [ret2, setRet2] = useState(false);
  const [formaPago, setFormaPago] = useState("Efectivo");
  const [banco, setBanco] = useState("");
  const [referencia, setReferencia] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const retencion1 = ret1 ? calculateRetention(subtotal, 0.01) : 0;
  const retencion2 = ret2 ? calculateRetention(subtotal, 0.02) : 0;
  const total = calculateCashierTotal(subtotal, abono, retencion1, retencion2);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const branch = getDesiredBranch(branchId) ?? initialBranch;
    onCreate({
      fecha: today(),
      cliente: cliente.trim() || "Cliente sin registrar",
      rucCedula: rucCedula.trim(),
      sucursalId: branch.id,
      sucursalNombre: branch.name,
      items: [
        {
          id: `ITEM-${Date.now()}`,
          descripcion: descripcion.trim() || "Ítem operativo demo",
          cantidad: 1,
          precioUnitario: roundMoney(subtotal),
          total: roundMoney(subtotal),
        },
      ],
      descripcion: descripcion.trim() || "Factura operativa demo.",
      subtotal: roundMoney(subtotal),
      abono: roundMoney(abono),
      retencion1,
      retencion2,
      total,
      formaPago: formaPago as CashierInvoice["formaPago"],
      banco: banco.trim(),
      referencia: referencia.trim(),
      estado: "Emitido",
      elaboradoPor: session.userName,
      observaciones: observaciones.trim(),
      descripcionMoto: buildMotorcycleInvoiceDescription(),
    });
    setCliente("");
    setRucCedula("");
    setSubtotal(0);
    setAbono(0);
    setObservaciones("");
  }

  return (
    <CashierFormCard title="Emitir factura operativa">
      <form className="grid gap-4" onSubmit={submit}>
        <InputField label="Cliente" onChange={setCliente} required value={cliente} />
        <InputField label="RUC/cédula" onChange={setRucCedula} value={rucCedula} />
        <BranchField branchId={branchId} branches={branches} onChange={setBranchId} />
        <InputField label="Descripción" onChange={setDescripcion} value={descripcion} />
        <MoneyField label="Subtotal" onChange={setSubtotal} value={subtotal} />
        <MoneyField label="Abono" onChange={setAbono} value={abono} />
        <RetentionFields ret1={ret1} ret2={ret2} setRet1={setRet1} setRet2={setRet2} />
        <PaymentFields
          banco={banco}
          formaPago={formaPago}
          referencia={referencia}
          setBanco={setBanco}
          setFormaPago={setFormaPago}
          setReferencia={setReferencia}
        />
        <InputField label="Observaciones" onChange={setObservaciones} value={observaciones} />
        <TotalPreview retencion1={retencion1} retencion2={retencion2} total={total} />
        <Button type="submit">Emitir factura</Button>
      </form>
    </CashierFormCard>
  );
}

function ReceiptForm({
  branches,
  onCreate,
  session,
}: {
  branches: readonly CashierBranch[];
  onCreate: (input: Omit<CashierReceipt, "id" | "numero"> & { numero?: string }) => void;
  session: DemoSession;
}) {
  const initialBranch = getInitialBranch(branches, session);
  const [recibimosDe, setRecibimosDe] = useState("");
  const [rucCedula, setRucCedula] = useState("");
  const [concepto, setConcepto] = useState("Abono recibido.");
  const [facturaRelacionada, setFacturaRelacionada] = useState("");
  const [branchId, setBranchId] = useState<DesiredBranchId>(initialBranch.id);
  const [montoRecibido, setMontoRecibido] = useState(0);
  const [abono, setAbono] = useState(0);
  const [ret1, setRet1] = useState(false);
  const [ret2, setRet2] = useState(false);
  const [formaPago, setFormaPago] = useState("Efectivo");
  const [banco, setBanco] = useState("");
  const [referencia, setReferencia] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const retencion1 = ret1 ? calculateRetention(montoRecibido, 0.01) : 0;
  const retencion2 = ret2 ? calculateRetention(montoRecibido, 0.02) : 0;
  const totalAplicado = calculateCashierTotal(
    montoRecibido,
    abono,
    retencion1,
    retencion2,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const branch = getDesiredBranch(branchId) ?? initialBranch;
    onCreate({
      fecha: today(),
      recibimosDe: recibimosDe.trim() || "Cliente sin registrar",
      rucCedula: rucCedula.trim(),
      concepto: concepto.trim() || "Pago operativo demo.",
      facturaRelacionada: facturaRelacionada.trim(),
      formaPago: formaPago as CashierReceipt["formaPago"],
      banco: banco.trim(),
      referencia: referencia.trim(),
      montoRecibido: roundMoney(montoRecibido),
      abono: roundMoney(abono),
      retencion1,
      retencion2,
      totalAplicado,
      elaboradoPor: session.userName,
      estado: "Emitido",
      observaciones: observaciones.trim(),
      sucursalId: branch.id,
      sucursalNombre: branch.name,
    });
    setRecibimosDe("");
    setRucCedula("");
    setMontoRecibido(0);
    setAbono(0);
    setObservaciones("");
  }

  return (
    <CashierFormCard title="Emitir recibo oficial de caja">
      <form className="grid gap-4" onSubmit={submit}>
        <InputField label="Recibimos de" onChange={setRecibimosDe} required value={recibimosDe} />
        <InputField label="RUC/cédula" onChange={setRucCedula} value={rucCedula} />
        <BranchField branchId={branchId} branches={branches} onChange={setBranchId} />
        <InputField label="Concepto" onChange={setConcepto} value={concepto} />
        <InputField label="Factura relacionada" onChange={setFacturaRelacionada} value={facturaRelacionada} />
        <MoneyField label="Monto recibido" onChange={setMontoRecibido} value={montoRecibido} />
        <MoneyField label="Abono aplicado" onChange={setAbono} value={abono} />
        <RetentionFields ret1={ret1} ret2={ret2} setRet1={setRet1} setRet2={setRet2} />
        <PaymentFields
          banco={banco}
          formaPago={formaPago}
          referencia={referencia}
          setBanco={setBanco}
          setFormaPago={setFormaPago}
          setReferencia={setReferencia}
        />
        <InputField label="Observaciones" onChange={setObservaciones} value={observaciones} />
        <TotalPreview retencion1={retencion1} retencion2={retencion2} total={totalAplicado} />
        <Button type="submit">Emitir recibo</Button>
      </form>
    </CashierFormCard>
  );
}

function NoteForm({
  branches,
  onCreate,
  session,
}: {
  branches: readonly CashierBranch[];
  onCreate: (input: Omit<CashierNote, "id" | "numero"> & { numero?: string }) => void;
  session: DemoSession;
}) {
  const initialBranch = getInitialBranch(branches, session);
  const [tipo, setTipo] = useState<CashierNoteType>("Nota de Débito");
  const [cliente, setCliente] = useState("");
  const [rucCedula, setRucCedula] = useState("");
  const [facturaRelacionada, setFacturaRelacionada] = useState("");
  const [concepto, setConcepto] = useState("");
  const [branchId, setBranchId] = useState<DesiredBranchId>(initialBranch.id);
  const [monto, setMonto] = useState(0);
  const [ret1, setRet1] = useState(false);
  const [ret2, setRet2] = useState(false);
  const [observaciones, setObservaciones] = useState("");

  const retencion1 = ret1 ? calculateRetention(monto, 0.01) : 0;
  const retencion2 = ret2 ? calculateRetention(monto, 0.02) : 0;
  const total = calculateCashierTotal(monto, 0, retencion1, retencion2);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const branch = getDesiredBranch(branchId) ?? initialBranch;
    onCreate({
      tipo,
      fecha: today(),
      cliente: cliente.trim() || "Cliente sin registrar",
      rucCedula: rucCedula.trim(),
      facturaRelacionada: facturaRelacionada.trim(),
      concepto: concepto.trim() || `${tipo} operativa demo.`,
      monto: roundMoney(monto),
      retencion1,
      retencion2,
      total,
      estado: "Emitido",
      elaboradoPor: session.userName,
      observaciones: observaciones.trim(),
      sucursalId: branch.id,
      sucursalNombre: branch.name,
    });
    setCliente("");
    setRucCedula("");
    setMonto(0);
    setObservaciones("");
  }

  return (
    <CashierFormCard title="Emitir nota operativa">
      <form className="grid gap-4" onSubmit={submit}>
        <SelectField
          label="Tipo de nota"
          onChange={(value) => setTipo(value as CashierNoteType)}
          options={[...cashierNoteTypes]}
          value={tipo}
        />
        <InputField label="Cliente" onChange={setCliente} required value={cliente} />
        <InputField label="RUC/cédula" onChange={setRucCedula} value={rucCedula} />
        <BranchField branchId={branchId} branches={branches} onChange={setBranchId} />
        <InputField label="Factura relacionada" onChange={setFacturaRelacionada} value={facturaRelacionada} />
        <InputField label="Concepto" onChange={setConcepto} value={concepto} />
        <MoneyField label="Monto" onChange={setMonto} value={monto} />
        <RetentionFields ret1={ret1} ret2={ret2} setRet1={setRet1} setRet2={setRet2} />
        <InputField label="Observaciones" onChange={setObservaciones} value={observaciones} />
        <TotalPreview retencion1={retencion1} retencion2={retencion2} total={total} />
        <Button type="submit">Emitir nota</Button>
      </form>
    </CashierFormCard>
  );
}

function ClosureForm({
  branches,
  onCreate,
  session,
}: {
  branches: readonly CashierBranch[];
  onCreate: (input: Omit<CashierClosure, "id">) => void;
  session: DemoSession;
}) {
  const initialBranch = getInitialBranch(branches, session);
  const [branchId, setBranchId] = useState<DesiredBranchId>(initialBranch.id);
  const [efectivo, setEfectivo] = useState(0);
  const [transferencias, setTransferencias] = useState(0);
  const [cheques, setCheques] = useState(0);
  const [tarjetas, setTarjetas] = useState(0);
  const [totalFacturado, setTotalFacturado] = useState(0);
  const [totalRetenciones, setTotalRetenciones] = useState(0);
  const [observaciones, setObservaciones] = useState("");
  const totalRecibido = roundMoney(efectivo + transferencias + cheques + tarjetas);
  const diferencias = roundMoney(totalRecibido - totalFacturado);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const branch = getDesiredBranch(branchId) ?? initialBranch;
    onCreate({
      fecha: today(),
      sucursalId: branch.id,
      sucursalNombre: branch.name,
      cajero: session.userName,
      efectivo: roundMoney(efectivo),
      transferencias: roundMoney(transferencias),
      cheques: roundMoney(cheques),
      tarjetas: roundMoney(tarjetas),
      totalFacturado: roundMoney(totalFacturado),
      totalRecibido,
      totalRetenciones: roundMoney(totalRetenciones),
      diferencias,
      estado: "Abierto",
      observaciones: observaciones.trim(),
    });
    setEfectivo(0);
    setTransferencias(0);
    setCheques(0);
    setTarjetas(0);
    setTotalFacturado(0);
    setTotalRetenciones(0);
    setObservaciones("");
  }

  return (
    <CashierFormCard title="Preparar cierre diario">
      <form className="grid gap-4" onSubmit={submit}>
        <BranchField branchId={branchId} branches={branches} onChange={setBranchId} />
        <MoneyField label="Efectivo" onChange={setEfectivo} value={efectivo} />
        <MoneyField label="Transferencias" onChange={setTransferencias} value={transferencias} />
        <MoneyField label="Cheques" onChange={setCheques} value={cheques} />
        <MoneyField label="Tarjetas" onChange={setTarjetas} value={tarjetas} />
        <MoneyField label="Total facturado" onChange={setTotalFacturado} value={totalFacturado} />
        <MoneyField label="Total retenciones" onChange={setTotalRetenciones} value={totalRetenciones} />
        <InputField label="Observaciones" onChange={setObservaciones} value={observaciones} />
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-zinc-300">
          Total recibido: <strong>{formatAmount(totalRecibido)}</strong>
          <br />
          Diferencia: <strong>{formatAmount(diferencias)}</strong>
        </div>
        <Button type="submit">Preparar cierre</Button>
      </form>
    </CashierFormCard>
  );
}

function DocumentsTable({
  empty,
  rows,
  title,
}: {
  empty: string;
  rows: Array<CashierInvoice | CashierReceipt>;
  title: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-white/10 p-5">
        <h3 className="text-lg font-black text-white">{title}</h3>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-zinc-500">
              <tr>
                <th className="px-5 py-3">Número</th>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Sucursal</th>
                <th className="px-5 py-3">Pago</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-4 font-bold text-white">{row.numero}</td>
                  <td className="px-5 py-4 text-zinc-400">{row.fecha}</td>
                  <td className="px-5 py-4 text-zinc-300">
                    {"cliente" in row ? row.cliente : row.recibimosDe}
                  </td>
                  <td className="px-5 py-4 text-zinc-400">{row.sucursalNombre}</td>
                  <td className="px-5 py-4 text-zinc-400">{row.formaPago}</td>
                  <td className="px-5 py-4 font-bold text-white">
                    {formatAmount("totalAplicado" in row ? row.totalAplicado : row.total)}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge estado={row.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message={empty} />
      )}
    </Card>
  );
}

function NotesTable({ rows }: { rows: CashierNote[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-white/10 p-5">
        <h3 className="text-lg font-black text-white">Notas operativas</h3>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-zinc-500">
              <tr>
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3">Número</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Factura</th>
                <th className="px-5 py-3">Sucursal</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-4 text-zinc-300">{row.tipo}</td>
                  <td className="px-5 py-4 font-bold text-white">{row.numero}</td>
                  <td className="px-5 py-4 text-zinc-300">{row.cliente}</td>
                  <td className="px-5 py-4 text-zinc-400">{row.facturaRelacionada || "No registrada"}</td>
                  <td className="px-5 py-4 text-zinc-400">{row.sucursalNombre}</td>
                  <td className="px-5 py-4 font-bold text-white">{formatAmount(row.total)}</td>
                  <td className="px-5 py-4"><StatusBadge estado={row.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="Aún no hay notas para este alcance. Cuando Caja emita una nota de débito o crédito, aparecerá aquí y pasará a revisión contable." />
      )}
    </Card>
  );
}

function ClosuresTable({
  onUpdate,
  rows,
}: {
  onUpdate: (closures: CashierClosure[]) => void;
  rows: CashierClosure[];
}) {
  function closeClosure(closureId: string) {
    onUpdate(
      rows.map((row) =>
        row.id === closureId && row.estado === "Abierto"
          ? { ...row, estado: "Cerrado" as const }
          : row,
      ),
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-white/10 p-5">
        <h3 className="text-lg font-black text-white">Cierres diarios</h3>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-zinc-500">
              <tr>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Sucursal</th>
                <th className="px-5 py-3">Cajero</th>
                <th className="px-5 py-3">Recibido</th>
                <th className="px-5 py-3">Retenciones</th>
                <th className="px-5 py-3">Diferencia</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-4 text-zinc-400">{row.fecha}</td>
                  <td className="px-5 py-4 text-zinc-300">{row.sucursalNombre}</td>
                  <td className="px-5 py-4 text-zinc-300">{row.cajero}</td>
                  <td className="px-5 py-4 font-bold text-white">{formatAmount(row.totalRecibido)}</td>
                  <td className="px-5 py-4 text-zinc-400">{formatAmount(row.totalRetenciones)}</td>
                  <td className="px-5 py-4 text-zinc-400">{formatAmount(row.diferencias)}</td>
                  <td className="px-5 py-4"><StatusBadge estado={row.estado} /></td>
                  <td className="px-5 py-4">
                    {row.estado === "Abierto" ? (
                      <Button onClick={() => closeClosure(row.id)} type="button" variant="secondary">
                        Cerrar cierre
                      </Button>
                    ) : (
                      <span className="text-xs text-zinc-500">Sin acción</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="Aún no hay cierres para este alcance. Cuando Caja prepare el cierre diario, aparecerá aquí para seguimiento y revisión contable posterior." />
      )}
    </Card>
  );
}

function RecentDocuments({
  rows,
  title,
}: {
  rows: Array<CashierInvoice | CashierReceipt | CashierNote>;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <h4 className="text-sm font-black uppercase tracking-[0.12em] text-zinc-500">{title}</h4>
      <div className="mt-4 grid gap-3">
        {rows.length ? rows.map((row) => (
          <div className="flex items-center justify-between gap-3" key={row.id}>
            <div>
              <div className="font-bold text-white">{row.numero}</div>
              <div className="text-xs text-zinc-500">
                {getRecentDocumentSubtitle(row)}
              </div>
            </div>
            <StatusBadge estado={row.estado} />
          </div>
        )) : (
          <p className="text-sm text-zinc-500">Sin documentos recientes para este alcance.</p>
        )}
      </div>
    </div>
  );
}

function getRecentDocumentSubtitle(row: CashierInvoice | CashierReceipt | CashierNote) {
  if ("recibimosDe" in row) return row.recibimosDe;
  if ("tipo" in row) return `${row.tipo} / ${row.cliente}`;
  return row.cliente;
}

function RecentClosures({ rows }: { rows: CashierClosure[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <h4 className="text-sm font-black uppercase tracking-[0.12em] text-zinc-500">Cierres recientes</h4>
      <div className="mt-4 grid gap-3">
        {rows.length ? rows.map((row) => (
          <div className="flex items-center justify-between gap-3" key={row.id}>
            <div>
              <div className="font-bold text-white">{row.fecha}</div>
              <div className="text-xs text-zinc-500">{row.sucursalNombre}</div>
            </div>
            <StatusBadge estado={row.estado} />
          </div>
        )) : (
          <p className="text-sm text-zinc-500">Sin cierres recientes para este alcance.</p>
        )}
      </div>
    </div>
  );
}

function CashierRestricted({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Card className="p-8 text-center">
      <Badge tone="gray">Caja</Badge>
      <h2 className="mt-4 text-2xl font-black text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
        {description}
      </p>
    </Card>
  );
}

function CashierFormCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Card className="p-5">
      <h3 className="mb-5 text-lg font-black text-white">{title}</h3>
      {children}
    </Card>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-zinc-500">{label}</div>
          <div className="mt-2 text-2xl font-black text-white">{value}</div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-500/15 text-blue-300">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function InputField({
  label,
  onChange,
  required,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </span>
      <input
        className="h-11 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm text-zinc-100 outline-none transition focus:border-blue-500/70"
        onChange={(event) => onChange(event.target.value)}
        required={required}
        value={value}
      />
    </label>
  );
}

function MoneyField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </span>
      <input
        className="h-11 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm text-zinc-100 outline-none transition focus:border-blue-500/70"
        min="0"
        onChange={(event) => onChange(Number(event.target.value))}
        step="0.01"
        type="number"
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </span>
      <select
        className="h-11 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm text-zinc-100 outline-none transition focus:border-blue-500/70"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function BranchField({
  branchId,
  branches,
  onChange,
}: {
  branchId: DesiredBranchId;
  branches: readonly CashierBranch[];
  onChange: (value: DesiredBranchId) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
        Sucursal
      </span>
      <select
        className="h-11 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm text-zinc-100 outline-none transition focus:border-blue-500/70"
        onChange={(event) => onChange(event.target.value as DesiredBranchId)}
        value={branchId}
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function PaymentFields({
  banco,
  formaPago,
  referencia,
  setBanco,
  setFormaPago,
  setReferencia,
}: {
  banco: string;
  formaPago: string;
  referencia: string;
  setBanco: (value: string) => void;
  setFormaPago: (value: string) => void;
  setReferencia: (value: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <SelectField
        label="Forma de pago"
        onChange={setFormaPago}
        options={[...cashierPaymentMethods]}
        value={formaPago}
      />
      <InputField label="Banco" onChange={setBanco} value={banco} />
      <InputField label="Referencia" onChange={setReferencia} value={referencia} />
    </div>
  );
}

function RetentionFields({
  ret1,
  ret2,
  setRet1,
  setRet2,
}: {
  ret1: boolean;
  ret2: boolean;
  setRet1: (value: boolean) => void;
  setRet2: (value: boolean) => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4">
      <label className="flex items-center gap-3 text-sm font-semibold text-zinc-300">
        <input checked={ret1} onChange={(event) => setRet1(event.target.checked)} type="checkbox" />
        Aplicar retención 1%
      </label>
      <label className="flex items-center gap-3 text-sm font-semibold text-zinc-300">
        <input checked={ret2} onChange={(event) => setRet2(event.target.checked)} type="checkbox" />
        Aplicar retención 2%
      </label>
    </div>
  );
}

function TotalPreview({
  retencion1,
  retencion2,
  total,
}: {
  retencion1: number;
  retencion2: number;
  total: number;
}) {
  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100">
      Retención 1%: <strong>{formatAmount(retencion1)}</strong>
      <br />
      Retención 2%: <strong>{formatAmount(retencion2)}</strong>
      <br />
      Total operativo: <strong>{formatAmount(total)}</strong>
    </div>
  );
}

function StatusBadge({ estado }: { estado: string }) {
  const tone =
    estado === "Emitido" || estado === "Cerrado"
      ? "green"
      : estado === "Anulado"
        ? "red"
        : estado === "Revisado por Contabilidad"
          ? "blue"
          : "yellow";
  return <Badge tone={tone}>{estado}</Badge>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="p-8 text-sm leading-6 text-zinc-500">{message}</div>;
}

function filterByScope<T extends { sucursalId: DesiredBranchId }>(
  records: T[],
  session: DemoSession | null,
) {
  if (!session) return [];
  if (session.role === "Cajero" && session.branchId !== "all") {
    return records.filter((record) => record.sucursalId === session.branchId);
  }
  return records;
}

function applyDocumentFilters<T extends { estado: string; sucursalNombre: string }>(
  records: T[],
  stateFilter: string,
  branchFilter: string,
) {
  return records.filter((record) => {
    const matchesState = stateFilter === "Todos" || record.estado === stateFilter;
    const matchesBranch =
      branchFilter === "Todos" || record.sucursalNombre === branchFilter;
    return matchesState && matchesBranch;
  });
}

function applyClosureFilters(
  records: CashierClosure[],
  stateFilter: string,
  branchFilter: string,
) {
  return records.filter((record) => {
    const matchesState = stateFilter === "Todos" || record.estado === stateFilter;
    const matchesBranch =
      branchFilter === "Todos" || record.sucursalNombre === branchFilter;
    return matchesState && matchesBranch;
  });
}

function getInitialBranch(branches: readonly CashierBranch[], session: DemoSession) {
  if (session.branchId !== "all") {
    return getDesiredBranch(session.branchId) ?? branches[0] ?? desiredBranches[0];
  }
  return branches[0] ?? desiredBranches[0];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
