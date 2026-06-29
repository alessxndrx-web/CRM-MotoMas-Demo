"use client";

import Link from "next/link";
import {
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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  {
    badge: string;
    title: string;
    description: string;
    searchLabel: string;
  }
> = {
  process: {
    badge: "Seguimiento público",
    title: "Mi proceso",
    description:
      "Consulta el avance de tu solicitud o expediente con tus datos de seguimiento.",
    searchLabel: "Buscar proceso",
  },
  reservation: {
    badge: "Reserva",
    title: "Mi reserva",
    description:
      "Revisa si tu proceso tiene una reserva activa, completada o cancelada.",
    searchLabel: "Buscar reserva",
  },
  delivery: {
    badge: "Entrega",
    title: "Mi entrega",
    description:
      "Consulta el estado visible de entrega asociado a tu proceso comercial.",
    searchLabel: "Buscar entrega",
  },
  credit: {
    badge: "Seguimiento de crédito",
    title: "Mi crédito",
    description:
      "Consulta el estado público de tu seguimiento de crédito con tus datos de proceso.",
    searchLabel: "Consultar proceso",
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
    <section className="mx-auto grid max-w-[1520px] gap-8 px-4 py-10 sm:px-8 lg:grid-cols-[420px_1fr] lg:px-10">
      <div>
        <Badge tone="red">{copy.badge}</Badge>
        <h1 className="mt-5 text-4xl font-black tracking-normal text-white sm:text-5xl">
          {copy.title}
        </h1>
        <p className="mt-4 text-base leading-7 text-zinc-400">
          {copy.description} Solo verás información asociada a esos datos.
        </p>

        <Card className="mt-8 p-6">
          <form className="grid gap-5" onSubmit={searchProcess}>
            <Field label="Código de solicitud">
              <Input
                autoComplete="off"
                name="codigoSolicitud"
                onChange={(event) => setCodeQuery(event.target.value)}
                placeholder="Ej. SOL-20260614-ABC12345"
                value={codeQuery}
              />
            </Field>

            <Field label="Número de expediente">
              <Input
                autoComplete="off"
                name="numeroExpediente"
                onChange={(event) => setFileQuery(event.target.value)}
                placeholder="Ej. EXP-20260619-025"
                value={fileQuery}
              />
            </Field>

            <Field label="Teléfono">
              <Input
                autoComplete="tel"
                name="telefonoSolicitud"
                onChange={(event) => setPhoneQuery(event.target.value)}
                placeholder="Número usado en la solicitud"
                type="tel"
                value={phoneQuery}
              />
            </Field>

            <Field label="Cédula">
              <Input
                autoComplete="off"
                maxLength={16}
                name="cedulaSolicitud"
                onChange={(event) =>
                  setCedulaQuery(sanitizeCedulaQuery(event.target.value))
                }
                placeholder="Ej. 001-010101-0000A"
                value={cedulaQuery}
              />
            </Field>

            <Button className="h-12 w-full" type="submit">
              <Search className="h-4 w-4" />
              {copy.searchLabel}
            </Button>
          </form>
        </Card>

        <ProcessNav queryString={queryString} view={view} />
      </div>

      <div>
        {result ? (
          <div className="space-y-6">
            {view === "process" ? <ProcessCard process={result} /> : null}
            {view === "reservation" ? (
              <ReservationCard process={result} />
            ) : null}
            {view === "delivery" ? <DeliveryCard process={result} /> : null}
            {view === "credit" ? <CreditCardView process={result} /> : null}
          </div>
        ) : (
          <EmptyState hasSearched={hasSearched} view={view} />
        )}
      </div>
    </section>
  );
}

function ProcessCard({ process }: { process: PublicProcessSummary }) {
  const status = getPublicStatus(process);
  const progressIndex = getProgressIndex(process);
  const isClosed = process.lead?.estado === "Descartado";

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Badge tone={isClosed ? "gray" : "green"}>{status}</Badge>
          <h2 className="mt-4 text-3xl font-black text-white">
            {getPublicPersonName(process)}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Seguimiento de tu solicitud y expediente comercial.
          </p>
        </div>
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-500/15 text-red-400">
          <ClipboardCheck className="h-7 w-7" />
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <InfoTile label="Nombre" value={getPublicPersonName(process)} />
        <InfoTile
          label="Código de solicitud"
          value={process.lead?.id ?? "Información pendiente de completar"}
        />
        <InfoTile
          label="Teléfono"
          value={getPublicPhone(process) ?? "Información pendiente de completar"}
        />
        <InfoTile
          label="Cédula"
          value={process.lead?.cedula ?? "No registrado"}
        />
        <InfoTile label="Moto de interés" value={getPublicMotorcycle(process)} />
        <InfoTile label="Sucursal" value={getPublicBranch(process)} />
        <InfoTile
          label="Canal"
          value={process.lead?.canalOrigen ?? "No indicado"}
        />
        <InfoTile
          label="Estado actual"
          value={status}
        />
        <InfoTile
          label="Fecha de creación"
          value={formatPublicDate(
            process.lead?.fechaCreacion ?? process.file?.fechaCreacion,
          )}
        />
        <InfoTile
          label="Número de expediente"
          value={
            process.file?.numeroExpediente ??
            process.lead?.numeroExpediente ??
            "Información pendiente de completar"
          }
        />
        <InfoTile
          label="Asesor"
          value={getPublicAdvisor(process) ?? "Pendiente de asignacion"}
        />
      </div>

      <ProgressLine activeIndex={progressIndex} closed={isClosed} />
      <NextStep>{getNextStep(process)}</NextStep>
    </Card>
  );
}

