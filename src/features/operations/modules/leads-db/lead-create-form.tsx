"use client";

import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/fields";
import { Notice } from "@/components/ui/feedback";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { LeadCatalogOption } from "@/features/operations/modules/leads-db/lead-detail-drawer";
import {
  createLeadAction,
  type ManualLeadDuplicate,
} from "@/server/crm/actions";
import { manualLeadOrigins, type LeadCampaignOption } from "@/server/crm/shared";

/**
 * Patch CRM-QA1 — **el botón «Registrar lead» que la QA echó en falta.**
 *
 * El alta manual existía sólo en la bandeja local de `localStorage`, que
 * `LegacyOperationalPanelGate` esconde en cuanto hay `DATABASE_URL`. En una
 * instalación con base de datos —o sea, en producción— el vendedor se quedaba
 * mirando una lista vacía sin forma de añadir nada.
 *
 * ## El aviso de duplicado no bloquea al cliente que vuelve
 *
 * El servidor avisa cuando ya hay un lead **vivo** con el mismo teléfono o
 * cédula, y esta pantalla ofrece dos salidas: abrir el que ya existe, o crear el
 * nuevo de todos modos. Un lead cerrado —expediente o descartado— no cuenta como
 * duplicado, así que un cliente que regresa meses después entra sin fricción.
 */
