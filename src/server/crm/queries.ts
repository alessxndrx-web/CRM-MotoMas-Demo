import type { Prisma } from "@prisma/client";

import type { CrmScope } from "@/server/auth/access";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  activityPriorityLabels,
  activityStatusLabels,
  activityTypeLabels,
  customerFileStatusLabels,
  leadStatusLabels,
  type ActivityDTO,
  type ActivityPriorityValue,
  type ActivityStatusValue,
  type ActivityTypeValue,
  type CustomerDTO,
  type CustomerFileDetailDTO,
  type CustomerFileDTO,
  type CustomerFileStatusValue,
  type LeadDTO,
  type LeadMotorcycleDTO,
  type LeadStatusValue,
} from "@/server/crm/shared";

/**
 * Role-scoped CRM read queries. Every function resolves the caller's
 * {@link CrmScope} into a Prisma `where` filter so branch/personal visibility is
 * enforced in the database layer, never only in the UI.
 */

const LIST_LIMIT = 200;

/** Resolves the cuid branch id for a branch code, or null if not seeded. */
async function resolveBranchId(branchCode: string): Promise<string | null> {
  const prisma = getPrisma();
  const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
  return branch?.id ?? null;
}

/** Leads visible for a scope: assigned OR created by the seller in personal mode. */
function personalLeadFilter(userId: string): Prisma.LeadWhereInput {
  return {
    OR: [{ assignedSellerId: userId }, { createdById: userId }],
  };
}

/**
 * Patch CRM-QA1 — lo que hay que traer del lead para poder pintar su moto.
 *
 * Se declara una vez porque lo usan `listLeads` y `getLeadDetail`, y las dos
 * tienen que devolver exactamente la misma forma: si divergieran, la ficha
 * mostraria un dato que la lista no tiene y nadie lo notaria hasta produccion.
 */
const leadInclude = {
  branch: true,
  assignedSeller: true,
  createdBy: true,
  catalogModel: true,
} satisfies Prisma.LeadInclude;

/**
 * Cuantas unidades AVAILABLE de cada modelo hay en cada sucursal, para los pares
 * (modelo, sucursal) que la lista de leads necesita.
 *
 * **Un `groupBy` y no una consulta por fila.** Una lista de 200 leads habria
 * hecho 200 viajes a la base para un contador; agrupar una vez sobre los modelos
 * ya visibles cuesta uno.
 *
 * La disponibilidad NO se filtra por el alcance del usuario: es el inventario
 * fisico de la sucursal del lead, que es justo el dato que un vendedor necesita
 * para saber si puede prometer esa moto. No revela costos.
 */
async function availabilityByModelAndBranch(
  pairs: Array<{ catalogModelId: string; branchId: string }>,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!pairs.length) return result;

  const rows = await getPrisma().motorcycleUnit.groupBy({
    by: ["catalogModelId", "branchId"],
    where: {
      status: "AVAILABLE",
      catalogModelId: { in: [...new Set(pairs.map((p) => p.catalogModelId))] },
      branchId: { in: [...new Set(pairs.map((p) => p.branchId))] },
    },
    _count: { _all: true },
  });

  for (const row of rows) {
    if (!row.catalogModelId) continue;
    result.set(`${row.catalogModelId}:${row.branchId}`, row._count._all);
  }
  return result;
}

type CatalogModelRelation = {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  slug: string;
  imageUrl: string | null;
  description: string | null;
} | null;

function mapLeadMotorcycle(
  catalogModel: CatalogModelRelation,
  availableUnitsInBranch: number,
): LeadMotorcycleDTO | null {
  if (!catalogModel) return null;
  return {
    catalogModelId: catalogModel.id,
    brand: catalogModel.brand,
    model: catalogModel.model,
    year: catalogModel.year,
    slug: catalogModel.slug,
    imageUrl: catalogModel.imageUrl,
    description: catalogModel.description,
    availableUnitsInBranch,
  };
}

