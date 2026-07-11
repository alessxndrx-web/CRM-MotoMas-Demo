"use client";

import { useRouter } from "next/navigation";
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
import { logoutAction } from "@/server/auth/actions";
import {
  ENABLE_DEMO_DATA_RESET,
  SHOW_TECHNICAL_LABELS,
} from "@/shared/feature-flags";

const businessRules = [
  "Los clientes pertenecen a MotoMas, no a los vendedores. La información se conserva ante cambios de cartera.",
  "La asignación de leads es manual: el lead entra a la bandeja de la sucursal y el gerente asigna vendedor.",
  "Cada expediente conserva un solo seguimiento de crédito activo en esta fase.",
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
  "El acceso al Centro de Operaciones requiere una sesión válida; las rutas privadas se validan en el servidor.",
  "Los permisos por rol y por sucursal se aplican tanto en la navegación como en cada acción.",
  "El reinicio de datos internos es destructivo: elimina la operación registrada en este navegador y cierra la sesión activa.",
  "Usuarios, sucursales e inventario de motocicletas ya operan en el sistema central; el resto de los módulos se completa en fases siguientes.",
];

const technicalAuditNotes = [
  "La sesión real usa una cookie firmada (HMAC); el espejo local (localStorage) solo sostiene los paneles aún no migrados.",
  "El reinicio de datos internos borra las claves de localStorage listadas abajo y no afecta PostgreSQL.",
];

export function SettingsPanel() {
  const router = useRouter();
  const [session, setSession] = useState<DemoSession | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [wasReset, setWasReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const syncSession = () => setSession(readDemoSession());
    queueMicrotask(syncSession);
    return subscribeToDemoSession(syncSession);
  }, []);

  if (!session) {
    return (
      <Card className="p-8 text-center">
        <Database className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="mt-4 text-xl font-semibold text-slate-900">
          Inicia sesión para continuar
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Inicia sesión como Administrador para acceder a configuración.
        </p>
        <Link
          className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
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
        <ShieldAlert className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="mt-4 text-xl font-semibold text-slate-900">
          Configuración restringida
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Esta zona de control global está disponible solo para Administrador.
        </p>
      </Card>
    );
  }

  async function runReset() {
    if (confirmation !== "REINICIAR") return;
    setResetting(true);
    resetDemoData();
    try {
      await logoutAction();
    } catch {
      // Best-effort: the local reset already ran.
    }
    setWasReset(true);
    setConfirmation("");
    router.push("/login");
    router.refresh();
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="gray">Configuración</Badge>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
              Administrador · Vista global
            </span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-slate-900">
            Configuración y control
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Área administrativa para revisar usuarios, sucursales, reglas de
            negocio, alcances de datos y controles de seguridad.
          </p>
        </div>
      </div>

      {/* Users and branches */}
      <div className="grid gap-6 xl:grid-cols-2">
        <ConfigSection
          description="Roles internos disponibles en la operación."
          icon={Users}
          title="Usuarios y roles"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {operationRoles.map((role) => (
              <div
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                key={role}
              >
                <span className="text-sm font-bold text-slate-900">{role}</span>
                <Badge tone="gray">{getUsersByRole(role).length}</Badge>
              </div>
            ))}
          </div>
        </ConfigSection>

        <ConfigSection
          description="Sucursales de la operación. La gestión completa de sucursales se habilitará en una fase siguiente."
          icon={Building2}
          title="Sucursales"
        >
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-sm text-slate-500">Sucursales configuradas</span>
            <span className="text-base font-semibold text-slate-900">{desiredBranches.length}</span>
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
        description="Reglas base que rigen la operación comercial y contable."
        icon={ScrollText}
        title="Reglas de negocio"
      >
        <ul className="grid gap-2">
          {businessRules.map((rule) => (
            <li
              className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600"
              key={rule}
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              {rule}
            </li>
          ))}
        </ul>
      </ConfigSection>

      {/* Data scopes */}
      <ConfigSection
        description={
          SHOW_TECHNICAL_LABELS
            ? "Ámbitos de datos que administra la plataforma. Alcance técnico: se guardan localmente en este navegador mientras se completa la migración."
            : "Ámbitos de datos que administra la plataforma."
        }
        icon={ListChecks}
        title="Alcances de datos del sistema"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {dataScopes.map((scope) => (
            <div
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              key={scope.label}
            >
              <div className="text-sm font-bold text-slate-900">{scope.label}</div>
              <div className="mt-1 text-xs text-slate-500">{scope.detail}</div>
            </div>
          ))}
        </div>
      </ConfigSection>

      {/* Audit / safety */}
      <ConfigSection
        description="Notas de auditoría y seguridad."
        icon={ShieldAlert}
        title="Auditoría y seguridad"
      >
        <ul className="grid gap-2">
          {[...auditNotes, ...(SHOW_TECHNICAL_LABELS ? technicalAuditNotes : [])].map((note) => (
            <li
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500"
              key={note}
            >
              {note}
            </li>
          ))}
        </ul>
      </ConfigSection>

      {/* Browser-only recovery control; hidden from normal production UI. */}
      {ENABLE_DEMO_DATA_RESET ? (
        <Card className="border-red-200 bg-red-50 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Badge tone="red">Zona peligrosa</Badge>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <RotateCcw className="h-5 w-5 text-red-700" />
              <h3 className="text-lg font-semibold text-slate-900">Reiniciar datos internos</h3>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Esta acción es <strong className="text-red-700">destructiva e irreversible</strong>.
              Elimina solicitudes, clientes, expedientes, inventario, traslados,
              reservas, ventas, actividades, proformas, documentos, créditos y los
              registros de Caja y Contabilidad de este navegador, y cierra la sesión
              activa. No afecta usuarios, sucursales ni inventario de motocicletas
              ya registrados en el sistema.
            </p>
          </div>
          <Badge tone="gray">Solo Administrador</Badge>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Escribe REINICIAR para confirmar
            </span>
            <input
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              onChange={(event) => {
                setWasReset(false);
                setConfirmation(event.target.value.toUpperCase());
              }}
              placeholder="Escribe REINICIAR"
              value={confirmation}
            />
          </label>
          <Button
            disabled={confirmation !== "REINICIAR" || resetting}
            onClick={runReset}
            type="button"
            variant="danger"
          >
            <RotateCcw className="h-4 w-4" />
            {resetting ? "Reiniciando…" : "Reiniciar"}
          </Button>
        </div>

        {wasReset ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
            Datos internos reiniciados. La sesión fue cerrada.
          </div>
        ) : null}
        </Card>
      ) : null}
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
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-600">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  );
}
