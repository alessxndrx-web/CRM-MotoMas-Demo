"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  BookmarkCheck,
  ClipboardList,
  CreditCard,
  FolderOpen,
  FolderPlus,
  Plus,
  UserPlus,
} from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { Textarea } from "@/components/ui/fields";
import { Notice } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createExpedienteAction,
  updateCustomerBranchAction,
} from "@/server/crm/actions";
import {
  activityTypeLabels,
  activityTypeValues,
  type CustomerDetailDTO,
} from "@/server/crm/shared";
import { createActivityAction } from "@/server/expedientes/actions";
import { createPaymentRequestAction } from "@/server/payments/actions";
import { formatMoney, supportedCurrencies } from "@/server/payments/shared";

/**
 * Patch CRM-AUD2 — la ficha comercial del cliente.
 *
 * ## Qué resuelve
 *
 * La auditoría CRM-AUD1 encontró que el cliente **sólo existía como fila de una
 * lista**: sus leads, expedientes, créditos, reservas, cobros y ventas no eran
 * alcanzables desde él. Para saber qué pasaba con una persona había que cruzar
 * seis pantallas sabiendo de antemano que cada registro existía.
 *
 * Esta pantalla responde de una vez: quién es, quién lo atiende, de dónde vino,
 * qué le interesa, qué se habló, qué tiene abierto y **qué toca hacer ahora**.
 *
 * ## Lo que NO es
 *
 * No es un expediente de veinte pestañas ni un almacén de documentos. Cada
 * bloque es un puntero con su acción contextual: operar una reserva sigue
 * ocurriendo en Reservas, y los documentos siguen viviendo en el expediente.
 *
 * ## Las acciones dependen del permiso Y del registro
 *
 * Si ya hay expediente se ofrece «Ver expediente», no «Crear». Si el rol no
 * gestiona cobros, «Solicitar pago» no se dibuja — y la acción lo rechazaría
 * igual, porque la frontera está en el servidor.
 */