export async function listLeads(scope: CrmScope): Promise<LeadDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const prisma = getPrisma();

  let where: Prisma.LeadWhereInput = {};
  if (scope.level === "branch") {
    const branchId = await resolveBranchId(scope.branchCode);
    if (!branchId) return [];
    where = { branchId };
  } else if (scope.level === "personal") {
    where = personalLeadFilter(scope.userId);
  }

  const leads = await prisma.lead.findMany({
    where,
    include: leadInclude,
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  const availability = await availabilityByModelAndBranch(
    leads
      .filter((lead) => lead.catalogModelId)
      .map((lead) => ({
        catalogModelId: lead.catalogModelId as string,
        branchId: lead.branchId,
      })),
  );

  return leads.map((lead) =>
    mapLead(
      lead,
      availability.get(`${lead.catalogModelId}:${lead.branchId}`) ?? 0,
    ),
  );
}

/**
 * Patch CRM-QA1 — un lead concreto, ya recortado por el alcance del solicitante.
 *
 * Resuelve primero y comprueba despues sobre la fila resuelta, igual que
 * {@link getCustomerFileDetail}: un id fuera de alcance devuelve `null`, no un
 * error distinto, asi que la URL no sirve para averiguar si el lead existe.
 */
export async function getLeadDetail(
  scope: CrmScope,
  leadId: string,
): Promise<LeadDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const prisma = getPrisma();

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: leadInclude,
  });
  if (!lead) return null;

  if (scope.level === "branch" && lead.branch.code !== scope.branchCode) {
    return null;
  }
  if (
    scope.level === "personal" &&
    lead.assignedSellerId !== scope.userId &&
    lead.createdById !== scope.userId
  ) {
    return null;
  }

  const availability = lead.catalogModelId
    ? await availabilityByModelAndBranch([
        { catalogModelId: lead.catalogModelId, branchId: lead.branchId },
      ])
    : new Map<string, number>();

  return mapLead(
    lead,
    availability.get(`${lead.catalogModelId}:${lead.branchId}`) ?? 0,
  );
}

