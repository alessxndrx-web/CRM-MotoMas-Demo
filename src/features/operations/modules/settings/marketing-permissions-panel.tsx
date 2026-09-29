"use client";

import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/feedback";
import { MultiSelectList } from "@/features/operations/components/multi-select-list";
import { setDelegatedPermissionAction } from "@/server/permissions/actions";
import {
  delegatedPermissionHints,
  delegatedPermissionLabels,
  delegatedPermissionValues,
  type DelegatedPermissionValue,
  type GrantMode,
  type MarketingUserGrantsDTO,
} from "@/server/permissions/shared";

/**
 * Patch CRM-INT1 — qué puede modificar cada usuario de Marketing, y dónde.
 *
 * El rol MARKETING da **visibilidad global** (campañas de todas las sucursales
 * y la visión comercial de sólo lectura). Editar es otra cosa y se concede
 * aquí, por usuario, permiso y sucursal: campañas, reportes de leads e
 * integración con Meta. **Nadie empieza con permisos de edición** (Patch
 * CRM-INT2 retiró las concesiones globales que CRM-INT1 sembraba).
 *
 * La decisión se aplica en el servidor: cada acción de Marketing la vuelve a
 * leer de la base. Esta pantalla sólo la edita.
 */
export function MarketingPermissionsPanel({
  branches,
  users,
}: {
  branches: Array<{ code: string; name: string }>;
  users: MarketingUserGrantsDTO[];
}) {
  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <KeyRound aria-hidden className="h-5 w-5 text-slate-400" />
        Permisos de Marketing
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Marketing ve todas las sucursales. Aquí decides quién puede además crear
        o editar campañas y reportar leads, y en qué sucursales.
      </p>
      {users.length ? (
        <div className="mt-5 space-y-4">
          {users.map((user) => (
            <UserGrants branches={branches} key={user.userId} user={user} />
          ))}
        </div>
      ) : (
        <div className="mt-5">
          <EmptyState
            description="Crea un usuario con rol Marketing para asignarle permisos."
            icon={KeyRound}
            title="No hay usuarios de Marketing"
          />
        </div>
      )}
    </Card>
  );
}

function UserGrants({
  branches,
  user,
}: {
  branches: Array<{ code: string; name: string }>;
  user: MarketingUserGrantsDTO;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-slate-900">{user.name}</p>
        <span className="text-xs text-slate-500">{user.email}</span>
        {user.isActive ? null : <Badge tone="gray">Inactivo</Badge>}
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {delegatedPermissionValues.map((permission) => (
          <GrantEditor
            branches={branches}
            key={permission}
            permission={permission}
            userId={user.userId}
            value={user.grants[permission]}
          />
        ))}
      </div>
    </div>
  );
}

function GrantEditor({
  branches,
  permission,
  userId,
  value,
}: {
  branches: Array<{ code: string; name: string }>;
  permission: DelegatedPermissionValue;
  userId: string;
  value: { mode: GrantMode; branchCodes: string[] };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<GrantMode>(value.mode);
  const [codes, setCodes] = useState<string[]>(value.branchCodes);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const name = `${userId}-${permission}`;

  const dirty =
    mode !== value.mode ||
    (mode === "BRANCHES" &&
      (codes.length !== value.branchCodes.length ||
        codes.some((code) => !value.branchCodes.includes(code))));

  function save() {
    setError("");
    setSaved(false);
    startTransition(async () => {
      const result = await setDelegatedPermissionAction({
        userId,
        permission,
        mode,
        branchCodes: mode === "BRANCHES" ? codes : [],
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <fieldset className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-800">
        {delegatedPermissionLabels[permission]}
      </legend>
      <p className="text-xs text-slate-500">{delegatedPermissionHints[permission]}</p>
      <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-700">
        {(
          [
            ["NONE", "Sin permiso"],
            ["ALL", "Todas las sucursales"],
            ["BRANCHES", "Sucursales específicas"],
          ] as const
        ).map(([option, label]) => (
          <label className="flex items-center gap-2" key={option}>
            <input
              checked={mode === option}
              name={name}
              onChange={() => setMode(option)}
              type="radio"
            />
            {label}
          </label>
        ))}
      </div>
      {mode === "BRANCHES" ? (
        <div className="mt-3">
          <MultiSelectList
            label="Sucursales permitidas"
            onChange={setCodes}
            options={branches.map((branch) => ({ value: branch.code, label: branch.name }))}
            searchPlaceholder="Buscar sucursal"
            selected={codes}
          />
        </div>
      ) : null}
      {error ? (
        <div className="mt-2">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-3">
        <Button disabled={pending || !dirty} onClick={save} size="sm">
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        {saved && !dirty ? <span className="text-xs text-emerald-700">Guardado.</span> : null}
      </div>
    </fieldset>
  );
}
