"use client";

import { useRouter } from "next/navigation";
import { LogIn, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DesiredBranchId } from "@/data/operations/leads";
import {
  demoInternalUsers,
  getBranchesWithUsers,
  getDefaultRouteForSession,
  getUsersByRoleAndBranch,
  operationRoles,
} from "@/data/operations/users";
import {
  clearDemoSession,
  readDemoSession,
  saveDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
import type { DemoSession, OperationRole } from "@/features/operations/types";
import { cn } from "@/lib/utils";

export function DemoSessionLogin() {
  const router = useRouter();
  const [session, setSession] = useState<DemoSession | null>(null);
  const [role, setRole] = useState<OperationRole>("Gerente");
  const branchOptions = useMemo(() => getBranchesWithUsers(role), [role]);
  const [branchId, setBranchId] = useState<DesiredBranchId | "">("plaza-inter");
  const isGlobalRole = role === "Administrador" || role === "Contador";

  useEffect(() => {
    setSession(readDemoSession());
    return subscribeToDemoSession(() => setSession(readDemoSession()));
  }, []);

  useEffect(() => {
    if (role === "Administrador" || role === "Contador") {
      setBranchId("");
      return;
    }

    const firstBranch = getBranchesWithUsers(role)[0];
    setBranchId(firstBranch?.id ?? "");
  }, [role]);

  const selectedUser = useMemo(() => {
    if (role === "Administrador" || role === "Contador") {
      return (
        demoInternalUsers.find((user) => user.role === role) ?? null
      );
    }

    if (!branchId) return null;
    return getUsersByRoleAndBranch(role, branchId)[0] ?? null;
  }, [branchId, role]);

  function startSession() {
    if (!selectedUser) return;

    saveDemoSession(selectedUser);
    router.push(getDefaultRouteForSession(selectedUser));
  }

  function resetSession() {
    clearDemoSession();
    setSession(null);
  }

  return (
    <section className="mx-auto max-w-[980px] py-8">
      <div className="mb-8">
        <Badge tone="red">Sesión interna demo</Badge>
        <h2 className="mt-4 text-3xl font-black text-slate-900">
          Centro de Operaciones MotoMas
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Selecciona un rol interno para operar la demo por sucursal. El rol
          Cliente pertenece al Portal Cliente y no aparece en este acceso.
        </p>
      </div>

      {session ? (
        <Card className="mb-6 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-red-50 text-red-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <Badge tone="green">Sesión activa</Badge>
                <h3 className="mt-3 text-xl font-black text-slate-900">
                  {session.userName}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {session.role} / {session.branchName}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => router.push(getDefaultRouteForSession(session))}
              >
                Continuar
              </Button>
              <Button onClick={resetSession} variant="secondary">
                <RotateCcw className="h-4 w-4" />
                Cambiar sesión
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-6">
        <div className="grid gap-6">
          <div className="grid gap-3 md:grid-cols-5">
            {operationRoles.map((item) => (
              <button
                className={cn(
                  "rounded-2xl border px-5 py-4 text-left transition",
                  role === item
                    ? "border-red-200 bg-red-50 text-slate-900"
                    : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                )}
                key={item}
                onClick={() => setRole(item)}
                type="button"
              >
                <span className="block text-sm font-black">{item}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  {roleCopy[item]}
                </span>
              </button>
            ))}
          </div>

          {!isGlobalRole ? (
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                Sucursal operativa
              </span>
              <select
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                onChange={(event) =>
                  setBranchId(event.target.value as DesiredBranchId)
                }
                value={branchId}
              >
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-sm font-black text-slate-900">
                {role === "Contador" ? "Área contable habilitada" : "Vista global habilitada"}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {role === "Contador"
                  ? "El Contador accede únicamente a contabilidad, costos internos, diarios, comprobantes, documentos, gastos, planilla y reportes contables."
                  : "El Administrador General puede supervisar todas las sucursales, pero la asignación operativa diaria se mantiene orientada al Gerente."}
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              Usuario demo
            </div>
            <div className="mt-2 text-lg font-black text-slate-900">
              {selectedUser?.userName ?? "Sin usuario disponible"}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {selectedUser
                ? `${selectedUser.role} / ${selectedUser.branchName}`
                : "Selecciona una sucursal con usuario demo."}
            </div>
          </div>

          <Button
            className="h-12 w-full sm:w-auto"
            disabled={!selectedUser}
            onClick={startSession}
          >
            <LogIn className="h-4 w-4" />
            Iniciar sesión demo
          </Button>
        </div>
      </Card>
    </section>
  );
}

const roleCopy: Record<OperationRole, string> = {
  Vendedor: "Atención diaria y seguimiento de sus leads.",
  Gerente: "Asignación y supervisión de su sucursal.",
  Administrador: "Vista global de supervisión.",
  Contador: "Área contable separada y costos internos.",
  Cajero: "Emisión operativa de documentos y cierres.",
};
