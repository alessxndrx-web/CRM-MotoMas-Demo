"use client";

import Link from "next/link";
import {
  Building2,
  Database,
  ListChecks,
  RotateCcw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { desiredBranches } from "@/data/operations/leads";
import { getUsersByRole, operationRoles } from "@/data/operations/users";
import { resetDemoData } from "@/features/operations/services/demo-data-reset-service";
import {
  readDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";

const businessRules = [
  "Los clientes pertenecen a MotoMas, no a los vendedores. La información se conserva ante cambios de cartera.",
  "La asignación de leads es manual: el lead entra a la bandeja de la sucursal y el gerente asigna vendedor.",
  "Cada expediente conserva un solo seguimiento de crédito activo en esta fase de demo.",
  "Caja emite documentos operativos; Contabilidad revisa, contabiliza y concilia.",
  "El costo de inventario es visible para Contador y Administrador; el Gerente solo ve su sucursal.",
];

const dataScopes = [
  { label: "Solicitudes y leads", detail: "Bandeja de leads y solicitudes públicas." },
  { label: "Clientes y expedientes", detail: "Fichas de cliente y expedientes comerciales." },
  { label: "Actividades y proformas", detail: "Agenda comercial y proformas por expediente." },
  { label: "Inventario y traslados", detail: "Unidades, movimientos y órdenes de traslado." },
  { label: "Reservas y ventas", detail: "Reservas de unidades, ventas y entregas." },
  { label: "Créditos y documentos", detail: "Seguimiento de crédito y checklist documental." },
  { label: "Caja", detail: "Facturas, recibos, notas y cierres emitidos por Caja." },
  { label: "Contabilidad", detail: "Documentos, diarios, comprobantes, bancos y cierres contables." },
];

const auditNotes = [
  "Esta es una demo local: la información se guarda en este navegador y no en una base de datos central.",
  "No hay autenticación real, control de sesión del servidor ni revocación de accesos.",
  "El reinicio de datos demo es destructivo y solo afecta este navegador.",
  "La gestión real de usuarios, roles, permisos y sucursales queda para una fase con base de datos y autenticación.",
];

export function SettingsPanel() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [wasReset, setWasReset] = useState(false);

  useEffect(() => {
    setSession(readDemoSession());
    return subscribeToDemoSession(() => setSession(readDemoSession()));
  }, []);

  if (!session) {
    return (
      <Card className="p-8 text-center">
        <Database className="mx-auto h-10 w-10 text-zinc-600" />
        <h2 className="mt-4 text-2xl font-black text-white">
          Sesión interna requerida
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          Inicia sesión demo como Administrador para acceder a configuración.
        </p>
        <Link
          className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(239,35,45,0.24)] transition hover:bg-red-500"
          href="/panel"
        >
          Ir a inicio de sesión
        </Link>
      </Card>
    );
  }

  if (session.role !== "Administrador") {
    return (
      <Card className="p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-zinc-600" />
        <h2 className="mt-4 text-2xl font-black text-white">
          Configuración restringida
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          Esta zona de control global está disponible solo para Administrador.
        </p>
      </Card>
    );
  }

  function runReset() {
    if (confirmation !== "REINICIAR") return;
    resetDemoData();
    setWasReset(true);
    setConfirmation("");
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="gray">Configuración</Badge>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
              Administrador · Vista global
            </span>
          </div>
          <h2 className="mt-4 text-3xl font-black text-white">
            Configuración y control
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            Área administrativa para revisar usuarios, sucursales, reglas de
            negocio, alcances de datos y controles de seguridad de la demo.
          </p>
        </div>
      </div>

      {/* Users and branches */}
      <div className="grid gap-6 xl:grid-cols-2">
        <ConfigSection
          description="Roles internos demo. La gestión real de usuarios, contraseñas y permisos queda para una fase futura."
          icon={Users}
          title="Usuarios y roles"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {operationRoles.map((role) => (
              <div
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                key={role}
              >
                <span className="text-sm font-bold text-white">{role}</span>
                <Badge tone="gray">{getUsersByRole(role).length} demo</Badge>
              </div>
            ))}
          </div>
        </ConfigSection>

        <ConfigSection
          description="Sucursales de la operación. La administración real de sucursales se habilitará con base de datos."
          icon={Building2}
          title="Sucursales"
        >
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <span className="text-sm text-zinc-400">Sucursales configuradas</span>
            <span className="text-lg font-black text-white">{desiredBranches.length}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {desiredBranches.map((branch) => (
              <Badge key={branch.id} tone="gray">
                {branch.name}
              </Badge>
            ))}
          </div>
        </ConfigSection>
      </div>

      {/* Business rules */}
      <ConfigSection
        description="Reglas base que rigen la operación comercial y contable de la demo."
        icon={ScrollText}
        title="Reglas de negocio"
      >
        <ul className="grid gap-2">
          {businessRules.map((rule) => (
            <li
              className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-zinc-300"
              key={rule}
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              {rule}
            </li>
          ))}
        </ul>
      </ConfigSection>

      {/* Data scopes */}
      <ConfigSection
        description="Ámbitos de datos que administra la plataforma. Alcance técnico de la demo: se guardan localmente en este navegador."
        icon={ListChecks}
        title="Alcances de datos del sistema"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {dataScopes.map((scope) => (
            <div
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
              key={scope.label}
            >
              <div className="text-sm font-bold text-white">{scope.label}</div>
              <div className="mt-1 text-xs text-zinc-500">{scope.detail}</div>
            </div>
          ))}
        </div>
      </ConfigSection>

      {/* Audit / safety */}
      <ConfigSection
        description="Notas de auditoría y seguridad de la demo."
        icon={ShieldAlert}
        title="Auditoría y seguridad"
      >
        <ul className="grid gap-2">
          {auditNotes.map((note) => (
            <li
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-zinc-400"
              key={note}
            >
              {note}
            </li>
          ))}
        </ul>
      </ConfigSection>

      {/* Danger zone */}
      <Card className="border-red-500/30 bg-red-500/[0.06] p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Badge tone="red">Zona peligrosa</Badge>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <RotateCcw className="h-5 w-5 text-red-300" />
              <h3 className="text-xl font-black text-white">Reiniciar datos demo</h3>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
              Esta acción es <strong className="text-red-200">destructiva e irreversible</strong>.
              Elimina solicitudes, clientes, expedientes, inventario, traslados,
              reservas, ventas, actividades, proformas, documentos, créditos y los
              registros de Caja y Contabilidad de este navegador, y cierra la sesión
              interna. No afecta ninguna base de datos real.
            </p>
          </div>
          <Badge tone="gray">Solo Administrador</Badge>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
              Escribe REINICIAR para confirmar
            </span>
            <input
              className="h-12 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm font-semibold text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15"
              onChange={(event) => {
                setWasReset(false);
                setConfirmation(event.target.value.toUpperCase());
              }}
              placeholder="Escribe REINICIAR"
              value={confirmation}
            />
          </label>
          <Button
            disabled={confirmation !== "REINICIAR"}
            onClick={runReset}
            type="button"
            variant="danger"
          >
            <RotateCcw className="h-4 w-4" />
            Reiniciar demo
          </Button>
        </div>

        {wasReset ? (
          <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-4 text-sm font-semibold text-emerald-200">
            Datos demo reiniciados. La sesión interna fue cerrada.
          </div>
        ) : null}
      </Card>
    </section>
  );
}

function ConfigSection({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-zinc-300">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-lg font-black text-white">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-zinc-500">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  );
}
