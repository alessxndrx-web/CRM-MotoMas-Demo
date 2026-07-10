import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { ReservationsPanel } from "@/features/operations/modules/reservations/reservations-panel";
import { ReservationsDbPanel } from "@/features/operations/modules/reservations-db/reservations-db-panel";
import {
  canManageReservations,
  getBranchScopeForUser,
  getOperationsScopeForUser,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { listCustomers, listCustomerFiles } from "@/server/crm/queries";
import { getInventoryData } from "@/server/inventory/queries";
import { listReservations } from "@/server/operations/queries";

export const dynamic = "force-dynamic";

export default async function ReservationsPage() {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();
  const canManage = canManageReservations(session.roleEnum);

  let reservations: Awaited<ReturnType<typeof listReservations>> = [];
  let customers: Awaited<ReturnType<typeof listCustomers>> = [];
  let files: Awaited<ReturnType<typeof listCustomerFiles>> = [];
  let units: Awaited<ReturnType<typeof getInventoryData>>["units"] = [];

  if (dbConfigured && canManage) {
    const scope = getOperationsScopeForUser(
      session.roleEnum,
      session.branchId,
      session.uid,
    );
    const branchScope = getBranchScopeForUser(session.roleEnum, session.branchId);
    const [reservationsResult, customersResult, filesResult, inventoryResult] =
      await Promise.all([
        listReservations(scope),
        listCustomers(scope),
        listCustomerFiles(scope),
        getInventoryData(branchScope),
      ]);
    reservations = reservationsResult;
    customers = customersResult;
    files = filesResult;
    units = inventoryResult.units;
  }

  const scopeLabel =
    session.roleEnum === "ADMIN"
      ? "Vista global"
      : session.roleEnum === "GERENTE"
        ? session.branchName
        : "Mis reservas";

  return (
    <section className="space-y-10">
      {canManage ? (
        <ReservationsDbPanel
          canManage={canManage}
          customers={customers}
          dbConfigured={dbConfigured}
          files={files}
          reservations={reservations}
          scopeLabel={scopeLabel}
          units={units}
        />
      ) : null}
      {dbConfigured && canManage ? (
        <LegacySectionDivider
          businessLabel="Seguimiento adicional de reservas"
          technicalLabel="Reservas locales · Temporal, pendiente de migración"
        />
      ) : null}
      <ReservationsPanel />
    </section>
  );
}
