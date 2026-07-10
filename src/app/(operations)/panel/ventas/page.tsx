import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { SalesPanel } from "@/features/operations/modules/sales/sales-panel";
import { SalesDbPanel } from "@/features/operations/modules/sales-db/sales-db-panel";
import {
  canManageSales,
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
    <section className="space-y-10">
      {canManage ? (
        <SalesDbPanel
          activeReservations={activeReservations}
          canManage={canManage}
          customers={customers}
          dbConfigured={dbConfigured}
          files={files}
          sales={sales}
          scopeLabel={scopeLabel}
          units={units}
        />
      ) : null}
      {dbConfigured && canManage ? (
        <LegacySectionDivider
          businessLabel="Registros adicionales de ventas"
          technicalLabel="Ventas locales · Temporal, pendiente de migración"
        />
      ) : null}
      <SalesPanel />
    </section>
  );
}
