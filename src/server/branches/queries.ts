import { desiredBranches } from "@/data/operations/leads";
import type {
  BranchAdminDTO,
  BranchOptionDTO,
} from "@/server/branches/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

/**
 * Patch CRM-INT1 — **las sucursales salen de la base.**
 *
 * Hasta este parche cada pantalla del CRM armaba su selector con
 * `desiredBranches`, una lista fija en `src/data/operations/leads.ts`. Una
 * sucursal dada de alta o desactivada en la base no cambiaba nada en pantalla,
 * y el formulario de clientes llegaba a enviar la sucursal del primer cliente
 * de la lista porque no tenía de dónde sacar otra.
 *
 * Sin base configurada se devuelve la lista fija: es el arranque degradado de
 * desarrollo, donde tampoco hay nada que guardar.
 */
export async function listActiveBranches(): Promise<BranchOptionDTO[]> {
  if (!isDatabaseConfigured()) {
    return desiredBranches.map((branch) => ({
      code: branch.id,
      name: branch.name,
    }));
  }
  return getPrisma().branch.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { code: true, name: true },
  });
}

/**
 * Todas las sucursales, activas o no, con lo que depende de cada una. Sólo la
 * pantalla de administración la usa: es lo que un Administrador necesita ver
 * antes de desactivar una.
 */
export async function listBranchesForAdmin(): Promise<BranchAdminDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const prisma = getPrisma();
  const [branches, users, customers, units] = await Promise.all([
    prisma.branch.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.user.groupBy({
      by: ["branchId"],
      where: { isActive: true, branchId: { not: null } },
      _count: { _all: true },
    }),
    prisma.customer.groupBy({ by: ["branchId"], _count: { _all: true } }),
    prisma.motorcycleUnit.groupBy({
      by: ["branchId"],
      where: { status: "AVAILABLE" },
      _count: { _all: true },
    }),
  ]);

  const count = (
    rows: Array<{ branchId: string | null; _count: { _all: number } }>,
    id: string,
  ) => rows.find((row) => row.branchId === id)?._count._all ?? 0;

  return branches.map((branch) => ({
    id: branch.id,
    code: branch.code,
    name: branch.name,
    address: branch.address,
    phone: branch.phone,
    isActive: branch.isActive,
    activeUsers: count(users, branch.id),
    customers: count(customers, branch.id),
    availableUnits: count(units, branch.id),
    createdAt: branch.createdAt.toISOString(),
  }));
}
