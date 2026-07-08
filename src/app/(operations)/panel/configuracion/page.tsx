import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SettingsPanel } from "@/features/operations/modules/settings/settings-panel";
import { UserManagement } from "@/features/operations/modules/users/user-management";
import {
  canManageUsers,
  getAssignableBranchCodesForActor,
  getCreatableRolesForActor,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { branchNameForCode } from "@/server/auth/roles";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { listUsers } from "@/server/auth/user-store";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireAuth();
  const isAdmin = session.roleEnum === "ADMIN";
  const manageUsers = canManageUsers(session.roleEnum);

  if (!manageUsers) {
    return (
      <Card className="p-8 text-center">
        <Badge tone="gray">Configuración</Badge>
        <h2 className="mt-4 text-2xl font-black text-white">Acceso restringido</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          La configuración y la gestión de usuarios están disponibles para
          Administrador y Gerente.
        </p>
      </Card>
    );
  }

  const actorBranchCode = session.branchId === "all" ? null : session.branchId;
  const users = await listUsers(
    isAdmin ? undefined : { branchCode: actorBranchCode },
  );
  const creatableRoles = getCreatableRolesForActor(session.roleEnum);
  const assignableCodes = getAssignableBranchCodesForActor(
    session.roleEnum,
    actorBranchCode,
  );
  const branchOptions = assignableCodes.map((code) => ({
    code,
    name: branchNameForCode(code),
  }));

  return (
    <section className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="gray">Configuración</Badge>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
            {isAdmin ? "Administrador · Vista global" : `Gerente · ${session.branchName}`}
          </span>
        </div>
        <h2 className="mt-4 text-3xl font-black text-white">
          Usuarios y configuración
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
          {isAdmin
            ? "Crea usuarios de cualquier rol y sucursal. La creación real se persiste en la base de datos."
            : "Crea Vendedores para tu sucursal. Los usuarios se persisten en la base de datos."}
        </p>
      </div>

      <UserManagement
        actorRole={session.roleEnum}
        branchOptions={branchOptions}
        creatableRoles={creatableRoles}
        dbConfigured={isDatabaseConfigured()}
        lockedBranchCode={isAdmin ? null : actorBranchCode}
        users={users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          branchCode: user.branchCode,
          isActive: user.isActive,
        }))}
      />

      {isAdmin ? <SettingsPanel /> : null}
    </section>
  );
}
