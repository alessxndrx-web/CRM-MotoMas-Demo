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
import { lookupPublicPortalStatusAction } from "@/server/portal/actions";
import {
  PUBLIC_LOOKUP_NOT_FOUND,
  type PublicPortalLookupResultDTO,
} from "@/server/portal/shared";
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
  // Database-backed public result (Patch 3.6B). Only the "process" view is wired
  // to the DB lookup; the other views stay on the localStorage fallback.
  const [dbResult, setDbResult] = useState<PublicPortalLookupResultDTO | null>(
    null,
  );
  const [pending, setPending] = useState(false);
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
    const values = {
      code: initialCode,
      fileNumber: initialFileNumber,
      phone: initialPhone,
      cedula: initialCedula,
    };
    if (
      initialCode?.trim() ||
      initialFileNumber?.trim() ||
      initialPhone?.trim() ||
      initialCedula?.trim()
    ) {
      void runLookup(values);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCedula, initialCode, initialFileNumber, initialPhone]);

  // All four public views are now wired to the verified database lookup, each
  // falling back to the localStorage lookup when there is no verified match.
  const dbBackedView =
    view === "process" ||
    view === "credit" ||
    view === "reservation" ||
    view === "delivery";

  /**
   * Prefer the verified database lookup for the database-backed views; fall back
   * to the legacy localStorage lookup when the database has no verified match or
   * is unavailable. The other views remain on the localStorage lookup only.
   */
  async function runLookup(values: {
    code?: string | null;
    fileNumber?: string | null;
    phone?: string | null;
    cedula?: string | null;
  }) {
    setHasSearched(true);

    if (dbBackedView) {
      setPending(true);
      try {
        const response = await lookupPublicPortalStatusAction({
          code: values.code?.trim() || values.fileNumber?.trim() || null,
          phone: values.phone ?? null,
          identification: values.cedula ?? null,
        });
        if (response.ok) {
          setDbResult(response.result);
          setResult(null);
          return;
        }
      } catch {
        // Fall through to the legacy fallback below.
      } finally {
        setPending(false);
      }
    }

    setDbResult(null);
    setResult(
      findPublicProcess({
        code: values.code,
        fileNumber: values.fileNumber,
        phone: values.phone,
        cedula: values.cedula,
        requireVerifiedContact: dbBackedView,
      }),
    );
  }

  function searchProcess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runLookup({
      code: codeQuery,
      fileNumber: fileQuery,
      phone: phoneQuery,
      cedula: cedulaQuery,
    });
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
          <div className="flex items-center gap-2.5">
            <Search className="h-5 w-5 text-navy" />
            <h2 className="text-base font-semibold text-slate-900">
              Consulta tu proceso
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Ingresa un dato de tu solicitud y confírmalo con el teléfono o la
            cédula que usaste.
          </p>

          <form className="mt-5 grid gap-6" onSubmit={searchProcess}>
            <div className="grid gap-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-navy">
                1 · Tu solicitud
              </div>
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
            </div>

            <div className="grid gap-4 border-t border-slate-100 pt-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-navy">
                2 · Verificación de identidad
              </div>
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
            </div>

            <button
              className={cn(btnPrimary, "w-full")}
              disabled={pending}
              type="submit"
            >
              <Search className="h-4 w-4" />
              {pending ? "Buscando…" : copy.searchLabel}
            </button>
          </form>

          <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
            Tus datos se usan únicamente para verificar tu identidad y mostrarte
            tu proceso. Si no recuerdas alguno, tu asesor de sucursal puede
            ayudarte a recuperarlo.
          </p>
        </PortalCard>
        </div>

        <div className="min-w-0">
          {dbBackedView && dbResult ? (
            <div className="animate-fade-up space-y-6">
              {view === "process" ? <DbProcessCard result={dbResult} /> : null}
              {view === "credit" ? <DbCreditCard result={dbResult} /> : null}
              {view === "reservation" ? <DbReservationCard result={dbResult} /> : null}
              {view === "delivery" ? <DbDeliveryCard result={dbResult} /> : null}
            </div>
          ) : result ? (
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

      <NextStep>{getNextStep(process)}</NextStep>
      <ProgressLine activeIndex={progressIndex} closed={isClosed} />

      <DetailsBlock>
        <InfoTile label="Código de solicitud" value={process.lead?.id ?? "No disponible"} />
        <InfoTile label="Teléfono" value={getPublicPhone(process) ?? "No disponible"} />
        <InfoTile label="Moto de interés" value={getPublicMotorcycle(process)} />
        <InfoTile label="Sucursal" value={getPublicBranch(process)} />
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
      </DetailsBlock>
    </PortalCard>
  );
}

