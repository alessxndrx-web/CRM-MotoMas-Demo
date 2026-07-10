"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bike,
  CalendarCheck,
  Check,
  ClipboardCheck,
  CreditCard,
  FileSearch,
  PackageCheck,
  Search,
  Truck,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  findPublicProcess,
  formatPublicDate,
  getDeliveryPublicStatus,
  getNextStep,
  getProgressIndex,
  getPublicAdvisor,
  getPublicBranch,
  getPublicCreditNextStep,
  getPublicCreditStatus,
  getPublicMotorcycle,
  getPublicPersonName,
  getPublicPhone,
  getPublicStatus,
  getReservationPublicStatus,
  hasPendingDocuments,
  maskVin,
  normalizeUnitStatus,
  publicProgressSteps,
  type PublicProcessSummary,
} from "@/features/portal/services/public-process-service";
import {
  btnPrimary,
  inputClass,
  labelClass,
  PortalBadge,
  PortalCard,
  PortalPageHeader,
} from "@/features/portal/components/ui";
import { cn } from "@/lib/utils";

export type PublicProcessView = "process" | "reservation" | "delivery" | "credit";

type PublicProcessLookupProps = {
  initialCode?: string | null;
  initialFileNumber?: string | null;
  initialPhone?: string | null;
  initialCedula?: string | null;
  view: PublicProcessView;
};

const viewCopy: Record<
  PublicProcessView,
  { badge: string; title: string; description: string; searchLabel: string }
> = {
  process: {
    badge: "Consulta tu proceso",
    title: "Mi proceso",
    description:
      "Consulta el avance de tu solicitud con tus datos de seguimiento.",
    searchLabel: "Buscar mi proceso",
  },
  reservation: {
    badge: "Estado de reserva",
    title: "Mi reserva",
    description: "Revisa si tu proceso tiene una reserva activa.",
    searchLabel: "Buscar mi reserva",
  },
  delivery: {
    badge: "Estado de entrega",
    title: "Mi entrega",
    description: "Consulta el estado de entrega de tu motocicleta.",
    searchLabel: "Buscar mi entrega",
  },
  credit: {
    badge: "Seguimiento de crédito",
    title: "Mi crédito",
    description: "Consulta el estado de tu seguimiento de crédito.",
    searchLabel: "Consultar mi crédito",
  },
};

