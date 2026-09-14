import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import {
  LegacyOperationalPanelGate,
  LegacySectionDivider,
} from "@/features/operations/components/legacy-section-divider";
import { SellersPanel } from "@/features/operations/modules/sellers/sellers-panel";
import { SellersDbPanel } from "@/features/operations/modules/sellers-db/sellers-db-panel";
import {
  canViewSellerPerformance,
  isGlobalScopeRole,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import {
  getDashboardSellerPerformance,
  type AnalyticsContext,
} from "@/server/analytics/queries";
import { isDatabaseConfigured } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

/**
 * Patch CRM-AUD1 — `/panel/vendedores`, reconstruida.
 *
 * **Era la única pantalla del CRM sin autorización de servidor.** El archivo
 * entero era:
 *
 *     export default function SellersPage() {
 *       return <SellersPanel />;
 *     }
 *
 * Sin `requireAuth`, sin predicado, y sin ser siquiera asíncrona. Lo único que
 * separaba a un vendedor de la supervisión de su sucursal era un `if` dentro del
 * componente de cliente que leía el rol desde `localStorage`, donde el propio
 * usuario puede cambiarlo. `proxy.ts` sólo comprueba que haya sesión, no cuál.
 *
 * Y lo que enseñaba no eran datos: la lista de vendedores salía de
 * `demoInternalUsers` —una lista fija de demo— y las métricas de los servicios
 * de `localStorage`, así que con una base configurada la pantalla mostraba
 * personas que no existen con cifras de nadie.
 *
 * Ahora autoriza con {@link canViewSellerPerformance} y sirve
 * `getDashboardSellerPerformance`, que resuelve el alcance del solicitante en la
 * base. El panel local queda debajo con el mismo interruptor de recuperación que
 * el resto de módulos migrados.
 */
export default async function SellersPage() {
  const session = await requireAuth();
  if (!canViewSellerPerformance(session.roleEnum)) notFound();

  const dbConfigured = isDatabaseConfigured();
  const context: AnalyticsContext = {
    role: session.roleEnum,
    branchCode: session.branchId === GLOBAL_BRANCH_ID ? null : session.branchId,
    userId: session.uid,
  };

  const sellers = dbConfigured
    ? await getDashboardSellerPerformance(context)
    : [];

  return (
    <section className="space-y-6">
      <PageHeader
        description="La carga de trabajo de tu equipo comercial: leads, seguimientos vencidos, expedientes, reservas y cierres."
        title="Equipo de ventas"
      />
      <SellersDbPanel
        dbConfigured={dbConfigured}
        scopeLabel={
          isGlobalScopeRole(session.roleEnum) ? "Vista global" : session.branchName
        }
        sellers={sellers}
      />

      <LegacyOperationalPanelGate dbAvailable={dbConfigured} fallbackAllowed>
        {dbConfigured ? (
          <LegacySectionDivider
            businessLabel="Seguimiento adicional del equipo"
            technicalLabel="Vendedores locales · Temporal, pendiente de migración"
          />
        ) : null}
        <SellersPanel />
      </LegacyOperationalPanelGate>
    </section>
  );
}
