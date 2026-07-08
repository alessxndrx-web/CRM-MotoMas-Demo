"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  Receipt,
  StickyNote,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buildMotorcycleInvoiceDescription } from "@/data/operations/accounting";
import {
  calculateCashierTotal,
  calculateRetention,
  cashierDocumentStates,
  cashierNoteTypes,
  cashierPaymentMethods,
  roundMoney,
  type CashierClosure,
  type CashierInvoice,
  type CashierNote,
  type CashierNoteType,
  type CashierPaymentMethod,
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

const sectionNav: {
  href: string;
  label: string;
  section: CashierSection;
  icon: LucideIcon;
}[] = [
  { href: "/panel/caja", label: "Caja", section: "dashboard", icon: Wallet },
  {
    href: "/panel/caja/facturacion",
    label: "Facturación",
    section: "facturacion",
    icon: FileText,
  },
  { href: "/panel/caja/recibos", label: "Recibos", section: "recibos", icon: Receipt },
  { href: "/panel/caja/notas", label: "Notas", section: "notas", icon: StickyNote },
  {
    href: "/panel/caja/cierres",
    label: "Cierres",
    section: "cierres",
    icon: ClipboardList,
  },
];

// Safe operational actions use a calm blue primary style; red stays reserved for
// destructive or dangerous actions (there are none in Caja beyond confirmations).
const cashierPrimaryButton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(37,99,235,0.24)] transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70";