export function CustomerDetailPanel({
  branches,
  canChangeBranch,
  canCreateExpediente,
  canRequestPayment,
  detail,
  nowIso,
}: {
  /** Patch CRM-INT1 — sucursales activas, para moverlo. Vacío si no puede. */
  branches: Array<{ code: string; name: string }>;
  canChangeBranch: boolean;
  canCreateExpediente: boolean;
  canRequestPayment: boolean;
  detail: CustomerDetailDTO;
  /** Resuelto en el servidor para que «vencida» no cambie al hidratar. */
  nowIso: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [targetBranch, setTargetBranch] = useState("");

  const [activityType, setActivityType] = useState("LLAMADA");
  const [activityDescription, setActivityDescription] = useState("");
  const [activityDate, setActivityDate] = useState("");

  const [showPayment, setShowPayment] = useState(false);
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<string>("NIO");
  const [concepto, setConcepto] = useState("");

  const { customer } = detail;
  const openExpediente = detail.expedientes[0] ?? null;

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la acción.");
        return;
      }
      setMessage(done);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      {/* --- Quién es y quién lo atiende --- */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-900">{customer.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {customer.phone}
              {customer.email ? ` · ${customer.email}` : ""}
            </p>
          </div>
          <Badge tone={customer.assignedSellerName ? "blue" : "orange"}>
            {customer.assignedSellerName
              ? `Atiende ${customer.assignedSellerName}`
              : "Sin vendedor asignado"}
          </Badge>
        </div>

        <DetailList
          className="mt-5"
          items={[
            { label: "Cédula", value: customer.cedula ?? "No registrada" },
            { label: "Sucursal", value: customer.branchName },
            {
              label: "Cliente desde",
              value: new Date(customer.createdAt).toLocaleDateString("es-NI"),
            },
            {
              label: "Origen",
              value: detail.originLead?.originChannel ?? "Registro directo",
            },
            {
              label: "Última interacción",
              value: detail.lastInteractionAt
                ? new Date(detail.lastInteractionAt).toLocaleString("es-NI")
                : "Sin interacciones",
            },
            {
              label: "Próxima actividad",
              value: detail.nextActivity
                ? `${detail.nextActivity.typeLabel} · ${new Date(
                    detail.nextActivity.scheduledAt,
                  ).toLocaleString("es-NI")}`
                : "Sin agenda",
            },
            {
              label: "Asignado por",
              value: customer.assignedByName ?? "—",
            },
            {
              label: "Asignado el",
              value: customer.assignedAt
                ? new Date(customer.assignedAt).toLocaleDateString("es-NI")
                : "—",
            },
          ]}
        />

        {/*
          Patch CRM-INT1 — cambiar la sucursal del cliente. Sólo la sucursal:
          sus datos, leads, expedientes, créditos, reservas y ventas quedan como
          estaban, cada uno en la sucursal donde ocurrió.
        */}
        {canChangeBranch ? (
          <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
            <Field className="min-w-[220px] flex-1" label="Mover a otra sucursal">
              <Select
                onChange={(event) => setTargetBranch(event.target.value)}
                value={targetBranch}
              >
                <option value="">Selecciona la sucursal de destino</option>
                {branches
                  .filter((branch) => branch.code !== customer.branchCode)
                  .map((branch) => (
                    <option key={branch.code} value={branch.code}>
                      {branch.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Button
              disabled={pending || !targetBranch}
              onClick={() =>
                run(
                  () =>
                    updateCustomerBranchAction({
                      customerId: customer.id,
                      branchCode: targetBranch,
                    }),
                  "Sucursal del cliente actualizada.",
                )
              }
              variant="secondary"
            >
              Cambiar sucursal
            </Button>
            <p className="w-full text-xs text-slate-500">
              Si su vendedor no pertenece a la sucursal de destino, la cartera
              quedará sin asignar para que allí lo repartan.
            </p>
          </div>
        ) : null}
      </Card>

      {/* --- Registrar seguimiento --- */}
      <Card className="p-6">
        <SectionTitle icon={ClipboardList}>Seguimiento</SectionTitle>

        <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <Field label="Tipo">
            <Select
              onChange={(event) => setActivityType(event.target.value)}
              value={activityType}
            >
              {activityTypeValues.map((value) => (
                <option key={value} value={value}>
                  {activityTypeLabels[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field hint="Opcional" label="Programar para">
            <Input
              onChange={(event) => setActivityDate(event.target.value)}
              type="datetime-local"
              value={activityDate}
            />
          </Field>
          <Field className="sm:col-span-2" label="Descripción" required>
            <Textarea
              onChange={(event) => setActivityDescription(event.target.value)}
              placeholder="Qué se habló o qué hay que hacer"
              rows={2}
              value={activityDescription}
            />
          </Field>
          <div className="sm:col-span-2">
            <Button
              disabled={pending || !activityDescription.trim()}
              onClick={() =>
                run(async () => {
                  const result = await createActivityAction({
                    type: activityType,
                    description: activityDescription,
                    scheduledAt: activityDate
                      ? new Date(activityDate).toISOString()
                      : null,
                    customerId: customer.id,
                  });
                  if (result.ok) {
                    setActivityDescription("");
                    setActivityDate("");
                  }
                  return result;
                }, "Actividad registrada.")
              }
              size="sm"
            >
              <Plus aria-hidden className="h-4 w-4" />
              Registrar actividad
            </Button>
          </div>
        </div>

        <ul className="mt-4 space-y-2">
          {detail.activities.length ? (
            detail.activities.map((activity) => {
              const overdue =
                activity.status === "PENDIENTE" &&
                activity.scheduledAt &&
                new Date(activity.scheduledAt) < new Date(nowIso);
              return (
                <li
                  className="rounded-lg border border-slate-200 px-4 py-3"
                  key={activity.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {activity.typeLabel}
                    </span>
                    <Badge tone={overdue ? "red" : activity.status === "COMPLETADA" ? "green" : "blue"}>
                      {overdue ? "Vencida" : activity.statusLabel}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{activity.description}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {activity.userName ?? "Sin responsable"} ·{" "}
                    {new Date(activity.createdAt).toLocaleString("es-NI")}
                  </p>
                </li>
              );
            })
          ) : (
            <li className="rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
              Todavía no hay seguimientos registrados para este cliente.
            </li>
          )}
        </ul>
      </Card>

      {/* --- Expedientes y crédito --- */}
      <Card className="p-6">
        <SectionTitle
          action={
            canCreateExpediente && !openExpediente ? (
              <Button
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      createExpedienteAction({
                        customerId: customer.id,
                        branchCode: customer.branchCode ?? "",
                        motoInteres: detail.originLead?.motorcycleInterest ?? null,
                      }),
                    "Expediente creado.",
                  )
                }
                size="sm"
                variant="secondary"
              >
                <FolderPlus aria-hidden className="h-4 w-4" />
                Crear expediente
              </Button>
            ) : null
          }
          icon={FolderOpen}
        >
          Expedientes y crédito
        </SectionTitle>

        {detail.expedientes.length ? (
          <ul className="mt-4 space-y-2">
            {detail.expedientes.map((file) => (
              <li key={file.id}>
                <Link
                  className="sb-focus flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
                  href={`/panel/expedientes?expediente=${file.id}`}
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-sm font-semibold text-slate-900">
                      {file.fileNumber}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {file.motorcycleInterest ?? "Sin moto de interés"}
                      {file.sellerName ? ` · ${file.sellerName}` : ""}
                      {file.documentsTotal
                        ? ` · ${file.documentsTotal - file.documentsPending}/${file.documentsTotal} documentos`
                        : ""}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {file.creditStatusLabel ? (
                      <Badge tone="blue">
                        <CreditCard aria-hidden className="h-3.5 w-3.5" />
                        {file.creditStatusLabel}
                      </Badge>
                    ) : null}
                    <Badge tone="slate">{file.statusLabel}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyLine>
            Sin expediente. El crédito, la proforma y los documentos viven dentro
            de uno.
          </EmptyLine>
        )}
      </Card>

      {/* --- Reservas --- */}
      <Card className="p-6">
        <SectionTitle
          action={
            <Link href="/panel/reservas">
              <Button size="sm" variant="ghost">
                Ir a Reservas
              </Button>
            </Link>
          }
          icon={BookmarkCheck}
        >
          Reservas
        </SectionTitle>

        {detail.reservations.length ? (
          <ul className="mt-4 space-y-2">
            {detail.reservations.map((reservation) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"
                key={reservation.id}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">
                    {reservation.unitName}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {reservation.reservationNumber} · {reservation.chassisNumber} ·{" "}
                    {new Date(reservation.reservedAt).toLocaleDateString("es-NI")}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={reservation.status === "PENDIENTE_PAGO" ? "orange" : "slate"}>
                    {reservation.paymentLabel}
                  </Badge>
                  <Badge
                    tone={
                      reservation.status === "ACTIVA"
                        ? "blue"
                        : reservation.status === "COMPLETADA"
                          ? "green"
                          : reservation.status === "PENDIENTE_PAGO"
                            ? "orange"
                            : "gray"
                    }
                  >
                    {reservation.statusLabel}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyLine>Este cliente no tiene reservas.</EmptyLine>
        )}
      </Card>

      {/* --- Cobros --- */}
      <Card className="p-6">
        <SectionTitle
          action={
            canRequestPayment ? (
              <Button
                onClick={() => setShowPayment((value) => !value)}
                size="sm"
                variant="secondary"
              >
                <CreditCard aria-hidden className="h-4 w-4" />
                {showPayment ? "Cerrar" : "Solicitar pago"}
              </Button>
            ) : null
          }
          icon={CreditCard}
        >
          Cobros
        </SectionTitle>

        {showPayment && canRequestPayment ? (
          <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <Field label="Monto" required>
              <Input
                inputMode="decimal"
                onChange={(event) => setMonto(event.target.value)}
                placeholder="0.00"
                value={monto}
              />
            </Field>
            <Field label="Moneda" required>
              <Select
                onChange={(event) => setMoneda(event.target.value)}
                value={moneda}
              >
                {supportedCurrencies.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>
            <Field className="sm:col-span-2" label="Concepto" required>
              <Input
                onChange={(event) => setConcepto(event.target.value)}
                placeholder="Qué está pagando el cliente"
                value={concepto}
              />
            </Field>
            <div className="sm:col-span-2">
              <Button
                disabled={pending || !monto.trim() || !concepto.trim()}
                onClick={() =>
                  run(async () => {
                    const result = await createPaymentRequestAction({
                      customerId: customer.id,
                      monto,
                      moneda,
                      concepto,
                    });
                    if (result.ok) {
                      setMonto("");
                      setConcepto("");
                      setShowPayment(false);
                    }
                    return result;
                  }, "Cobro enviado al portal del cliente.")
                }
                size="sm"
              >
                Solicitar pago
              </Button>
            </div>
          </div>
        ) : null}

        {detail.paymentRequests.length ? (
          <ul className="mt-4 space-y-2">
            {detail.paymentRequests.map((payment) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"
                key={payment.id}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {payment.concept}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {payment.requestNumber} ·{" "}
                    {new Date(payment.createdAt).toLocaleDateString("es-NI")}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900">
                    {formatMoney(payment.amount, payment.currency)}
                  </span>
                  <Badge tone="slate">{payment.statusLabel}</Badge>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyLine>Sin cobros emitidos a este cliente.</EmptyLine>
        )}
      </Card>

      {/* --- Leads y ventas --- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <SectionTitle icon={UserPlus}>Leads</SectionTitle>
          {detail.leads.length ? (
            <ul className="mt-4 space-y-2">
              {detail.leads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    className="sb-focus flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
                    href={`/panel/leads?q=${encodeURIComponent(lead.trackingCode)}`}
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-xs font-semibold text-slate-900">
                        {lead.trackingCode}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {lead.motorcycleInterest ?? "Sin moto"} ·{" "}
                        {lead.assignedSellerName ?? "Sin asignar"}
                      </span>
                    </span>
                    <Badge tone="slate">{lead.statusLabel}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyLine>Este cliente no vino de un lead registrado.</EmptyLine>
          )}
        </Card>

        <Card className="p-6">
          <SectionTitle icon={BadgeDollarSign}>Ventas</SectionTitle>
          {detail.sales.length ? (
            <ul className="mt-4 space-y-2">
              {detail.sales.map((sale) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-4 py-3"
                  key={sale.id}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {sale.unitName}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {sale.saleNumber} · {sale.typeLabel} ·{" "}
                      {new Date(sale.soldAt).toLocaleDateString("es-NI")}
                    </span>
                  </span>
                  <Badge tone="green">{sale.statusLabel}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyLine>Todavía no ha comprado.</EmptyLine>
          )}
        </Card>
      </div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  children,
  action,
}: {
  icon: typeof ClipboardList;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Icon aria-hidden className="h-4 w-4 text-slate-400" />
        {children}
      </h3>
      {action}
    </div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
      {children}
    </p>
  );
}