export function LeadCreateForm({
  branches,
  campaigns,
  canAssign,
  catalogModels,
  onCreated,
  sellers,
}: {
  /** Vacío salvo para un rol global: los demás heredan su sucursal. */
  branches: Array<{ code: string; name: string }>;
  /**
   * Patch CRM-INT1 — campañas vigentes. Para un rol de sucursal llegan ya
   * recortadas a las que cubren la suya; para uno global se filtran aquí por
   * la sucursal elegida.
   */
  campaigns: LeadCampaignOption[];
  canAssign: boolean;
  catalogModels: LeadCatalogOption[];
  onCreated?: (leadId: string) => void;
  sellers: Array<{ id: string; name: string; branchCode: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState<ManualLeadDuplicate | null>(null);
  const [created, setCreated] = useState("");

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cedula, setCedula] = useState("");
  const [correo, setCorreo] = useState("");
  const [origen, setOrigen] = useState<string>(manualLeadOrigins[0]);
  const [catalogModelId, setCatalogModelId] = useState("");
  const [motoInteres, setMotoInteres] = useState("");
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");
  const [vendedorId, setVendedorId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const branchSellers = branches.length
    ? sellers.filter((seller) => seller.branchCode === branchCode)
    : sellers;
  const branchCampaigns = branches.length
    ? campaigns.filter(
        (campaign) =>
          campaign.branchCodes.length === 0 ||
          campaign.branchCodes.includes(branchCode),
      )
    : campaigns;

  function reset() {
    setNombre("");
    setTelefono("");
    setCedula("");
    setCorreo("");
    setCatalogModelId("");
    setMotoInteres("");
    setVendedorId("");
    setCampaignId("");
    setObservaciones("");
  }

  function submit(forzarDuplicado: boolean) {
    setError("");
    setCreated("");
    startTransition(async () => {
      const result = await createLeadAction({
        nombre,
        telefono,
        cedula: cedula || null,
        correo: correo || null,
        origen,
        catalogModelId: catalogModelId || null,
        motoInteres: motoInteres || null,
        branchCode: branches.length ? branchCode : null,
        vendedorId: canAssign ? vendedorId || null : null,
        campaignId: campaignId || null,
        observaciones: observaciones || null,
        forzarDuplicado,
      });
      if (!result.ok) {
        setError(result.error);
        setDuplicate(result.duplicate ?? null);
        return;
      }
      setDuplicate(null);
      setCreated(result.trackingCode);
      reset();
      router.refresh();
      onCreated?.(result.leadId);
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <UserPlus aria-hidden className="h-4 w-4" />
        Registrar lead
      </Button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-5">
      <FormSection
        description="Para un cliente que llega a la sucursal, llama o escribe. El lead queda a tu nombre salvo que lo asignes."
        title="Registrar lead"
      >
        <Field label="Nombre" required>
          <Input
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Nombre y apellido"
            value={nombre}
          />
        </Field>
        <Field hint="Al menos 8 dígitos" label="Teléfono" required>
          <Input
            inputMode="tel"
            onChange={(event) => setTelefono(event.target.value)}
            placeholder="8888 8888"
            value={telefono}
          />
        </Field>
        <Field label="Cédula">
          <Input
            onChange={(event) => setCedula(event.target.value)}
            placeholder="001-000000-0000A"
            value={cedula}
          />
        </Field>
        <Field label="Correo">
          <Input
            onChange={(event) => setCorreo(event.target.value)}
            type="email"
            value={correo}
          />
        </Field>
        <Field label="Origen" required>
          <Select onChange={(event) => setOrigen(event.target.value)} value={origen}>
            {manualLeadOrigins.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          hint="Si no está en el catálogo, descríbela abajo"
          label="Motocicleta de interés"
        >
          <Select
            onChange={(event) => setCatalogModelId(event.target.value)}
            value={catalogModelId}
          >
            <option value="">Sin definir</option>
            {catalogModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </Select>
        </Field>
        {catalogModelId ? null : (
          <Field label="Moto (texto libre)">
            <Input
              onChange={(event) => setMotoInteres(event.target.value)}
              placeholder="Lo que el cliente dijo"
              value={motoInteres}
            />
          </Field>
        )}
        {branches.length ? (
          <Field label="Sucursal" required>
            <Select
              onChange={(event) => setBranchCode(event.target.value)}
              value={branchCode}
            >
              {branches.map((branch) => (
                <option key={branch.code} value={branch.code}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {canAssign ? (
          <Field hint="Déjalo vacío para repartirlo después" label="Vendedor">
            <Select
              onChange={(event) => setVendedorId(event.target.value)}
              value={vendedorId}
            >
              <option value="">Sin asignar</option>
              {branchSellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {branchCampaigns.length ? (
          <Field
            hint="Opcional: si el cliente dice por qué anuncio llegó"
            label="Campaña de marketing"
          >
            <Select
              onChange={(event) => setCampaignId(event.target.value)}
              value={campaignId}
            >
              <option value="">Ninguna o no sabe</option>
              {branchCampaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field className="sm:col-span-2" label="Observaciones">
          <Textarea
            onChange={(event) => setObservaciones(event.target.value)}
            placeholder="Contexto de la visita o la llamada"
            value={observaciones}
          />
        </Field>
      </FormSection>

      {error ? (
        <div className="mt-4">
          <Notice tone={duplicate ? "warning" : "danger"}>{error}</Notice>
          {duplicate ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-semibold">
                {duplicate.name} · {duplicate.trackingCode}
              </p>
              <p className="mt-0.5">
                {duplicate.statusLabel} ·{" "}
                {duplicate.assignedSellerName ?? "Sin vendedor asignado"}
              </p>
              <Button
                className="mt-3"
                disabled={pending}
                onClick={() => submit(true)}
                size="sm"
                variant="secondary"
              >
                Registrarlo igualmente
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {created ? (
        <div className="mt-4">
          <Notice tone="success" title="Lead registrado">
            Código de seguimiento <strong>{created}</strong>.
          </Notice>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={pending || !nombre.trim() || !telefono.trim()} onClick={() => submit(false)}>
          <UserPlus aria-hidden className="h-4 w-4" />
          Guardar lead
        </Button>
        <Button
          onClick={() => {
            setOpen(false);
            setError("");
            setDuplicate(null);
            setCreated("");
          }}
          variant="secondary"
        >
          Cerrar
        </Button>
      </div>
    </div>
  );
}
