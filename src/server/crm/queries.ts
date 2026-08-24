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
    include: { branch: true, assignedSeller: true, createdBy: true },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return leads.map(mapLead);
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
        { leads: { some: personalLeadFilter(scope.userId) } },
        { customerFiles: { some: { sellerId: scope.userId } } },
      ],
    };
  }

  const customers = await prisma.customer.findMany({
    where,
    include: { branch: true },
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
      lead: { include: { branch: true, assignedSeller: true, createdBy: true } },
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

function mapLead(lead: {
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
}): LeadDTO {
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
  createdAt: Date;
  updatedAt: Date;
  branch?: BranchRelation;
}): CustomerDTO {
  return {
    id: customer.id,
    branchCode: branchCodeOf(customer.branch ?? null),
    branchName: branchNameOf(customer.branch ?? null),
    name: customer.name,
    phone: customer.phone,
    cedula: customer.cedula,
    email: customer.email,
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
