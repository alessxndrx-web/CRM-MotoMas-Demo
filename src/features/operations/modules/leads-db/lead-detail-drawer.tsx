"use client";

import { useRouter } from "next/navigation";
import { Bike, ClipboardList, FolderPlus, Plus } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailList } from "@/components/ui/detail-list";
import { Drawer } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/fields";
import { Field } from "@/components/ui/form-section";
import { Notice } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createExpedienteAction } from "@/server/crm/actions";
import { setLeadMotorcycleAction } from "@/server/crm/actions";
import {
  activityTypeLabels,
  activityTypeValues,
  type ActivityListItemDTO,
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
 */

export type LeadCatalogOption = {
  id: string;
  label: string;
};

export function LeadDetailDrawer({
  activities,
  canCreateExpediente,
  catalogModels,
  lead,
  onClose,
}: {
  activities: ActivityListItemDTO[];
  canCreateExpediente: boolean;
  catalogModels: LeadCatalogOption[];
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

  if (!lead) {
    return <Drawer onClose={onClose} open={false} title="Lead" />;
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
            ]}
          />
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
                  {lead.motorcycle.brand} {lead.motorcycle.model}
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
        ) : canCreateExpediente ? (
          <Notice tone="info" title="Para crear el expediente falta el cliente">
            Registra primero al cliente en <strong>Clientes</strong> con este mismo
            teléfono y vuelve a abrir el lead.
          </Notice>
        ) : null}
      </div>
    </Drawer>
  );
}
