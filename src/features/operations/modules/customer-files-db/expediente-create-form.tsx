"use client";

import { useRouter } from "next/navigation";
import { FolderPlus } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/fields";
import { Notice } from "@/components/ui/feedback";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createExpedienteAction } from "@/server/crm/actions";
import type { CustomerDTO, LeadDTO } from "@/server/crm/shared";

/**
 * Patch CRM-QA1 — **el formulario que le faltaba a `createExpedienteAction`.**
 *
 * La acción está escrita, validada y con su transacción desde el parche 3.1B.
 * Nunca tuvo un llamador: cero. `knip` no lo detectó porque su análisis de
 * exportaciones sueltas está desactivado (ver `knip.json`) y el archivo sí es
 * alcanzable por sus otras exportaciones. La QA lo detectó a la primera: «no hay
 * opción de crear expedientes».
 *
 * El vendedor se queda su propio expediente —lo impone la acción, no esta
 * pantalla—; un rol con alcance de sucursal puede elegir a quién se lo asigna.
 *
 * Patch CRM-INT1 — el desplegable «Lead de origen» salía **siempre vacío** al
 * elegir un cliente: filtraba por `lead.customerId`, y ese campo sólo lo
 * escribía la propia creación del expediente. Ahora ofrece los leads ya
 * vinculados al cliente **y** los que aún no tienen cliente pero comparten su
 * teléfono o cédula; la acción enlaza el lead al guardar. La moto se elige del
 * catálogo general, con texto libre sólo si no está en él.
 */
export function ExpedienteCreateForm({
  branches,
  canChooseSeller,
  catalogModels,
  customers,
  leads,
  sellers,
}: {
  branches: Array<{ code: string; name: string }>;
  canChooseSeller: boolean;
  /** Patch CRM-INT1 — el catálogo general, la misma fuente que el lead. */
  catalogModels: Array<{ id: string; label: string }>;
  customers: CustomerDTO[];
  leads: LeadDTO[];
  sellers: Array<{ id: string; name: string; branchCode: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [motoInteres, setMotoInteres] = useState("");
  const [catalogModelId, setCatalogModelId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");

  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  // La sucursal del expediente es la del cliente. Sólo se pregunta cuando el
  // cliente todavía no está elegido y quien mira es un rol global.
  const effectiveBranch = selectedCustomer?.branchCode ?? branchCode;
  const customerPhone = selectedCustomer?.phone.replace(/\D/g, "") ?? "";
  const customerCedula = normalizeId(selectedCustomer?.cedula);
  const customerLeads = leads.filter((lead) => {
    if (!selectedCustomer) return !lead.customerId;
    if (lead.customerId) return lead.customerId === selectedCustomer.id;
    return (
      (customerPhone !== "" && lead.phone.replace(/\D/g, "") === customerPhone) ||
      (customerCedula !== "" && normalizeId(lead.cedula) === customerCedula)
    );
  });
  const selectedModelLabel =
    catalogModels.find((model) => model.id === catalogModelId)?.label ?? "";

  function submit() {
    setError("");
    setCreated("");
    startTransition(async () => {
      const result = await createExpedienteAction({
        customerId,
        branchCode: effectiveBranch,
        leadId: leadId || null,
        sellerId: canChooseSeller ? sellerId || null : null,
        motoInteres: selectedModelLabel || motoInteres || null,
        observaciones: observaciones || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated(result.fileNumber);
      setLeadId("");
      setMotoInteres("");
      setCatalogModelId("");
      setObservaciones("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <FolderPlus aria-hidden className="h-4 w-4" />
        Nuevo expediente
      </Button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-5">
      <FormSection
        description="El expediente agrupa proforma, documentos y seguimiento de crédito de un cliente."
        title="Nuevo expediente"
      >
        <Field label="Cliente" required>
          <Select
            onChange={(event) => {
              setCustomerId(event.target.value);
              setLeadId("");
            }}
            value={customerId}
          >
            <option value="">Selecciona un cliente</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} · {customer.phone}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          hint={
            selectedCustomer && !customerLeads.length
              ? "Este cliente no tiene leads con su teléfono o cédula."
              : "Opcional: lo marca como convertido y lo vincula al cliente"
          }
          label="Lead de origen"
        >
          <Select onChange={(event) => setLeadId(event.target.value)} value={leadId}>
            <option value="">Sin lead</option>
            {customerLeads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.trackingCode} · {lead.name}
              </option>
            ))}
          </Select>
        </Field>
        {branches.length && !selectedCustomer ? (
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
        {canChooseSeller ? (
          <Field label="Vendedor responsable">
            <Select
              onChange={(event) => setSellerId(event.target.value)}
              value={sellerId}
            >
              <option value="">Sin asignar</option>
              {sellers
                .filter(
                  (seller) =>
                    !effectiveBranch || seller.branchCode === effectiveBranch,
                )
                .map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}
        <Field
          hint="Del catálogo general. No reserva ni garantiza existencias."
          label="Motocicleta de interés"
        >
          <Select
            onChange={(event) => setCatalogModelId(event.target.value)}
            value={catalogModelId}
          >
            <option value="">Sin definir o fuera del catálogo</option>
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
              placeholder="Sólo si no está en el catálogo"
              value={motoInteres}
            />
          </Field>
        )}
        <Field className="sm:col-span-2" label="Observaciones">
          <Textarea
            onChange={(event) => setObservaciones(event.target.value)}
            value={observaciones}
          />
        </Field>
      </FormSection>

      {error ? (
        <div className="mt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
      {created ? (
        <div className="mt-4">
          <Notice tone="success" title="Expediente creado">
            Número <strong>{created}</strong>. Selecciónalo en la lista para
            trabajar su proforma, documentos y crédito.
          </Notice>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={pending || !customerId} onClick={submit}>
          <FolderPlus aria-hidden className="h-4 w-4" />
          {pending ? "Creando…" : "Crear expediente"}
        </Button>
        <Button onClick={() => setOpen(false)} variant="secondary">
          Cerrar
        </Button>
      </div>
    </div>
  );
}

/** Cédula comparable: sólo letras y números, en mayúsculas. */
function normalizeId(value: string | null | undefined): string {
  return (value ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}
