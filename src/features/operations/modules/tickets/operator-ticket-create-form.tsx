"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Send } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  ticketCategoryOptions,
  ticketImpactOptions,
  ticketModuleOptions,
  ticketPriorityOptions,
  ticketScopeOptions,
} from "@/features/operations/modules/tickets/ticket-ui";
import { createOperatorTicketAction } from "@/server/tickets/operator-actions";
import type {
  CreateOperatorTicketInput,
  OperatorTicketOptionsDTO,
} from "@/server/tickets/types";

const selectClass =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
const textareaClass =
  "min-h-28 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

type FormState = {
  title: string;
  description: string;
  category: CreateOperatorTicketInput["category"];
  subcategory: string;
  impact: CreateOperatorTicketInput["impact"];
  priority: "" | NonNullable<CreateOperatorTicketInput["priority"]>;
  scope: CreateOperatorTicketInput["scope"];
  branchCode: string;
  requesterEmail: string;
  module: string;
  relatedReference: string;
  sourceRoute: string;
  errorCode: string;
};

export function OperatorTicketCreateForm({
  options,
}: {
  options: OperatorTicketOptionsDTO;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    category: "ERROR_DEL_SISTEMA",
    subcategory: "",
    impact: "AFECTA_UNA_TAREA",
    priority: "",
    scope: "USER",
    branchCode: "",
    requesterEmail: "",
    module: "",
    relatedReference: "",
    sourceRoute: "",
    errorCode: "",
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createOperatorTicketAction({
        title: form.title,
        description: form.description,
        category: form.category,
        subcategory: form.subcategory || null,
        impact: form.impact,
        priority: form.priority || null,
        scope: form.scope,
        branchCode: form.branchCode || null,
        requesterEmail: form.requesterEmail || null,
        relatedEntityType: form.module || null,
        relatedEntityReference: form.relatedReference || null,
        sourceRoute: form.sourceRoute || null,
        errorCode: form.errorCode || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/panel/soporte/tickets/${encodeURIComponent(result.code)}?creado=1`);
      router.refresh();
    });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <Card className="p-5 sm:p-6">
        <FormSection
          description="El operador clasifica el alcance. La identidad creadora y el rol se toman de la sesión autenticada."
          title="Incidente de soporte"
        >
          <Field className="sm:col-span-2" label="Título" required>
            <Input
              maxLength={160}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
              value={form.title}
            />
          </Field>
          <Field label="Categoría" required>
            <select
              className={selectClass}
              onChange={(event) =>
                setForm({ ...form, category: event.target.value as FormState["category"] })
              }
              value={form.category}
            >
              {ticketCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Subcategoría">
            <Input
              maxLength={120}
              onChange={(event) => setForm({ ...form, subcategory: event.target.value })}
              value={form.subcategory}
            />
          </Field>
          <Field label="Impacto" required>
            <select
              className={selectClass}
              onChange={(event) =>
                setForm({ ...form, impact: event.target.value as FormState["impact"] })
              }
              value={form.impact}
            >
              {ticketImpactOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Prioridad técnica" hint="Opcional; por defecto se deriva del impacto.">
            <select
              className={selectClass}
              onChange={(event) =>
                setForm({ ...form, priority: event.target.value as FormState["priority"] })
              }
              value={form.priority}
            >
              <option value="">Derivada del impacto</option>
              {ticketPriorityOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field className="sm:col-span-2" label="Descripción" required>
            <textarea
              className={textareaClass}
              maxLength={8000}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              required
              value={form.description}
            />
          </Field>
        </FormSection>
      </Card>

      <Card className="p-5 sm:p-6">
        <FormSection
          description="USER es personal; BRANCH afecta una sucursal; MODULE afecta un módulo; GLOBAL representa una incidencia de todo el sistema."
          title="Clasificación de alcance"
        >
          <Field label="Alcance" required>
            <select
              className={selectClass}
              onChange={(event) =>
                setForm({ ...form, scope: event.target.value as FormState["scope"] })
              }
              value={form.scope}
            >
              {ticketScopeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>

          {form.scope === "USER" ? (
            <Field label="Solicitante" required>
              <select
                className={selectClass}
                onChange={(event) => setForm({ ...form, requesterEmail: event.target.value })}
                required
                value={form.requesterEmail}
              >
                <option value="">Seleccionar usuario activo</option>
                {options.requesters.map((user) => (
                  <option key={user.email} value={user.email}>
                    {user.label} · {user.roleLabel}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {form.scope === "BRANCH" || form.scope === "MODULE" ? (
            <Field
              label="Sucursal"
              required={form.scope === "BRANCH"}
              hint={form.scope === "MODULE" ? "Opcional para incidentes transversales." : undefined}
            >
              <select
                className={selectClass}
                onChange={(event) => setForm({ ...form, branchCode: event.target.value })}
                required={form.scope === "BRANCH"}
                value={form.branchCode}
              >
                <option value="">Sin sucursal específica</option>
                {options.branches.map((branch) => (
                  <option key={branch.code} value={branch.code}>{branch.label}</option>
                ))}
              </select>
            </Field>
          ) : null}

          {form.scope === "MODULE" ? (
            <Field label="Módulo" required>
              <select
                className={selectClass}
                onChange={(event) => setForm({ ...form, module: event.target.value })}
                required
                value={form.module}
              >
                <option value="">Seleccionar módulo</option>
                {ticketModuleOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
          ) : null}

          <Field label="Referencia opaca" hint="Código visible; no se consulta el registro de negocio.">
            <Input
              maxLength={160}
              onChange={(event) => setForm({ ...form, relatedReference: event.target.value })}
              value={form.relatedReference}
            />
          </Field>
          <Field label="Ruta segura">
            <Input
              maxLength={300}
              onChange={(event) => setForm({ ...form, sourceRoute: event.target.value })}
              placeholder="/panel/..."
              value={form.sourceRoute}
            />
          </Field>
          <Field label="Código de error">
            <Input
              maxLength={160}
              onChange={(event) => setForm({ ...form, errorCode: event.target.value })}
              value={form.errorCode}
            />
          </Field>
        </FormSection>
      </Card>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          No incluyas credenciales, cookies, valores de entorno, datos de pago ni trazas crudas.
        </div>
      </div>
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700" role="alert">{error}</div> : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700" href="/panel/soporte/tickets">
          <ArrowLeft className="h-4 w-4" /> Volver a la bandeja
        </Link>
        <Button disabled={pending} type="submit">
          <Send className="h-4 w-4" /> {pending ? "Creando…" : "Crear ticket operativo"}
        </Button>
      </div>
    </form>
  );
}
