"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ClipboardList, ShieldCheck } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { motorcycles } from "@/data/catalog/motorcycles";
import {
  desiredBranches,
  leadOriginChannels,
  type DesiredBranchId,
  type LeadOriginChannel,
} from "@/data/operations/leads";
import { savePublicLead } from "@/features/portal/services/lead-service";
import { readMarketingCampaigns } from "@/features/operations/services/marketing-campaign-service";
import { createPublicLeadAction } from "@/server/crm/actions";
import {
  btnAccent,
  inputClass,
  labelClass,
  PortalBadge,
  PortalCard,
  PortalPageHeader,
  selectClass,
} from "@/features/portal/components/ui";
import type {
  CreatedLeadSummary,
  LeadRequestFormValues,
} from "@/features/portal/types";
import { cn } from "@/lib/utils";

type LeadRequestFormProps = {
  initialMotorcycleSlug?: string | null;
};

const emptyValues: LeadRequestFormValues = {
  nombre: "",
  telefono: "",
  cedula: "",
  correo: "",
  motoSlug: "",
  sucursalDeseada: "",
  canalOrigen: "Sitio web",
};

type FormErrors = Partial<Record<keyof LeadRequestFormValues, string>>;

export function LeadRequestForm({ initialMotorcycleSlug }: LeadRequestFormProps) {
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaignId");
  const initialMotoExists = motorcycles.some(
    (motorcycle) => motorcycle.slug === initialMotorcycleSlug,
  );
  const [values, setValues] = useState<LeadRequestFormValues>({
    ...emptyValues,
    motoSlug: initialMotoExists ? initialMotorcycleSlug ?? "" : "",
  });
  const [createdLead, setCreatedLead] = useState<CreatedLeadSummary | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState("");

  const selectedMotorcycle = useMemo(
    () => motorcycles.find((motorcycle) => motorcycle.slug === values.motoSlug),
    [values.motoSlug],
  );

  function updateValue<K extends keyof LeadRequestFormValues>(
    key: K,
    value: LeadRequestFormValues[K],
  ) {
    const nextValue = sanitizeInputValue(key, value);
    setValues((current) => ({ ...current, [key]: nextValue }));
    setErrors((current) => {
      const nextErrors = { ...current };
      const fieldError = validateField(key, nextValue);

      if (fieldError) {
        nextErrors[key] = fieldError;
      } else {
        delete nextErrors[key];
      }

      return nextErrors;
    });
    setError("");
  }

  async function submitLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatedLead(null);
    setError("");
    const nextErrors = validateForm(values);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setError("Revisa los campos marcados antes de enviar la solicitud.");
      return;
    }

    if (!selectedMotorcycle || !values.sucursalDeseada) {
      setError("Completa nombre, teléfono, cédula, moto de interés y sucursal.");
      return;
    }

    const nombre = sanitizeText(values.nombre);
    const telefono = normalizePhone(values.telefono);
    const cedula = normalizeCedula(values.cedula);

    try {
      const campaign = campaignId
        ? readMarketingCampaigns().find((item) => item.id === campaignId)
        : null;

      // Create the lead in the database first so both records share the same
      // tracking code. If the database is not configured or the call fails,
      // the request still saves to localStorage so the demo keeps working.
      const dbResult = await createPublicLeadAction({
        nombre,
        telefono,
        cedula,
        correo: values.correo || null,
        motoInteres: selectedMotorcycle.name,
        motoSlug: selectedMotorcycle.slug,
        sucursalDeseada: values.sucursalDeseada,
        canalOrigen: values.canalOrigen || null,
      });

      const lead = savePublicLead({
        nombre,
        telefono,
        cedula,
        correo: values.correo,
        motoInteres: selectedMotorcycle.name,
        motoSlug: selectedMotorcycle.slug,
        sucursalDeseada: values.sucursalDeseada,
        canalOrigen: values.canalOrigen || null,
        campaignId,
        campaignName: campaign?.nombre ?? null,
        utmSource: searchParams.get("utm_source"),
        utmMedium: searchParams.get("utm_medium"),
        utmCampaign: searchParams.get("utm_campaign"),
        utmContent: searchParams.get("utm_content"),
        utmTerm: searchParams.get("utm_term"),
        idOverride: dbResult.ok ? dbResult.trackingCode : null,
      });

      setCreatedLead({
        id: lead.id,
        estado: lead.estado,
        motoInteres: lead.motoInteres,
        sucursalNombre: lead.sucursalNombre,
        fechaCreacion: lead.fechaCreacion,
      });
      setValues({
        ...emptyValues,
        motoSlug: selectedMotorcycle.slug,
        canalOrigen: values.canalOrigen || "Sitio web",
      });
    } catch {
      setError("No se pudo guardar la solicitud. Intenta nuevamente.");
    }
  }

  return (
    <>
      <PortalPageHeader
        description="Un asesor de la sucursal seleccionada revisará tu solicitud y se pondrá en contacto para dar seguimiento a tu interés."
        eyebrow="Solicitar información"
        title="Solicita información"
        tone="orange"
      />

      <section className="mx-auto grid max-w-[1240px] items-start gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
      <div className="min-w-0">
        {createdLead ? (
          <PortalCard className="animate-fade-up overflow-hidden border-emerald-200 bg-emerald-50 p-6">
            <div className="flex gap-4">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-slate-900">
                  ¡Solicitud recibida!
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Guarda tu código de solicitud para consultar el avance de tu
                  proceso:
                </p>
                <div className="mt-3 inline-flex items-center rounded-xl border border-emerald-200 bg-white px-4 py-2.5">
                  <span className="font-mono text-base font-semibold tracking-wide text-slate-900">
                    {createdLead.id}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {createdLead.sucursalNombre} dará seguimiento a tu interés en{" "}
                  <span className="font-semibold text-slate-800">
                    {createdLead.motoInteres}
                  </span>
                  .
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <Link
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700"
                    href={`/consultar-expediente?codigo=${encodeURIComponent(createdLead.id)}`}
                  >
                    Consultar mi proceso
                  </Link>
                  {[
                    { href: "/mi-reserva", label: "Mi reserva" },
                    { href: "/mi-entrega", label: "Mi entrega" },
                    { href: "/mi-credito", label: "Mi crédito" },
                  ].map((item) => (
                    <Link
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      href={`${item.href}?codigo=${encodeURIComponent(createdLead.id)}`}
                      key={item.href}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </PortalCard>
        ) : null}

        <PortalCard className={cn("p-6 sm:p-7", createdLead && "mt-8")}>
          <form className="grid gap-8" onSubmit={submitLead}>
            <FormSection step={1} title="Datos del cliente">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Nombre">
                  <input
                    autoComplete="name"
                    className={inputClass}
                    id="lead-nombre"
                    maxLength={80}
                    name="nombre"
                    onChange={(event) => updateValue("nombre", event.target.value)}
                    placeholder="Nombre completo"
                    required
                    value={values.nombre}
                  />
                  <FieldError message={errors.nombre} />
                </Field>
                <Field label="Teléfono">
                  <input
                    autoComplete="tel"
                    className={inputClass}
                    id="lead-telefono"
                    inputMode="numeric"
                    maxLength={8}
                    name="telefono"
                    onBeforeInput={preventNonDigitInput}
                    onChange={(event) => updateValue("telefono", event.target.value)}
                    onKeyDown={preventNonDigitKey}
                    onPaste={(event) => pasteSanitizedValue(event, "telefono")}
                    placeholder="Número de contacto"
                    required
                    type="text"
                    value={values.telefono}
                  />
                  <FieldError message={errors.telefono} />
                </Field>
              </div>
              <Field label="Número de cédula">
                <input
                  autoComplete="off"
                  className={inputClass}
                  id="lead-cedula"
                  maxLength={16}
                  name="cedula"
                  onBeforeInput={preventInvalidCedulaInput}
                  onChange={(event) => updateValue("cedula", event.target.value)}
                  onPaste={(event) => pasteSanitizedValue(event, "cedula")}
                  placeholder="001-010101-0000A"
                  required
                  value={values.cedula}
                />
                <p className="mt-2 text-xs font-medium text-slate-500">
                  Ejemplo: 001-010101-0000A
                </p>
                <FieldError message={errors.cedula} />
              </Field>
              <Field label="Correo (opcional)">
                <input
                  autoComplete="email"
                  className={inputClass}
                  id="lead-correo"
                  maxLength={120}
                  name="correo"
                  onChange={(event) => updateValue("correo", event.target.value)}
                  placeholder="correo@ejemplo.com"
                  type="email"
                  value={values.correo}
                />
                <FieldError message={errors.correo} />
              </Field>
            </FormSection>

            <FormSection step={2} title="Moto de interés">
              <Field label="Selecciona una moto">
                <select
                  className={selectClass}
                  id="lead-moto"
                  name="motoInteres"
                  onChange={(event) => updateValue("motoSlug", event.target.value)}
                  required
                  value={values.motoSlug}
                >
                  <option value="">Selecciona una moto</option>
                  {motorcycles.map((motorcycle) => (
                    <option key={motorcycle.slug} value={motorcycle.slug}>
                      {motorcycle.name}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.motoSlug} />
              </Field>
            </FormSection>

            <FormSection step={3} title="Sucursal">
              <Field label="Sucursal donde deseas ser atendido">
                <select
                  className={selectClass}
                  id="lead-sucursal"
                  name="sucursalDeseada"
                  onChange={(event) =>
                    updateValue("sucursalDeseada", event.target.value as DesiredBranchId | "")
                  }
                  required
                  value={values.sucursalDeseada}
                >
                  <option value="">Selecciona una sucursal</option>
                  {desiredBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.sucursalDeseada} />
              </Field>
            </FormSection>

            <FormSection step={4} title="Contacto y envío">
              <Field label="¿Cómo nos conociste?">
                <select
                  className={selectClass}
                  id="lead-canal"
                  name="canalOrigen"
                  onChange={(event) =>
                    updateValue("canalOrigen", event.target.value as LeadOriginChannel | "")
                  }
                  value={values.canalOrigen}
                >
                  <option value="">No especificado</option>
                  {leadOriginChannels.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.canalOrigen} />
              </Field>

              <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Al enviar, recibirás un código de solicitud para consultar el
                avance de tu proceso. Un asesor de la sucursal seleccionada
                revisará tu solicitud y te contactará.
              </p>

              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {error}
                </div>
              ) : null}

              <button className={cn(btnAccent, "w-full")} type="submit">
                <ClipboardList className="h-4 w-4" />
                Enviar solicitud
              </button>
            </FormSection>
          </form>
        </PortalCard>
      </div>

      <aside className="space-y-5 lg:sticky lg:top-28">
        <PortalCard className="p-6">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            Qué pasa después
          </h2>
          <div className="mt-5 space-y-4">
            <SummaryLine label="Estado inicial" value="Solicitud recibida" />
            <SummaryLine label="Asesor" value="Pendiente de asignación" />
            <SummaryLine label="Atención" value="Sucursal seleccionada" />
            <SummaryLine label="Seguimiento" value="Contacto de tu asesor" />
          </div>
        </PortalCard>

        <PortalCard className="p-6">
          <PortalBadge tone="slate">Buen saber</PortalBadge>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Enviar una solicitud no representa aprobación de crédito, reserva de
            unidad ni confirmación de disponibilidad. Todo se confirma durante el
            acompañamiento de tu asesor.
          </p>
        </PortalCard>
      </aside>
      </section>
    </>
  );
}

function FormSection({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-sm font-semibold text-white">
          {step}
        </span>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <span aria-hidden className="ml-auto h-1 w-8 rounded-full bg-orange-500/60" />
      </div>
      {children}
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

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-2 text-xs font-semibold leading-5 text-red-600">{message}</p>;
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="max-w-[200px] text-right text-sm font-bold text-slate-900">
        {value}
      </span>
    </div>
  );
}

function sanitizeInputValue<K extends keyof LeadRequestFormValues>(
  key: K,
  value: LeadRequestFormValues[K],
): LeadRequestFormValues[K] {
  if (key === "telefono") {
    return normalizePhone(value).slice(0, 8) as LeadRequestFormValues[K];
  }

  if (key === "cedula") {
    return normalizeCedulaInput(value) as LeadRequestFormValues[K];
  }

  if (key === "nombre") {
    return value.slice(0, 80) as LeadRequestFormValues[K];
  }

  if (key === "correo") {
    return value.slice(0, 120) as LeadRequestFormValues[K];
  }

  return value;
}

function validateForm(values: LeadRequestFormValues) {
  const nextErrors: FormErrors = {};

  (Object.keys(values) as (keyof LeadRequestFormValues)[]).forEach((key) => {
    const fieldError = validateField(key, values[key]);
    if (fieldError) nextErrors[key] = fieldError;
  });

  return nextErrors;
}

function validateField<K extends keyof LeadRequestFormValues>(
  key: K,
  value: LeadRequestFormValues[K],
) {
  if (key === "nombre") return validateName(value);
  if (key === "telefono") return validatePhone(value);
  if (key === "cedula") return validateCedula(value);
  if (key === "correo") return validateEmail(value);
  if (key === "motoSlug") return validateMotorcycle(value);
  if (key === "sucursalDeseada") return validateBranch(value);
  if (key === "canalOrigen") return validateOriginChannel(value);

  return "";
}

function validateName(value: string) {
  const name = sanitizeText(value);

  if (!name) return "El nombre es obligatorio.";
  if (name.length < 3) return "El nombre debe tener al menos 3 caracteres.";
  if (name.length > 80) return "El nombre no debe superar 80 caracteres.";
  if (/\d/.test(name)) return "El nombre no debe contener números.";

  return "";
}

function validatePhone(value: string) {
  const phone = normalizePhone(value);

  if (!phone) return "El teléfono es obligatorio.";
  if (phone.length !== 8) return "El teléfono debe tener exactamente 8 dígitos.";

  return "";
}

function validateCedula(value: string) {
  const cedula = normalizeCedula(value);

  if (!cedula) return "El número de cédula es obligatorio.";
  if (!/^[0-9A-Z-]+$/.test(cedula)) {
    return "La cédula solo puede incluir números, guiones y una letra final.";
  }

  if (cedula.includes("-")) {
    if (cedula.length > 16) return "La cédula con guiones no debe superar 16 caracteres.";
    if (!/^\d{3}-\d{6}-\d{4}[A-Z]$/.test(cedula)) {
      return "Usa el formato 001-010101-0000A.";
    }

    return "";
  }

  if (cedula.length > 14) return "La cédula sin guiones no debe superar 14 caracteres.";
  if (!/^\d{13}[A-Z]$/.test(cedula)) {
    return "Usa el formato 0010101010000A.";
  }

  return "";
}

function validateEmail(value: string) {
  const email = value.trim();

  if (!email) return "";
  if (email.length > 120) return "El correo no debe superar 120 caracteres.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Ingresa un correo válido.";
  }

  return "";
}

function validateMotorcycle(value: string) {
  if (!value) return "Selecciona una moto de interés.";
  if (!motorcycles.some((motorcycle) => motorcycle.slug === value)) {
    return "Selecciona una moto válida del catálogo.";
  }

  return "";
}

function validateBranch(value: string) {
  if (!value) return "Selecciona la sucursal donde deseas ser atendido.";
  if (!desiredBranches.some((branch) => branch.id === value)) {
    return "Selecciona una sucursal valida.";
  }

  return "";
}

function validateOriginChannel(value: string) {
  if (!value) return "Selecciona el canal de origen.";
  if (!leadOriginChannels.some((channel) => channel === value)) {
    return "Selecciona un canal de origen valido.";
  }

  return "";
}

function sanitizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeCedula(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function normalizeCedulaInput(value: string) {
  const cedula = normalizeCedula(value).replace(/[^0-9A-Z-]/g, "");

  return cedula.includes("-") ? cedula.slice(0, 16) : cedula.slice(0, 14);
}

function preventNonDigitInput(event: React.FormEvent<HTMLInputElement>) {
  const nativeEvent = event.nativeEvent as InputEvent;

  if (nativeEvent.data && /\D/.test(nativeEvent.data)) {
    event.preventDefault();
  }
}

function preventNonDigitKey(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.key.length > 1) {
    return;
  }

  if (!/^\d$/.test(event.key)) {
    event.preventDefault();
  }
}

function preventInvalidCedulaInput(event: React.FormEvent<HTMLInputElement>) {
  const nativeEvent = event.nativeEvent as InputEvent;

  if (nativeEvent.data && /[^0-9a-zA-Z-]/.test(nativeEvent.data)) {
    event.preventDefault();
  }
}

function pasteSanitizedValue(
  event: React.ClipboardEvent<HTMLInputElement>,
  key: "telefono" | "cedula",
) {
  event.preventDefault();

  const pasted = event.clipboardData.getData("text");
  const input = event.currentTarget;
  const selectionStart = input.selectionStart ?? input.value.length;
  const selectionEnd = input.selectionEnd ?? input.value.length;
  const nextValue =
    input.value.slice(0, selectionStart) + pasted + input.value.slice(selectionEnd);

  input.value =
    key === "telefono"
      ? normalizePhone(nextValue).slice(0, 8)
      : normalizeCedulaInput(nextValue);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
