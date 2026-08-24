"use client";

import Link from "next/link";
import { ClipboardCheck, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ActivityRelationshipPanel } from "@/features/operations/components/activity-relationship-panel";
import { CustomerFileQuotePanel } from "@/features/operations/components/customer-file-quote-panel";
import { CustomerFileDocumentsPanel } from "@/features/operations/components/customer-file-documents-panel";
import { CustomerFileCreditPanel } from "@/features/operations/components/customer-file-credit-panel";
import type {
  CustomerFileRecord,
  CustomerRecord,
} from "@/data/operations/customer-files";
import type { PublicLead } from "@/data/operations/leads";
import {
  findCustomerById,
  readCustomerFiles,
  readCustomers,
} from "@/features/operations/services/customer-files-service";
import { readLeadInboxLeads } from "@/features/operations/services/leads-service";
import { filterCustomerFilesBySession } from "@/features/operations/services/operation-scope-service";
import {
  readDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";
import { cn } from "@/lib/utils";

export function CustomerFilesList() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [files, setFiles] = useState<CustomerFileRecord[]>([]);
  const [leads, setLeads] = useState<PublicLead[]>([]);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setSession(readDemoSession());
    const storedFiles = readCustomerFiles();
    setFiles(storedFiles);
    setCustomers(readCustomers());
    setLeads(readLeadInboxLeads());
    setSelectedFileId(storedFiles[0]?.id ?? "");
    return subscribeToDemoSession(() => setSession(readDemoSession()));
  }, []);

  const scopedFiles = useMemo(
    () => filterCustomerFilesBySession(files, leads, session),
    [files, leads, session],
  );

  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return scopedFiles;

    return scopedFiles.filter((file) => {
      const customer = findCustomerById(customers, file.clienteId);

      return (
        file.numeroExpediente.toLowerCase().includes(normalizedQuery) ||
        file.motoInteres.toLowerCase().includes(normalizedQuery) ||
        file.sucursalNombre.toLowerCase().includes(normalizedQuery) ||
        customer?.nombre.toLowerCase().includes(normalizedQuery) ||
        customer?.telefono.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [customers, query, scopedFiles]);

  const selectedFile =
    filteredFiles.find((file) => file.id === selectedFileId) ??
    filteredFiles[0] ??
    null;

  useEffect(() => {
    if (!selectedFile && filteredFiles[0]) {
      setSelectedFileId(filteredFiles[0].id);
    }
  }, [filteredFiles, selectedFile]);

  if (!session) {
    return (
      <Card className="p-8 text-center">
        <ClipboardCheck className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="mt-4 text-xl font-semibold text-slate-900">
          Inicia sesión para continuar
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Inicia sesión para consultar expedientes del Centro de Operaciones.
        </p>
        <Link
          className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          href="/panel"
        >
          Ir a inicio de sesión
        </Link>
      </Card>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        description="Expedientes creados desde leads asignados. Desde aquí se consulta el seguimiento comercial, documental y de crédito del cliente."
        eyebrow="Expedientes"
        title="Expedientes comerciales"
      />

      <Card className="p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-11"
            name="file-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por expediente, cliente, teléfono o moto"
            value={query}
          />
        </label>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr] border-b border-slate-200 px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500 lg:grid">
            <div>Expediente</div>
            <div>Cliente</div>
            <div>Moto</div>
            <div>Sucursal</div>
            <div>Vendedor</div>
            <div>Estado</div>
          </div>

          {filteredFiles.length ? (
            filteredFiles.map((file) => {
              const customer = findCustomerById(customers, file.clienteId);

              return (
                <button
                  className={cn(
                    "grid w-full gap-4 border-b border-slate-100 px-6 py-5 text-left transition last:border-b-0 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr] lg:items-center",
                    selectedFile?.id === file.id
                      ? "bg-red-50"
                      : "hover:bg-slate-100",
                  )}
                  key={file.id}
                  onClick={() => setSelectedFileId(file.id)}
                  type="button"
                >
                  <div className="font-mono text-sm font-semibold text-slate-900">
                    {file.numeroExpediente}
                  </div>
                  <div className="text-sm text-slate-600">
                    {customer?.nombre ?? "Cliente no encontrado"}
                  </div>
                  <div className="text-sm text-slate-500">{file.motoInteres}</div>
                  <div className="text-sm text-slate-500">
                    {file.sucursalNombre}
                  </div>
                  <div className="text-sm text-slate-500">{file.vendedor}</div>
                  <div>
                    <Badge tone="green">{file.estado}</Badge>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">
              Aún no hay expedientes para este alcance. Cuando conviertas un lead en expediente, aparecerá aquí.
            </div>
          )}
        </Card>

        <FileDetail
          customer={
            selectedFile ? findCustomerById(customers, selectedFile.clienteId) : null
          }
          file={selectedFile}
          session={session}
        />
      </div>
    </section>
  );
}

function FileDetail({
  customer,
  file,
  session,
}: {
  customer: CustomerRecord | null;
  file: CustomerFileRecord | null;
  session: DemoSession;
}) {
  if (!file) {
    return (
      <Card className="p-8 text-center">
        <ClipboardCheck className="mx-auto h-10 w-10 text-slate-400" />
        <h3 className="mt-4 text-lg font-semibold text-slate-900">Sin seleccion</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Selecciona un expediente para revisar su detalle.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <Badge tone="green">{file.estado}</Badge>
      <h3 className="mt-4 font-mono text-xl font-semibold text-slate-900">
        {file.numeroExpediente}
      </h3>
      <p className="mt-1 text-xs text-slate-400">{file.id}</p>

      <div className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <DetailLine
          label="Cliente"
          value={customer?.nombre ?? "Cliente no encontrado"}
        />
        <DetailLine
          label="Teléfono"
          value={customer?.telefono ?? "No disponible"}
        />
        <DetailLine label="Moto" value={file.motoInteres} />
        <DetailLine label="Sucursal" value={file.sucursalNombre} />
        <DetailLine label="Vendedor" value={file.vendedor} />
        <DetailLine label="Fecha" value={formatDate(file.fechaCreacion)} />
      </div>

      <Card className="mt-6 border-slate-200 bg-slate-50 p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Observaciones
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {file.observaciones ?? "Sin observaciones registradas."}
        </p>
      </Card>

      <Card className="mt-6 border-red-200 bg-red-50 p-5">
        <div className="flex items-start gap-3">
          <Users className="mt-1 h-5 w-5 text-red-700" />
          <p className="text-sm leading-6 text-slate-600">
            La proforma registra una propuesta comercial del expediente. No
            reserva una unidad, no genera una venta y no aprueba crédito.
          </p>
        </div>
      </Card>

      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        {["Resumen", "Proforma", "Documentos", "Credito", "Reserva", "Venta", "Actividades"].map((section) => (
          <div
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500"
            key={section}
          >
            {section}
          </div>
        ))}
      </div>

      <ActivityRelationshipPanel
        allowedTypes={["Seguimiento"]}
        branchId={file.sucursalId}
        branchName={file.sucursalNombre}
        customerId={file.clienteId}
        expedienteId={file.id}
        leadIds={[file.leadId]}
        session={session}
        title="Historial comercial"
      />

      <CustomerFileQuotePanel file={file} session={session} />

      <CustomerFileDocumentsPanel file={file} session={session} />

      <CustomerFileCreditPanel file={file} session={session} />
    </Card>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 last:border-b-0 last:pb-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="max-w-[220px] text-right text-sm font-semibold text-slate-900">
        {value}
      </span>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
