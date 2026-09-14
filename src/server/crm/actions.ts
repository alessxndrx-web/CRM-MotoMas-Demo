"use server";

import { revalidatePath } from "next/cache";

import {
  canAccessBranch,
  canAssignCustomers,
  canAssignLeads,
  canOperateCrm,
  getCrmScopeForUser,
  isGlobalScopeRole,
  type CrmScope,
} from "@/server/auth/access";
import { getCurrentUserSession } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { generateCrmCode } from "@/server/crm/codes";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  isLeadStatusValue,
  isManualLeadOrigin,
  leadStatusLabels,
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

/**
 * Patch CRM-QA1. ¿Alcanza este actor a este lead? Se declaró al extraer la
 * comprobación que `updateLeadStatusAction` tenía en línea: ahora la usan tres
 * acciones, y repetirla era garantizar que una de ellas acabara divergiendo.
 */
function leadInScope(
  scope: CrmScope,
  lead: {
    assignedSellerId: string | null;
    createdById: string | null;
    branch: { code: string };
  },
): boolean {
  if (scope.level === "global") return true;
  if (scope.level === "branch") return lead.branch.code === scope.branchCode;
  return (
    lead.assignedSellerId === scope.userId || lead.createdById === scope.userId
  );
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
    const trackingCode = generateCrmCode("SOL");

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
    if (
      seller.role !== "VENDEDOR" &&
      seller.role !== "LIDER_VENTAS" &&
      seller.role !== "GERENTE"
    ) {
      return { ok: false, error: "Solo puedes asignar el lead a un vendedor." };
    }
    // A branch-scoped assigner may only assign to a seller of the lead's branch.
    if (
      session.roleEnum !== "ADMIN" &&
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

    if (!leadInScope(scope, lead)) {
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
        // Patch CRM-QA1. Un vendedor que registra un cliente se lo queda: si
        // naciera sin dueño desaparecería de su propia lista en cuanto la
        // guardara, que es la razón por la que este formulario no servía de nada.
        ...(session.roleEnum === "VENDEDOR"
          ? {
              assignedSellerId: session.uid,
              assignedById: session.uid,
              assignedAt: new Date(),
            }
          : {}),
      },
    });

    revalidatePath("/panel/clientes");
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

    const fileNumber = generateCrmCode("EXP");

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

    revalidatePath("/panel/expedientes");
    revalidatePath("/panel/leads");
    return { ok: true, expedienteId: created.id, fileNumber };
  } catch {
    return { ok: false, error: "No se pudo crear el expediente." };
  }
}

// --- Manual lead registration (Patch CRM-QA1) ----------------------------

/**
 * El duplicado que la acción encontró. **No es un error**: un cliente que ya
 * pasó por MotoMas puede volver, y bloquearlo sería peor que crear la fila de
 * más. La acción devuelve el lead vivo que ya existe para que la pantalla ofrezca
 * abrirlo en lugar de crear un segundo con el mismo teléfono.
 */
export type ManualLeadDuplicate = {
  leadId: string;
  trackingCode: string;
  name: string;
  statusLabel: string;
  assignedSellerName: string | null;
};

export type CreateLeadResult =
  | { ok: true; leadId: string; trackingCode: string }
  | { ok: false; error: string; duplicate?: ManualLeadDuplicate };

export type CreateLeadInput = {
  nombre: string;
  telefono: string;
  cedula?: string | null;
  correo?: string | null;
  /** Uno de `manualLeadOrigins`. */
  origen: string;
  /** Modelo del catálogo que le interesa. Opcional. */
  catalogModelId?: string | null;
  /** Texto libre cuando la moto no está en el catálogo. */
  motoInteres?: string | null;
  /** Sólo lo eligen los roles globales; el resto hereda su sucursal. */
  branchCode?: string | null;
  /** Sólo lo eligen quienes pueden asignar; un vendedor se queda su lead. */
  vendedorId?: string | null;
  observaciones?: string | null;
  /** Crear igualmente pese al aviso de duplicado. */
  forzarDuplicado?: boolean;
};

/**
 * Alta manual de un lead desde el panel — el botón que la QA echó en falta.
 *
 * ## Por qué no basta con `createPublicLeadAction`
 *
 * Aquella es la del portal: no tiene sesión, así que no puede poner autor, ni
 * asignar vendedor, ni validar sucursal contra el alcance de nadie, ni aceptar
 * un modelo del catálogo. Reutilizarla habría dejado todo lead registrado en
 * mostrador sin dueño y sin autor, que es exactamente el agujero por el que un
 * vendedor no veía nada en su bandeja.
 *
 * ## A quién queda asignado
 *
 * Un VENDEDOR se queda **siempre** el lead que registra: es suyo por definición
 * y no puede repartirlo. Un rol con {@link canAssignLeads} puede dejarlo sin
 * asignar o dárselo a alguien de la sucursal del lead.
 *
 * ## Duplicados
 *
 * Reutiliza la misma normalización de teléfono y cédula que `createCustomerAction`.
 * Un lead **vivo** (ni EXPEDIENTE ni DESCARTADO) con el mismo teléfono o la
 * misma cédula detiene el alta y devuelve cuál es; volver a llamar con
 * `forzarDuplicado` la completa. No se bloquea al cliente que regresa: los leads
 * cerrados no cuentan como duplicado.
 */
