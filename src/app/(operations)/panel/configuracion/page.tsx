import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AppearanceSection } from "@/features/operations/modules/settings/appearance-section";
import { BranchAdminPanel } from "@/features/operations/modules/settings/branch-admin-panel";
import { MarketingPermissionsPanel } from "@/features/operations/modules/settings/marketing-permissions-panel";
import { SettingsPanel } from "@/features/operations/modules/settings/settings-panel";
import { UserManagement } from "@/features/operations/modules/users/user-management";
import {
  canManageBranches,
  canManageDelegatedPermissions,
  canManageUsers,
  getAssignableBranchCodesForActor,
  getCreatableRolesForActor,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { branchNameForCode } from "@/server/auth/roles";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { listUsers } from "@/server/auth/user-store";
import { PosOperatorsPanel } from "@/features/operations/modules/pos/pos-operators-panel";
import {
  listActiveBranches,
  listBranchesForAdmin,
} from "@/server/branches/queries";
import { listMarketingUsersWithGrants } from "@/server/permissions/queries";
import { listPosOperators } from "@/server/pos/queries";

export const dynamic = "force-dynamic";

/**
 * Patch CRM-INT4 — «Apariencia» abre la página para cualquier rol que llegue a
 * ella: es la preferencia de tema de quien la mira. Lo demás (usuarios,
 * operadores, sucursales, permisos) sigue siendo de Gerente y Administrador,
 * con la misma comprobación de siempre.
 */
export default async function SettingsPage() {
  const session = await requireAuth();
  const isAdmin = session.roleEnum === "ADMIN";
  const manageUsers = canManageUsers(session.roleEnum);

  if (!manageUsers) {
    return (
      <section className="space-y-8">
        <AppearanceSection />
        <Card className="p-8 text-center">
          <Badge tone="gray">Configuración</Badge>
          <h2 className="mt-4 text-2xl font-black text-slate-900">Acceso restringido</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            La gestión de usuarios, sucursales y permisos está disponible para
            Administrador y Gerente. La apariencia es tuya: puedes cambiarla arriba.
          </p>
        </Card>
      </section>
    );
  }

  const actorBranchCode = session.branchId === "all" ? null : session.branchId;
  const users = await listUsers(
    isAdmin ? undefined : { branchCode: actorBranchCode },
  );
  const creatableRoles = getCreatableRolesForActor(session.roleEnum);
  // Patch CRM-INT1 — las sucursales activas salen de la base para el
  // Administrador: una sucursal creada en esta misma pantalla tiene que poder
  // recibir usuarios. El Gerente sigue limitado a la suya.
  const activeBranches = await listActiveBranches();
  const branchOptions = isAdmin
    ? activeBranches
    : getAssignableBranchCodesForActor(session.roleEnum, actorBranchCode).map((code) => ({
        code,
        name: branchNameForCode(code),
      }));

  // Patch POS2.4. Las credenciales de mostrador se administran aquí, con el
  // mismo permiso que los usuarios: repartir accesos es administración.
  const posOperators = await listPosOperators();
  const posBranchOptions = activeBranches;

  // Patch CRM-INT1 — sucursales y permisos delegados de Marketing, sólo para
  // quien los administra.
  const [adminBranches, marketingUsers] = await Promise.all([
    canManageBranches(session.roleEnum) ? listBranchesForAdmin() : Promise.resolve([]),
    canManageDelegatedPermissions(session.roleEnum)
      ? listMarketingUsersWithGrants()
      : Promise.resolve([]),
  ]);

  return (
    <section className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="gray">Configuración</Badge>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-slate-600">
            {isAdmin ? "Administrador · Vista global" : `Gerente · ${session.branchName}`}
          </span>
        </div>
        <h2 className="mt-4 text-3xl font-black text-slate-900">
          Usuarios y configuración
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          {isAdmin
            ? "Crea usuarios de cualquier rol y sucursal. La creación se guarda en el sistema."
            : "Crea Vendedores para tu sucursal. Los usuarios se guardan en el sistema."}
        </p>
      </div>

      <AppearanceSection />

      <PosOperatorsPanel
        branches={posBranchOptions}
        operators={posOperators}
        users={users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
        }))}
      />

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

      {canManageBranches(session.roleEnum) ? (
        <BranchAdminPanel branches={adminBranches} />
      ) : null}

      {canManageDelegatedPermissions(session.roleEnum) ? (
        <MarketingPermissionsPanel branches={activeBranches} users={marketingUsers} />
      ) : null}

      {isAdmin ? <SettingsPanel /> : null}
    </section>
  );
}