export function PublicProcessLookup({
  initialCode,
  initialFileNumber,
  initialPhone,
  initialCedula,
  view,
}: PublicProcessLookupProps) {
  const [codeQuery, setCodeQuery] = useState(initialCode ?? "");
  const [fileQuery, setFileQuery] = useState(initialFileNumber ?? "");
  const [phoneQuery, setPhoneQuery] = useState(initialPhone ?? "");
  const [cedulaQuery, setCedulaQuery] = useState(initialCedula ?? "");
  const [result, setResult] = useState<PublicProcessSummary | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const copy = viewCopy[view];
  const queryString = useMemo(
    () =>
      buildQueryString({
        code: codeQuery,
        fileNumber: fileQuery,
        phone: phoneQuery,
        cedula: cedulaQuery,
      }),
    [cedulaQuery, codeQuery, fileQuery, phoneQuery],
  );

  useEffect(() => {
    if (
      initialCode?.trim() ||
      initialFileNumber?.trim() ||
      initialPhone?.trim() ||
      initialCedula?.trim()
    ) {
      setResult(
        findPublicProcess({
          code: initialCode,
          fileNumber: initialFileNumber,
          phone: initialPhone,
          cedula: initialCedula,
        }),
      );
      setHasSearched(true);
    }
  }, [initialCedula, initialCode, initialFileNumber, initialPhone]);

  function searchProcess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(
      findPublicProcess({
        code: codeQuery,
        fileNumber: fileQuery,
        phone: phoneQuery,
        cedula: cedulaQuery,
      }),
    );
    setHasSearched(true);
  }

  return (
    <>
      <PortalPageHeader
        description={`${copy.description} Solo verás información asociada a esos datos.`}
        eyebrow={copy.badge}
        title={copy.title}
      >
        <ProcessNav queryString={queryString} view={view} />
      </PortalPageHeader>

      <section className="mx-auto grid max-w-[1240px] items-start gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:px-8">
        <div className="lg:sticky lg:top-28">
        <PortalCard className="p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <Search className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900">
              Seguimiento de solicitud
            </h2>
          </div>
          <form className="grid gap-5" onSubmit={searchProcess}>
            <Field label="Código de solicitud">
              <input
                autoComplete="off"
                className={inputClass}
                name="codigoSolicitud"
                onChange={(event) => setCodeQuery(event.target.value)}
                placeholder="Ej. SOL-20260614-ABC12345"
                value={codeQuery}
              />
            </Field>

            <Field label="Número de expediente">
              <input
                autoComplete="off"
                className={inputClass}
                name="numeroExpediente"
                onChange={(event) => setFileQuery(event.target.value)}
                placeholder="Ej. EXP-20260619-025"
                value={fileQuery}
              />
            </Field>

            <Field label="Teléfono">
              <input
                autoComplete="tel"
                className={inputClass}
                name="telefonoSolicitud"
                onChange={(event) => setPhoneQuery(event.target.value)}
                placeholder="Número usado en la solicitud"
                type="tel"
                value={phoneQuery}
              />
            </Field>

            <Field label="Cédula">
              <input
                autoComplete="off"
                className={inputClass}
                maxLength={16}
                name="cedulaSolicitud"
                onChange={(event) => setCedulaQuery(sanitizeCedulaQuery(event.target.value))}
                placeholder="Ej. 001-010101-0000A"
                value={cedulaQuery}
              />
            </Field>

            <button className={cn(btnPrimary, "w-full")} type="submit">
              <Search className="h-4 w-4" />
              {copy.searchLabel}
            </button>
          </form>

          <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
            Basta con uno de los datos. Si no recuerdas ninguno, tu asesor de
            sucursal puede ayudarte a recuperarlo.
          </p>
        </PortalCard>
        </div>

        <div className="min-w-0">
          {result ? (
            <div className="animate-fade-up space-y-6">
              {view === "process" ? <ProcessCard process={result} /> : null}
              {view === "reservation" ? <ReservationCard process={result} /> : null}
              {view === "delivery" ? <DeliveryCard process={result} /> : null}
              {view === "credit" ? <CreditCardView process={result} /> : null}
            </div>
          ) : (
            <EmptyState hasSearched={hasSearched} view={view} />
          )}
        </div>
      </section>
    </>
  );
}

function ProcessCard({ process }: { process: PublicProcessSummary }) {
  const status = getPublicStatus(process);
  const progressIndex = getProgressIndex(process);
  const isClosed = process.lead?.estado === "Descartado";

  return (
    <PortalCard className="p-6">
      <HeaderBlock
        badge={status}
        icon={<ClipboardCheck className="h-6 w-6" />}
        title={getPublicPersonName(process)}
        tone={isClosed ? "slate" : "green"}
      />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <InfoTile label="Nombre" value={getPublicPersonName(process)} />
        <InfoTile label="Código de solicitud" value={process.lead?.id ?? "No disponible"} />
        <InfoTile label="Teléfono" value={getPublicPhone(process) ?? "No disponible"} />
        <InfoTile label="Moto de interés" value={getPublicMotorcycle(process)} />
        <InfoTile label="Sucursal" value={getPublicBranch(process)} />
        <InfoTile label="Estado actual" value={status} />
        <InfoTile
          label="Fecha de solicitud"
          value={formatPublicDate(process.lead?.fechaCreacion ?? process.file?.fechaCreacion)}
        />
        <InfoTile
          label="Número de expediente"
          value={
            process.file?.numeroExpediente ??
            process.lead?.numeroExpediente ??
            "Aún no asignado"
          }
        />
        <InfoTile
          label="Asesor"
          value={getPublicAdvisor(process) ?? "Pendiente de asignación"}
        />
      </div>

      <ProgressLine activeIndex={progressIndex} closed={isClosed} />
      <NextStep>{getNextStep(process)}</NextStep>
    </PortalCard>
  );
}

