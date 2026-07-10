import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { desiredBranches } from "@/data/operations/leads";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import { InventoryMovementsClient } from "@/features/operations/modules/inventory-db/inventory-movements-client";
import { canManageInventory, getBranchScopeForUser } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { getInventoryData } from "@/server/inventory/queries";
import { SHOW_TECHNICAL_LABELS } from "@/shared/feature-flags";

export const dynamic = "force-dynamic";

export default async function InventoryMovementsPage() {
  const session = await requireAuth();

  if (!canManageInventory(session.roleEnum)) {
    return (
      <Card className="p-8 text-center">
        <Badge tone="gray">Inventario</Badge>
        <h2 className="mt-4 text-2xl font-black text-slate-900">
          Gestión de inventario restringida
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          El alta y baja de motocicletas está disponible para Gerente y
          Administrador. El Vendedor consulta disponibilidad y el Cajero no
          gestiona inventario.
        </p>
      </Card>
    );
  }

  const scope = getBranchScopeForUser(session.roleEnum, session.branchId);
  const dbConfigured = isDatabaseConfigured();
  const data = await getInventoryData(scope);

  const branchOptions = scope.global
    ? desiredBranches.map((branch) => ({ code: branch.id, name: branch.name }))
    : [{ code: scope.branchCode, name: session.branchName }];

  return (
    <section className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <PrimarySectionBadge
            businessLabel="Inventario · Control de unidades"
            technicalLabel="Inventario · Base de datos"
          />
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-slate-600">
            {scope.global ? "Vista global" : session.branchName}
          </span>
        </div>
        <h2 className="mt-4 text-3xl font-black text-slate-900">
          Altas y bajas de motocicletas
        </h2>
        <PrimarySectionDescription
          businessText="Registro real de ingreso y egreso de unidades. Cada movimiento queda en el historial de inventario."
          technicalText="Registro real de ingreso y egreso de unidades respaldado por la base de
          datos. Cada movimiento queda en el historial de inventario."
        />
      </div>

      {!dbConfigured ? (
        SHOW_TECHNICAL_LABELS ? (
          <Card className="border-amber-200 bg-amber-50 p-6">
            <h3 className="text-lg font-black text-amber-700">
              Base de datos no configurada
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-700">
              Esta pantalla registra inventario en PostgreSQL. Para activarla,
              configura <code>DATABASE_URL</code> en <code>.env</code> y ejecuta:
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-amber-200 bg-amber-50 p-4 font-mono text-xs text-amber-700">{`npm run prisma:generate
npm run prisma:migrate     # npx prisma migrate dev --name init
npm run prisma:seed        # node prisma/seed.mjs`}</pre>
            <p className="mt-3 text-sm leading-6 text-amber-700">
              Mientras tanto, el inventario comercial de consulta sigue disponible
              en <code>/panel/inventario</code>.
            </p>
          </Card>
        ) : (
          <SectionUnavailableNotice
            businessText="Esta pantalla aún no está disponible. Mientras tanto, el inventario comercial de consulta sigue disponible en Inventario."
            technicalText="Esta pantalla aún no está disponible."
          />
        )
      ) : null}

      <InventoryMovementsClient
        branchOptions={branchOptions}
        dbConfigured={dbConfigured}
        isBranchLocked={!scope.global}
        movements={data.movements}
        units={data.units}
      />
    </section>
  );
}
