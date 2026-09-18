import { PageHeader } from "@/components/ui/page-header";
import {
  LegacyOperationalPanelGate,
  LegacySectionDivider,
} from "@/features/operations/components/legacy-section-divider";
import { ReservationsPanel } from "@/features/operations/modules/reservations/reservations-panel";
import { ReservationsDbPanel } from "@/features/operations/modules/reservations-db/reservations-db-panel";
import {
  canManagePaymentRequests,
  canManageReservations,
  canReviewReservationPaymentProofs,
  getBranchScopeForUser,
  getOperationsScopeForUser,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { listCustomers, listCustomerFiles } from "@/server/crm/queries";
import { getInventoryData } from "@/server/inventory/queries";
import { listReservations } from "@/server/operations/queries";
import {
  isReservationStatusValue,
  type ReservationStatusValue,
} from "@/server/operations/shared";
import { getActivePaymentProvider } from "@/server/payments/providers";

export const dynamic = "force-dynamic";

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  const session = await requireAuth();
  // Patch CRM-AUD2. Filtro en la URL, como el resto del CRM.
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const statusFilter = isReservationStatusValue(params.estado ?? "")
    ? (params.estado as ReservationStatusValue)
    : null;
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
        listReservations(scope, { q: query, status: statusFilter }),
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

  // Sin pasarela configurada no se ofrece pagar en línea en ninguna parte. Un
  // botón que siempre falla es peor que la ausencia del botón.
  const onlinePaymentsEnabled = getActivePaymentProvider() !== null;

  return (
    <section className="space-y-6">
      <PageHeader
        description="Una reserva nueva queda pendiente de pago y no aparta la moto: la unidad se bloquea con el comprobante o con el pago en línea confirmado."
        title="Reservas"
      />
      {canManage ? (
        <ReservationsDbPanel
          canManage={canManage}
          canRequestPayment={canManagePaymentRequests(session.roleEnum)}
          canReviewProofs={canReviewReservationPaymentProofs(session.roleEnum)}
          customers={customers}
          dbConfigured={dbConfigured}
          files={files}
          onlinePaymentsEnabled={onlinePaymentsEnabled}
          reservations={reservations}
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
            businessLabel="Seguimiento adicional de reservas"
            technicalLabel="Reservas locales · Temporal, pendiente de migración"
          />
        ) : null}
        <ReservationsPanel />
      </LegacyOperationalPanelGate>
    </section>
  );
}
