"use client";

import { useRouter } from "next/navigation";
import { Building2, Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/feedback";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { createBranchAction, updateBranchAction } from "@/server/branches/actions";
import type { BranchAdminDTO } from "@/server/branches/shared";

/**
 * Patch CRM-INT1 — administración de sucursales.
 *
 * Las sucursales sólo entraban por el seed. Aquí el Administrador las da de
 * alta, las renombra y las desactiva. **No se borran**: todo lo que ocurrió en
 * una sucursal sigue apuntando a ella. Desactivarla la saca de los selectores
 * de registros nuevos, y el servidor no lo permite mientras tenga usuarios
 * activos.
 *
 * El código se deriva del nombre al crearla y no cambia nunca: viaja en la
 * sesión y en los enlaces.
 */
export function BranchAdminPanel({ branches }: { branches: BranchAdminDTO[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", address: "", phone: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", address: "", phone: "" });

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la acción.");
        return;
      }
      setMessage(done);
      after?.();
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Building2 aria-hidden className="h-5 w-5 text-slate-400" />
            Sucursales
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            De aquí salen los selectores de sucursal de clientes, leads,
            expedientes, campañas e inventario.
          </p>
        </div>
        {creating ? null : (
          <Button onClick={() => setCreating(true)} size="sm">
            <Plus aria-hidden className="h-4 w-4" />
            Nueva sucursal
          </Button>
        )}
      </div>

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

      {creating ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <FormSection
            description="El código se genera del nombre y no cambia después."
            title="Nueva sucursal"
          >
            <Field label="Nombre" required>
              <Input
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                value={draft.name}
              />
            </Field>
            <Field hint="Opcional" label="Teléfono">
              <Input
                inputMode="tel"
                onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                value={draft.phone}
              />
            </Field>
            <Field className="sm:col-span-2" hint="Opcional" label="Dirección">
              <Input
                onChange={(event) => setDraft({ ...draft, address: event.target.value })}
                value={draft.address}
              />
            </Field>
          </FormSection>
          <div className="mt-4 flex gap-2">
            <Button
              disabled={pending || !draft.name.trim()}
              onClick={() =>
                run(
                  () => createBranchAction(draft),
                  "Sucursal creada.",
                  () => {
                    setDraft({ name: "", address: "", phone: "" });
                    setCreating(false);
                  },
                )
              }
            >
              {pending ? "Guardando…" : "Crear sucursal"}
            </Button>
            <Button onClick={() => setCreating(false)} variant="secondary">
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Sucursal</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 text-right font-semibold">Usuarios activos</th>
              <th className="px-4 py-3 text-right font-semibold">Clientes</th>
              <th className="px-4 py-3 text-right font-semibold">Unidades disponibles</th>
              <th className="px-4 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {branches.map((branch) =>
              editing === branch.code ? (
                <tr key={branch.code}>
                  <td className="bg-slate-50 px-4 py-4" colSpan={6}>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Nombre" required>
                        <Input
                          onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
                          value={editDraft.name}
                        />
                      </Field>
                      <Field label="Teléfono">
                        <Input
                          onChange={(event) => setEditDraft({ ...editDraft, phone: event.target.value })}
                          value={editDraft.phone}
                        />
                      </Field>
                      <Field label="Dirección">
                        <Input
                          onChange={(event) => setEditDraft({ ...editDraft, address: event.target.value })}
                          value={editDraft.address}
                        />
                      </Field>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        disabled={pending || !editDraft.name.trim()}
                        onClick={() =>
                          run(
                            () =>
                              updateBranchAction({
                                code: branch.code,
                                ...editDraft,
                                isActive: branch.isActive,
                              }),
                            "Sucursal actualizada.",
                            () => setEditing(null),
                          )
                        }
                        size="sm"
                      >
                        Guardar
                      </Button>
                      <Button onClick={() => setEditing(null)} size="sm" variant="secondary">
                        Cancelar
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={branch.code}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{branch.name}</p>
                    <p className="font-mono text-xs text-slate-400">{branch.code}</p>
                    {branch.address || branch.phone ? (
                      <p className="text-xs text-slate-500">
                        {[branch.address, branch.phone].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={branch.isActive ? "green" : "gray"}>
                      {branch.isActive ? "Activa" : "Desactivada"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{branch.activeUsers}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{branch.customers}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{branch.availableUnits}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        onClick={() => {
                          setEditing(branch.code);
                          setEditDraft({
                            name: branch.name,
                            address: branch.address ?? "",
                            phone: branch.phone ?? "",
                          });
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        <Pencil aria-hidden className="h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              updateBranchAction({
                                code: branch.code,
                                name: branch.name,
                                address: branch.address,
                                phone: branch.phone,
                                isActive: !branch.isActive,
                              }),
                            branch.isActive ? "Sucursal desactivada." : "Sucursal reactivada.",
                          )
                        }
                        size="sm"
                        variant="secondary"
                      >
                        {branch.isActive ? "Desactivar" : "Reactivar"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
