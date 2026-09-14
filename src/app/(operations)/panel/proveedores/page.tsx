import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { SuppliersPanel } from "@/features/operations/modules/suppliers/suppliers-panel";
import { canManageSuppliers, getBranchScopeForUser } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { listSuppliers } from "@/server/suppliers/queries";

export const dynamic = "force-dynamic";

/**
 * Patch CRM-QA1 — `/panel/proveedores`.
 *
 * La QA reportó «los proveedores no aparecen». No era una consulta rota ni un
 * modelo que faltara: `ThirdParty` con `type = PROVEEDOR` existe desde POS1.2-A
 * y `listPosSuppliers` ya lo leía para el desplegable de una orden nueva. Lo que
 * no existía era una pantalla donde verlos o darlos de alta fuera de
 * Contabilidad, que un Gerente no pasa — y el Gerente es precisamente quien crea
 * las órdenes de compra.
 *
 * `notFound()` para quien no pasa el permiso, como hacen las pantallas de
 * compras: la URL directa tampoco entra.
 */
export default async function SuppliersPage() {
  const session = await requireAuth();
  if (!canManageSuppliers(session.roleEnum)) notFound();

  const dbConfigured = isDatabaseConfigured();
  const scope = getBranchScopeForUser(session.roleEnum, session.branchId);
  const suppliers = dbConfigured
    ? await listSuppliers(scope, { includeInactive: true })
    : [];

  return (
    <section className="space-y-6">
      <PageHeader
        description="Los terceros a quienes MotoMas compra. Son los mismos que Contabilidad mantiene: lo que se registra aquí está disponible en ambos sitios."
        title="Proveedores"
      />
      <SuppliersPanel
        canManage={canManageSuppliers(session.roleEnum)}
        dbConfigured={dbConfigured}
        scopeLabel={scope.global ? "Vista global" : session.branchName}
        suppliers={suppliers}
      />
    </section>
  );
}