/**
 * Database-backed process card (Patch 3.6B). Renders only the public-safe DTO
 * from `lookupPublicPortalStatusAction`: no raw contact data, internal ids,
 * notes, costs, Caja or Contabilidad fields ever reach this component.
 */
function DbProcessCard({ result }: { result: PublicPortalLookupResultDTO }) {
  return (
    <PortalCard className="p-6">
      <HeaderBlock
        badge={result.status}
        icon={<ClipboardCheck className="h-6 w-6" />}
        title={result.customerName}
      />

      <NextStep>{result.nextStep}</NextStep>
      <DbProgressLine timeline={result.timeline} />

      <DetailsBlock>
        <InfoTile
          label="Código de solicitud"
          value={result.trackingCode ?? "No disponible"}
        />
        <InfoTile label="Teléfono" value={result.maskedPhone ?? "No disponible"} />
        <InfoTile label="Moto de interés" value={result.motorcycleModel} />
        <InfoTile label="Sucursal" value={result.branchName} />
        <InfoTile
          label="Última actualización"
          value={formatPublicDate(result.lastUpdate)}
        />
        <InfoTile
          label="Número de expediente"
          value={result.expediente?.expedienteCode ?? "Aún no asignado"}
        />
        <InfoTile
          label="Asesor"
          value={result.advisorName ?? "Pendiente de asignación"}
        />
      </DetailsBlock>
    </PortalCard>
  );
}

function DbProgressLine({
  timeline,
}: {
  timeline: PublicPortalLookupResultDTO["timeline"];
}) {
  return (
    <ProgressSurface>
      <ProgressStepper
        steps={timeline.map((step) => ({
          label: step.label,
          state:
            step.status === "current"
              ? "current"
              : step.status === "done"
                ? "done"
                : "pending",
        }))}
      />
    </ProgressSurface>
  );
}

function ProgressSurface({ children }: { children: ReactNode }) {
  return (
    <div className="portal-timeline-surface mt-6 rounded-2xl p-5">
      <div className="flex items-center gap-2.5">
        <FileSearch className="h-5 w-5 text-navy" />
        <h3 className="text-base font-semibold text-slate-900">Progreso de tu proceso</h3>
      </div>
      {children}
    </div>
  );
}

type StepState = "done" | "current" | "pending";

/**
 * Connected stepper: navy for completed steps, orange only on the current one.
 * Vertical with a left rail on mobile, horizontal dots on sm+ — replaces the
 * old grid of numbered boxes.
 */
