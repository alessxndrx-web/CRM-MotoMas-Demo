"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bike,
  ClipboardList,
  FolderPlus,
  History,
  Megaphone,
  Plus,
  Route,
  UserCheck,
} from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailList } from "@/components/ui/detail-list";
import { Drawer } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/fields";
import { IdentityResolutionPanel } from "@/features/operations/components/identity-resolution-panel";
import { Field } from "@/components/ui/form-section";
import { Notice } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  convertLeadToCustomerAction,
  createExpedienteAction,
  type LeadConversionResolution,
  setLeadCampaignAction,
  setLeadMotorcycleAction,
} from "@/server/crm/actions";
import {
  activityTypeLabels,
  activityTypeValues,
  type ActivityListItemDTO,
  type IdentityResolutionNeeded,
  type LeadAssignmentDTO,
  type LeadCampaignOption,
  type LeadCommercialContextDTO,
  type LeadDTO,
} from "@/server/crm/shared";
import { createActivityAction } from "@/server/expedientes/actions";

/**
 * Patch CRM-QA1 — la ficha del lead.
 *
 * ## Qué resuelve
 *
 * Tres hallazgos de la QA a la vez, porque los tres eran el mismo agujero: el
 * lead no tenía ficha.
 *
 * - **«La información del lead no muestra la motocicleta.»** El dato viajaba en
 *   el DTO desde 3.1B y ninguna pantalla lo pintaba.
 * - **«Sólo el supervisor registra actividades.»** El permiso siempre incluyó al
 *   vendedor; lo que no existía era un sitio donde colgar el seguimiento de un
 *   lead que todavía no es expediente.
 * - **«No hay opción de crear expedientes.»** `createExpedienteAction` llevaba
 *   escrita desde 3.1B sin un solo llamador.
 *
 * ## Lo que muestra de la moto
 *
 * Sólo lo que la base guarda: marca, modelo, año, imagen y cuántas unidades
 * disponibles hay en la sucursal del lead. **No hay precio ni color** porque
 * `MotorcycleCatalogModel` no los tiene; inventarlos habría producido una ficha
 * que miente al vendedor delante del cliente.
 *
 * ## Patch CRM-INT1 — el lead llega hasta el crédito
 *
 * - **Convertir en cliente.** La ficha decía «registra primero al cliente en
 *   Clientes con este mismo teléfono y vuelve a abrir el lead», y registrarlo
 *   allí no enlazaba nada: el botón de expediente no aparecía nunca. Ahora la
 *   conversión se hace aquí. Patch CRM-INT2: sólo una cédula válida enlaza
 *   sola con un cliente existente; si coincide únicamente el teléfono, la ficha
 *   enseña las candidatas (`IdentityResolutionPanel`) y quien convierte decide.
 * - **Asignaciones.** Cuándo lo recibió su primer vendedor, cuándo el actual y
 *   cada reasignación, con quién la hizo. Un lead asignado antes del registro
 *   lo dice en lugar de inventar la fecha.
 * - **Campaña.** A qué campaña se atribuye, que es lo que la conciliación de
 *   Marketing cuenta como «leads del CRM».
 */

export type LeadCatalogOption = {
  id: string;
  label: string;
};

