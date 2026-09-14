"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/fields";
import { Notice } from "@/components/ui/feedback";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  saveSupplierAction,
  setSupplierActiveAction,
} from "@/server/suppliers/actions";
import type { SupplierDTO } from "@/server/suppliers/queries";

/**
 * Patch CRM-QA1 — la pantalla de proveedores.
 *
 * **No hay modelo nuevo detrás.** Escribe `ThirdParty` con `type = PROVEEDOR`,
 * el mismo proveedor que Contabilidad ve en Terceros y que una orden de compra
 * referencia. Lo que faltaba era esto: una pantalla alcanzable por quien crea
 * órdenes de compra, en lugar de un CRUD encerrado tras el permiso contable.
 *
 * Desactivar en lugar de borrar: una orden de compra apunta al proveedor con
 * `onDelete: Restrict`, así que borrarlo destruiría el historial de compras o
 * sería imposible. Desactivado sale de los desplegables y conserva todo.
 */
export function SuppliersPanel({
  canManage,
  dbConfigured,
  scopeLabel,
  suppliers,
}: {
  canManage: boolean;
  dbConfigured: boolean;
  scopeLabel: string;
  suppliers: SupplierDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<SupplierDTO | null>(null);
  const [open, setOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [nombre, setNombre] = useState("");
  const [identificacion, setIdentificacion] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [notas, setNotas] = useState("");

  const visible = showInactive
    ? suppliers
    : suppliers.filter((supplier) => supplier.isActive);

  function startEdit(supplier: SupplierDTO) {
    setEditing(supplier);
    setNombre(supplier.name);
    setIdentificacion(supplier.taxId ?? "");
    setTelefono(supplier.phone ?? "");
    setCorreo(supplier.email ?? "");
    setNotas(supplier.notes ?? "");
    setOpen(true);
  }

  function startCreate() {
    setEditing(null);
    setNombre("");
    setIdentificacion("");
    setTelefono("");
    setCorreo("");
    setNotas("");
    setOpen(true);
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
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="green">Proveedores</Badge>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
            {scopeLabel}
          </span>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Truck className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-500">
        Los proveedores de las órdenes de compra. Son los mismos terceros que
        Contabilidad mantiene: darlos de alta aquí los deja disponibles en ambos
        sitios.
      </p>

      {!dbConfigured ? (
        <Notice className="mt-5" tone="warning">
          Esta sección requiere una base de datos configurada.
        </Notice>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {canManage ? (
              <Button onClick={startCreate} size="sm">
                <Plus aria-hidden className="h-4 w-4" />
                Nuevo proveedor
              </Button>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                checked={showInactive}
                className="sb-focus h-4 w-4 rounded border-slate-300"
                onChange={(event) => setShowInactive(event.target.checked)}
                type="checkbox"
              />
              Mostrar inactivos
            </label>
          </div>

          {open && canManage ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <FormSection
                description="El proveedor pertenece a la sucursal que lo registra."
                title={editing ? `Editar ${editing.name}` : "Nuevo proveedor"}
              >
                <Field label="Nombre" required>
                  <Input
                    onChange={(event) => setNombre(event.target.value)}
                    value={nombre}
                  />
                </Field>
                <Field label="Identificación fiscal (RUC)">
                  <Input
                    onChange={(event) => setIdentificacion(event.target.value)}
                    value={identificacion}
                  />
                </Field>
                <Field label="Teléfono">
                  <Input
                    onChange={(event) => setTelefono(event.target.value)}
                    value={telefono}
                  />
                </Field>
                <Field label="Correo">
                  <Input
                    onChange={(event) => setCorreo(event.target.value)}
                    type="email"
                    value={correo}
                  />
                </Field>
                <Field className="sm:col-span-2" label="Notas">
                  <Textarea
                    onChange={(event) => setNotas(event.target.value)}
                    rows={2}
                    value={notas}
                  />
                </Field>
              </FormSection>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  disabled={pending || !nombre.trim()}
                  onClick={() =>
                    run(
                      () =>
                        saveSupplierAction({
                          supplierId: editing?.id ?? null,
                          nombre,
                          identificacion,
                          telefono,
                          correo,
                          notas,
                        }),
                      editing ? "Proveedor actualizado." : "Proveedor registrado.",
                    )
                  }
                >
                  Guardar proveedor
                </Button>
                <Button onClick={() => setOpen(false)} variant="secondary">
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}

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

          <div className="mt-5 overflow-x-auto">
            <div className="min-w-[860px] overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-[1.4fr_1fr_1.2fr_0.8fr_auto] border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <div>Proveedor</div>
                <div>RUC</div>
                <div>Contacto</div>
                <div>Órdenes</div>
                <div className="text-right">Acciones</div>
              </div>

              {visible.length ? (
                visible.map((supplier) => (
                  <div
                    className="grid grid-cols-[1.4fr_1fr_1.2fr_0.8fr_auto] items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0"
                    key={supplier.id}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-slate-900">
                          {supplier.name}
                        </span>
                        {supplier.isActive ? null : (
                          <Badge tone="gray">Inactivo</Badge>
                        )}
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {supplier.branchName}
                      </div>
                    </div>
                    <div className="truncate text-sm text-slate-500">
                      {supplier.taxId ?? "—"}
                    </div>
                    <div className="min-w-0 text-sm text-slate-500">
                      <span className="block truncate">{supplier.phone ?? "—"}</span>
                      <span className="block truncate text-xs text-slate-400">
                        {supplier.email ?? ""}
                      </span>
                    </div>
                    <div className="text-sm text-slate-500">
                      {supplier.purchaseOrderCount}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {canManage ? (
                        <>
                          <Button
                            onClick={() => startEdit(supplier)}
                            size="sm"
                            variant="secondary"
                          >
                            Editar
                          </Button>
                          <Button
                            disabled={pending}
                            onClick={() =>
                              run(
                                () =>
                                  setSupplierActiveAction({
                                    supplierId: supplier.id,
                                    activo: !supplier.isActive,
                                  }),
                                supplier.isActive
                                  ? "Proveedor desactivado."
                                  : "Proveedor reactivado.",
                              )
                            }
                            size="sm"
                            variant={supplier.isActive ? "ghost" : "success"}
                          >
                            {supplier.isActive ? "Desactivar" : "Reactivar"}
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  action={
                    canManage ? (
                      <Button onClick={startCreate} size="sm">
                        <Plus aria-hidden className="h-4 w-4" />
                        Nuevo proveedor
                      </Button>
                    ) : null
                  }
                  description="Sin proveedores no se puede crear una orden de compra. Registra el primero."
                  icon={Truck}
                  title="Aún no hay proveedores"
                />
              )}
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-500">
            ¿Ya tienes proveedores?{" "}
            <Link
              className="sb-focus rounded font-semibold text-blue-700 hover:underline"
              href="/panel/pos/compras"
            >
              Ir a órdenes de compra
            </Link>
            .
          </p>
        </>
      )}
    </Card>
  );
}