function ReservationCard({ process }: { process: PublicProcessSummary }) {
  const reservationStatus = getReservationPublicStatus(process);
  const reservation = process.reservation;

  return (
    <Card className="p-6">
      <HeaderBlock
        badge={reservationStatus}
        icon={<CalendarCheck className="h-7 w-7" />}
        title="Estado de reserva"
      />

      {reservation ? (
        <>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <InfoTile label="Cliente" value={getPublicPersonName(process)} />
            <InfoTile label="Modelo" value={reservation.modelo} />
            <InfoTile label="VIN" value={maskVin(reservation.vin)} />
            <InfoTile label="Sucursal" value={reservation.sucursalNombre} />
            <InfoTile label="Estado de reserva" value={reservationStatus} />
            <InfoTile
              label="Fecha de reserva"
              value={formatPublicDate(reservation.fechaReserva)}
            />
            <InfoTile
              label="Estado de unidad"
              value={
                normalizeUnitStatus(process.unit?.estado) ??
                "Información pendiente de completar"
              }
            />
            <InfoTile
              label="Número de expediente"
              value={
                reservation.numeroExpediente ??
                "Información pendiente de completar"
              }
            />
          </div>
          <NextStep>{getNextStep(process)}</NextStep>
        </>
      ) : (
        <PublicMessage
          icon={<PackageCheck className="h-7 w-7" />}
          title="Sin reserva activa"
          description="No encontramos una reserva asociada a esos datos. Si tu proceso avanza, la sucursal podra registrar una reserva y la veras aqui."
        />
      )}
    </Card>
  );
}

function DeliveryCard({ process }: { process: PublicProcessSummary }) {
  const deliveryStatus = getDeliveryPublicStatus(process);
  const unitStatus = normalizeUnitStatus(process.unit?.estado);

  return (
    <Card className="p-6">
      <HeaderBlock
        badge={deliveryStatus}
        icon={<Truck className="h-7 w-7" />}
        title="Estado de entrega"
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <InfoTile label="Cliente" value={getPublicPersonName(process)} />
        <InfoTile label="Modelo" value={getPublicMotorcycle(process)} />
        <InfoTile label="Sucursal" value={getPublicBranch(process)} />
        <InfoTile
          label="Estado de unidad"
          value={unitStatus ?? "Información pendiente de completar"}
        />
        <InfoTile
          label="Venta"
          value={
            deliveryStatus === "Motocicleta entregada"
              ? "Entregada"
              : process.sale
                ? "Venta completada"
                : "Sin venta registrada"
          }
        />
        <InfoTile
          label="Fecha de venta"
          value={formatPublicDate(process.sale?.fechaVenta)}
        />
        {process.sale?.fechaEntrega ? (
          <InfoTile
            label="Fecha de entrega"
            value={formatPublicDate(process.sale.fechaEntrega)}
          />
        ) : null}
      </div>

      <PublicMessage
        icon={<Truck className="h-7 w-7" />}
        title={deliveryStatus}
        description={
          deliveryStatus === "Motocicleta entregada" ||
          deliveryStatus === "Entregada"
            ? "Tu motocicleta figura como entregada."
            : deliveryStatus === "Proceso de entrega en preparacion"
              ? "La venta ya fue completada. La sucursal preparara los pasos finales de entrega."
              : "La entrega aun no esta programada porque no encontramos una venta completada asociada a esos datos."
        }
      />
    </Card>
  );
}

