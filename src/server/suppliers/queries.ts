import type { Prisma } from "@prisma/client";

import type { BranchScope } from "@/server/auth/access";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

/**
 * Patch CRM-QA1 — lectura de proveedores.
 *
 * ## Por qué no hay un modelo `Supplier`
 *
 * Porque ya existe. `ThirdParty` con `type = PROVEEDOR` es el agregado de
 * proveedor de este repositorio desde POS1.2-A: tiene identificación fiscal,
 * sucursal, contacto y baja lógica, y lo referencian las órdenes de compra y los
 * documentos contables. Crear una segunda tabla habría partido en dos el
 * proveedor que Contabilidad y Compras ya comparten.
 *
 * ## Qué faltaba entonces
 *
 * Una pantalla. El único mantenimiento de `ThirdParty` vivía dentro de
 * Contabilidad, tras `canOperateContabilidad` (ADMIN o CONTADOR), y el Gerente
 * que crea órdenes de compra no pasa ese predicado. Podía elegir proveedor en el
 * desplegable de una orden nueva y no podía ver ninguno ni dar de alta el
 * primero — que es exactamente lo que la QA reportó como «los proveedores no
 * aparecen».
 */

const LIST_LIMIT = 200;

export type SupplierDTO = {
  id: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  branchCode: string | null;
  branchName: string;
  /** Órdenes de compra que le apuntan. Gobierna si se puede desactivar. */
  purchaseOrderCount: number;
  createdAt: string;
};

export async function listSuppliers(
  scope: BranchScope,
  options: { includeInactive?: boolean } = {},
): Promise<SupplierDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const prisma = getPrisma();

  const where: Prisma.ThirdPartyWhereInput = {
    type: "PROVEEDOR",
    ...(options.includeInactive ? {} : { isActive: true }),
    ...(scope.global ? {} : { branch: { code: scope.branchCode } }),
  };

  const rows = await prisma.thirdParty.findMany({
    where,
    include: {
      branch: true,
      _count: { select: { posPurchaseOrders: true } },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: LIST_LIMIT,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    taxId: row.taxId,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    isActive: row.isActive,
    branchCode: row.branch?.code ?? null,
    branchName: row.branch?.name ?? "Sucursal",
    purchaseOrderCount: row._count.posPurchaseOrders,
    createdAt: row.createdAt.toISOString(),
  }));
}