export async function createLeadAction(
  input: CreateLeadInput,
): Promise<CreateLeadResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canOperateCrm(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const name = sanitizeText(input.nombre ?? "");
  const phone = normalizePhone(input.telefono ?? "");
  if (!name) return { ok: false, error: "El nombre es obligatorio." };
  if (phone.length < 8) {
    return { ok: false, error: "El teléfono debe tener al menos 8 dígitos." };
  }

  const origin = sanitizeText(input.origen ?? "");
  if (!isManualLeadOrigin(origin)) {
    return { ok: false, error: "Selecciona un origen válido para el lead." };
  }

  const actorBranch = sessionBranchCode(session.branchId);
  // Un rol de sucursal no elige dónde cae el lead: cae en la suya. Sólo un rol
  // global tiene que decirlo, porque no tiene ninguna.
  const branchCode = isGlobalScopeRole(session.roleEnum)
    ? (input.branchCode ?? "").trim()
    : (actorBranch ?? "");
  if (!branchCode) {
    return { ok: false, error: "Selecciona una sucursal de atención." };
  }
  if (!canAccessBranch(session.roleEnum, actorBranch, branchCode)) {
    return { ok: false, error: "No puedes registrar leads en esa sucursal." };
  }

  const cedula = input.cedula ? normalizeCedula(input.cedula) || null : null;
  const email = input.correo?.trim() ? input.correo.trim().toLowerCase() : null;

  try {
    const prisma = getPrisma();
    const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
    if (!branch) return { ok: false, error: "La sucursal seleccionada no existe." };

    // Quién se queda el lead.
    let assignedSellerId: string | null = null;
    if (session.roleEnum === "VENDEDOR") {
      assignedSellerId = session.uid;
    } else if (input.vendedorId?.trim()) {
      if (!canAssignLeads(session.roleEnum)) {
        return { ok: false, error: "No tienes permiso para asignar leads." };
      }
      const seller = await prisma.user.findUnique({
        where: { id: input.vendedorId.trim() },
        include: { branch: true },
      });
      if (!seller || !seller.isActive) {
        return { ok: false, error: "El vendedor seleccionado no está disponible." };
      }
      if (seller.role !== "VENDEDOR" && seller.role !== "LIDER_VENTAS") {
        return { ok: false, error: "Solo puedes asignar el lead a un vendedor." };
      }
      if (seller.branch?.code !== branch.code) {
        return {
          ok: false,
          error: "Solo puedes asignar leads a vendedores de esa sucursal.",
        };
      }
      assignedSellerId = seller.id;
    }

    // Modelo del catálogo, si lo eligió.
    let catalogModelId: string | null = null;
    let catalogLabel: string | null = null;
    let catalogSlug: string | null = null;
    if (input.catalogModelId?.trim()) {
      const model = await prisma.motorcycleCatalogModel.findUnique({
        where: { id: input.catalogModelId.trim() },
      });
      if (!model || !model.isActive) {
        return { ok: false, error: "El modelo de motocicleta no está disponible." };
      }
      catalogModelId = model.id;
      catalogLabel = `${model.brand} ${model.model}`.trim();
      catalogSlug = model.slug;
    }

    if (!input.forzarDuplicado) {
      const duplicate = await prisma.lead.findFirst({
        where: {
          status: { notIn: ["EXPEDIENTE", "DESCARTADO"] },
          OR: [
            { phone },
            ...(cedula ? [{ cedula }] : []),
          ],
        },
        include: { assignedSeller: true },
        orderBy: { createdAt: "desc" },
      });
      if (duplicate) {
        const status = duplicate.status as LeadStatusValue;
        return {
          ok: false,
          error:
            `Ya existe un lead activo con ese contacto (${duplicate.trackingCode}). ` +
            "Revísalo antes de crear otro.",
          duplicate: {
            leadId: duplicate.id,
            trackingCode: duplicate.trackingCode,
            name: duplicate.name,
            statusLabel: leadStatusLabels[status] ?? duplicate.status,
            assignedSellerName: duplicate.assignedSeller?.name ?? null,
          },
        };
      }
    }

    const trackingCode = generateCrmCode("SOL");
    const created = await prisma.lead.create({
      data: {
        trackingCode,
        name,
        phone,
        cedula,
        email,
        // El texto libre sigue existiendo: es lo que la ficha enseña cuando la
        // moto no está en el catálogo, y lo que el portal público ya escribía.
        motorcycleInterest:
          sanitizeText(input.motoInteres ?? "") || catalogLabel || null,
        motorcycleSlug: catalogSlug,
        catalogModelId,
        originChannel: origin,
        status: assignedSellerId ? "ASIGNADO" : "NUEVO_LEAD",
        branchId: branch.id,
        assignedSellerId,
        createdById: session.uid,
        notes: sanitizeText(input.observaciones ?? "").slice(0, 500) || null,
      },
    });

    revalidatePath("/panel/leads");
    return { ok: true, leadId: created.id, trackingCode };
  } catch {
    return { ok: false, error: "No se pudo registrar el lead." };
  }
}