function CreditCardView({ process }: { process: PublicProcessSummary }) {
  const creditStatus = getPublicCreditStatus(process);
  const pendingDocuments = hasPendingDocuments(process);

  return (
    <Card className="p-6">
      <HeaderBlock
        badge={process.credit ? "Seguimiento de crédito" : "Crédito pendiente"}
        icon={<CreditCard className="h-7 w-7" />}
        title={process.credit ? "Seguimiento de crédito" : "Crédito pendiente de habilitar"}
      />

      <PublicMessage
        icon={<FileSearch className="h-7 w-7" />}
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
        <InfoTile
          label="Número de expediente"
          value={
            process.file?.numeroExpediente ??
            process.lead?.numeroExpediente ??
            "Información pendiente de completar"
          }
        />
      </div>
    </Card>
  );
}

function ProgressLine({
  activeIndex,
  closed,
}: {
  activeIndex: number;
  closed: boolean;
}) {
  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.045] p-5">
      <div className="flex items-center gap-3">
        <FileSearch className="h-5 w-5 text-red-400" />
        <h3 className="text-lg font-black text-white">Progreso</h3>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {publicProgressSteps.map((step, index) => {
          const complete = !closed && index <= activeIndex;
          return (
            <div
              className={cn(
                "min-h-[104px] rounded-xl border p-4",
                complete
                  ? "border-red-500/35 bg-red-500/12"
                  : "border-white/10 bg-black/20",
              )}
              key={step}
            >
              <div
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-lg border text-xs font-black",
                  complete
                    ? "border-red-500/35 bg-red-500/20 text-red-300"
                    : "border-white/10 text-zinc-600",
                )}
              >
                {complete ? <Check className="h-4 w-4" /> : index + 1}
              </div>
              <div
                className={cn(
                  "mt-4 text-sm font-black leading-5",
                  complete ? "text-white" : "text-zinc-500",
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
    <Card className="mt-5 p-4">
      <div className="mb-3 text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
        Consultas del cliente
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {links.map((item) => (
          <Link
            className={cn(
              "rounded-lg border px-3 py-2 text-sm font-semibold transition",
              view === item.key
                ? "border-red-500/35 bg-red-500/12 text-white"
                : "border-white/10 bg-white/[0.045] text-zinc-400 hover:text-white",
            )}
            href={`${item.href}${queryString}`}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}

function EmptyState({
  hasSearched,
  view,
}: {
  hasSearched: boolean;
  view: PublicProcessView;
}) {
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.045] text-red-400">
        <Bike className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-2xl font-black text-white">
        {hasSearched ? "Solicitud no encontrada" : viewCopy[view].title}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-500">
        {hasSearched
          ? "No encontramos una solicitud con esos datos. Verificá tu código, número de expediente, teléfono o cédula."
          : "Ingresá tu código de solicitud, número de expediente, teléfono o cédula para consultar tu seguimiento."}
      </p>
    </Card>
  );
}

function HeaderBlock({
  badge,
  icon,
  title,
}: {
  badge: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <Badge tone="green">{badge}</Badge>
        <h2 className="mt-4 text-3xl font-black text-white">{title}</h2>
      </div>
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-500/15 text-red-400">
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
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.045] p-5">
      <div className="flex gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-red-500/12 text-red-400">
          {icon}
        </div>
        <div>
          <h3 className="text-xl font-black text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
        </div>
      </div>
    </div>
  );
}

function NextStep({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/8 p-5">
      <div className="text-xs font-black uppercase tracking-[0.12em] text-red-300">
        Proximo paso
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{children}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
      <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-sm font-black leading-6 text-white">{value}</div>
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
