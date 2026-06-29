"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ClipboardList, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { motorcycles } from "@/data/catalog/motorcycles";
import {
  desiredBranches,
  leadOriginChannels,
  type DesiredBranchId,
  type LeadOriginChannel,
} from "@/data/operations/leads";
import { savePublicLead } from "@/features/portal/services/lead-service";
import { readMarketingCampaigns } from "@/features/operations/services/marketing-campaign-service";
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

export function LeadRequestForm({
  initialMotorcycleSlug,
}: LeadRequestFormProps) {
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

  function submitLead(event: React.FormEvent<HTMLFormElement>) {
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

    try {
      const campaign = campaignId
        ? readMarketingCampaigns().find((item) => item.id === campaignId)
        : null;
      const lead = savePublicLead({
        nombre: sanitizeText(values.nombre),
        telefono: normalizePhone(values.telefono),
        cedula: normalizeCedula(values.cedula),
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
    <section className="mx-auto grid max-w-[1520px] gap-8 px-4 py-10 sm:px-8 lg:grid-cols-[1fr_420px] lg:px-10">
      <div>
        <Badge tone="red">Solicitud pública</Badge>
        <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-normal text-white sm:text-5xl">
          Solicitar información
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
          Envía tus datos y elige la sucursal donde quieres recibir atención. La
          solicitud queda registrada para el seguimiento de la sucursal
          seleccionada.
        </p>

        {createdLead ? (
          <Card className="mt-8 border-emerald-500/25 bg-emerald-500/10 p-6">
            <div className="flex gap-4">
              <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-emerald-300" />
              <div>
                <Badge tone="green">Solicitud recibida</Badge>
                <h2 className="mt-4 text-2xl font-black text-white">
                  Solicitud recibida
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Código de solicitud:{" "}
                  <span className="font-black text-white">{createdLead.id}</span>
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  {createdLead.sucursalNombre} dará seguimiento a tu interés en{" "}
                  {createdLead.motoInteres}.
                </p>
                <p className="mt-3 text-sm leading-6 text-zinc-500">
                  Esta solicitud no representa aprobación de crédito, reserva de
                  unidad ni confirmación de disponibilidad.
                </p>
                <Link
                  className="mt-5 inline-flex h-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] px-5 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.1]"
                  href={`/consultar-expediente?codigo=${encodeURIComponent(
                    createdLead.id,
                  )}`}
                >
                  Consultar solicitud
                </Link>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { href: "/mi-reserva", label: "Mi reserva" },
                    { href: "/mi-entrega", label: "Mi entrega" },
                    { href: "/mi-credito", label: "Mi crédito" },
                  ].map((item) => (
                    <Link
                      className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                      href={`${item.href}?codigo=${encodeURIComponent(
                        createdLead.id,
                      )}`}
                      key={item.href}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        <Card className="mt-8 p-6">
          <form className="grid gap-5" onSubmit={submitLead}>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Nombre">
                <Input
                  autoComplete="name"
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
                <Input
                  autoComplete="tel"
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
              <Input
                autoComplete="off"
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
              <p className="mt-2 text-xs font-semibold text-zinc-500">
                Ejemplo: 001-010101-0000A
              </p>
              <FieldError message={errors.cedula} />
            </Field>

            <Field label="Correo opcional">
              <Input
                autoComplete="email"
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

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Moto de interés">
                <Select
                  id="lead-moto"
                  name="motoInteres"
                  onChange={(value) => updateValue("motoSlug", value)}
                  required
                  value={values.motoSlug}
                >
                  <option value="">Selecciona una moto</option>
                  {motorcycles.map((motorcycle) => (
                    <option key={motorcycle.slug} value={motorcycle.slug}>
                      {motorcycle.name}
                    </option>
                  ))}
                </Select>
                <FieldError message={errors.motoSlug} />
              </Field>

              <Field label="Sucursal donde desea ser atendido">
                <Select
                  id="lead-sucursal"
                  name="sucursalDeseada"
                  onChange={(value) =>
                    updateValue("sucursalDeseada", value as DesiredBranchId | "")
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
                </Select>
                <FieldError message={errors.sucursalDeseada} />
              </Field>
            </div>

            <Field label="Canal de origen">
              <Select
                id="lead-canal"
                name="canalOrigen"
                onChange={(value) =>
                  updateValue("canalOrigen", value as LeadOriginChannel | "")
                }
                value={values.canalOrigen}
              >
                <option value="">No especificado</option>
                {leadOriginChannels.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </Select>
              <FieldError message={errors.canalOrigen} />
            </Field>

            {error ? (
              <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm font-semibold text-red-200">
                {error}
              </div>
            ) : null}

            <Button className="h-12 w-full sm:w-auto" type="submit">
              <ClipboardList className="h-4 w-4" />
              Solicitar información
            </Button>
          </form>
        </Card>
      </div>

      <aside className="space-y-5">
        <Card className="p-6">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-red-500/15 text-red-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="mt-5 text-2xl font-black text-white">
            Cómo se registra
          </h2>
          <div className="mt-5 space-y-4">
            <SummaryLine label="Estado inicial" value="Solicitud recibida" />
            <SummaryLine label="Asesor" value="Pendiente de asignación" />
            <SummaryLine label="Destino" value="Sucursal seleccionada" />
            <SummaryLine label="Seguimiento" value="Proceso de sucursal" />
          </div>
        </Card>

        <Card className="p-6">
          <Badge tone="gray">Alcance</Badge>
          <p className="mt-4 text-sm leading-6 text-zinc-500">
            La sucursal revisará tu solicitud y continuará el seguimiento. La
            aprobación de crédito, reserva y disponibilidad se confirman durante
            el proceso comercial.
          </p>
        </Card>
      </aside>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
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

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p className="mt-2 text-xs font-semibold leading-5 text-red-300">
      {message}
    </p>
  );
}

function Select({
  className,
  children,
  id,
  name,
  onChange,
  value,
  required,
}: {
  className?: string;
  children: React.ReactNode;
  id?: string;
  name?: string;
  onChange: (value: string) => void;
  value: string;
  required?: boolean;
}) {
  return (
    <select
      className={cn(
        "h-12 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm font-semibold text-zinc-100 outline-none transition focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15",
        className,
      )}
      id={id}
      name={name}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      value={value}
    >
      {children}
    </select>
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
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.key.length > 1
  ) {
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

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="max-w-[220px] text-right text-sm font-black text-white">
        {value}
      </span>
    </div>
  );
}