export function CashierPanel({ section = "dashboard" }: { section?: CashierSection }) {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [invoices, setInvoices] = useState<CashierInvoice[]>([]);
  const [receipts, setReceipts] = useState<CashierReceipt[]>([]);
  const [notes, setNotes] = useState<CashierNote[]>([]);
  const [closures, setClosures] = useState<CashierClosure[]>([]);

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

  return (
    <CashierShell section={section} session={session}>
      {section === "dashboard" ? (
        <DashboardView
          closures={scopedClosures}
          invoices={scopedInvoices}
          notes={scopedNotes}
          receipts={scopedReceipts}
          session={session}
        />
      ) : null}

      {section === "facturacion" ? (
        <FacturacionView
          branches={scopedBranches}
          invoices={scopedInvoices}
          session={session}
          onCreate={(input) => setInvoices(addCashierInvoice(invoices, input))}
        />
      ) : null}

      {section === "recibos" ? (
        <RecibosView
          branches={scopedBranches}
          receipts={scopedReceipts}
          session={session}
          onCreate={(input) => setReceipts(addCashierReceipt(receipts, input))}
        />
      ) : null}

      {section === "notas" ? (
        <NotasView
          branches={scopedBranches}
          notes={scopedNotes}
          session={session}
          onCreate={(input) => setNotes(addCashierNote(notes, input))}
        />
      ) : null}

      {section === "cierres" ? (
        <CierresView
          branches={scopedBranches}
          closures={scopedClosures}
          invoices={scopedInvoices}
          notes={scopedNotes}
          receipts={scopedReceipts}
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
  const active = sectionNav.find((item) => item.section === section);

  return (
    <section className="grid gap-6">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 bg-white/[0.035] p-6">
          <div>
            <Badge tone="blue">Caja operativa</Badge>
            <h2 className="mt-4 text-2xl font-black text-white">
              {active?.label === "Caja" ? "Estación de caja" : active?.label}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Caja emite documentos y prepara el cierre del turno. Contabilidad
              revisa, contabiliza y concilia. Sin facturación fiscal, PDF ni DGI.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <User className="h-4 w-4 text-blue-300" />
              {session.userName}
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
              <Building2 className="h-3.5 w-3.5" />
              {session.branchName}
            </div>
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto p-3" aria-label="Caja">
          {sectionNav.map((item) => {
            const Icon = item.icon;
            const isActive = section === item.section;
            return (
              <Link
                className={cn(
                  "flex min-w-max items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition",
                  isActive
                    ? "border-blue-500/40 bg-blue-500/12 text-blue-300"
                    : "border-white/10 bg-white/[0.035] text-zinc-400 hover:bg-white/[0.065] hover:text-white",
                )}
                href={item.href}
                key={item.href}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </Card>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

function DashboardView({
  closures,
  invoices,
  notes,
  receipts,
  session,
}: {
  closures: CashierClosure[];
  invoices: CashierInvoice[];
  notes: CashierNote[];
  receipts: CashierReceipt[];
  session: DemoSession;
}) {
  const operationalDate = resolveOperationalDate([
    ...invoices.map((invoice) => invoice.fecha),
    ...receipts.map((receipt) => receipt.fecha),
    ...notes.map((note) => note.fecha),
    ...closures.map((closure) => closure.fecha),
  ]);

  const dayInvoices = invoices.filter((invoice) => invoice.fecha === operationalDate);
  const dayReceipts = receipts.filter((receipt) => receipt.fecha === operationalDate);
  const dayNotes = notes.filter((note) => note.fecha === operationalDate);
  const shift = resolveCurrentShift(closures, operationalDate, session);

  return (
    <div className="grid gap-6">
      <CurrentShiftCard operationalDate={operationalDate} session={session} shift={shift} />
      <DaySummary
        invoices={dayInvoices}
        notes={dayNotes}
        operationalDate={operationalDate}
        pendingClosures={closures.filter((closure) => closure.estado === "Abierto").length}
        receipts={dayReceipts}
        shift={shift}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <WorkQueue
          closures={closures}
          invoices={invoices}
          notes={notes}
          receipts={receipts}
        />
        <RecentActivity
          closures={closures}
          invoices={invoices}
          notes={notes}
          receipts={receipts}
        />
      </div>
    </div>
  );
}

type CurrentShift = {
  closure: CashierClosure | null;
  estado: "Abierto" | "Cerrado";
};

function resolveCurrentShift(
  closures: CashierClosure[],
  operationalDate: string,
  session: DemoSession,
): CurrentShift {
  const dayClosures = closures.filter((closure) => closure.fecha === operationalDate);
  // A "Cerrado" or reviewed closure means the shift for the day is closed.
  const closed = dayClosures.find(
    (closure) =>
      closure.estado === "Cerrado" ||
      closure.estado === "Revisado por Contabilidad",
  );
  if (closed) return { closure: closed, estado: "Cerrado" };
  const open = dayClosures.find((closure) => closure.estado === "Abierto");
  return { closure: open ?? null, estado: "Abierto" };
}

function CurrentShiftCard({
  operationalDate,
  session,
  shift,
}: {
  operationalDate: string;
  session: DemoSession;
  shift: CurrentShift;
}) {
  const isOpen = shift.estado === "Abierto";
  const cajero = shift.closure?.cajero || session.userName;
  const sucursal =
    shift.closure?.sucursalNombre ||
    (session.branchId === "all" ? "Todas las sucursales" : session.branchName);

  return (
    <Card
      className={cn(
        "overflow-hidden border-l-4",
        isOpen ? "border-l-amber-500/70" : "border-l-emerald-500/70",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-6 p-6">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "grid h-12 w-12 place-items-center rounded-2xl",
              isOpen
                ? "bg-amber-500/15 text-amber-300"
                : "bg-emerald-500/15 text-emerald-300",
            )}
          >
            {isOpen ? <Clock className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-black text-white">Turno de caja</h3>
              <Badge tone={isOpen ? "yellow" : "green"}>
                {isOpen ? "Abierto" : "Cerrado"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              {isOpen
                ? "El turno está en operación. Emite documentos y prepara el cierre cuando termines la jornada."
                : "El turno de esta jornada ya fue cerrado y quedó disponible para revisión contable."}
            </p>
            <div className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <ShiftDetail icon={Building2} label="Sucursal" value={sucursal} />
              <ShiftDetail icon={User} label="Cajero" value={cajero} />
              <ShiftDetail icon={Clock} label="Fecha" value={formatDate(operationalDate)} />
              <ShiftDetail
                icon={Clock}
                label={isOpen ? "Hora de apertura" : "Hora de cierre"}
                value={
                  isOpen
                    ? shift.closure?.horaApertura || "En operación"
                    : shift.closure?.horaCierre || "—"
                }
              />
            </div>
          </div>
        </div>
        <Link className={cashierPrimaryButton} href="/panel/caja/cierres">
          {isOpen ? "Cerrar caja" : "Ver cierres"}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}

function ShiftDetail({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 font-bold text-white">{value}</div>
    </div>
  );
}

function DaySummary({
  invoices,
  notes,
  operationalDate,
  pendingClosures,
  receipts,
  shift,
}: {
  invoices: CashierInvoice[];
  notes: CashierNote[];
  operationalDate: string;
  pendingClosures: number;
  receipts: CashierReceipt[];
  shift: CurrentShift;
}) {
  const totalRecibido = receipts.reduce((sum, receipt) => sum + receipt.totalAplicado, 0);
  const totalFacturado = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const abonos =
    invoices.reduce((sum, invoice) => sum + invoice.abono, 0) +
    receipts.reduce((sum, receipt) => sum + receipt.abono, 0);
  const retencion1 = sumRetencion(invoices, receipts, notes, "retencion1");
  const retencion2 = sumRetencion(invoices, receipts, notes, "retencion2");
  const diferencia = shift.closure
    ? shift.closure.diferencias
    : roundMoney(totalRecibido - totalFacturado);
  const payments = paymentBreakdown(invoices, receipts);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Badge tone="gray">Resumen de la jornada</Badge>
          <h3 className="mt-3 text-lg font-black text-white">
            Documentos y dinero de la jornada
          </h3>
        </div>
        <span className="text-sm font-semibold text-zinc-500">
          {formatDate(operationalDate)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile icon={FileText} label="Facturas emitidas" value={String(invoices.length)} />
        <SummaryTile icon={Receipt} label="Recibos emitidos" value={String(receipts.length)} />
        <SummaryTile icon={StickyNote} label="Notas emitidas" value={String(notes.length)} />
        <SummaryTile
          highlight
          icon={Banknote}
          label="Total recibido"
          value={formatAmount(totalRecibido)}
        />
        <SummaryTile icon={Wallet} label="Abonos" value={formatAmount(abonos)} />
        <SummaryTile icon={ClipboardList} label="Retención 1%" value={formatAmount(retencion1)} />
        <SummaryTile icon={ClipboardList} label="Retención 2%" value={formatAmount(retencion2)} />
        <SummaryTile
          icon={CreditCard}
          label="Diferencia"
          tone={diferencia === 0 ? "neutral" : diferencia < 0 ? "warn" : "neutral"}
          value={formatAmount(diferencia)}
        />
      </div>

      <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-4">
        <PaymentTile label="Efectivo" value={payments.Efectivo} />
        <PaymentTile label="Transferencia" value={payments.Transferencia} />
        <PaymentTile label="Cheque" value={payments.Cheque} />
        <PaymentTile label="Tarjeta" value={payments.Tarjeta} />
      </div>

      {pendingClosures > 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-200">
          <AlertCircle className="h-4 w-4" />
          {pendingClosures === 1
            ? "Hay 1 cierre pendiente de cerrar."
            : `Hay ${pendingClosures} cierres pendientes de cerrar.`}
        </div>
      ) : null}
    </Card>
  );
}

function SummaryTile({
  highlight,
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  highlight?: boolean;
  icon: LucideIcon;
  label: string;
  tone?: "neutral" | "warn";
  value: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        highlight
          ? "border-blue-500/30 bg-blue-500/10"
          : "border-white/10 bg-white/[0.03]",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.1em] text-zinc-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        className={cn(
          "mt-2 text-xl font-black",
          tone === "warn" ? "text-amber-300" : highlight ? "text-blue-200" : "text-white",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function PaymentTile({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs font-black uppercase tracking-[0.1em] text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-black text-white">{formatAmount(value)}</div>
    </div>
  );
}

function WorkQueue({
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
  const pendingClosure = closures.find((closure) => closure.estado === "Abierto");

  return (
    <Card className="p-6">
      <Badge tone="gray">Cola de trabajo</Badge>
      <h3 className="mt-3 text-lg font-black text-white">¿Qué sigue?</h3>
      <p className="mt-1 text-sm text-zinc-400">
        Emite el próximo documento o cierra la caja del turno.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <PrimaryAction
          href="/panel/caja/facturacion"
          icon={FileText}
          label="Emitir factura"
        />
        <PrimaryAction href="/panel/caja/recibos" icon={Receipt} label="Emitir recibo" />
        <PrimaryAction href="/panel/caja/notas" icon={StickyNote} label="Crear nota" />
        <PrimaryAction
          href="/panel/caja/cierres"
          icon={ClipboardList}
          label="Cerrar caja"
          tone={pendingClosure ? "alert" : "default"}
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <QueueList
          emptyLabel="Sin facturas recientes."
          href="/panel/caja/facturacion"
          items={invoices.slice(0, 3).map((invoice) => ({
            id: invoice.id,
            title: invoice.numero,
            subtitle: invoice.cliente,
            estado: invoice.estado,
          }))}
          title="Facturas recientes"
        />
        <QueueList
          emptyLabel="Sin recibos recientes."
          href="/panel/caja/recibos"
          items={receipts.slice(0, 3).map((receipt) => ({
            id: receipt.id,
            title: receipt.numero,
            subtitle: receipt.recibimosDe,
            estado: receipt.estado,
          }))}
          title="Recibos recientes"
        />
        <QueueList
          emptyLabel="Sin notas recientes."
          href="/panel/caja/notas"
          items={notes.slice(0, 3).map((note) => ({
            id: note.id,
            title: note.numero,
            subtitle: `${note.tipo} · ${note.cliente}`,
            estado: note.estado,
          }))}
          title="Notas recientes"
        />
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h4 className="text-xs font-black uppercase tracking-[0.1em] text-zinc-500">
            Cierre pendiente
          </h4>
          {pendingClosure ? (
            <div className="mt-3 text-sm">
              <div className="font-bold text-white">{pendingClosure.sucursalNombre}</div>
              <div className="text-xs text-zinc-500">
                {formatDate(pendingClosure.fecha)} · recibido{" "}
                {formatAmount(pendingClosure.totalRecibido)}
              </div>
              <Link
                className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-blue-300 hover:text-blue-200"
                href="/panel/caja/cierres"
              >
                Cerrar caja <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">
              No hay cierres pendientes. Prepara uno al terminar la jornada.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function PrimaryAction({
  href,
  icon: Icon,
  label,
  tone = "default",
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  tone?: "default" | "alert";
}) {
  return (
    <Link
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-bold transition",
        tone === "alert"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15"
          : "border-blue-500/30 bg-blue-500/10 text-blue-200 hover:bg-blue-500/15",
      )}
      href={href}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function QueueList({
  emptyLabel,
  href,
  items,
  title,
}: {
  emptyLabel: string;
  href: string;
  items: { id: string; title: string; subtitle: string; estado: string }[];
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black uppercase tracking-[0.1em] text-zinc-500">
          {title}
        </h4>
        <Link className="text-xs font-bold text-blue-300 hover:text-blue-200" href={href}>
          Ver todo
        </Link>
      </div>
      <div className="mt-3 grid gap-2">
        {items.length ? (
          items.map((item) => (
            <div className="flex items-center justify-between gap-2" key={item.id}>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-white">{item.title}</div>
                <div className="truncate text-xs text-zinc-500">{item.subtitle}</div>
              </div>
              <StatusBadge estado={item.estado} />
            </div>
          ))
        ) : (
          <p className="text-sm text-zinc-500">{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}

type ActivityItem = {
  id: string;
  fecha: string;
  icon: LucideIcon;
  label: string;
  detail: string;
  estado: string;
};

function RecentActivity({
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
  const activity: ActivityItem[] = [
    ...invoices.map((invoice) => ({
      id: invoice.id,
      fecha: invoice.fecha,
      icon: FileText,
      label: "Factura emitida",
      detail: `${invoice.numero} · ${invoice.cliente}`,
      estado: invoice.estado,
    })),
    ...receipts.map((receipt) => ({
      id: receipt.id,
      fecha: receipt.fecha,
      icon: Receipt,
      label: "Recibo emitido",
      detail: `${receipt.numero} · ${receipt.recibimosDe}`,
      estado: receipt.estado,
    })),
    ...notes.map((note) => ({
      id: note.id,
      fecha: note.fecha,
      icon: StickyNote,
      label: `${note.tipo} creada`,
      detail: `${note.numero} · ${note.cliente}`,
      estado: note.estado,
    })),
    ...closures.map((closure) => ({
      id: closure.id,
      fecha: closure.fecha,
      icon: ClipboardList,
      label: "Cierre de caja",
      detail: `${closure.sucursalNombre} · ${formatAmount(closure.totalRecibido)}`,
      estado: closure.estado,
    })),
  ]
    .sort((a, b) => compareByFechaDesc(a, b))
    .slice(0, 7);

  return (
    <Card className="p-6">
      <Badge tone="gray">Actividad reciente</Badge>
      <h3 className="mt-3 text-lg font-black text-white">Últimos movimientos</h3>
      <div className="mt-4 grid gap-3">
        {activity.length ? (
          activity.map((item) => {
            const Icon = item.icon;
            return (
              <div className="flex items-start gap-3" key={`${item.id}-${item.label}`}>
                <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-zinc-300">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white">{item.label}</span>
                    <span className="text-xs text-zinc-500">{formatDate(item.fecha)}</span>
                  </div>
                  <div className="truncate text-xs text-zinc-500">{item.detail}</div>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-zinc-500">
            Aún no hay movimientos de caja para este alcance.
          </p>
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Facturación                                                                */
/* -------------------------------------------------------------------------- */

function FacturacionView({
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
    <div className="grid gap-6">
      <InvoiceComposer branches={branches} onCreate={onCreate} session={session} />
      <InvoiceListCard branches={branches} invoices={invoices} />
    </div>
  );
}

function InvoiceComposer({
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
  const branchName = getDesiredBranch(branchId)?.name ?? initialBranch.name;

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
    setRet1(false);
    setRet2(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/15 text-blue-300">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-black text-white">Emitir factura</h3>
            <p className="text-xs text-zinc-500">
              Completa las secciones y emite. Se sincroniza a Contabilidad.
            </p>
          </div>
        </div>

        <form className="mt-6 grid gap-6" onSubmit={submit}>
          <FormSection
            step={1}
            subtitle="Datos del tercero y sucursal que emite."
            title="Cliente y sucursal"
          >
            <InputField label="Cliente" onChange={setCliente} required value={cliente} />
            <InputField label="RUC / cédula" onChange={setRucCedula} value={rucCedula} />
            <BranchField branchId={branchId} branches={branches} onChange={setBranchId} />
          </FormSection>

          <FormSection
            step={2}
            subtitle="Descripción del ítem o concepto facturado."
            title="Ítems o concepto"
          >
            <InputField label="Descripción" onChange={setDescripcion} value={descripcion} />
            <MoneyField label="Subtotal" onChange={setSubtotal} value={subtotal} />
            <p className="text-xs text-zinc-500">
              La descripción de motocicleta usa el orden contable oficial (MARCA,
              MODELO, CHASIS, MOTOR, COLOR, AÑO, CASCO, PÓLIZA, CILINDRAJE).
            </p>
          </FormSection>

          <FormSection
            step={3}
            subtitle="Forma de pago, abono y retenciones aplicadas."
            title="Pago, abono y retenciones"
          >
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
            <InputField
              label="Observaciones"
              onChange={setObservaciones}
              value={observaciones}
            />
          </FormSection>

          <button className={cn(cashierPrimaryButton, "w-full")} type="submit">
            <FileText className="h-4 w-4" />
            Emitir factura
          </button>
        </form>
      </Card>

      <DocumentPreview
        badge="Vista previa"
        descripcionMoto={buildMotorcycleInvoiceDescription()}
        fields={[
          { label: "Cliente", value: cliente || "Cliente sin registrar" },
          { label: "RUC / cédula", value: rucCedula || "No registrado" },
          { label: "Sucursal", value: branchName },
          { label: "Concepto", value: descripcion || "Factura operativa demo." },
          { label: "Forma de pago", value: formaPago },
          { label: "Banco", value: banco || "—" },
          { label: "Referencia", value: referencia || "—" },
        ]}
        subtitle="Se asignará número al emitir"
        title="Factura operativa"
        totals={{
          subtotal,
          abono,
          retencion1,
          retencion2,
          total,
          totalLabel: "Total a pagar",
        }}
        traceability={session.userName}
      />
    </div>
  );
}

function InvoiceListCard({
  branches,
  invoices,
}: {
  branches: readonly CashierBranch[];
  invoices: CashierInvoice[];
}) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("Todos");
  const [branchFilter, setBranchFilter] = useState("Todos");
  const [paymentFilter, setPaymentFilter] = useState("Todos");

  const filtered = invoices.filter((invoice) => {
    const matchesState = stateFilter === "Todos" || invoice.estado === stateFilter;
    const matchesBranch =
      branchFilter === "Todos" || invoice.sucursalNombre === branchFilter;
    const matchesPayment =
      paymentFilter === "Todos" || invoice.formaPago === paymentFilter;
    const matchesSearch =
      !search.trim() ||
      `${invoice.numero} ${invoice.cliente} ${invoice.rucCedula}`
        .toLowerCase()
        .includes(search.trim().toLowerCase());
    return matchesState && matchesBranch && matchesPayment && matchesSearch;
  });

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-white/10 p-5">
        <h3 className="text-lg font-black text-white">Facturas emitidas</h3>
        <p className="text-xs text-zinc-500">
          {filtered.length} de {invoices.length} facturas en el alcance actual.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SearchField
            onChange={setSearch}
            placeholder="Buscar número, cliente o RUC"
            value={search}
          />
          <SelectField
            label="Estado"
            onChange={setStateFilter}
            options={["Todos", ...cashierDocumentStates]}
            value={stateFilter}
          />
          <SelectField
            label="Forma de pago"
            onChange={setPaymentFilter}
            options={["Todos", ...cashierPaymentMethods]}
            value={paymentFilter}
          />
          <SelectField
            label="Sucursal"
            onChange={setBranchFilter}
            options={["Todos", ...branches.map((branch) => branch.name)]}
            value={branchFilter}
          />
        </div>
      </div>
      {filtered.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-zinc-500">
              <tr>
                <th className="px-5 py-3">Número</th>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Sucursal</th>
                <th className="px-5 py-3">Pago</th>
                <th className="px-5 py-3 text-right">Retenciones</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filtered.map((invoice) => (
                <tr className="hover:bg-white/[0.02]" key={invoice.id}>
                  <td className="px-5 py-4 font-bold text-white">{invoice.numero}</td>
                  <td className="px-5 py-4 text-zinc-400">{formatDate(invoice.fecha)}</td>
                  <td className="px-5 py-4 text-zinc-300">{invoice.cliente}</td>
                  <td className="px-5 py-4 text-zinc-400">{invoice.sucursalNombre}</td>
                  <td className="px-5 py-4 text-zinc-400">{invoice.formaPago}</td>
                  <td className="px-5 py-4 text-right text-zinc-400">
                    {formatAmount(invoice.retencion1 + invoice.retencion2)}
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-white">
                    {formatAmount(invoice.total)}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge estado={invoice.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          message={
            invoices.length
              ? "Ninguna factura coincide con los filtros. Ajusta la búsqueda, el estado, la forma de pago o la sucursal."
              : "Aún no hay facturas para este alcance. Emite una factura arriba y quedará disponible para revisión contable."
          }
        />
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Recibos                                                                    */
/* -------------------------------------------------------------------------- */

function RecibosView({
  branches,
  onCreate,
  receipts,
  session,
}: {
  branches: readonly CashierBranch[];
  onCreate: (input: Omit<CashierReceipt, "id" | "numero"> & { numero?: string }) => void;
  receipts: CashierReceipt[];
  session: DemoSession;
}) {
  return (
    <div className="grid gap-6">
      <ReceiptComposer branches={branches} onCreate={onCreate} session={session} />
      <ReceiptListCard branches={branches} receipts={receipts} />
    </div>
  );
}

function ReceiptComposer({
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
  const totalAplicado = calculateCashierTotal(montoRecibido, abono, retencion1, retencion2);
  const branchName = getDesiredBranch(branchId)?.name ?? initialBranch.name;

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
    setRet1(false);
    setRet2(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/15 text-blue-300">
            <Receipt className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-black text-white">Emitir recibo oficial de caja</h3>
            <p className="text-xs text-zinc-500">
              Registra el pago o abono recibido y su factura relacionada.
            </p>
          </div>
        </div>

        <form className="mt-6 grid gap-6" onSubmit={submit}>
          <FormSection
            step={1}
            subtitle="De quién se recibe y sobre qué factura."
            title="Cliente y documento origen"
          >
            <InputField
              label="Recibimos de"
              onChange={setRecibimosDe}
              required
              value={recibimosDe}
            />
            <InputField label="RUC / cédula" onChange={setRucCedula} value={rucCedula} />
            <BranchField branchId={branchId} branches={branches} onChange={setBranchId} />
            <InputField
              label="Factura relacionada"
              onChange={setFacturaRelacionada}
              value={facturaRelacionada}
            />
          </FormSection>

          <FormSection
            step={2}
            subtitle="Concepto del pago recibido."
            title="Concepto"
          >
            <InputField label="Concepto" onChange={setConcepto} value={concepto} />
          </FormSection>

          <FormSection
            step={3}
            subtitle="Monto recibido, abono aplicado y retenciones."
            title="Pago, abono y retenciones"
          >
            <MoneyField
              label="Monto recibido"
              onChange={setMontoRecibido}
              value={montoRecibido}
            />
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
            <InputField
              label="Observaciones"
              onChange={setObservaciones}
              value={observaciones}
            />
          </FormSection>

          <button className={cn(cashierPrimaryButton, "w-full")} type="submit">
            <Receipt className="h-4 w-4" />
            Emitir recibo
          </button>
        </form>
      </Card>

      <DocumentPreview
        badge="Vista previa"
        fields={[
          { label: "Recibimos de", value: recibimosDe || "Cliente sin registrar" },
          { label: "RUC / cédula", value: rucCedula || "No registrado" },
          { label: "Sucursal", value: branchName },
          { label: "Factura relacionada", value: facturaRelacionada || "No registrada" },
          { label: "Concepto", value: concepto || "Pago operativo demo." },
          { label: "Forma de pago", value: formaPago },
          { label: "Banco", value: banco || "—" },
          { label: "Referencia", value: referencia || "—" },
        ]}
        subtitle="Se asignará número al emitir"
        title="Recibo oficial de caja"
        totals={{
          subtotal: montoRecibido,
          subtotalLabel: "Monto recibido",
          abono,
          retencion1,
          retencion2,
          total: totalAplicado,
          totalLabel: "Total aplicado",
        }}
        traceability={session.userName}
      />
    </div>
  );
}

function ReceiptListCard({
  branches,
  receipts,
}: {
  branches: readonly CashierBranch[];
  receipts: CashierReceipt[];
}) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("Todos");
  const [branchFilter, setBranchFilter] = useState("Todos");
  const [paymentFilter, setPaymentFilter] = useState("Todos");

  const filtered = receipts.filter((receipt) => {
    const matchesState = stateFilter === "Todos" || receipt.estado === stateFilter;
    const matchesBranch =
      branchFilter === "Todos" || receipt.sucursalNombre === branchFilter;
    const matchesPayment =
      paymentFilter === "Todos" || receipt.formaPago === paymentFilter;
    const matchesSearch =
      !search.trim() ||
      `${receipt.numero} ${receipt.recibimosDe} ${receipt.facturaRelacionada}`
        .toLowerCase()
        .includes(search.trim().toLowerCase());
    return matchesState && matchesBranch && matchesPayment && matchesSearch;
  });

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-white/10 p-5">
        <h3 className="text-lg font-black text-white">Recibos emitidos</h3>
        <p className="text-xs text-zinc-500">
          {filtered.length} de {receipts.length} recibos en el alcance actual.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SearchField
            onChange={setSearch}
            placeholder="Buscar número, cliente o factura"
            value={search}
          />
          <SelectField
            label="Estado"
            onChange={setStateFilter}
            options={["Todos", ...cashierDocumentStates]}
            value={stateFilter}
          />
          <SelectField
            label="Forma de pago"
            onChange={setPaymentFilter}
            options={["Todos", ...cashierPaymentMethods]}
            value={paymentFilter}
          />
          <SelectField
            label="Sucursal"
            onChange={setBranchFilter}
            options={["Todos", ...branches.map((branch) => branch.name)]}
            value={branchFilter}
          />
        </div>
      </div>
      {filtered.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-zinc-500">
              <tr>
                <th className="px-5 py-3">Número</th>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Recibimos de</th>
                <th className="px-5 py-3">Factura</th>
                <th className="px-5 py-3">Pago</th>
                <th className="px-5 py-3 text-right">Retenciones</th>
                <th className="px-5 py-3 text-right">Total aplicado</th>
                <th className="px-5 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filtered.map((receipt) => (
                <tr className="hover:bg-white/[0.02]" key={receipt.id}>
                  <td className="px-5 py-4 font-bold text-white">{receipt.numero}</td>
                  <td className="px-5 py-4 text-zinc-400">{formatDate(receipt.fecha)}</td>
                  <td className="px-5 py-4 text-zinc-300">{receipt.recibimosDe}</td>
                  <td className="px-5 py-4 text-zinc-400">
                    {receipt.facturaRelacionada || "No registrada"}
                  </td>
                  <td className="px-5 py-4 text-zinc-400">{receipt.formaPago}</td>
                  <td className="px-5 py-4 text-right text-zinc-400">
                    {formatAmount(receipt.retencion1 + receipt.retencion2)}
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-white">
                    {formatAmount(receipt.totalAplicado)}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge estado={receipt.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          message={
            receipts.length
              ? "Ningún recibo coincide con los filtros. Ajusta la búsqueda, el estado, la forma de pago o la sucursal."
              : "Aún no hay recibos para este alcance. Registra un pago o abono arriba y quedará disponible para Contabilidad."
          }
        />
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Notas                                                                      */
/* -------------------------------------------------------------------------- */

function NotasView({
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
    <div className="grid gap-6">
      <NoteComposer branches={branches} onCreate={onCreate} session={session} />
      <NoteListCard branches={branches} notes={notes} />
    </div>
  );
}

function NoteComposer({
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
  const branchName = getDesiredBranch(branchId)?.name ?? initialBranch.name;
  const isDebito = tipo === "Nota de Débito";

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
    setRet1(false);
    setRet2(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/15 text-blue-300">
            <StickyNote className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-black text-white">Crear nota</h3>
            <p className="text-xs text-zinc-500">
              Nota de débito aumenta el saldo; nota de crédito lo disminuye.
            </p>
          </div>
        </div>

        <form className="mt-6 grid gap-6" onSubmit={submit}>
          <FormSection
            step={1}
            subtitle="Elige débito o crédito según el ajuste."
            title="Tipo de nota"
          >
            <div className="grid grid-cols-2 gap-3">
              {cashierNoteTypes.map((noteType) => {
                const active = noteType === tipo;
                return (
                  <button
                    className={cn(
                      "rounded-xl border px-4 py-3 text-sm font-bold transition",
                      active
                        ? "border-blue-500/40 bg-blue-500/12 text-blue-200"
                        : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]",
                    )}
                    key={noteType}
                    onClick={() => setTipo(noteType)}
                    type="button"
                  >
                    {noteType}
                  </button>
                );
              })}
            </div>
          </FormSection>

          <FormSection
            step={2}
            subtitle="Cliente, factura relacionada y motivo."
            title="Cliente y documento origen"
          >
            <InputField label="Cliente" onChange={setCliente} required value={cliente} />
            <InputField label="RUC / cédula" onChange={setRucCedula} value={rucCedula} />
            <BranchField branchId={branchId} branches={branches} onChange={setBranchId} />
            <InputField
              label="Factura relacionada"
              onChange={setFacturaRelacionada}
              value={facturaRelacionada}
            />
            <InputField label="Motivo / concepto" onChange={setConcepto} value={concepto} />
          </FormSection>

          <FormSection
            step={3}
            subtitle="Monto y retenciones aplicadas."
            title="Monto y retenciones"
          >
            <MoneyField label="Monto" onChange={setMonto} value={monto} />
            <RetentionFields ret1={ret1} ret2={ret2} setRet1={setRet1} setRet2={setRet2} />
            <InputField
              label="Observaciones"
              onChange={setObservaciones}
              value={observaciones}
            />
          </FormSection>

          <button className={cn(cashierPrimaryButton, "w-full")} type="submit">
            <StickyNote className="h-4 w-4" />
            Emitir {isDebito ? "nota de débito" : "nota de crédito"}
          </button>
        </form>
      </Card>

      <DocumentPreview
        badge={tipo}
        fields={[
          { label: "Cliente", value: cliente || "Cliente sin registrar" },
          { label: "RUC / cédula", value: rucCedula || "No registrado" },
          { label: "Sucursal", value: branchName },
          { label: "Factura relacionada", value: facturaRelacionada || "No registrada" },
          { label: "Motivo / concepto", value: concepto || `${tipo} operativa demo.` },
        ]}
        subtitle="Se asignará número al emitir"
        title={tipo}
        totals={{
          subtotal: monto,
          subtotalLabel: "Monto",
          retencion1,
          retencion2,
          total,
          totalLabel: "Total",
        }}
        traceability={session.userName}
      />
    </div>
  );
}

function NoteListCard({
  branches,
  notes,
}: {
  branches: readonly CashierBranch[];
  notes: CashierNote[];
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [stateFilter, setStateFilter] = useState("Todos");
  const [branchFilter, setBranchFilter] = useState("Todos");

  const filtered = notes.filter((note) => {
    const matchesType = typeFilter === "Todos" || note.tipo === typeFilter;
    const matchesState = stateFilter === "Todos" || note.estado === stateFilter;
    const matchesBranch =
      branchFilter === "Todos" || note.sucursalNombre === branchFilter;
    const matchesSearch =
      !search.trim() ||
      `${note.numero} ${note.cliente} ${note.facturaRelacionada}`
        .toLowerCase()
        .includes(search.trim().toLowerCase());
    return matchesType && matchesState && matchesBranch && matchesSearch;
  });

  const debitos = filtered.filter((note) => note.tipo === "Nota de Débito");
  const creditos = filtered.filter((note) => note.tipo === "Nota de Crédito");

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-white/10 p-5">
        <h3 className="text-lg font-black text-white">Notas emitidas</h3>
        <p className="text-xs text-zinc-500">
          {debitos.length} de débito · {creditos.length} de crédito en el alcance actual.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SearchField
            onChange={setSearch}
            placeholder="Buscar número, cliente o factura"
            value={search}
          />
          <SelectField
            label="Tipo"
            onChange={setTypeFilter}
            options={["Todos", ...cashierNoteTypes]}
            value={typeFilter}
          />
          <SelectField
            label="Estado"
            onChange={setStateFilter}
            options={["Todos", ...cashierDocumentStates]}
            value={stateFilter}
          />
          <SelectField
            label="Sucursal"
            onChange={setBranchFilter}
            options={["Todos", ...branches.map((branch) => branch.name)]}
            value={branchFilter}
          />
        </div>
      </div>
      {filtered.length ? (
        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <NoteGroup
            emptyLabel="Sin notas de débito en el alcance actual."
            notes={debitos}
            tone="yellow"
            title="Notas de débito"
          />
          <NoteGroup
            emptyLabel="Sin notas de crédito en el alcance actual."
            notes={creditos}
            tone="green"
            title="Notas de crédito"
          />
        </div>
      ) : (
        <EmptyState
          message={
            notes.length
              ? "Ninguna nota coincide con los filtros. Ajusta la búsqueda, el tipo, el estado o la sucursal."
              : "Aún no hay notas para este alcance. Crea una nota de débito o crédito arriba y pasará a revisión contable."
          }
        />
      )}
    </Card>
  );
}

function NoteGroup({
  emptyLabel,
  notes,
  tone,
  title,
}: {
  emptyLabel: string;
  notes: CashierNote[];
  tone: "yellow" | "green";
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-black text-white">{title}</h4>
        <Badge tone={tone}>{notes.length}</Badge>
      </div>
      <div className="mt-4 grid gap-3">
        {notes.length ? (
          notes.map((note) => (
            <div
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
              key={note.id}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-white">{note.numero}</span>
                <StatusBadge estado={note.estado} />
              </div>
              <div className="mt-1 text-sm text-zinc-300">{note.cliente}</div>
              <div className="text-xs text-zinc-500">
                {note.facturaRelacionada
                  ? `Factura ${note.facturaRelacionada}`
                  : "Sin factura relacionada"}
                {" · "}
                {formatDate(note.fecha)}
              </div>
              <div className="mt-2 text-xs text-zinc-400">{note.concepto}</div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-xs text-zinc-500">
                  Retenciones {formatAmount(note.retencion1 + note.retencion2)}
                </span>
                <span className="font-black text-white">{formatAmount(note.total)}</span>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-zinc-500">{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cierres                                                                     */
/* -------------------------------------------------------------------------- */

function CierresView({
  branches,
  closures,
  invoices,
  notes,
  onCreate,
  onUpdate,
  receipts,
  session,
}: {
  branches: readonly CashierBranch[];
  closures: CashierClosure[];
  invoices: CashierInvoice[];
  notes: CashierNote[];
  onCreate: (input: Omit<CashierClosure, "id">) => void;
  onUpdate: (closures: CashierClosure[]) => void;
  receipts: CashierReceipt[];
  session: DemoSession;
}) {
  const operationalDate = resolveOperationalDate([
    ...invoices.map((invoice) => invoice.fecha),
    ...receipts.map((receipt) => receipt.fecha),
    ...notes.map((note) => note.fecha),
    ...closures.map((closure) => closure.fecha),
  ]);
  const shift = resolveCurrentShift(closures, operationalDate, session);

  return (
    <div className="grid gap-6">
      <CurrentShiftCard operationalDate={operationalDate} session={session} shift={shift} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <ClosureForm
          branches={branches}
          invoices={invoices.filter((invoice) => invoice.fecha === operationalDate)}
          notes={notes.filter((note) => note.fecha === operationalDate)}
          onCreate={onCreate}
          receipts={receipts.filter((receipt) => receipt.fecha === operationalDate)}
          session={session}
        />
        <ClosuresTable
          invoices={invoices}
          notes={notes}
          onUpdate={onUpdate}
          receipts={receipts}
          rows={closures}
          session={session}
        />
      </div>
    </div>
  );
}

function ClosureForm({
  branches,
  invoices,
  notes,
  onCreate,
  receipts,
  session,
}: {
  branches: readonly CashierBranch[];
  invoices: CashierInvoice[];
  notes: CashierNote[];
  onCreate: (input: Omit<CashierClosure, "id">) => void;
  receipts: CashierReceipt[];
  session: DemoSession;
}) {
  const initialBranch = getInitialBranch(branches, session);
  const [branchId, setBranchId] = useState<DesiredBranchId>(initialBranch.id);
  const [efectivo, setEfectivo] = useState(0);
  const [transferencias, setTransferencias] = useState(0);
  const [cheques, setCheques] = useState(0);
  const [tarjetas, setTarjetas] = useState(0);
  const [observaciones, setObservaciones] = useState("");

  // Suggested totals from the documents issued during the operational day.
  const branchInvoices = invoices.filter((invoice) => invoice.sucursalId === branchId);
  const branchReceipts = receipts.filter((receipt) => receipt.sucursalId === branchId);
  const branchNotes = notes.filter((note) => note.sucursalId === branchId);
  const totalFacturado = roundMoney(
    branchInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
  );
  const totalRetenciones = sumRetencion(
    branchInvoices,
    branchReceipts,
    branchNotes,
    "retencion1",
  ) +
    sumRetencion(branchInvoices, branchReceipts, branchNotes, "retencion2");
  const totalRecibido = roundMoney(efectivo + transferencias + cheques + tarjetas);
  const diferencias = roundMoney(totalRecibido - totalFacturado);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const branch = getDesiredBranch(branchId) ?? initialBranch;
    onCreate({
      fecha: today(),
      horaApertura: nowTime(),
      horaCierre: "",
      sucursalId: branch.id,
      sucursalNombre: branch.name,
      cajero: session.userName,
      efectivo: roundMoney(efectivo),
      transferencias: roundMoney(transferencias),
      cheques: roundMoney(cheques),
      tarjetas: roundMoney(tarjetas),
      totalFacturado,
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
    setObservaciones("");
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/15 text-blue-300">
          <ClipboardList className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-lg font-black text-white">Preparar cierre del turno</h3>
          <p className="text-xs text-zinc-500">
            Cuenta el dinero por forma de pago y compáralo con lo facturado.
          </p>
        </div>
      </div>

      <form className="mt-6 grid gap-6" onSubmit={submit}>
        <FormSection
          step={1}
          subtitle="Sucursal del turno que se cierra."
          title="Sucursal"
        >
          <BranchField branchId={branchId} branches={branches} onChange={setBranchId} />
        </FormSection>

        <FormSection
          step={2}
          subtitle="Efectivo, transferencias, cheques y tarjetas contados."
          title="Dinero por forma de pago"
        >
          <MoneyField label="Efectivo" onChange={setEfectivo} value={efectivo} />
          <MoneyField
            label="Transferencias"
            onChange={setTransferencias}
            value={transferencias}
          />
          <MoneyField label="Cheques" onChange={setCheques} value={cheques} />
          <MoneyField label="Tarjetas" onChange={setTarjetas} value={tarjetas} />
        </FormSection>

        <FormSection
          step={3}
          subtitle="Notas u observaciones del cierre."
          title="Observaciones"
        >
          <InputField
            label="Observaciones"
            onChange={setObservaciones}
            value={observaciones}
          />
        </FormSection>

        <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
          <ClosureRow label="Total recibido" value={formatAmount(totalRecibido)} strong />
          <ClosureRow label="Total facturado (jornada)" value={formatAmount(totalFacturado)} />
          <ClosureRow label="Total retenciones (jornada)" value={formatAmount(totalRetenciones)} />
          <ClosureRow
            label="Diferencia"
            tone={diferencias === 0 ? "ok" : "warn"}
            value={formatAmount(diferencias)}
          />
          <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-zinc-500">
            <span>Facturas: {branchInvoices.length}</span>
            <span>Recibos: {branchReceipts.length}</span>
            <span>Notas: {branchNotes.length}</span>
          </div>
        </div>

        <button className={cn(cashierPrimaryButton, "w-full")} type="submit">
          <ClipboardList className="h-4 w-4" />
          Preparar cierre
        </button>
      </form>
    </Card>
  );
}

function ClosureRow({
  label,
  strong,
  tone = "neutral",
  value,
}: {
  label: string;
  strong?: boolean;
  tone?: "neutral" | "ok" | "warn";
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-400">{label}</span>
      <span
        className={cn(
          "font-bold",
          tone === "warn"
            ? "text-amber-300"
            : tone === "ok"
              ? "text-emerald-300"
              : strong
                ? "text-white"
                : "text-zinc-200",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ClosuresTable({
  invoices,
  notes,
  onUpdate,
  receipts,
  rows,
  session,
}: {
  invoices: CashierInvoice[];
  notes: CashierNote[];
  onUpdate: (closures: CashierClosure[]) => void;
  receipts: CashierReceipt[];
  rows: CashierClosure[];
  session: DemoSession;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;

  function closeClosure(closureId: string) {
    onUpdate(
      rows.map((row) =>
        row.id === closureId && row.estado === "Abierto"
          ? { ...row, estado: "Cerrado" as const, horaCierre: nowTime() }
          : row,
      ),
    );
  }

  if (!rows.length) {
    return (
      <Card className="overflow-hidden">
        <div className="border-b border-white/10 p-5">
          <h3 className="text-lg font-black text-white">Cierres del turno</h3>
        </div>
        <EmptyState message="Aún no hay cierres para este alcance. Prepara el cierre del turno a la izquierda y aparecerá aquí para seguimiento y revisión contable." />
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden">
        <div className="border-b border-white/10 p-5">
          <h3 className="text-lg font-black text-white">Cierres del turno</h3>
          <p className="text-xs text-zinc-500">
            Caja cierra el turno; Contabilidad marca la revisión.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-zinc-500">
              <tr>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Sucursal</th>
                <th className="px-5 py-3">Cajero</th>
                <th className="px-5 py-3 text-right">Recibido</th>
                <th className="px-5 py-3 text-right">Diferencia</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((row) => {
                const isSelected = selected?.id === row.id;
                return (
                  <tr
                    className={cn(
                      "cursor-pointer transition hover:bg-white/[0.03]",
                      isSelected && "bg-blue-500/[0.06]",
                    )}
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className="px-5 py-4 text-zinc-400">{formatDate(row.fecha)}</td>
                    <td className="px-5 py-4 text-zinc-300">{row.sucursalNombre}</td>
                    <td className="px-5 py-4 text-zinc-300">{row.cajero}</td>
                    <td className="px-5 py-4 text-right font-bold text-white">
                      {formatAmount(row.totalRecibido)}
                    </td>
                    <td
                      className={cn(
                        "px-5 py-4 text-right",
                        row.diferencias === 0 ? "text-zinc-400" : "text-amber-300",
                      )}
                    >
                      {formatAmount(row.diferencias)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge estado={row.estado} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      {row.estado === "Abierto" ? (
                        <button
                          className={cn(cashierPrimaryButton, "h-9 px-4 text-xs")}
                          onClick={(event) => {
                            event.stopPropagation();
                            closeClosure(row.id);
                          }}
                          type="button"
                        >
                          Cerrar caja
                        </button>
                      ) : (
                        <span className="text-xs text-zinc-500">Sin acción</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {selected ? (
        <ClosureDetail closure={selected} invoices={invoices} notes={notes} receipts={receipts} />
      ) : null}
    </div>
  );
}

function ClosureDetail({
  closure,
  invoices,
  notes,
  receipts,
}: {
  closure: CashierClosure;
  invoices: CashierInvoice[];
  notes: CashierNote[];
  receipts: CashierReceipt[];
}) {
  const dayInvoices = invoices.filter(
    (invoice) =>
      invoice.fecha === closure.fecha && invoice.sucursalId === closure.sucursalId,
  );
  const dayReceipts = receipts.filter(
    (receipt) =>
      receipt.fecha === closure.fecha && receipt.sucursalId === closure.sucursalId,
  );
  const dayNotes = notes.filter(
    (note) => note.fecha === closure.fecha && note.sucursalId === closure.sucursalId,
  );
  const reviewed = closure.estado === "Revisado por Contabilidad";

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Badge tone="gray">Detalle del cierre</Badge>
          <h3 className="mt-3 text-lg font-black text-white">
            {closure.sucursalNombre} · {formatDate(closure.fecha)}
          </h3>
        </div>
        <StatusBadge estado={closure.estado} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PaymentTile label="Efectivo" value={closure.efectivo} />
        <PaymentTile label="Transferencias" value={closure.transferencias} />
        <PaymentTile label="Cheques" value={closure.cheques} />
        <PaymentTile label="Tarjetas" value={closure.tarjetas} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile icon={FileText} label="Facturas" value={String(dayInvoices.length)} />
        <SummaryTile icon={Receipt} label="Recibos" value={String(dayReceipts.length)} />
        <SummaryTile icon={StickyNote} label="Notas" value={String(dayNotes.length)} />
        <SummaryTile
          icon={ClipboardList}
          label="Retenciones"
          value={formatAmount(closure.totalRetenciones)}
        />
        <SummaryTile
          highlight
          icon={Banknote}
          label="Total recibido"
          value={formatAmount(closure.totalRecibido)}
        />
        <SummaryTile
          icon={CreditCard}
          label="Total facturado"
          value={formatAmount(closure.totalFacturado)}
        />
        <SummaryTile
          icon={CreditCard}
          label="Diferencia"
          tone={closure.diferencias === 0 ? "neutral" : "warn"}
          value={formatAmount(closure.diferencias)}
        />
      </div>

      {closure.observaciones ? (
        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
          <span className="text-xs font-black uppercase tracking-[0.1em] text-zinc-500">
            Observaciones
          </span>
          <p className="mt-1">{closure.observaciones}</p>
        </div>
      ) : null}

      <div
        className={cn(
          "mt-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold",
          reviewed
            ? "border-blue-500/25 bg-blue-500/10 text-blue-200"
            : "border-white/10 bg-white/[0.03] text-zinc-400",
        )}
      >
        {reviewed ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
        {reviewed
          ? "Revisado por Contabilidad."
          : "Revisión contable pendiente. Contabilidad marca la revisión; Caja no puede hacerlo."}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Document preview                                                           */
/* -------------------------------------------------------------------------- */

type PreviewTotals = {
  subtotal: number;
  subtotalLabel?: string;
  abono?: number;
  retencion1: number;
  retencion2: number;
  total: number;
  totalLabel: string;
};

function DocumentPreview({
  badge,
  descripcionMoto,
  fields,
  subtitle,
  title,
  totals,
  traceability,
}: {
  badge: string;
  descripcionMoto?: string[];
  fields: { label: string; value: string }[];
  subtitle: string;
  title: string;
  totals: PreviewTotals;
  traceability: string;
}) {
  return (
    <Card className="h-fit overflow-hidden xl:sticky xl:top-28">
      <div className="border-b border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="blue">{badge}</Badge>
          <span className="text-xs font-semibold text-zinc-500">{subtitle}</span>
        </div>
        <h3 className="mt-3 text-lg font-black text-white">{title}</h3>
      </div>
      <div className="grid gap-4 p-5">
        <dl className="grid gap-2 text-sm">
          {fields.map((field) => (
            <div className="flex items-start justify-between gap-3" key={field.label}>
              <dt className="text-zinc-500">{field.label}</dt>
              <dd className="max-w-[60%] break-words text-right font-semibold text-zinc-200">
                {field.value}
              </dd>
            </div>
          ))}
        </dl>

        {descripcionMoto && descripcionMoto.length ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <span className="text-xs font-black uppercase tracking-[0.1em] text-zinc-500">
              Descripción de motocicleta
            </span>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-5 text-zinc-300">
              {descripcionMoto.join("\n")}
            </pre>
          </div>
        ) : null}

        <div className="grid gap-1.5 rounded-xl border border-blue-500/20 bg-blue-500/[0.08] p-4 text-sm">
          <PreviewTotalRow
            label={totals.subtotalLabel ?? "Subtotal"}
            value={formatAmount(totals.subtotal)}
          />
          {typeof totals.abono === "number" ? (
            <PreviewTotalRow label="Abono" value={`- ${formatAmount(totals.abono)}`} />
          ) : null}
          <PreviewTotalRow
            label="Retención 1%"
            value={`- ${formatAmount(totals.retencion1)}`}
          />
          <PreviewTotalRow
            label="Retención 2%"
            value={`- ${formatAmount(totals.retencion2)}`}
          />
          <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-2">
            <span className="font-black text-white">{totals.totalLabel}</span>
            <span className="text-lg font-black text-blue-200">
              {formatAmount(totals.total)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <User className="h-3.5 w-3.5" />
          Elaborado por {traceability} · se sincroniza a Contabilidad para revisión.
        </div>
      </div>
    </Card>
  );
}

function PreviewTotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-400">{label}</span>
      <span className="font-semibold text-zinc-200">{value}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared field + primitive components                                        */
/* -------------------------------------------------------------------------- */

function FormSection({
  children,
  step,
  subtitle,
  title,
}: {
  children: ReactNode;
  step: number;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-500/15 text-xs font-black text-blue-300">
          {step}
        </span>
        <div>
          <h4 className="text-sm font-black text-white">{title}</h4>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
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

function SearchField({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
        Buscar
      </span>
      <input
        className="h-11 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm text-zinc-100 outline-none transition focus:border-blue-500/70"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
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
  const needsBank = formaPago !== "Efectivo";
  return (
    <div className="grid gap-4">
      <SelectField
        label="Forma de pago"
        onChange={setFormaPago}
        options={[...cashierPaymentMethods]}
        value={formaPago}
      />
      {needsBank ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField label="Banco" onChange={setBanco} value={banco} />
          <InputField label="Referencia" onChange={setReferencia} value={referencia} />
        </div>
      ) : (
        <p className="text-xs text-zinc-500">
          Pago en efectivo: banco y referencia no son necesarios.
        </p>
      )}
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
        <input
          checked={ret1}
          className="h-4 w-4 accent-blue-500"
          onChange={(event) => setRet1(event.target.checked)}
          type="checkbox"
        />
        Aplicar retención 1% (sobre el subtotal)
      </label>
      <label className="flex items-center gap-3 text-sm font-semibold text-zinc-300">
        <input
          checked={ret2}
          className="h-4 w-4 accent-blue-500"
          onChange={(event) => setRet2(event.target.checked)}
          type="checkbox"
        />
        Aplicar retención 2% (sobre el subtotal)
      </label>
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
          : estado === "Borrador"
            ? "gray"
            : "yellow";
  return <Badge tone={tone}>{estado}</Badge>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="p-8 text-sm leading-6 text-zinc-500">{message}</div>;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

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

function sumRetencion(
  invoices: CashierInvoice[],
  receipts: CashierReceipt[],
  notes: CashierNote[],
  key: "retencion1" | "retencion2",
) {
  return roundMoney(
    invoices.reduce((sum, invoice) => sum + invoice[key], 0) +
      receipts.reduce((sum, receipt) => sum + receipt[key], 0) +
      notes.reduce((sum, note) => sum + note[key], 0),
  );
}

function paymentBreakdown(invoices: CashierInvoice[], receipts: CashierReceipt[]) {
  const totals: Record<CashierPaymentMethod, number> = {
    Efectivo: 0,
    Transferencia: 0,
    Cheque: 0,
    Tarjeta: 0,
  };
  for (const invoice of invoices) {
    totals[invoice.formaPago] = roundMoney(totals[invoice.formaPago] + invoice.total);
  }
  for (const receipt of receipts) {
    totals[receipt.formaPago] = roundMoney(
      totals[receipt.formaPago] + receipt.totalAplicado,
    );
  }
  return totals;
}

function resolveOperationalDate(dates: string[]) {
  const current = today();
  if (dates.includes(current)) return current;
  const valid = dates.filter(Boolean).sort();
  return valid.length ? valid[valid.length - 1] : current;
}

function compareByFechaDesc(
  a: { fecha: string; id: string },
  b: { fecha: string; id: string },
) {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
  return a.id < b.id ? 1 : -1;
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

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function formatDate(value: string) {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