/**
 * Cambia la moto de interés de un lead sin tocar nada más.
 *
 * **[R] Acción propia y no un campo en una edición general.** El requisito
 * explícito era que editar otros datos del lead no borrase la moto asociada; la
 * forma de garantizarlo es que ninguna otra acción escriba esta columna. Aquí
 * sólo se escribe la moto.
 */
export async function setLeadMotorcycleAction(input: {
  leadId: string;
  catalogModelId: string | null;
}): Promise<CrmActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canOperateCrm(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const scope = getCrmScopeForUser(
    session.roleEnum,
    sessionBranchCode(session.branchId),
    session.uid,
  );

  try {
    const prisma = getPrisma();
    const lead = await prisma.lead.findUnique({
      where: { id: input.leadId },
      include: { branch: true },
    });
    if (!lead) return { ok: false, error: "El lead no existe." };
    if (!leadInScope(scope, lead)) {
      return { ok: false, error: "Este lead no está dentro de tu alcance." };
    }

    if (!input.catalogModelId) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { catalogModelId: null },
      });
      revalidatePath("/panel/leads");
      return { ok: true };
    }

    const model = await prisma.motorcycleCatalogModel.findUnique({
      where: { id: input.catalogModelId },
    });
    if (!model || !model.isActive) {
      return { ok: false, error: "El modelo de motocicleta no está disponible." };
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        catalogModelId: model.id,
        motorcycleSlug: model.slug,
        motorcycleInterest: `${model.brand} ${model.model}`.trim(),
      },
    });
    revalidatePath("/panel/leads");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar la moto de interés." };
  }
}

// --- Customer assignment (Patch CRM-QA1) ---------------------------------

/**
 * Mueve un cliente a la cartera de un vendedor, o la vacía.
 *
 * **Reasignar no toca la historia.** Los leads, expedientes, reservas y ventas
 * del cliente conservan el vendedor que tuvieron en su momento: esta acción sólo
 * escribe el puntero vivo de `Customer` y su rastro de auditoría. Esa separación
 * es la que permite mover la cartera sin que la atribución comercial ya
 * registrada cambie debajo de un informe.
 */
export async function assignCustomerAction(input: {
  customerId: string;
  /** Cadena vacía o nulo para dejarlo sin asignar. */
  sellerId: string | null;
}): Promise<CrmActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canAssignCustomers(session.roleEnum)) {
    return { ok: false, error: "No tienes permiso para asignar clientes." };
  }

  const actorBranch = sessionBranchCode(session.branchId);

  try {
    const prisma = getPrisma();
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      include: { branch: true },
    });
    if (!customer) return { ok: false, error: "El cliente no existe." };
    if (!canAccessBranch(session.roleEnum, actorBranch, customer.branch.code)) {
      return { ok: false, error: "El cliente no pertenece a tu sucursal." };
    }

    const sellerId = input.sellerId?.trim() || null;
    if (!sellerId) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { assignedSellerId: null, assignedById: session.uid, assignedAt: new Date() },
      });
      revalidatePath("/panel/clientes");
      return { ok: true };
    }

    const seller = await prisma.user.findUnique({
      where: { id: sellerId },
      include: { branch: true },
    });
    if (!seller || !seller.isActive) {
      return { ok: false, error: "El vendedor seleccionado no está disponible." };
    }
    if (seller.role !== "VENDEDOR" && seller.role !== "LIDER_VENTAS") {
      return { ok: false, error: "Solo puedes asignar el cliente a un vendedor." };
    }
    // Un rol de sucursal sólo reparte dentro de la suya; el Administrador, que
    // es global, reparte al equipo de la sucursal del cliente.
    if (seller.branch?.code !== customer.branch.code) {
      return {
        ok: false,
        error: "Solo puedes asignar el cliente a un vendedor de su sucursal.",
      };
    }

    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        assignedSellerId: seller.id,
        assignedById: session.uid,
        assignedAt: new Date(),
      },
    });

    revalidatePath("/panel/clientes");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo asignar el cliente." };
  }
}