export async function listCustomers(scope: CrmScope): Promise<CustomerDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const prisma = getPrisma();

  let where: Prisma.CustomerWhereInput = {};
  if (scope.level === "branch") {
    const branchId = await resolveBranchId(scope.branchCode);
    if (!branchId) return [];
    where = { branchId };
  } else if (scope.level === "personal") {
    where = {
      OR: [
        // Patch CRM-QA1. La cartera asignada es la primera via de acceso de un
        // vendedor a un cliente: antes solo llegaba a el a traves de un lead o
        // de un expediente, asi que un cliente reasignado quedaba invisible para
        // quien acababa de recibirlo.
        { assignedSellerId: scope.userId },
        { leads: { some: personalLeadFilter(scope.userId) } },
        { customerFiles: { some: { sellerId: scope.userId } } },
      ],
    };
  }

  const customers = await prisma.customer.findMany({
    where,
    include: { branch: true, assignedSeller: true, assignedBy: true },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return customers.map(mapCustomer);
}

export async function listCustomerFiles(
  scope: CrmScope,
): Promise<CustomerFileDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const prisma = getPrisma();

  let where: Prisma.CustomerFileWhereInput = {};
  if (scope.level === "branch") {
    const branchId = await resolveBranchId(scope.branchCode);
    if (!branchId) return [];
    where = { branchId };
  } else if (scope.level === "personal") {
    where = {
      OR: [
        { sellerId: scope.userId },
        { lead: { is: personalLeadFilter(scope.userId) } },
      ],
    };
  }

  const files = await prisma.customerFile.findMany({
    where,
    include: { branch: true, customer: true, seller: true },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return files.map(mapCustomerFile);
}

export async function getCustomerFileDetail(
  scope: CrmScope,
  id: string,
): Promise<CustomerFileDetailDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const prisma = getPrisma();

  const file = await prisma.customerFile.findUnique({
    where: { id },
    include: {
      branch: true,
      seller: true,
      customer: { include: { branch: true } },
      lead: { include: leadInclude },
      activities: {
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: LIST_LIMIT,
      },
    },
  });
  if (!file) return null;

  // Enforce visibility on the resolved record.
  if (scope.level === "branch" && file.branch.code !== scope.branchCode) {
    return null;
  }
  if (scope.level === "personal") {
    const owned =
      file.sellerId === scope.userId ||
      file.lead?.assignedSellerId === scope.userId ||
      file.lead?.createdById === scope.userId;
    if (!owned) return null;
  }

  return {
    ...mapCustomerFile(file),
    customer: mapCustomer(file.customer),
    lead: file.lead ? mapLead(file.lead) : null,
    activities: file.activities.map(mapActivity),
  };
}

// --- Mappers -------------------------------------------------------------

type BranchRelation = { code: string; name: string } | null;
type UserRelation = { id: string; name: string } | null;

function branchCodeOf(branch: BranchRelation): string | null {
  return branch?.code ?? null;
}

function branchNameOf(branch: BranchRelation): string {
  return branch?.name ?? "Sucursal";
}

function mapLead(
  lead: {
    id: string;
    trackingCode: string;
    name: string;
    phone: string;
    cedula: string | null;
    email: string | null;
    motorcycleInterest: string | null;
    motorcycleSlug: string | null;
    originChannel: string | null;
    status: string;
    assignedSellerId: string | null;
    createdById: string | null;
    customerId: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    branch?: BranchRelation;
    assignedSeller?: UserRelation;
    createdBy?: UserRelation;
    catalogModel?: CatalogModelRelation;
  },
  availableUnitsInBranch = 0,
): LeadDTO {
  const status = lead.status as LeadStatusValue;
  return {
    id: lead.id,
    trackingCode: lead.trackingCode,
    name: lead.name,
    phone: lead.phone,
    cedula: lead.cedula,
    email: lead.email,
    motorcycleInterest: lead.motorcycleInterest,
    motorcycleSlug: lead.motorcycleSlug,
    motorcycle: mapLeadMotorcycle(
      lead.catalogModel ?? null,
      availableUnitsInBranch,
    ),
    branchCode: branchCodeOf(lead.branch ?? null),
    branchName: branchNameOf(lead.branch ?? null),
    originChannel: lead.originChannel,
    status,
    statusLabel: leadStatusLabels[status] ?? lead.status,
    assignedSellerId: lead.assignedSellerId,
    assignedSellerName: lead.assignedSeller?.name ?? null,
    createdById: lead.createdById,
    createdByName: lead.createdBy?.name ?? null,
    customerId: lead.customerId,
    notes: lead.notes,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

function mapCustomer(customer: {
  id: string;
  name: string;
  phone: string;
  cedula: string | null;
  email: string | null;
  assignedSellerId?: string | null;
  assignedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  branch?: BranchRelation;
  assignedSeller?: UserRelation;
  assignedBy?: UserRelation;
}): CustomerDTO {
  return {
    id: customer.id,
    branchCode: branchCodeOf(customer.branch ?? null),
    branchName: branchNameOf(customer.branch ?? null),
    name: customer.name,
    phone: customer.phone,
    cedula: customer.cedula,
    email: customer.email,
    assignedSellerId: customer.assignedSellerId ?? null,
    assignedSellerName: customer.assignedSeller?.name ?? null,
    assignedByName: customer.assignedBy?.name ?? null,
    assignedAt: customer.assignedAt ? customer.assignedAt.toISOString() : null,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function mapCustomerFile(file: {
  id: string;
  fileNumber: string;
  customerId: string;
  leadId: string | null;
  sellerId: string | null;
  motorcycleInterest: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  branch?: BranchRelation;
  customer?: { name: string } | null;
  seller?: UserRelation;
}): CustomerFileDTO {
  const status = file.status as CustomerFileStatusValue;
  return {
    id: file.id,
    fileNumber: file.fileNumber,
    customerId: file.customerId,
    customerName: file.customer?.name ?? "Cliente",
    leadId: file.leadId,
    branchCode: branchCodeOf(file.branch ?? null),
    branchName: branchNameOf(file.branch ?? null),
    sellerId: file.sellerId,
    sellerName: file.seller?.name ?? null,
    motorcycleInterest: file.motorcycleInterest,
    status,
    statusLabel: customerFileStatusLabels[status] ?? file.status,
    notes: file.notes,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}

function mapActivity(activity: {
  id: string;
  type: string;
  status: string;
  priority: string;
  description: string | null;
  result: string | null;
  scheduledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  user?: UserRelation;
}): ActivityDTO {
  const type = activity.type as ActivityTypeValue;
  const status = activity.status as ActivityStatusValue;
  const priority = activity.priority as ActivityPriorityValue;
  return {
    id: activity.id,
    type,
    typeLabel: activityTypeLabels[type] ?? activity.type,
    status,
    statusLabel: activityStatusLabels[status] ?? activity.status,
    priority,
    priorityLabel: activityPriorityLabels[priority] ?? activity.priority,
    description: activity.description,
    result: activity.result,
    scheduledAt: activity.scheduledAt ? activity.scheduledAt.toISOString() : null,
    completedAt: activity.completedAt ? activity.completedAt.toISOString() : null,
    userName: activity.user?.name ?? null,
    createdAt: activity.createdAt.toISOString(),
  };
}
