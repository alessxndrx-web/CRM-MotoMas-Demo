"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import type { OperationRole } from "@/features/operations/types";
import {
  ticketCategoryOptions,
  ticketImpactOptions,
  ticketModulesForRole,
  type TicketCategoryValue,
  type TicketImpactValue,
  type TicketModuleValue,
} from "@/features/operations/modules/tickets/ticket-ui";
import { createTicketAction } from "@/server/tickets/actions";

const selectClassName =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
const textareaClassName =
  "min-h-32 w-full resize-y rounded-md border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

type TicketFormState = {
  title: string;
  category: TicketCategoryValue;
  description: string;
  impact: TicketImpactValue;
  module: TicketModuleValue;
  subcategory: string;
  relatedReference: string;
  errorCode: string;
  sourceRoute: string;
};

export function TicketCreateForm({
  role,
  branchName,
  initialErrorCode,
  initialSourceRoute,
}: {
  role: OperationRole;
  branchName: string;
  initialErrorCode: string;
  initialSourceRoute: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TicketFormState>({
    title: "",
    category: "ERROR_DEL_SISTEMA",
    description: "",
    impact: "AFECTA_UNA_TAREA",
    module: "GENERAL",
    subcategory: "",
    relatedReference: "",
    errorCode: initialErrorCode,
    sourceRoute: initialSourceRoute,
  });
  const modules = ticketModulesForRole(role);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTicketAction({
        title: form.title,
        category: form.category,
        description: form.description,
        impact: form.impact,
        subcategory: form.subcategory || null,
        relatedEntityType: form.module,
        relatedEntityId: form.relatedReference || null,
        errorCode: form.errorCode || null,
        sourceRoute: form.sourceRoute || null,
      });
      if (!result.ok) {
        setError(
          "No pudimos registrar el ticket. Revisa los campos e inténtalo nuevamente.",
        );
        return;
      }
      router.push(
        `/panel/ayuda/tickets/${encodeURIComponent(result.code)}?creado=1`,
      );
      router.refresh();
    });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <Card className="p-5 sm:p-6">
        <FormSection
          description="Cuéntanos qué ocurrió en lenguaje sencillo. Soporte asignará la prioridad técnica según el impacto."
          title="Información principal"
        >
          <Field className="sm:col-span-2" label="Título" required>
            <Input
              autoComplete="off"
              maxLength={160}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Ej. No puedo completar una reserva"
              required
              value={form.title}
            />
          </Field>

          <Field label="Categoría" required>
            <select
              className={selectClassName}
              onChange={(event) =>
                setForm({
                  ...form,
                  category: event.target.value as TicketCategoryValue,
                })
              }
              required
              value={form.category}
            >
              {ticketCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Impacto" required>
            <select
              className={selectClassName}
              onChange={(event) =>
                setForm({
                  ...form,
                  impact: event.target.value as TicketImpactValue,
                })
              }
              required
              value={form.impact}
            >
              {ticketImpactOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Módulo relacionado" required>
            <select
              className={selectClassName}
              onChange={(event) =>
                setForm({
                  ...form,
                  module: event.target.value as TicketModuleValue,
                })
              }
              required
              value={form.module}
            >
              {modules.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Subcategoría" hint="Opcional">
            <Input
              autoComplete="off"
              maxLength={120}
              onChange={(event) =>
                setForm({ ...form, subcategory: event.target.value })
              }
              placeholder="Ej. Inicio de sesión"
              value={form.subcategory}
            />
          </Field>

          <Field className="sm:col-span-2" label="¿Qué ocurrió?" required>
            <textarea
              className={textareaClassName}
              maxLength={8000}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
              placeholder="Describe lo que intentabas hacer, los pasos seguros que seguiste y el resultado que viste."
              required
              value={form.description}
            />
          </Field>
        </FormSection>
      </Card>

      <Card className="p-5 sm:p-6">
        <FormSection
          description="Estos datos ayudan a ubicar el contexto sin consultar automáticamente registros comerciales o financieros."
          title="Contexto opcional"
        >
          <Field
            label="Referencia del registro"
            hint="Usa solo un código visible, nunca datos privados del cliente."
          >
            <Input
              autoComplete="off"
              maxLength={160}
              onChange={(event) =>
                setForm({ ...form, relatedReference: event.target.value })
              }
              placeholder="Ej. EXP-2026-001"
              value={form.relatedReference}
            />
          </Field>

          <Field label="Código de error" hint="Opcional; no pegues una traza técnica.">
            <Input
              autoComplete="off"
              maxLength={160}
              onChange={(event) =>
                setForm({ ...form, errorCode: event.target.value })
              }
              placeholder="Ej. RESERVA-409"
              value={form.errorCode}
            />
          </Field>

          <Field className="sm:col-span-2" label="Ruta donde ocurrió" hint="Contexto de navegación; puedes corregirlo o dejarlo vacío.">
            <Input
              autoComplete="off"
              maxLength={300}
              onChange={(event) =>
                setForm({ ...form, sourceRoute: event.target.value })
              }
              placeholder="/panel/reservas"
              value={form.sourceRoute}
            />
          </Field>

          <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Sucursal del ticket
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{branchName}</p>
            <p className="mt-1 text-xs text-slate-500">
              Se obtiene de tu sesión y no puede cambiarse desde este formulario.
            </p>
          </div>
        </FormSection>
      </Card>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            No incluyas contraseñas, tokens, cookies, datos de <code>.env</code>,
            números completos de tarjeta, CVV ni trazas técnicas. El sistema aplica
            enmascaramiento preventivo, pero no reemplaza una herramienta DLP.
          </p>
        </div>
      </div>

      {error ? (
        <div
          aria-live="polite"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          href="/panel/ayuda"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a ayuda
        </Link>
        <Button disabled={pending} type="submit">
          <Send className="h-4 w-4" />
          {pending ? "Enviando…" : "Enviar ticket"}
        </Button>
      </div>
    </form>
  );
}
