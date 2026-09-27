"use client";

import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/fields";
import { Notice } from "@/components/ui/feedback";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CustomerFileDTO } from "@/server/crm/shared";
import { saveCreditApplicationAction } from "@/server/expedientes/actions";
import {
  creditFinancingTypeLabels,
  creditFinancingTypeValues,
  supportedCurrencies,
} from "@/server/expedientes/shared";

/**
 * Patch CRM-QA1 — **abrir una solicitud de crédito desde la lista de créditos.**
 *
 * La QA reportó «no hay opción de crear créditos». `saveCreditApplicationAction`
 * existía desde 3.3B y era completa —montos en Decimal, plazo acotado, estados
 * validados—, pero su único punto de entrada era el detalle de un expediente ya
 * seleccionado, al que se llegaba por `?expediente=<id>`. Desde la pantalla de
 * Créditos no había ningún camino.
 *
 * **No es un modelo nuevo.** Es la misma acción y la misma `CreditApplication`,
 * con su regla de siempre: una por expediente. Elegir el expediente aquí es lo
 * único que se añade.
 */
export function CreditCreateForm({
  files,
}: {
  /** Expedientes del alcance del usuario, sin solicitud de crédito todavía. */
  files: CustomerFileDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [customerFileId, setCustomerFileId] = useState("");
  const [institucion, setInstitucion] = useState("");
  const [tipo, setTipo] = useState<string>(creditFinancingTypeValues[0]);
  const [monto, setMonto] = useState("");
  const [prima, setPrima] = useState("");
  const [plazo, setPlazo] = useState("");
  const [moneda, setMoneda] = useState<string>("NIO");
  const [pendientes, setPendientes] = useState("");
  const [observaciones, setObservaciones] = useState("");

  function toNumber(value: string): number | null {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function submit() {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await saveCreditApplicationAction({
        customerFileId,
        financialInstitution: institucion || null,
        financingType: tipo,
        // `sanitizeMoney` del servidor acota y redondea; aquí sólo se convierte
        // lo que el campo de texto trae, y un valor inválido llega como null.
        amount: toNumber(monto),
        downPayment: toNumber(prima),
        termMonths: toNumber(plazo),
        currency: moneda,
        pendingItems: pendientes || null,
        observations: observaciones || null,
        requestedAt: new Date().toISOString(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Solicitud de crédito registrada en el expediente.");
      setMonto("");
      setPrima("");
      setPlazo("");
      setPendientes("");
      setObservaciones("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!files.length} onClick={() => setOpen(true)} size="sm">
          <CreditCard aria-hidden className="h-4 w-4" />
          Nueva solicitud de crédito
        </Button>
        {/*
          * El botón deshabilitado sin explicación es la peor de las dos
          * opciones: quien mira no sabe si falta un permiso o falta un dato.
          * Aquí siempre falta lo mismo, y se dice.
          */}
        {files.length ? null : (
          <span className="text-sm text-slate-500">
            Todos los expedientes abiertos de tu alcance ya tienen solicitud, o
            todavía no hay ninguno. Crea el expediente desde la ficha del
            cliente o del lead.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-5">
      <FormSection
        description="El crédito vive dentro de un expediente: uno por expediente. Elige a cuál pertenece."
        title="Nueva solicitud de crédito"
      >
        <Field className="sm:col-span-2" label="Expediente" required>
          <Select
            onChange={(event) => setCustomerFileId(event.target.value)}
            value={customerFileId}
          >
            <option value="">Selecciona un expediente</option>
            {files.map((file) => (
              <option key={file.id} value={file.id}>
                {file.fileNumber} · {file.customerName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tipo de financiamiento">
          <Select onChange={(event) => setTipo(event.target.value)} value={tipo}>
            {creditFinancingTypeValues.map((value) => (
              <option key={value} value={value}>
                {creditFinancingTypeLabels[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Institución financiera">
          <Input
            onChange={(event) => setInstitucion(event.target.value)}
            placeholder="Nombre de la financiera"
            value={institucion}
          />
        </Field>
        <Field label="Monto solicitado">
          <Input
            inputMode="decimal"
            onChange={(event) => setMonto(event.target.value)}
            placeholder="0.00"
            value={monto}
          />
        </Field>
        <Field label="Prima">
          <Input
            inputMode="decimal"
            onChange={(event) => setPrima(event.target.value)}
            placeholder="0.00"
            value={prima}
          />
        </Field>
        <Field hint="En meses" label="Plazo">
          <Input
            inputMode="numeric"
            onChange={(event) => setPlazo(event.target.value)}
            placeholder="24"
            value={plazo}
          />
        </Field>
        <Field label="Moneda">
          <Select onChange={(event) => setMoneda(event.target.value)} value={moneda}>
            {supportedCurrencies.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Requisitos pendientes">
          <Input
            onChange={(event) => setPendientes(event.target.value)}
            placeholder="Colilla, constancia salarial…"
            value={pendientes}
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
      {message ? (
        <div className="mt-4">
          <Notice tone="success">{message}</Notice>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={pending || !customerFileId} onClick={submit}>
          <CreditCard aria-hidden className="h-4 w-4" />
          Guardar solicitud
        </Button>
        <Button onClick={() => setOpen(false)} variant="secondary">
          Cerrar
        </Button>
      </div>
    </div>
  );
}
