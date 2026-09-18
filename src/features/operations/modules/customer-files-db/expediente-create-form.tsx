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
 */
export function ExpedienteCreateForm({
  branches,
  canChooseSeller,
  customers,
  leads,
  sellers,
}: {
  branches: Array<{ code: string; name: string }>;
  canChooseSeller: boolean;
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
  const [observaciones, setObservaciones] = useState("");
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");

  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  // La sucursal del expediente es la del cliente. Sólo se pregunta cuando el
  // cliente todavía no está elegido y quien mira es un rol global.
  const effectiveBranch = selectedCustomer?.branchCode ?? branchCode;
  const customerLeads = leads.filter(
    (lead) => !customerId || lead.customerId === customerId,
  );

  function submit() {
    setError("");
    setCreated("");
    startTransition(async () => {
      const result = await createExpedienteAction({
        customerId,
        branchCode: effectiveBranch,
        leadId: leadId || null,
        sellerId: canChooseSeller ? sellerId || null : null,
        motoInteres: motoInteres || null,
        observaciones: observaciones || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated(result.fileNumber);
      setLeadId("");
      setMotoInteres("");
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
        <Field hint="Opcional: lo marca como convertido" label="Lead de origen">
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
        <Field label="Motocicleta de interés">
          <Input
            onChange={(event) => setMotoInteres(event.target.value)}
            placeholder="Modelo que el cliente busca"
            value={motoInteres}
          />
        </Field>
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
          Crear expediente
        </Button>
        <Button onClick={() => setOpen(false)} variant="secondary">
          Cerrar
        </Button>
      </div>
    </div>
  );
}
