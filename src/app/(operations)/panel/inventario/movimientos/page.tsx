import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { desiredBranches } from "@/data/operations/leads";
import { InventoryMovementsClient } from "@/features/operations/modules/inventory-db/inventory-movements-client";
import { canManageInventory, getBranchScopeForUser } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { getInventoryData } from "@/server/inventory/queries";

export const dynamic = "force-dynamic";

export default async function InventoryMovementsPage() {
  const session = await requireAuth();

  if (!canManageInventory(session.roleEnum)) {
    return (
      <Card className="p-8 text-center">
        <Badge tone="gray">Inventario</Badge>
        <h2 className="mt-4 text-2xl font-black text-white">
          Gestión de inventario restringida
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
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
          <Badge tone="green">Inventario · Base de datos</Badge>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
            {scope.global ? "Vista global" : session.branchName}
          </span>
        </div>
        <h2 className="mt-4 text-3xl font-black text-white">
          Altas y bajas de motocicletas
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
          Registro real de ingreso y egreso de unidades respaldado por la base de
          datos. Cada movimiento queda en el historial de inventario.
        </p>
      </div>

      {!dbConfigured ? (
        <Card className="border-amber-500/25 bg-amber-500/10 p-6">
          <h3 className="text-lg font-black text-amber-100">
            Base de datos no configurada
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-100/90">
            Esta pantalla registra inventario en PostgreSQL. Para activarla,
            configura <code>DATABASE_URL</code> en <code>.env</code> y ejecuta:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-amber-500/20 bg-black/40 p-4 font-mono text-xs text-amber-100">{`npm run prisma:generate
npm run prisma:migrate     # npx prisma migrate dev --name init
npm run prisma:seed        # node prisma/seed.mjs`}</pre>
          <p className="mt-3 text-sm leading-6 text-amber-100/90">
            Mientras tanto, el inventario comercial de consulta sigue disponible
            en <code>/panel/inventario</code>.
          </p>
        </Card>
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
