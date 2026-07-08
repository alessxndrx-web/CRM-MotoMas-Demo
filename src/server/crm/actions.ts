"use server";

import { revalidatePath } from "next/cache";

import {
  canAccessBranch,
  canAssignLeads,
  canOperateCrm,
  getCrmScopeForUser,
} from "@/server/auth/access";
import { getCurrentUserSession } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  isLeadStatusValue,
  normalizeCedula,
  normalizePhone,
  sanitizeText,
  type LeadStatusValue,
} from "@/server/crm/shared";

/**
 * Server-side CRM write actions (Patch 3.1B). Every authenticated action
 * re-checks the session role/branch scope; authorization is enforced here, not
 * in the UI. The public lead creation action intentionally needs no session.
 *
 * These actions never touch inventory units, reservations, sales, transfers,
 * Caja or Contabilidad, and never expose costs.
 */

const DB_REQUIRED =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";
const NO_SESSION = "Sesión no válida.";
const NO_PERMISSION = "No tienes permiso para operar el CRM.";

export type CrmActionResult = { ok: true } | { ok: false; error: string };

function sessionBranchCode(branchId: string): string | null {
  return branchId === GLOBAL_BRANCH_ID ? null : branchId;
}

/** Short unique-ish public tracking / file code, e.g. SOL-20260708-3F9A2B7C. */
function generateCode(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefix}-${date}-${suffix}`;
}

// --- Public lead creation (no login) -------------------------------------

export type CreatePublicLeadInput = {
  nombre: string;
  telefono: string;
  cedula?: string | null;
  correo?: string | null;
  motoInteres?: string | null;
  motoSlug?: string | null;
  sucursalDeseada: string; // branch code
  canalOrigen?: string | null;
};

export type CreatePublicLeadResult =
  | { ok: true; trackingCode: string }
  | { ok: false; error: string };

export async function createPublicLeadAction(
  input: CreatePublicLeadInput,
): Promise<CreatePublicLeadResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const name = sanitizeText(input.nombre ?? "");
  const phone = normalizePhone(input.telefono ?? "");
  const branchCode = (input.sucursalDeseada ?? "").trim();

  if (!name) return { ok: false, error: "El nombre es obligatorio." };
  if (phone.length < 8) {
    return { ok: false, error: "El teléfono debe tener al menos 8 dígitos." };
  }
  if (!branchCode) {
    return { ok: false, error: "Selecciona una sucursal de atención." };
  }

  try {
    const prisma = getPrisma();
    const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
    if (!branch) {
      return { ok: false, error: "La sucursal seleccionada no existe." };
    }

    const cedula = input.cedula ? normalizeCedula(input.cedula) || null : null;
    const email = input.correo?.trim() ? input.correo.trim().toLowerCase() : null;
    const trackingCode = generateCode("SOL");

    await prisma.lead.create({
      data: {
        trackingCode,
        name,
        phone,
        cedula,
        email,
        motorcycleInterest: input.motoInteres?.trim() || null,
        motorcycleSlug: input.motoSlug?.trim() || null,
        originChannel: input.canalOrigen?.trim() || null,
        status: "NUEVO_LEAD",
        branchId: branch.id,
      },
    });

    return { ok: true, trackingCode };
  } catch {
    return {
      ok: false,
      error: "No se pudo registrar la solicitud. Inténtalo de nuevo.",
    };
  }
}

// --- Lead assignment -----------------------------------------------------

export async function assignLeadAction(input: {
  leadId: string;
  sellerId: string;
}): Promise<CrmActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canAssignLeads(session.roleEnum)) {
    return { ok: false, error: "No tienes permiso para asignar leads." };
  }

  const actorBranch = sessionBranchCode(session.branchId);

  try {
    const prisma = getPrisma();
    const lead = await prisma.lead.findUnique({
      where: { id: input.leadId },
      include: { branch: true },
    });
    if (!lead) return { ok: false, error: "El lead no existe." };

    if (!canAccessBranch(session.roleEnum, actorBranch, lead.branch.code)) {
      return { ok: false, error: "El lead no pertenece a tu sucursal." };
    }

    const seller = await prisma.user.findUnique({
      where: { id: input.sellerId },
      include: { branch: true },
    });
    if (!seller || !seller.isActive) {
      return { ok: false, error: "El vendedor seleccionado no está disponible." };
    }
    if (seller.role !== "VENDEDOR" && seller.role !== "GERENTE") {
      return { ok: false, error: "Solo puedes asignar el lead a un vendedor." };
    }
    // A manager may only assign to a seller of the same (lead) branch.
    if (
      session.roleEnum === "GERENTE" &&
      seller.branch?.code !== lead.branch.code
    ) {
      return {
        ok: false,
        error: "Solo puedes asignar leads a vendedores de tu sucursal.",
      };
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        assignedSellerId: seller.id,
        status: lead.status === "NUEVO_LEAD" ? "ASIGNADO" : lead.status,
      },
    });

    revalidatePath("/panel/leads");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo asignar el lead." };
  }
}

// --- Lead status update --------------------------------------------------

export async function updateLeadStatusAction(input: {
  leadId: string;
  status: string;
}): Promise<CrmActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canOperateCrm(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }
  if (!isLeadStatusValue(input.status)) {
    return { ok: false, error: "Estado de lead no válido." };
  }
  const nextStatus: LeadStatusValue = input.status;

  const actorBranch = sessionBranchCode(session.branchId);
  const scope = getCrmScopeForUser(session.roleEnum, actorBranch, session.uid);

  try {
    const prisma = getPrisma();
    const lead = await prisma.lead.findUnique({
      where: { id: input.leadId },
      include: { branch: true },
    });
    if (!lead) return { ok: false, error: "El lead no existe." };

    const allowed =
      scope.level === "global" ||
      (scope.level === "branch" && lead.branch.code === scope.branchCode) ||
      (scope.level === "personal" &&
        (lead.assignedSellerId === scope.userId ||
          lead.createdById === scope.userId));
    if (!allowed) {
      return { ok: false, error: "Este lead no está dentro de tu alcance." };
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: nextStatus },
    });

    revalidatePath("/panel/leads");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar el estado del lead." };
  }
}

// --- Customer creation ---------------------------------------------------

export type CreateCustomerResult =
  | { ok: true; customerId: string; deduped: boolean }
  | { ok: false; error: string };

export async function createCustomerAction(input: {
  nombre: string;
  telefono: string;
  cedula?: string | null;
  correo?: string | null;
  branchCode: string;
}): Promise<CreateCustomerResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canOperateCrm(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const name = sanitizeText(input.nombre ?? "");
  const phone = normalizePhone(input.telefono ?? "");
  const branchCode = (input.branchCode ?? "").trim();

  if (!name) return { ok: false, error: "El nombre es obligatorio." };
  if (phone.length < 8) {
    return { ok: false, error: "El teléfono debe tener al menos 8 dígitos." };
  }
  if (!branchCode) return { ok: false, error: "Selecciona una sucursal." };

  const actorBranch = sessionBranchCode(session.branchId);
  if (!canAccessBranch(session.roleEnum, actorBranch, branchCode)) {
    return { ok: false, error: "No puedes registrar clientes en esa sucursal." };
  }

  try {
    const prisma = getPrisma();
    const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
    if (!branch) return { ok: false, error: "La sucursal no existe." };

    const cedula = input.cedula ? normalizeCedula(input.cedula) || null : null;
    const email = input.correo?.trim() ? input.correo.trim().toLowerCase() : null;

    // Customers belong to MotoMas, not to a branch or seller: reuse an existing
    // record with the same normalized phone/cedula instead of duplicating it.
    const existing = await prisma.customer.findFirst({
      where: {
        OR: [
          { phoneNormalized: phone },
          ...(cedula ? [{ cedulaNormalized: cedula }] : []),
        ],
      },
    });
    if (existing) {
      return { ok: true, customerId: existing.id, deduped: true };
    }

    const customer = await prisma.customer.create({
      data: {
        branchId: branch.id,
        name,
        phone,
        phoneNormalized: phone,
        cedula: input.cedula?.trim() || null,
        cedulaNormalized: cedula,
        email,
      },
    });

    return { ok: true, customerId: customer.id, deduped: false };
  } catch {
    return { ok: false, error: "No se pudo registrar el cliente." };
  }
}

// --- Expediente (customer file) creation ---------------------------------

export type CreateExpedienteResult =
  | { ok: true; expedienteId: string; fileNumber: string }
  | { ok: false; error: string };

export async function createExpedienteAction(input: {
  customerId: string;
  branchCode: string;
  leadId?: string | null;
  sellerId?: string | null;
  motoInteres?: string | null;
  observaciones?: string | null;
}): Promise<CreateExpedienteResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canOperateCrm(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const branchCode = (input.branchCode ?? "").trim();
  if (!input.customerId) return { ok: false, error: "Selecciona un cliente." };
  if (!branchCode) return { ok: false, error: "Selecciona una sucursal." };

  const actorBranch = sessionBranchCode(session.branchId);
  if (!canAccessBranch(session.roleEnum, actorBranch, branchCode)) {
    return { ok: false, error: "No puedes crear expedientes en esa sucursal." };
  }

  // A seller always owns their own expediente; managers/admin may set a seller.
  const sellerId =
    session.roleEnum === "VENDEDOR"
      ? session.uid
      : input.sellerId?.trim() || null;

  try {
    const prisma = getPrisma();
    const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
    if (!branch) return { ok: false, error: "La sucursal no existe." };

    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
    });
    if (!customer) return { ok: false, error: "El cliente no existe." };

    let leadId: string | null = null;
    if (input.leadId) {
      const lead = await prisma.lead.findUnique({
        where: { id: input.leadId },
        include: { branch: true },
      });
      if (!lead) return { ok: false, error: "El lead no existe." };
      if (!canAccessBranch(session.roleEnum, actorBranch, lead.branch.code)) {
        return { ok: false, error: "El lead no pertenece a tu alcance." };
      }
      leadId = lead.id;
    }

    const fileNumber = generateCode("EXP");

    const created = await prisma.$transaction(async (tx) => {
      const file = await tx.customerFile.create({
        data: {
          fileNumber,
          customerId: customer.id,
          leadId,
          branchId: branch.id,
          sellerId,
          motorcycleInterest: input.motoInteres?.trim() || null,
          status: "ABIERTO",
          notes: input.observaciones?.trim() || null,
        },
      });

      if (leadId) {
        await tx.lead.update({
          where: { id: leadId },
          data: {
            status: "EXPEDIENTE",
            customerId: customer.id,
          },
        });
      }

      return file;
    });

    return { ok: true, expedienteId: created.id, fileNumber };
  } catch {
    return { ok: false, error: "No se pudo crear el expediente." };
  }
}
