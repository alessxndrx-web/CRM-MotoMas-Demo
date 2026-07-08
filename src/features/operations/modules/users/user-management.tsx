"use client";

import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isGlobalScopeRole } from "@/server/auth/access";
import { branchNameForCode, roleEnumToSpanish, type UserRoleEnum } from "@/server/auth/roles";
import { createUserAction } from "@/server/users/actions";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRoleEnum;
  branchCode: string | null;
  isActive: boolean;
};

type BranchOption = { code: string; name: string };

export function UserManagement({
  actorRole,
  branchOptions,
  creatableRoles,
  dbConfigured,
  lockedBranchCode,
  users,
}: {
  actorRole: UserRoleEnum;
  branchOptions: BranchOption[];
  creatableRoles: UserRoleEnum[];
  dbConfigured: boolean;
  lockedBranchCode: string | null;
  users: UserRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "error"; message: string } | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: creatableRoles[0] ?? "VENDEDOR",
    branchCode: lockedBranchCode ?? branchOptions[0]?.code ?? "",
    isActive: true,
  });

  const roleIsGlobal = isGlobalScopeRole(form.role);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);
    startTransition(async () => {
      const result = await createUserAction({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        branchCode: roleIsGlobal ? null : form.branchCode,
        isActive: form.isActive,
      });
      if (!result.ok) {
        setBanner({ tone: "error", message: result.error });
        return;
      }
      setBanner({ tone: "ok", message: "Usuario creado correctamente." });
      setForm((current) => ({ ...current, name: "", email: "", password: "" }));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
      <Card className="overflow-hidden">
        <div className="border-b border-white/10 p-5">
          <h3 className="text-lg font-black text-white">Usuarios</h3>
          <p className="text-xs text-zinc-500">
            {actorRole === "GERENTE"
              ? "Usuarios de tu sucursal."
              : "Todos los usuarios del sistema."}
          </p>
        </div>
        {users.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Nombre</th>
                  <th className="px-5 py-3">Correo</th>
                  <th className="px-5 py-3">Rol</th>
                  <th className="px-5 py-3">Sucursal</th>
                  <th className="px-5 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {users.map((user) => (
                  <tr className="hover:bg-white/[0.02]" key={user.id}>
                    <td className="px-5 py-4 font-bold text-white">{user.name}</td>
                    <td className="px-5 py-4 font-mono text-xs text-zinc-400">{user.email}</td>
                    <td className="px-5 py-4 text-zinc-300">{roleEnumToSpanish[user.role]}</td>
                    <td className="px-5 py-4 text-zinc-400">
                      {user.branchCode ? branchNameForCode(user.branchCode) : "Global"}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={user.isActive ? "green" : "gray"}>
                        {user.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-sm leading-6 text-zinc-500">
            No hay usuarios en este alcance todavía.
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-500/15 text-red-300">
            <UserPlus className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-black text-white">Crear usuario</h3>
            <p className="text-xs text-zinc-500">
              {actorRole === "GERENTE"
                ? "Solo Vendedores de tu sucursal."
                : "Cualquier rol y sucursal."}
            </p>
          </div>
        </div>

        {!dbConfigured ? (
          <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-100">
            La creación de usuarios requiere una base de datos configurada
            (<code>DATABASE_URL</code>). En modo demo la lista es de solo lectura.
          </div>
        ) : null}

        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <Field label="Nombre">
            <input
              className={inputClass}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
              value={form.name}
            />
          </Field>
          <Field label="Correo">
            <input
              className={inputClass}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
              type="email"
              value={form.email}
            />
          </Field>
          <Field label="Contraseña">
            <input
              className={inputClass}
              minLength={8}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="Mínimo 8 caracteres"
              required
              type="password"
              value={form.password}
            />
          </Field>
          <Field label="Rol">
            <select
              className={inputClass}
              disabled={creatableRoles.length <= 1}
              onChange={(event) =>
                setForm({ ...form, role: event.target.value as UserRoleEnum })
              }
              value={form.role}
            >
              {creatableRoles.map((role) => (
                <option key={role} value={role}>{roleEnumToSpanish[role]}</option>
              ))}
            </select>
          </Field>
          <Field label="Sucursal">
            {roleIsGlobal ? (
              <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-zinc-400">
                Global (todas las sucursales)
              </div>
            ) : lockedBranchCode ? (
              <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-zinc-300">
                {branchNameForCode(lockedBranchCode)}
                <span className="ml-2 text-xs text-zinc-600">(fija por tu rol)</span>
              </div>
            ) : (
              <select
                className={inputClass}
                onChange={(event) => setForm({ ...form, branchCode: event.target.value })}
                value={form.branchCode}
              >
                {branchOptions.map((branch) => (
                  <option key={branch.code} value={branch.code}>{branch.name}</option>
                ))}
              </select>
            )}
          </Field>
          <label className="flex items-center gap-3 text-sm font-semibold text-zinc-300">
            <input
              checked={form.isActive}
              className="h-4 w-4 accent-red-500"
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              type="checkbox"
            />
            Usuario activo
          </label>

          {banner ? (
            <div
              className={
                banner.tone === "ok"
                  ? "rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200"
                  : "rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200"
              }
            >
              {banner.message}
            </div>
          ) : null}

          <Button disabled={pending || !dbConfigured} type="submit">
            <UserPlus className="h-4 w-4" />
            Crear usuario
          </Button>
        </form>
      </Card>
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm text-zinc-100 outline-none transition focus:border-red-500/70";

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}