export function LeadDetailDrawer({
  activities,
  assignments,
  campaigns,
  canChangeCampaign,
  canCreateExpediente,
  catalogModels,
  commercialContext,
  lead,
  onClose,
}: {
  activities: ActivityListItemDTO[];
  /** Patch CRM-INT1 — de la más reciente a la más antigua. */
  assignments: LeadAssignmentDTO[];
  campaigns: LeadCampaignOption[];
  /** Cambiar una atribución existente es supervisión. */
  canChangeCampaign: boolean;
  canCreateExpediente: boolean;
  catalogModels: LeadCatalogOption[];
  /** Patch CRM-AUD1 — qué más tiene abierto el cliente de este lead. */
  commercialContext: LeadCommercialContextDTO | null;
  lead: LeadDTO | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [activityType, setActivityType] = useState("SEGUIMIENTO");
  const [activityDescription, setActivityDescription] = useState("");
  const [activityDate, setActivityDate] = useState("");
  const [motorcycleId, setMotorcycleId] = useState(lead?.motorcycle?.catalogModelId ?? "");
  const [campaignId, setCampaignId] = useState(lead?.campaignId ?? "");
  const [resolution, setResolution] = useState<IdentityResolutionNeeded | null>(null);

  if (!lead) {
    return <Drawer onClose={onClose} open={false} title="Lead" />;
  }

  /**
   * Patch CRM-INT2 — convertir puede devolver una coincidencia por resolver en
   * lugar de un error: entonces se enseñan las candidatas y se vuelve a llamar
   * con la decisión explícita.
   */
  function convert(resolucion: LeadConversionResolution | null) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await convertLeadToCustomerAction({ leadId: lead!.id, resolucion });
      if (!result.ok) {
        setResolution(result.resolution ?? null);
        if (!result.resolution) setError(result.error);
        return;
      }
      setResolution(null);
      setMessage(
        result.created
          ? "Lead convertido en cliente. Ya puedes crear su expediente."
          : "Lead vinculado al cliente existente. Ya puedes crear su expediente.",
      );
      router.refresh();
    });
  }

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

  function submitActivity() {
    if (!activityDescription.trim()) {
      setError("Describe la actividad antes de registrarla.");
      return;
    }
    run(async () => {
      const result = await createActivityAction({
        type: activityType,
        description: activityDescription,
        scheduledAt: activityDate ? new Date(activityDate).toISOString() : null,
        leadId: lead!.id,
      });
      if (result.ok) {
        setActivityDescription("");
        setActivityDate("");
      }
      return result;
    }, "Actividad registrada.");
  }

  return (
    <Drawer
      description={`${lead.trackingCode} · ${lead.branchName}`}
      onClose={onClose}
      open
      size="lg"
      title={lead.name}
    >
      <div className="space-y-6">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {message ? <Notice tone="success">{message}</Notice> : null}

        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Contacto</h3>
          <DetailList
            items={[
              { label: "Teléfono", value: lead.phone },
              { label: "Correo", value: lead.email ?? "—" },
              { label: "Cédula", value: lead.cedula ?? "—" },
              { label: "Origen", value: lead.originChannel ?? "—" },
              { label: "Estado", value: lead.statusLabel },
              { label: "Vendedor", value: lead.assignedSellerName ?? "Sin asignar" },
              { label: "Registrado por", value: lead.createdByName ?? "Portal público" },
              { label: "Recibido el", value: formatDateTime(lead.createdAt) },
              {
                label: "Primera asignación",
                value: lead.firstAssignedAt
                  ? formatDateTime(lead.firstAssignedAt)
                  : lead.assignedSellerId || assignments.length
                    ? "Fecha no registrada"
                    : "Aún sin asignar",
              },
              {
                label: "Asignación actual",
                value: lead.assignedAt
                  ? formatDateTime(lead.assignedAt)
                  : lead.assignedSellerId
                    ? "Fecha no registrada"
                    : "—",
              },
            ]}
          />
        </section>

        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <History aria-hidden className="h-4 w-4 text-slate-400" />
            Historial de asignaciones
          </h3>
          {assignments.length ? (
            <ol className="space-y-2">
              {assignments.map((row) => (
                <li
                  className="rounded-lg border border-slate-200 px-4 py-3 text-sm"
                  key={row.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {row.previousSellerName
                        ? `Reasignado a ${row.sellerName}`
                        : `Asignado a ${row.sellerName}`}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatDateTime(row.assignedAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.previousSellerName ? `Lo tenía ${row.previousSellerName} · ` : ""}
                    {row.assignedByName ? `Por ${row.assignedByName} · ` : ""}
                    {row.branchName}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              {lead.assignedSellerId
                ? "Este lead se asignó antes de que el sistema registrara las asignaciones; no hay fecha ni historial guardados."
                : "Todavía no se ha asignado a ningún vendedor."}
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Bike aria-hidden className="h-4 w-4 text-slate-400" />
            Motocicleta de interés
          </h3>
          {lead.motorcycle ? (
            <div className="flex gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              {lead.motorcycle.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={`${lead.motorcycle.brand} ${lead.motorcycle.model}`}
                  className="h-20 w-28 shrink-0 rounded-md object-cover"
                  src={lead.motorcycle.imageUrl}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">
                  {lead.motorcycle.label}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {lead.motorcycle.year ? `Año ${lead.motorcycle.year} · ` : ""}
                  {lead.motorcycle.slug}
                </p>
                <div className="mt-2">
                  <Badge tone={lead.motorcycle.availableUnitsInBranch > 0 ? "green" : "gray"}>
                    {lead.motorcycle.availableUnitsInBranch > 0
                      ? `${lead.motorcycle.availableUnitsInBranch} disponible(s) en ${lead.branchName}`
                      : `Sin unidades disponibles en ${lead.branchName}`}
                  </Badge>
                  <p className="mt-1 text-xs text-slate-400">
                    Estar en el catálogo no implica existencias: la
                    disponibilidad se cuenta en el inventario de la sucursal.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              {lead.motorcycleInterest
                ? `El lead indicó «${lead.motorcycleInterest}», que no corresponde a un modelo del catálogo. Selecciónalo abajo para completar la ficha.`
                : "Este lead aún no tiene una motocicleta asociada."}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field className="min-w-[220px] flex-1" label="Modelo del catálogo">
              <Select
                onChange={(event) => setMotorcycleId(event.target.value)}
                value={motorcycleId}
              >
                <option value="">Sin modelo asociado</option>
                {catalogModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              disabled={pending || motorcycleId === (lead.motorcycle?.catalogModelId ?? "")}
              onClick={() =>
                run(
                  () =>
                    setLeadMotorcycleAction({
                      leadId: lead.id,
                      catalogModelId: motorcycleId || null,
                    }),
                  "Motocicleta actualizada.",
                )
              }
              variant="secondary"
            >
              Guardar moto
            </Button>
          </div>
        </section>

        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ClipboardList aria-hidden className="h-4 w-4 text-slate-400" />
            Seguimiento
          </h3>

          <div className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-2">
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
                placeholder="Qué pasó o qué hay que hacer"
                value={activityDescription}
              />
            </Field>
            <div className="sm:col-span-2">
              <Button disabled={pending} onClick={submitActivity} size="sm">
                <Plus aria-hidden className="h-4 w-4" />
                Registrar actividad
              </Button>
            </div>
          </div>

          <ul className="mt-4 space-y-2">
            {activities.length ? (
              activities.map((activity) => (
                <li
                  className="rounded-lg border border-slate-200 px-4 py-3"
                  key={activity.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {activity.typeLabel}
                    </span>
                    <Badge tone={activity.status === "COMPLETADA" ? "green" : "blue"}>
                      {activity.statusLabel}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{activity.description}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {activity.userName ?? "Sin responsable"} ·{" "}
                    {new Date(activity.createdAt).toLocaleString("es-NI")}
                  </p>
                </li>
              ))
            ) : (
              <li className="rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
                Todavía no hay seguimientos registrados para este lead.
              </li>
            )}
          </ul>
        </section>

        <CampaignSection
          campaignId={campaignId}
          campaigns={campaigns.filter(
            (campaign) =>
              campaign.branchCodes.length === 0 ||
              (lead.branchCode !== null && campaign.branchCodes.includes(lead.branchCode)),
          )}
          canChange={canChangeCampaign || !lead.campaignId}
          lead={lead}
          onChange={setCampaignId}
          onSave={() =>
            run(
              () =>
                setLeadCampaignAction({
                  leadId: lead.id,
                  campaignId: campaignId || null,
                }),
              "Campaña del lead actualizada.",
            )
          }
          pending={pending}
        />

        <CommercialContextSection context={commercialContext} />

        {/*
          Patch CRM-INT1 — el cliente del lead. Sin esto la cadena lead →
          cliente → expediente → crédito no tenía por dónde avanzar.
        */}
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <UserCheck aria-hidden className="h-4 w-4 text-slate-400" />
            Cliente
          </h3>
          {lead.customerId ? (
            <p className="text-sm text-slate-600">
              Este lead ya es cliente.{" "}
              <Link
                className="font-semibold text-blue-700 underline"
                href={`/panel/clientes/${lead.customerId}`}
              >
                Abrir ficha del cliente
              </Link>
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-500">
                Crea el cliente con los datos de este lead en {lead.branchName}.
                Si su cédula ya está registrada, se vincula ese cliente; si sólo
                coincide el teléfono, se te pedirá confirmar quién es.
              </p>
              {resolution ? (
                <div className="mb-3">
                  <IdentityResolutionPanel
                    onCreateNew={() => convert({ tipo: "CREAR_NUEVO" })}
                    onLink={(customerId) => convert({ tipo: "VINCULAR", customerId })}
                    pending={pending}
                    resolution={resolution}
                  />
                </div>
              ) : null}
              <Button
                disabled={pending || lead.status === "DESCARTADO"}
                onClick={() => convert(null)}
                variant="secondary"
              >
                <UserCheck aria-hidden className="h-4 w-4" />
                {pending ? "Convirtiendo…" : "Convertir en cliente"}
              </Button>
              {lead.status === "DESCARTADO" ? (
                <p className="mt-2 text-xs text-slate-500">
                  Un lead descartado no se convierte. Cambia su estado primero.
                </p>
              ) : null}
            </>
          )}
        </section>

        {canCreateExpediente && lead.customerId ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Expediente</h3>
            <p className="mb-3 text-sm text-slate-500">
              Convierte el lead en expediente para trabajar proforma, documentos y
              crédito.
            </p>
            <Button
              disabled={pending || lead.status === "EXPEDIENTE"}
              onClick={() =>
                run(
                  () =>
                    createExpedienteAction({
                      customerId: lead.customerId as string,
                      branchCode: lead.branchCode ?? "",
                      leadId: lead.id,
                      motoInteres: lead.motorcycleInterest,
                    }),
                  "Expediente creado.",
                )
              }
              variant="secondary"
            >
              <FolderPlus aria-hidden className="h-4 w-4" />
              {lead.status === "EXPEDIENTE" ? "Ya tiene expediente" : "Crear expediente"}
            </Button>
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}

/**
 * Patch CRM-INT1 — a qué campaña se atribuye el lead.
 *
 * Atribuir por primera vez lo hace quien trabaja el lead; cambiar una
 * atribución ya hecha mueve la cifra de una campaña a otra, y eso es de quien
 * supervisa. La acción lo vuelve a comprobar.
 */
function CampaignSection({
  campaignId,
  campaigns,
  canChange,
  lead,
  onChange,
  onSave,
  pending,
}: {
  campaignId: string;
  campaigns: LeadCampaignOption[];
  canChange: boolean;
  lead: LeadDTO;
  onChange: (value: string) => void;
  onSave: () => void;
  pending: boolean;
}) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Megaphone aria-hidden className="h-4 w-4 text-slate-400" />
        Campaña de marketing
      </h3>
      <p className="mb-3 text-sm text-slate-600">
        {lead.campaignName
          ? `Atribuido a «${lead.campaignName}».`
          : "Sin campaña atribuida."}
      </p>
      {canChange && campaigns.length ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field className="min-w-[220px] flex-1" label="Campaña">
            <Select onChange={(event) => onChange(event.target.value)} value={campaignId}>
              <option value="">Sin campaña</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            disabled={pending || campaignId === (lead.campaignId ?? "")}
            onClick={onSave}
            variant="secondary"
          >
            Guardar campaña
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Patch CRM-AUD1 — el recorrido comercial del cliente, dentro de la ficha.
 *
 * **La ficha del lead era un callejón sin salida.** Enseñaba contacto, moto y
 * seguimientos y ahí terminaba: para saber si ese mismo cliente ya tenía una
 * reserva en curso, un crédito abierto o un cobro sin pagar había que salir a
 * buscarlo a mano en cuatro pantallas, sabiendo de antemano que existían. Un
 * vendedor al teléfono no tiene ese tiempo, y un líder decidiendo si cerrar la
 * venta tampoco.
 *
 * Son punteros, no copias: cada línea dice qué hay y a dónde ir a trabajarlo.
 * Operar una reserva sigue siendo cosa de la pantalla de Reservas.
 */
function CommercialContextSection({
  context,
}: {
  context: LeadCommercialContextDTO | null;
}) {
  if (!context) return null;
  const total =
    context.reservations.length +
    context.sales.length +
    context.expedientes.length +
    context.paymentRequests.length;
  if (total === 0) return null;

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Route aria-hidden className="h-4 w-4 text-slate-400" />
        Recorrido comercial del cliente
      </h3>
      <ul className="space-y-2">
        {context.expedientes.map((file) => (
          <ContextRow
            href={`/panel/expedientes?expediente=${file.id}`}
            key={file.id}
            label="Expediente"
            status={
              file.creditStatusLabel
                ? `${file.statusLabel} · Crédito ${file.creditStatusLabel}`
                : file.statusLabel
            }
            title={file.fileNumber}
          />
        ))}
        {context.reservations.map((reservation) => (
          <ContextRow
            href="/panel/reservas"
            key={reservation.id}
            label="Reserva"
            status={reservation.statusLabel}
            title={`${reservation.reservationNumber} · ${reservation.unitName}`}
          />
        ))}
        {context.paymentRequests.map((payment) => (
          <ContextRow
            href="/panel/pagos"
            key={payment.id}
            label="Cobro"
            status={payment.statusLabel}
            title={`${payment.concept} · ${payment.currency} ${payment.amount}`}
          />
        ))}
        {context.sales.map((sale) => (
          <ContextRow
            href="/panel/ventas"
            key={sale.id}
            label="Venta"
            status={sale.statusLabel}
            title={`${sale.saleNumber} · ${sale.unitName}`}
          />
        ))}
      </ul>
    </section>
  );
}

function ContextRow({
  label,
  title,
  status,
  href,
}: {
  label: string;
  title: string;
  status: string;
  href: string;
}) {
  return (
    <li>
      <Link
        className="sb-focus flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
        href={href}
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </span>
          <span className="block truncate text-sm text-slate-900">{title}</span>
        </span>
        <Badge tone="slate">{status}</Badge>
      </Link>
    </li>
  );
}
