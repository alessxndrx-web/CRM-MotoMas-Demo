"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { PageContainer } from "@/components/ui/page-container";
import { getDefaultRouteForSession } from "@/data/operations/users";
import { OperationsRail } from "@/features/operations/components/operations-rail";
import { OperationsTopbar } from "@/features/operations/components/operations-topbar";
import {
  containerWidthFor,
  findNavGroupKey,
  findNavItem,
  navLabelForRole,
} from "@/features/operations/lib/nav-model";
import { navGroupLabelForRole, shellSubtitle } from "@/features/operations/lib/role-copy";
import {
  clearDemoSession,
  readDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
import type { DemoSession, OperationRole } from "@/features/operations/types";
import { logoutAction } from "@/server/auth/actions";

/**
 * Patch POS2.0-B — el chasis de la aplicación.
 *
 * ```text
 * ┌──────────────────────────────────────────────┐
 * │              BARRA DE CONTEXTO               │
 * ├────────────┬─────────────────────────────────┤
 * │            │                                 │
 * │   BARRA    │           CONTENIDO             │
 * │  LATERAL   │                                 │
 * └────────────┴─────────────────────────────────┘
 * ```
 *
 * Tres piezas, cada una en su archivo: `OperationsRail`, `OperationsTopbar` y el
 * contenido. Este componente solo las coloca y sostiene el estado del cajón.
 *
 * ## Lo que cambió respecto al chasis anterior
 *
 * **El desplazamiento.** La barra lateral era `fixed` y el contenido empujaba con
 * `padding-left`, así que la página entera se desplazaba por debajo de ella.
 * Ahora la rejilla ocupa exactamente la altura de la ventana y **solo el área de
 * contenido se desplaza**: la barra no se mueve porque no está en el flujo que
 * baja, no porque se la haya clavado encima.
 *
 * **El cajón del móvil.** Era un panel a mano, sin foco atrapado, sin Escape y
 * sin bloqueo del fondo. Ahora es el `Drawer` del sistema de diseño, que trae las
 * cuatro cosas de `overlay.tsx`.
 *
 * **La sesión llega ya resuelta.** El `layout` del servidor la calcula y la pasa
 * como prop. Antes el chasis arrancaba en `null` y la leía en un efecto, así que
 * la primera pintura no tenía navegación ni identidad y **la pantalla cambiaba
 * bajo el usuario al hidratar** — lo mismo que hacía frágil una prueba de
 * POS1.2-F. La suscripción se mantiene: cerrar sesión sigue avisando.
 *
 * ## Lo que no cambió
 *
 * Las cinco pantallas de restricción por rol, con su texto y su destino. Las
 * rutas. Los permisos. **Nada de esto es la frontera de seguridad**: cada página
 * del servidor autoriza por su cuenta.
 */
type OperationsShellProps = {
  children: ReactNode;
  /** Resuelta en el servidor. Evita la primera pintura sin identidad. */
  initialSession?: DemoSession | null;
};

function BrandMark() {
  return (
    <span className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg bg-navy">
        <span className="text-sm font-bold leading-none text-white">
          M<span className="text-orange-400">m</span>
        </span>
      </span>
      <span>
        <span className="block text-base font-semibold leading-tight text-slate-900">
          MotoMas
        </span>
        <span className="block text-xs text-slate-500">Centro de Operaciones</span>
      </span>
    </span>
  );
}

function RestrictedScreen({
  role,
  title,
  message,
  actionHref,
  actionLabel,
}: RestrictedScreenProps) {
  return (
    <div className="app-canvas min-h-screen text-slate-900">
      <main className="mx-auto max-w-[900px] px-4 py-16 sm:px-8">
        <Card className="overflow-hidden p-8 text-center">
          <Badge tone="slate">{role}</Badge>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">{title}</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            {message}
          </p>
          <Link
            className="sb-focus mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            href={actionHref}
          >
            {actionLabel}
          </Link>
        </Card>
      </main>
    </div>
  );
}

type RestrictedScreenProps = {
  role: string;
  title: string;
  message: string;
  actionHref: string;
  actionLabel: string;
};

/** Las cuatro áreas cerradas, tal cual estaban. */
const restrictions: Array<{
  role: OperationRole;
  prefix: string;
  screen: RestrictedScreenProps;
}> = [
  {
    role: "Contador",
    prefix: "/panel/contabilidad",
    screen: {
      role: "Rol Contador",
      title: "Acceso comercial restringido",
      message:
        "El Contador trabaja en el área contable separada. No puede crear leads, reservas, traslados, ventas ni asignaciones comerciales.",
      actionHref: "/panel/contabilidad",
      actionLabel: "Ir a contabilidad",
    },
  },
  {
    role: "Cajero",
    prefix: "/panel/caja",
    screen: {
      role: "Rol Cajero",
      title: "Acceso operativo restringido",
      message:
        "El Cajero trabaja en el área de caja. No puede crear leads, reservas, traslados, ventas comerciales, modificar inventario ni acceder a contabilidad completa.",
      actionHref: "/panel/caja",
      actionLabel: "Ir a caja",
    },
  },
  {
    role: "Marketing",
    prefix: "/panel/marketing",
    screen: {
      role: "Rol Marketing",
      title: "Acceso fuera del área de Marketing",
      message:
        "Marketing opera únicamente campañas y atribución. No puede acceder a CRM, inventario, ventas, finanzas, configuración ni soporte.",
      actionHref: "/panel/marketing",
      actionLabel: "Ir a Marketing",
    },
  },
  {
    role: "Soporte Técnico",
    prefix: "/panel/soporte",
    screen: {
      role: "Rol Soporte Técnico",
      title: "Acceso fuera del área de Soporte",
      message:
        "Soporte Técnico opera únicamente diagnósticos seguros y auditoría técnica de solo lectura. No puede acceder a áreas comerciales, inventario, finanzas, configuración ni Marketing.",
      actionHref: "/panel/soporte",
      actionLabel: "Ir a Soporte",
    },
  },
];

function isHelpPath(pathname: string): boolean {
  return pathname === "/panel/ayuda" || pathname.startsWith("/panel/ayuda/");
}

export function OperationsShell({ children, initialSession }: OperationsShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<DemoSession | null>(initialSession ?? null);
  const [navOpen, setNavOpen] = useState(false);

  /*
   * **Solo suscripción, sin `setState` de arranque.**
   *
   * El chasis anterior leía el espejo local dentro del efecto porque no tenía
   * otra fuente: nacía en `null`. Ahora la sesión llega ya resuelta del
   * servidor, que es la autoridad de esta petición, así que el efecto no tiene
   * nada que corregir al montar — solo escuchar el cierre de sesión y los
   * cambios de otra pestaña. Eso elimina un renderizado en cascada que estaba
   * aquí desde antes de este parche.
   */
  useEffect(
    () => subscribeToDemoSession(() => setSession(readDemoSession())),
    [],
  );

  async function closeSession() {
    try {
      await logoutAction();
    } catch {
      // Best-effort: still clear the local mirror and return to login.
    }
    clearDemoSession();
    setSession(null);
    router.push("/login");
    router.refresh();
  }

  if (!session) {
    return (
      <div className="app-canvas min-h-screen text-slate-900">
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <Link className="sb-focus rounded" href="/panel">
              <BrandMark />
            </Link>
            <Badge tone="slate">Acceso interno</Badge>
          </header>
          {children}
        </main>
      </div>
    );
  }

  const helpPath = isHelpPath(pathname);
  const restriction = restrictions.find(
    (entry) =>
      session.role === entry.role &&
      pathname !== "/panel" &&
      !pathname.startsWith(entry.prefix) &&
      !helpPath,
  );
  if (restriction) return <RestrictedScreen {...restriction.screen} />;

  const homeHref = getDefaultRouteForSession(session);
  const activeItem = findNavItem(pathname);
  const activeGroupKey = findNavGroupKey(pathname);

  return (
    <div className="app-canvas min-h-screen text-slate-900 lg:flex lg:h-screen lg:overflow-hidden">
      {/*
       * Escritorio: columna propia dentro de la rejilla, no un elemento fijo
       * sobre el que el contenido pasa por debajo.
       */}
      <aside className="nav-surface hidden w-[260px] shrink-0 flex-col border-r border-slate-200 lg:flex">
        <div aria-hidden className="brand-rule h-1 shrink-0" />
        <OperationsRail
          brand={<BrandMark />}
          homeHref={homeHref}
          onLogout={closeSession}
          pathname={pathname}
          session={session}
        />
      </aside>

      {/* Móvil y tableta: el mismo contenido dentro del cajón del sistema. */}
      <Drawer
        /*
         * 288px, el ancho que ya tenía el menú móvil. `size="sm"` son 384px, que
         * en una pantalla de 390px no deja ver nada detrás: un cajón que tapa
         * toda la ventana deja de leerse como un cajón.
         */
        className="max-w-[18rem]"
        contentClassName="p-0"
        onClose={() => setNavOpen(false)}
        open={navOpen}
        side="left"
        size="sm"
        title="Navegación"
      >
        <OperationsRail
          homeHref={homeHref}
          onLogout={closeSession}
          /*
           * Cerrar al navegar se hace **en el gesto**, no en un efecto sobre la
           * ruta: el usuario tocó un enlace, y esa es la señal. Un efecto que
           * mirase `pathname` provocaría un renderizado en cascada para
           * expresar lo mismo con menos información.
           */
          onNavigate={() => setNavOpen(false)}
          pathname={pathname}
          session={session}
        />
      </Drawer>

      {/*
       * El área de contenido posee el desplazamiento vertical. Un solo
       * contenedor que se desplaza: sin cajas anidadas con su propia barra.
       */}
      <div className="flex min-w-0 flex-1 flex-col lg:h-screen lg:overflow-y-auto">
        <OperationsTopbar
          eyebrow={activeGroupKey ? navGroupLabelForRole(activeGroupKey, session.role) : null}
          helpHref={`/panel/ayuda/nuevo-ticket?ruta=${encodeURIComponent(pathname)}`}
          onLogout={closeSession}
          onOpenNav={() => setNavOpen(true)}
          session={session}
          subtitle={shellSubtitle(session.role)}
          title={
            activeItem ? navLabelForRole(activeItem, session.role) : "Centro de Operaciones"
          }
        />

        <main className="flex-1">
          <PageContainer width={containerWidthFor(pathname)}>{children}</PageContainer>
        </main>
      </div>
    </div>
  );
}