function ReservationCard({ process }: { process: PublicProcessSummary }) {
  const reservationStatus = getReservationPublicStatus(process);
  const reservation = process.reservation;

  return (
    <PortalCard className="p-6">
      <HeaderBlock
        badge={reservationStatus}
        icon={<CalendarCheck className="h-6 w-6" />}
        title="Estado de reserva"
      />

      {reservation ? (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <InfoTile label="Cliente" value={getPublicPersonName(process)} />
            <InfoTile label="Modelo" value={reservation.modelo} />
            <InfoTile label="Identificador" value={maskVin(reservation.vin)} />
            <InfoTile label="Sucursal" value={reservation.sucursalNombre} />
            <InfoTile label="Estado de reserva" value={reservationStatus} />
            <InfoTile
              label="Fecha de reserva"
              value={formatPublicDate(reservation.fechaReserva)}
            />
          </div>
          <NextStep>{getNextStep(process)}</NextStep>
        </>
      ) : (
        <PublicMessage
          icon={<PackageCheck className="h-6 w-6" />}
          title="Sin reserva activa"
          description="No encontramos una reserva asociada a esos datos. Si tu proceso avanza, la sucursal podrá registrar una reserva y la verás aquí."
        />
      )}
    </PortalCard>
  );
}

function DeliveryCard({ process }: { process: PublicProcessSummary }) {
  const deliveryStatus = getDeliveryPublicStatus(process);
  const unitStatus = normalizeUnitStatus(process.unit?.estado);

  return (
    <PortalCard className="p-6">
      <HeaderBlock
        badge={deliveryStatus}
        icon={<Truck className="h-6 w-6" />}
        title="Estado de entrega"
      />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <InfoTile label="Cliente" value={getPublicPersonName(process)} />
        <InfoTile label="Modelo" value={getPublicMotorcycle(process)} />
        <InfoTile label="Sucursal" value={getPublicBranch(process)} />
        <InfoTile
          label="Estado"
          value={
            deliveryStatus === "Motocicleta entregada"
              ? "Entregada"
              : process.sale
                ? "En preparación de entrega"
                : "Aún no programada"
          }
        />
        {process.sale?.fechaEntrega ? (
          <InfoTile
            label="Fecha de entrega"
            value={formatPublicDate(process.sale.fechaEntrega)}
          />
        ) : null}
      </div>

      <PublicMessage
        icon={<Truck className="h-6 w-6" />}
        title={deliveryStatus}
        description={
          deliveryStatus === "Motocicleta entregada" || deliveryStatus === "Entregada"
            ? "Tu motocicleta figura como entregada."
            : deliveryStatus === "Proceso de entrega en preparacion"
              ? "La sucursal está preparando los pasos finales de tu entrega."
              : "La entrega aún no está programada. Cuando tu proceso avance, verás aquí el estado."
        }
      />
    </PortalCard>
  );
}

function CreditCardView({ process }: { process: PublicProcessSummary }) {
  const creditStatus = getPublicCreditStatus(process);
  const pendingDocuments = hasPendingDocuments(process);

  return (
    <PortalCard className="p-6">
      <HeaderBlock
        badge={process.credit ? "Seguimiento de crédito" : "Crédito pendiente"}
        icon={<CreditCard className="h-6 w-6" />}
        title={process.credit ? "Seguimiento de crédito" : "Crédito pendiente de habilitar"}
      />

      <PublicMessage
        icon={<FileSearch className="h-6 w-6" />}
        title={creditStatus}
        description={getPublicCreditNextStep(process)}
      />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <InfoTile label="Cliente" value={getPublicPersonName(process)} />
        <InfoTile label="Moto de interés" value={getPublicMotorcycle(process)} />
        <InfoTile label="Sucursal" value={getPublicBranch(process)} />
        <InfoTile
          label="Documentación"
          value={
            pendingDocuments || process.credit?.estado === "Documentacion pendiente"
              ? "Hay documentación pendiente por completar."
              : "Sin documentación pendiente registrada."
          }
        />
      </div>
    </PortalCard>
  );
}

