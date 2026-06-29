"use client";

import Link from "next/link";
import { CreditCard, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  creditApplicationStatuses,
  type CreditApplicationRecord,
  type CreditApplicationStatus,
} from "@/data/operations/credit-applications";
import type { CustomerFileRecord, CustomerRecord } from "@/data/operations/customer-files";
import { desiredBranches } from "@/data/operations/leads";
import { readCreditApplications } from "@/features/operations/services/credit-application-service";
import { readCustomerFiles, readCustomers } from "@/features/operations/services/customer-files-service";
import { filterCreditApplicationsBySession } from "@/features/operations/services/operation-scope-service";
import { readDemoSession, subscribeToDemoSession } from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";

const ALL = "todas";

export function CreditsPanel() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [credits, setCredits] = useState<CreditApplicationRecord[]>([]);
  const [files, setFiles] = useState<CustomerFileRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<CreditApplicationStatus | typeof ALL>(ALL);
  const [branchFilter, setBranchFilter] = useState(ALL);
  const [sellerFilter, setSellerFilter] = useState(ALL);
  const [lenderFilter, setLenderFilter] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    function sync() {
      const nextSession = readDemoSession();
      setSession(nextSession);
      setCredits(readCreditApplications());
      setFiles(readCustomerFiles());
      setCustomers(readCustomers());
      setBranchFilter(nextSession?.role === "Gerente" ? nextSession.branchId : ALL);
    }

    sync();
    return subscribeToDemoSession(sync);
  }, []);

  const scopedCredits = useMemo(
    () => filterCreditApplicationsBySession(credits, session),
    [credits, session],
  );
  const visibleCredits = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedLender = lenderFilter.trim().toLowerCase();

    return scopedCredits.filter((credit) => {
      const customer = customers.find((item) => item.id === credit.customerId);
      const file = files.find((item) => item.id === credit.expedienteId);
      const matchesStatus = statusFilter === ALL || credit.estado === statusFilter;
      const matchesBranch = branchFilter === ALL || credit.sucursalId === branchFilter;
      const matchesSeller = sellerFilter === ALL || credit.vendedorNombre === sellerFilter;
      const matchesLender = !normalizedLender || (credit.financiera ?? "").toLowerCase().includes(normalizedLender);
      const searchText = [
        customer?.nombre,
        customer?.telefono,
        file?.numeroExpediente,
        credit.financiera,
        credit.vendedorNombre,
      ].filter(Boolean).join(" ").toLowerCase();

      return matchesStatus && matchesBranch && matchesSeller && matchesLender && (!normalizedQuery || searchText.includes(normalizedQuery));
    });
  }, [branchFilter, customers, files, lenderFilter, query, scopedCredits, sellerFilter, statusFilter]);

  if (!session || session.role === "Vendedor") {
    return (
      <Card className="p-8 text-center">
        <CreditCard className="mx-auto h-10 w-10 text-zinc-600" />
        <h2 className="mt-4 text-2xl font-black text-white">Créditos restringidos</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          La supervisión de créditos está disponible para Gerente y Administrador.
          El Vendedor gestiona el seguimiento desde sus expedientes.
        </p>
      </Card>
    );
  }

  const sellers = [...new Set(scopedCredits.map((credit) => credit.vendedorNombre))].sort();
  const branchOptions = session.role === "Gerente"
    ? desiredBranches.filter((branch) => branch.id === session.branchId)
    : desiredBranches;
  const metrics = [
    ["En revisión", countStatus(scopedCredits, "En revision")],
    ["Documentación pendiente", countStatus(scopedCredits, "Documentacion pendiente")],
    ["Preaprobados", countStatus(scopedCredits, "Preaprobado")],
    ["Aprobados", countStatus(scopedCredits, "Aprobado")],
    ["Rechazados", countStatus(scopedCredits, "Rechazado")],
    ["Cancelados", countStatus(scopedCredits, "Cancelado")],
  ];

  return (
    <section className="space-y-6">
      <div>
        <Badge tone="red">Créditos manuales</Badge>
        <h2 className="mt-4 text-3xl font-black text-white">Seguimiento de créditos</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
          Un seguimiento activo por expediente. La financiera y el estado se actualizan manualmente desde el expediente.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {metrics.map(([label, value]) => (
          <Card className="p-4" key={label}>
            <div className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-500">{label}</div>
            <div className="mt-2 text-2xl font-black text-white">{value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-5">
          <FilterSelect label="Estado" onChange={(value) => setStatusFilter(value as CreditApplicationStatus | typeof ALL)} value={statusFilter}>
            <option value={ALL}>Todos los estados</option>
            {creditApplicationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </FilterSelect>
          <FilterSelect label="Sucursal" onChange={setBranchFilter} value={branchFilter}>
            {session.role === "Administrador" ? <option value={ALL}>Todas las sucursales</option> : null}
            {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </FilterSelect>
          <FilterSelect label="Vendedor" onChange={setSellerFilter} value={sellerFilter}>
            <option value={ALL}>Todos los vendedores</option>
            {sellers.map((seller) => <option key={seller} value={seller}>{seller}</option>)}
          </FilterSelect>
          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">Financiera</span>
            <Input onChange={(event) => setLenderFilter(event.target.value)} placeholder="Filtrar financiera" value={lenderFilter} />
          </label>
          <label className="relative block">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">Busqueda</span>
            <Search className="pointer-events-none absolute bottom-4 left-4 h-4 w-4 text-zinc-600" />
            <Input className="pl-11" onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, teléfono o expediente" value={query} />
          </label>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[1250px] w-full text-left">
            <thead className="border-b border-white/10 bg-white/[0.035] text-xs font-black uppercase tracking-[0.1em] text-zinc-500">
              <tr>
                <th className="px-5 py-4">Expediente</th><th className="px-5 py-4">Cliente</th><th className="px-5 py-4">Sucursal</th><th className="px-5 py-4">Vendedor</th><th className="px-5 py-4">Financiera</th><th className="px-5 py-4">Estado</th><th className="px-5 py-4">Monto / prima</th><th className="px-5 py-4">Plazo / cuota</th><th className="px-5 py-4">Solicitud</th><th className="px-5 py-4">Actualización</th><th className="px-5 py-4">Acción</th>
              </tr>
            </thead>
            <tbody>
              {visibleCredits.map((credit) => {
                const customer = customers.find((item) => item.id === credit.customerId);
                const file = files.find((item) => item.id === credit.expedienteId);
                return (
                  <tr className="border-b border-white/7 text-sm text-zinc-300 last:border-b-0" key={credit.id}>
                    <td className="px-5 py-4 font-mono font-bold text-white">{file?.numeroExpediente ?? "Expediente no disponible"}</td>
                    <td className="px-5 py-4"><div className="font-semibold text-white">{customer?.nombre ?? "Cliente no disponible"}</div><div className="mt-1 text-xs text-zinc-500">{customer?.telefono ?? ""}</div></td>
                    <td className="px-5 py-4">{credit.sucursalNombre}</td><td className="px-5 py-4">{credit.vendedorNombre}</td><td className="px-5 py-4">{credit.financiera ?? "No indicada"}</td>
                    <td className="px-5 py-4"><Badge tone={statusTone(credit.estado)}>{credit.estado}</Badge></td>
                    <td className="px-5 py-4">{formatAmount(credit.montoSolicitado, credit.moneda)}<div className="mt-1 text-xs text-zinc-500">Prima: {formatAmount(credit.prima, credit.moneda)}</div></td>
                    <td className="px-5 py-4">{credit.plazoMeses ? `${credit.plazoMeses} meses` : "No indicado"}<div className="mt-1 text-xs text-zinc-500">Cuota: {formatAmount(credit.cuotaEstimada, credit.moneda)}</div></td>
                    <td className="px-5 py-4 text-zinc-400">{formatDate(credit.fechaSolicitud)}</td><td className="px-5 py-4 text-zinc-400">{formatDate(credit.fechaActualizacion)}</td>
                    <td className="px-5 py-4"><Link className="font-semibold text-red-300 hover:text-red-200" href="/panel/expedientes">Ver expediente</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visibleCredits.length ? <div className="p-8 text-center text-sm text-zinc-500">Aún no hay seguimientos de crédito para este alcance. Cuando un expediente inicie su seguimiento, aparecerá aquí.</div> : null}
      </Card>
    </section>
  );
}

function FilterSelect({ children, label, onChange, value }: { children: React.ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">{label}</span><select className="h-12 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm font-semibold text-zinc-100 outline-none focus:border-red-500/70" onChange={(event) => onChange(event.target.value)} value={value}>{children}</select></label>;
}

function countStatus(credits: CreditApplicationRecord[], status: CreditApplicationStatus) { return credits.filter((credit) => credit.estado === status).length; }
function formatAmount(value: number | null, currency: CreditApplicationRecord["moneda"]) { return value === null ? "No indicado" : new Intl.NumberFormat("es-NI", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
function formatDate(value: string | null) { if (!value) return "No indicada"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-NI", { day: "2-digit", month: "short", year: "numeric" }).format(date); }
function statusTone(status: CreditApplicationStatus) { if (status === "Aprobado") return "green" as const; if (status === "Documentacion pendiente" || status === "Preaprobado") return "yellow" as const; if (status === "Rechazado" || status === "Cancelado") return "gray" as const; return "blue" as const; }
