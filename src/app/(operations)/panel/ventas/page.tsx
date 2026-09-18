import { PageHeader } from "@/components/ui/page-header";
import {
  LegacyOperationalPanelGate,
  LegacySectionDivider,
} from "@/features/operations/components/legacy-section-divider";
import { SalesPanel } from "@/features/operations/modules/sales/sales-panel";
import { SalesDbPanel } from "@/features/operations/modules/sales-db/sales-db-panel";
import {
  canManageSales,
  canRegisterSales,
  getBranchScopeForUser,
  getOperationsScopeForUser,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { listCustomers, listCustomerFiles } from "@/server/crm/queries";
import { getInventoryData } from "@/server/inventory/queries";
import { listReservations, listSales } from "@/server/operations/queries";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();
  const canManage = canManageSales(session.roleEnum);

  let sales: Awaited<ReturnType<typeof listSales>> = [];
  let customers: Awaited<ReturnType<typeof listCustomers>> = [];
  let files: Awaited<ReturnType<typeof listCustomerFiles>> = [];
  let units: Awaited<ReturnType<typeof getInventoryData>>["units"] = [];
  let activeReservations: Awaited<ReturnType<typeof listReservations>> = [];

  if (dbConfigured && canManage) {
    const scope = getOperationsScopeForUser(
      session.roleEnum,
      session.branchId,
      session.uid,
    );
    const branchScope = getBranchScopeForUser(session.roleEnum, session.branchId);
    const [salesResult, customersResult, filesResult, inventoryResult, reservationsResult] =
      await Promise.all([
        listSales(scope),
        listCustomers(scope),
        listCustomerFiles(scope),
        getInventoryData(branchScope),
        listReservations(scope),
      ]);
    sales = salesResult;
    customers = customersResult;
    files = filesResult;
    units = inventoryResult.units;
    // Sólo las reservas ya pagadas pueden convertirse en venta. Una en
    // PENDIENTE_PAGO ni siquiera bloquea su unidad, así que ofrecerla aquí
    // llevaría a un formulario que el servidor rechaza.
    activeReservations = reservationsResult.filter(
      (reservation) => reservation.status === "ACTIVA" && !reservation.hasSale,
    );
  }

  const scopeLabel =
    session.roleEnum === "ADMIN"
      ? "Vista global"
      : session.roleEnum === "GERENTE"
        ? session.branchName
        : "Mis ventas";

  return (
    <section className="space-y-6">
      <PageHeader
        description="El cierre de una operación. Reportar la venta corresponde al Líder de ventas; un vendedor consulta las suyas y marca la entrega."
        title="Ventas"
      />
      {canManage ? (
        <SalesDbPanel
          activeReservations={activeReservations}
          canManage={canManage}
          canRegister={canRegisterSales(session.roleEnum)}
          customers={customers}
          dbConfigured={dbConfigured}
          files={files}
          sales={sales}
          scopeLabel={scopeLabel}
          units={units}
        />
      ) : null}
      <LegacyOperationalPanelGate
        dbAvailable={dbConfigured}
        fallbackAllowed={canManage}
      >
        {dbConfigured ? (
          <LegacySectionDivider
            businessLabel="Registros adicionales de ventas"
            technicalLabel="Ventas locales · Temporal, pendiente de migración"
          />
        ) : null}
        <SalesPanel />
      </LegacyOperationalPanelGate>
    </section>
  );
}