function ProgressStepper({
  steps,
}: {
  steps: { label: string; state: StepState }[];
}) {
  return (
    <ol className="mt-5 flex flex-col sm:flex-row">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li
            aria-current={step.state === "current" ? "step" : undefined}
            className="relative flex flex-1 items-start gap-3 pb-6 last:pb-0 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center"
            key={step.label}
          >
            {!isLast ? (
              <span
                aria-hidden
                className={cn(
                  "absolute bottom-0 left-[13px] top-8 w-0.5 rounded-full sm:bottom-auto sm:left-[calc(50%+1rem)] sm:right-[calc(-50%+1rem)] sm:top-[13px] sm:h-0.5 sm:w-auto",
                  step.state === "done" ? "bg-navy" : "bg-slate-200",
                )}
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[11px] font-bold",
                step.state === "done" && "border-navy bg-navy text-white",
                step.state === "current" &&
                  "border-orange-500 bg-white text-orange-600 ring-4 ring-orange-500/15",
                step.state === "pending" && "border-slate-300 bg-white text-slate-400",
              )}
            >
              {step.state === "done" ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                "text-sm font-semibold leading-5 sm:mt-1 sm:max-w-[8.5rem] sm:text-[13px]",
                step.state === "pending" ? "text-slate-500" : "text-slate-900",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Database-backed credit card (Patch 3.6C). Renders only the public-safe DTO:
 * the mapped, customer-friendly credit status and next step, plus the public
 * process fields. Internal credit observations, pending-item text, amounts,
 * ids, notes, costs, Caja and Contabilidad data never reach this component.
 */
function DbCreditCard({ result }: { result: PublicPortalLookupResultDTO }) {
  const hasCredit = result.credit !== null;
  if (!hasCredit) {
    return (
      <PortalCard className="p-6">
        <GenericLookupMessage icon={<FileSearch className="h-6 w-6" />} />
      </PortalCard>
    );
  }
  return (
    <PortalCard className="p-6">
      <HeaderBlock
        badge={result.credit?.status ?? "Seguimiento de crédito pendiente"}
        icon={<CreditCard className="h-6 w-6" />}
        title={result.customerName}
      />

      <NextStep>
        {result.credit?.nextStep ??
          "Cuando la sucursal inicie tu seguimiento de crédito, podrás consultar el avance desde esta pantalla."}
      </NextStep>

      <DetailsBlock>
        <InfoTile label="Moto de interés" value={result.motorcycleModel} />
        <InfoTile label="Sucursal" value={result.branchName} />
        <InfoTile
          label="Asesor"
          value={result.advisorName ?? "Pendiente de asignación"}
        />
        <InfoTile
          label="Última actualización"
          value={formatPublicDate(result.lastUpdate)}
        />
      </DetailsBlock>
    </PortalCard>
  );
}

/**
 * Database-backed reservation card (Patch 3.6D). Renders only the public-safe
 * DTO: the mapped reservation status/next step, plus the public process fields.
 * VIN, chassis/engine number, motorcycle unit id, internal notes, ids, costs,
 * Caja and Contabilidad data never reach this component — the DTO exposes only a
 * public-safe motorcycle model name.
 */
function DbReservationCard({ result }: { result: PublicPortalLookupResultDTO }) {
  const reservation = result.reservation;
  if (!reservation) {
    return (
      <PortalCard className="p-6">
        <GenericLookupMessage icon={<PackageCheck className="h-6 w-6" />} />
      </PortalCard>
    );
  }
  return (
    <PortalCard className="p-6">
      <HeaderBlock
        badge={reservation?.status ?? "Sin reserva activa"}
        icon={<CalendarCheck className="h-6 w-6" />}
        title={result.customerName}
      />

      <NextStep>{reservation.nextStep}</NextStep>
      <DbProgressLine timeline={result.timeline} />

      <DetailsBlock>
        <InfoTile label="Modelo" value={result.motorcycleModel} />
        <InfoTile label="Sucursal" value={result.branchName} />
        <InfoTile
          label="Asesor"
          value={result.advisorName ?? "Pendiente de asignación"}
        />
        <InfoTile
          label="Última actualización"
          value={formatPublicDate(result.lastUpdate)}
        />
      </DetailsBlock>
    </PortalCard>
  );
}

/**
 * Database-backed delivery card (Patch 3.6E). Renders only the public-safe DTO:
 * the mapped delivery status/next step, plus the public process fields. VIN,
 * chassis/engine number, motorcycle unit id, internal sale id, sale/payment
 * amounts, cash records, notes, ids, costs, Caja and Contabilidad data never
 * reach this component — the DTO exposes only a public-safe model name.
 */
function DbDeliveryCard({ result }: { result: PublicPortalLookupResultDTO }) {
  const delivery = result.delivery;
  if (!delivery) {
    return (
      <PortalCard className="p-6">
        <GenericLookupMessage icon={<Truck className="h-6 w-6" />} />
      </PortalCard>
    );
  }
  return (
    <PortalCard className="p-6">
      <HeaderBlock
        badge={delivery?.status ?? "Entrega aún no programada"}
        icon={<Truck className="h-6 w-6" />}
        title={result.customerName}
      />

      <NextStep>{delivery.nextStep}</NextStep>
      <DbProgressLine timeline={result.timeline} />

      <DetailsBlock>
        <InfoTile label="Modelo" value={result.motorcycleModel} />
        <InfoTile label="Sucursal" value={result.branchName} />
        <InfoTile
          label="Asesor"
          value={result.advisorName ?? "Pendiente de asignación"}
        />
        <InfoTile
          label="Última actualización"
          value={formatPublicDate(result.lastUpdate)}
        />
      </DetailsBlock>
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
        title={getPublicPersonName(process)}
      />

      {reservation ? (
        <>
          <NextStep>{getNextStep(process)}</NextStep>
          <DetailsBlock>
            <InfoTile label="Modelo" value={reservation.modelo} />
            <InfoTile label="Identificador" value={maskVin(reservation.vin)} />
            <InfoTile label="Sucursal" value={reservation.sucursalNombre} />
            <InfoTile
              label="Fecha de reserva"
              value={formatPublicDate(reservation.fechaReserva)}
            />
          </DetailsBlock>
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

  return (
    <PortalCard className="p-6">
      <HeaderBlock
        badge={deliveryStatus}
        icon={<Truck className="h-6 w-6" />}
        title={getPublicPersonName(process)}
      />

      <NextStep>
        {deliveryStatus === "Motocicleta entregada" || deliveryStatus === "Entregada"
          ? "Tu motocicleta figura como entregada."
          : deliveryStatus === "Proceso de entrega en preparacion"
            ? "La sucursal está preparando los pasos finales de tu entrega."
            : "La entrega aún no está programada. Cuando tu proceso avance, verás aquí el estado."}
      </NextStep>

      <DetailsBlock>
        <InfoTile label="Modelo" value={getPublicMotorcycle(process)} />
        <InfoTile label="Sucursal" value={getPublicBranch(process)} />
        {process.sale?.fechaEntrega ? (
          <InfoTile
            label="Fecha de entrega"
            value={formatPublicDate(process.sale.fechaEntrega)}
          />
        ) : null}
      </DetailsBlock>
    </PortalCard>
  );
}

function CreditCardView({ process }: { process: PublicProcessSummary }) {
  const creditStatus = getPublicCreditStatus(process);
  const pendingDocuments = hasPendingDocuments(process);

  return (
    <PortalCard className="p-6">
      <HeaderBlock
        badge={creditStatus}
        icon={<CreditCard className="h-6 w-6" />}
        title={getPublicPersonName(process)}
      />

      <NextStep>{getPublicCreditNextStep(process)}</NextStep>

      <DetailsBlock>
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
      </DetailsBlock>
    </PortalCard>
  );
}

function ProgressLine({ activeIndex, closed }: { activeIndex: number; closed: boolean }) {
  return (
    <ProgressSurface>
      <ProgressStepper
        steps={publicProgressSteps.map((label, index) => ({
          label,
          state: closed
            ? "pending"
            : index < activeIndex
              ? "done"
              : index === activeIndex
                ? "current"
                : "pending",
        }))}
      />
    </ProgressSurface>
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
              "relative min-w-max rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40",
              active
                ? "border-navy/30 bg-navy/5 text-navy"
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
      <div className="border-b border-slate-100 bg-gradient-to-br from-navy/5 via-white to-white p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-slate-200 bg-white text-navy shadow-sm">
          <Bike className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-slate-900">
          {hasSearched ? "No encontramos tu solicitud" : viewCopy[view].title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
          {hasSearched
            ? PUBLIC_LOOKUP_NOT_FOUND
            : "Ingresa un dato de tu solicitud y confírmalo con tu teléfono o cédula para ver el estado actual."}
        </p>
        {hasSearched ? (
          <ul className="mx-auto mt-4 grid max-w-md gap-1.5 text-left text-sm leading-6 text-slate-600">
            <li className="flex items-start gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-navy/60" />
              Revisa que los datos estén completos y sin espacios extra.
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-navy/60" />
              Usa el teléfono o la cédula tal como los registraste en tu solicitud.
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-navy/60" />
              Si el problema continúa, tu asesor de sucursal puede ayudarte.
            </li>
          </ul>
        ) : null}
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
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-navy/60" />
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
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy transition-colors hover:text-navy-soft"
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

/**
 * Status-first result header: the customer's current status is the headline,
 * the person/context line sits under it. Replaces the old badge+name header so
 * the answer — not the record — leads the card.
 */
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
      <div className="min-w-0">
        <PortalBadge tone={tone}>Estado actual</PortalBadge>
        <h2 className="mt-3 text-balance text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {badge}
        </h2>
        <p className="mt-1.5 text-sm font-medium text-slate-600">{title}</p>
      </div>
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-navy/5 text-navy">
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
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-navy/5 text-navy">
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

function GenericLookupMessage({ icon }: { icon: ReactNode }) {
  return (
    <PublicMessage
      icon={icon}
      title="No encontramos tu solicitud"
      description={PUBLIC_LOOKUP_NOT_FOUND}
    />
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

/**
 * Compact verified-summary row. Replaces the old bordered label/value tile so
 * the details read as a quiet reference list, not a CRM record grid.
 */
function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="min-w-0 text-sm font-semibold leading-6 text-slate-900 sm:text-right">
        {value}
      </div>
    </div>
  );
}

/** Demoted details section: same verified data, below the status story. */
function DetailsBlock({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Detalles de tu consulta
      </h3>
      <div className="mt-2.5 divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white px-5 py-1">
        {children}
      </div>
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