function ProgressLine({ activeIndex, closed }: { activeIndex: number; closed: boolean }) {
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-center gap-2.5">
        <FileSearch className="h-5 w-5 text-blue-600" />
        <h3 className="text-base font-semibold text-slate-900">Progreso</h3>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {publicProgressSteps.map((step, index) => {
          const complete = !closed && index <= activeIndex;
          return (
            <div
              className={cn(
                "min-h-[96px] rounded-xl border p-4",
                complete ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white",
              )}
              key={step}
            >
              <div
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-lg border text-xs font-semibold",
                  complete
                    ? "border-blue-300 bg-blue-600 text-white"
                    : "border-slate-200 text-slate-400",
                )}
              >
                {complete ? <Check className="h-4 w-4" /> : index + 1}
              </div>
              <div
                className={cn(
                  "mt-3 text-sm font-bold leading-5",
                  complete ? "text-slate-900" : "text-slate-500",
                )}
              >
                {step}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProcessNav({
  queryString,
  view,
}: {
  queryString: string;
  view: PublicProcessView;
}) {
  const links = [
    { href: "/consultar-expediente", label: "Mi proceso", key: "process" },
    { href: "/mi-reserva", label: "Mi reserva", key: "reservation" },
    { href: "/mi-entrega", label: "Mi entrega", key: "delivery" },
    { href: "/mi-credito", label: "Mi crédito", key: "credit" },
  ] as const;

  return (
    <nav
      aria-label="Consultas del cliente"
      className="-mx-1 mt-6 flex gap-1.5 overflow-x-auto px-1 pb-1"
    >
      {links.map((item) => {
        const active = view === item.key;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative min-w-max rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
              active
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
            href={`${item.href}${queryString}`}
            key={item.href}
          >
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-orange-500"
              />
            ) : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function EmptyState({
  hasSearched,
  view,
}: {
  hasSearched: boolean;
  view: PublicProcessView;
}) {
  const lookupFields = [
    "Código de solicitud",
    "Número de expediente",
    "Teléfono usado en la solicitud",
    "Cédula",
  ];

  return (
    <PortalCard className="animate-fade-in overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-br from-blue-50/60 via-white to-white p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-slate-200 bg-white text-blue-600 shadow-sm">
          <Bike className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-slate-900">
          {hasSearched ? "No encontramos tu solicitud" : viewCopy[view].title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
          {hasSearched
            ? "Verifica tu código de solicitud, número de expediente, teléfono o cédula e inténtalo de nuevo."
            : "Ingresa uno de estos datos para consultar el estado actual de tu proceso."}
        </p>
      </div>

      {/* Fills the panel instead of leaving a tall empty card on first load. */}
      <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Datos que puedes usar
          </div>
          <ul className="mt-3 grid gap-2">
            {lookupFields.map((field) => (
              <li
                className="flex items-center gap-2.5 text-sm leading-6 text-slate-700"
                key={field}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                {field}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Próximos pasos
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Si aún no has enviado tu solicitud, cuéntanos qué modelo te interesa
            y en qué sucursal quieres ser atendido. Un asesor dará seguimiento a
            tu proceso.
          </p>
          <Link
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800"
            href="/solicitar-informacion"
          >
            Solicitar información
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </PortalCard>
  );
}

function HeaderBlock({
  badge,
  icon,
  title,
  tone = "green",
}: {
  badge: string;
  icon: ReactNode;
  title: string;
  tone?: "green" | "slate";
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <PortalBadge tone={tone}>{badge}</PortalBadge>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
        {icon}
      </div>
    </div>
  );
}

function PublicMessage({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
    </div>
  );
}

function NextStep({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-5">
      <div className="text-xs font-bold uppercase tracking-wider text-orange-700">
        Próximo paso
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-700">{children}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1.5 text-sm font-bold leading-6 text-slate-900">{value}</div>
    </div>
  );
}

function buildQueryString({
  code,
  fileNumber,
  phone,
  cedula,
}: {
  code: string;
  fileNumber: string;
  phone: string;
  cedula: string;
}) {
  const params = new URLSearchParams();

  if (code.trim()) params.set("codigo", code.trim());
  if (fileNumber.trim()) params.set("expediente", fileNumber.trim());
  if (phone.trim()) params.set("telefono", phone.trim());
  if (cedula.trim()) params.set("cedula", cedula.trim());

  const value = params.toString();
  return value ? `?${value}` : "";
}

function sanitizeCedulaQuery(value: string) {
  const cleaned = value
    .replace(/\s+/g, "")
    .replace(/[^0-9A-Za-z-]/g, "")
    .toUpperCase();

  return cleaned.includes("-") ? cleaned.slice(0, 16) : cleaned.slice(0, 14);
}
