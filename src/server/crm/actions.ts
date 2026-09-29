"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import {
  canAccessBranch,
  canAssignCustomers,
  canAssignLeads,
  canChangeCustomerBranch,
  canOperateCrm,
  getCrmScopeForUser,
  isGlobalScopeRole,
  type CrmScope,
} from "@/server/auth/access";
import { getCurrentUserSession } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { resolveCatalogModelForInterest } from "@/server/catalog/service";
import { catalogModelLabel } from "@/server/catalog/shared";
import { generateCrmCode } from "@/server/crm/codes";
import {
  findIdentityMatch,
  leadMatchesCustomer,
  lockIdentity,
  toCandidateDTO,
  type IdentityMatch,
} from "@/server/crm/identity";
import { canAccessCustomer } from "@/server/crm/queries";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { resolveAttributableCampaign } from "@/server/marketing/attribution";
import { notifyUsers } from "@/server/notifications/service";
import {
  isLeadStatusValue,
  isManualLeadOrigin,
  leadStatusLabels,
  normalizeCedula,
  normalizePhone,
  phoneMatchKeys,
  sanitizeText,
  type IdentityResolutionNeeded,
  type LeadStatusValue,
} from "@/server/crm/shared";

/**
 * Server-side CRM write actions (Patch 3.1B). Every authenticated action
 * re-checks the session role/branch scope; authorization is enforced here, not
 * in the UI. The public lead creation action intentionally needs no session.
 *
 * These actions never touch inventory units, reservations, sales, transfers,
 * Caja or Contabilidad, and never expose costs.
 *
 * Patch CRM-INT1 cierra aquí la cadena lead → cliente → expediente que estaba
 * rota: la sucursal del cliente la resuelve el servidor, existe por fin la
 * conversión de un lead en cliente, y crear un expediente comprueba que el
 * cliente está al alcance de quien lo crea.
 */

const DB_REQUIRED =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";
const NO_SESSION = "Sesión no válida.";
const NO_PERMISSION = "No tienes permiso para operar el CRM.";
const NO_BRANCH_ASSIGNED =
  "Tu usuario no tiene una sucursal asignada. Pide al Administrador que te asigne una.";

export type CrmActionResult = { ok: true } | { ok: false; error: string };

function sessionBranchCode(branchId: string): string | null {
  return branchId === GLOBAL_BRANCH_ID ? null : branchId;
}

/**
 * Patch CRM-QA1. ¿Alcanza este actor a este lead? Se declaró al extraer la
 * comprobación que `updateLeadStatusAction` tenía en línea: ahora la usan
 * varias acciones, y repetirla era garantizar que una de ellas acabara
 * divergiendo.
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

/**
 * Patch CRM-INT1 — ¿puede esta persona quedarse con clientes o leads de esta
 * sucursal? Vendedor o Líder de ventas, activo y de esa misma sucursal. La
 * usan el alta de cliente, la conversión del lead y el expediente, que antes
 * aceptaban cualquier id de usuario como vendedor.
 */
async function resolveBranchSeller(
  db: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
  sellerId: string,
  branchId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const seller = await db.user.findUnique({ where: { id: sellerId } });
  if (!seller || !seller.isActive) {
    return { ok: false, error: "El vendedor seleccionado no está disponible." };
  }
  if (seller.role !== "VENDEDOR" && seller.role !== "LIDER_VENTAS") {
    return { ok: false, error: "Solo puedes asignar a un vendedor o líder de ventas." };
  }
  if (seller.branchId !== branchId) {
    return { ok: false, error: "El vendedor debe pertenecer a la misma sucursal." };
  }
  return { ok: true, id: seller.id };
}

/**
 * Patch CRM-INT1 — el lead cambia de manos, y queda escrito.
 *
 * Una sola función para el alta con vendedor y para la reasignación, porque
 * las dos tienen que dejar la misma huella: el puntero vivo del lead, sus dos
 * fechas y una fila nueva en `LeadAssignment`. Nunca se reescribe una fila de
 * la historia.
 *
 * `firstAssignedAt` sólo se fija cuando esta es de verdad la primera
 * asignación: un lead que ya tenía vendedor antes de este parche no tiene
 * fecha inicial conocida, y reasignarlo hoy no la convierte en «hoy».
 *
 * La actualización lleva el vendedor anterior en el `where`: si otra persona
 * lo reasignó entre la lectura y la escritura, no se pisa su cambio.
 */
async function recordLeadAssignment(
  tx: Prisma.TransactionClient,
  input: {
    lead: {
      id: string;
      branchId: string;
      status: string;
      assignedSellerId: string | null;
      firstAssignedAt: Date | null;
    };
    sellerId: string;
    assignedById: string;
  },
): Promise<boolean> {
  const now = new Date();
  const { lead } = input;
  const updated = await tx.lead.updateMany({
    where: { id: lead.id, assignedSellerId: lead.assignedSellerId },
    data: {
      assignedSellerId: input.sellerId,
      assignedAt: now,
      firstAssignedAt:
        lead.firstAssignedAt ?? (lead.assignedSellerId ? null : now),
      status: lead.status === "NUEVO_LEAD" ? "ASIGNADO" : undefined,
    },
  });
  if (updated.count === 0) return false;

  await tx.leadAssignment.create({
    data: {
      leadId: lead.id,
      branchId: lead.branchId,
      sellerId: input.sellerId,
      previousSellerId: lead.assignedSellerId,
      assignedById: input.assignedById,
      assignedAt: now,
    },
  });
  return true;
}

/**
 * La regla de atribución (campaña vigente, que cubre la sucursal y no está
 * finalizada) vive en `src/server/marketing/attribution.ts` desde Patch
 * CRM-INT3: la comparten este archivo y la entrada de Meta Lead Ads.
 */

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
  /**
   * Patch CRM-INT1 — la campaña y los parámetros del enlace por el que llegó.
   *
   * El enlace que Marketing copia (`?campaignId=…&utm_source=…`) llegaba hasta
   * el formulario y **se perdía ahí**: sólo el guardado local los recibía, así
   * que en producción ningún lead quedaba atribuido a ninguna campaña y el
   * contador de leads de cada campaña marcaba siempre cero.
   */
  campaignId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
};

export type CreatePublicLeadResult =
  | { ok: true; trackingCode: string }
  | { ok: false; error: string };

function optionalUtm(value: string | null | undefined): string | null {
  const clean = sanitizeText(value ?? "");
  return clean ? clean.slice(0, 120) : null;
}

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
    if (!branch || !branch.isActive) {
      return { ok: false, error: "La sucursal seleccionada no existe." };
    }

    const cedula = input.cedula ? normalizeCedula(input.cedula) || null : null;
    const email = input.correo?.trim() ? input.correo.trim().toLowerCase() : null;
    const trackingCode = generateCrmCode("SOL");

    // Patch CRM-INT1. La moto del portal, traducida al catálogo cuando la
    // coincidencia es exacta; si no, el lead conserva su texto libre y un
    // vendedor la elige en la ficha. Ver `resolveCatalogModelForInterest`.
    const catalog = await resolveCatalogModelForInterest(prisma, {
      slug: input.motoSlug,
      text: input.motoInteres,
    });
    // Una campaña inválida, finalizada o de otra sucursal no impide pedir
    // información: el cliente no puede arreglar el enlace que recibió. Se
    // registra el lead sin atribución y con sus parámetros UTM intactos.
    const marketingCampaignId = await resolveAttributableCampaign(
      prisma,
      input.campaignId,
      branch.id,
      new Date(),
    );

    await prisma.lead.create({
      data: {
        trackingCode,
        name,
        phone,
        cedula,
        email,
        motorcycleInterest: input.motoInteres?.trim() || null,
        motorcycleSlug: input.motoSlug?.trim() || null,
        catalogModelId: catalog?.id ?? null,
        originChannel: input.canalOrigen?.trim() || null,
        marketingCampaignId,
        campaignAttributionSource: marketingCampaignId ? "ENLACE_CAMPANA" : null,
        utmSource: optionalUtm(input.utmSource),
        utmMedium: optionalUtm(input.utmMedium),
        utmCampaign: optionalUtm(input.utmCampaign),
        utmContent: optionalUtm(input.utmContent),
        utmTerm: optionalUtm(input.utmTerm),
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

    // Patch CRM-INT1. Volver a elegir al mismo vendedor no es una asignación:
    // no se escribe historia de algo que no cambió.
    if (lead.assignedSellerId === seller.id) return { ok: true };

    // Patch CRM-AUD2. El aviso va DENTRO de la transacción del hecho: si la
    // asignación se deshace, el vendedor no se entera de un trabajo que no
    // tiene. Hasta aquí un lead repartido esperaba a que su vendedor entrara a
    // mirar la bandeja por su cuenta.
    const applied = await prisma.$transaction(async (tx) => {
      const recorded = await recordLeadAssignment(tx, {
        lead,
        sellerId: seller.id,
        assignedById: session.uid,
      });
      if (!recorded) return false;
      await notifyUsers(tx, {
        userIds: [seller.id],
        exceptUserId: session.uid,
        kind: "LEAD_ASIGNADO",
        title: lead.assignedSellerId
          ? "Te reasignaron un lead"
          : "Te asignaron un lead",
        body: `${lead.name} · ${lead.phone}`,
        leadId: lead.id,
      });
      return true;
    });
    if (!applied) {
      return {
        ok: false,
        error: "Otra persona reasignó este lead mientras tanto. Recarga la lista.",
      };
    }

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
  | { ok: true; customerId: string; deduped: boolean; branchName: string }
  | { ok: false; error: string; resolution?: IdentityResolutionNeeded };

/**
 * Patch CRM-INT2 — traduce una coincidencia ambigua a lo que la pantalla puede
 * enseñar y decidir.
 *
 * `canResolve`: quien supervisa (reparte cartera) puede decidir siempre; un
 * vendedor, sólo si ve a todas las candidatas —si no, no tiene con qué
 * decidir—. Vincular exige además poder ver al cliente elegido.
 */
async function describeAmbiguity(
  scope: CrmScope,
  role: Parameters<typeof canAssignCustomers>[0],
  match: Extract<IdentityMatch, { kind: "AMBIGUA" }> | Extract<IdentityMatch, { kind: "CEDULA" }>,
): Promise<IdentityResolutionNeeded> {
  const rows = match.kind === "CEDULA" ? [match.customer] : match.candidates;
  const access = await Promise.all(rows.map((row) => canAccessCustomer(scope, row.id)));
  const candidates = rows.map((row, index) => toCandidateDTO(row, access[index]));
  const allVisible = access.every(Boolean);
  const cedulaMatch = match.kind === "CEDULA" || match.cedulaMatch;
  return {
    reason:
      match.kind === "CEDULA"
        ? `Ya existe un cliente con esta cédula en la sucursal ${match.customer.branch.name}, y no está en tu alcance. Un gerente o el administrador debe vincularlo.`
        : match.reason,
    candidates,
    canResolve: canAssignCustomers(role) || allVisible,
    canCreateNew: !cedulaMatch,
  };
}

/**
 * Da de alta un cliente.
 *
 * ## La sucursal la decide el servidor
 *
 * Patch CRM-INT1 — **ésta era la causa de «no se puede crear el cliente».** El
 * formulario sólo pintaba selector de sucursal a los roles globales; para el
 * resto enviaba la sucursal *del primer cliente de su lista*, y un vendedor sin
 * clientes enviaba la cadena vacía y recibía «Selecciona una sucursal» sin
 * ningún selector que tocar.
 *
 * Ahora, como en `createLeadAction`: un rol de sucursal registra en la suya y
 * no elige; un rol global elige entre las sucursales activas. Una sucursal
 * desactivada no admite clientes nuevos.
 *
 * ## Un cliente, una sucursal
 *
 * `Customer.branchId` es una sola sucursal y así se queda: no existe la
 * pertenencia múltiple. Cambiarlo de sucursal es
 * {@link updateCustomerBranchAction}.
 *
 * ## ¿Ya existe? (Patch CRM-INT2)
 *
 * Antes, cualquier cliente con el mismo teléfono **o** la misma cédula se daba
 * por la misma persona y se devolvía «reutilizado». Ahora decide
 * `findIdentityMatch`: sólo una cédula válida identifica; un teléfono
 * compartido devuelve la coincidencia (`resolution`) y el alta no sigue hasta
 * que alguien confirme que es otra persona (`confirmarNuevo`). Nunca se crea un
 * segundo cliente con una cédula que ya existe. La búsqueda y el alta ocurren
 * bajo un candado por teléfono y cédula, así que dos altas simultáneas de la
 * misma persona no producen dos filas.
 *
 * ## A quién queda asignado
 *
 * Un VENDEDOR se lo queda siempre (si naciera sin dueño desaparecería de su
 * propia lista). Un Líder de ventas también, salvo que elija a otro vendedor.
 * Gerente y Administrador pueden dejarlo sin asignar o asignarlo a un vendedor
 * de esa sucursal.
 */
export async function createCustomerAction(input: {
  nombre: string;
  telefono: string;
  cedula?: string | null;
  correo?: string | null;
  /** Sólo lo eligen los roles globales; el resto hereda su sucursal. */
  branchCode?: string | null;
  /** Sólo quienes pueden repartir cartera. */
  vendedorId?: string | null;
  /**
   * Patch CRM-INT2 — confirma que es una persona distinta de las que comparten
   * su teléfono. No sirve contra una cédula que ya existe.
   */
  confirmarNuevo?: boolean;
}): Promise<CreateCustomerResult> {
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
  const email = input.correo?.trim() ? input.correo.trim().toLowerCase() : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "El correo no tiene un formato válido." };
  }

  const actorBranch = sessionBranchCode(session.branchId);
  const requested = (input.branchCode ?? "").trim();
  let branchCode: string;
  if (isGlobalScopeRole(session.roleEnum)) {
    if (!requested) return { ok: false, error: "Selecciona la sucursal del cliente." };
    branchCode = requested;
  } else {
    if (!actorBranch) return { ok: false, error: NO_BRANCH_ASSIGNED };
    if (requested && requested !== actorBranch) {
      return { ok: false, error: "No puedes registrar clientes en otra sucursal." };
    }
    branchCode = actorBranch;
  }
  if (!canAccessBranch(session.roleEnum, actorBranch, branchCode)) {
    return { ok: false, error: "No puedes registrar clientes en esa sucursal." };
  }

  const scope = getCrmScopeForUser(session.roleEnum, actorBranch, session.uid);

  try {
    const prisma = getPrisma();
    const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
    if (!branch) return { ok: false, error: "La sucursal no existe." };
    if (!branch.isActive) {
      return { ok: false, error: `La sucursal ${branch.name} está desactivada.` };
    }

    const cedula = input.cedula ? normalizeCedula(input.cedula) || null : null;

    let assignedSellerId: string | null = null;
    if (input.vendedorId?.trim() && canAssignCustomers(session.roleEnum)) {
      const seller = await resolveBranchSeller(prisma, input.vendedorId.trim(), branch.id);
      if (!seller.ok) return seller;
      assignedSellerId = seller.id;
    } else if (
      session.roleEnum === "VENDEDOR" ||
      session.roleEnum === "LIDER_VENTAS"
    ) {
      // Patch CRM-QA1. Un vendedor que registra un cliente se lo queda: si
      // naciera sin dueño desaparecería de su propia lista en cuanto la
      // guardara, que es la razón por la que este formulario no servía de nada.
      assignedSellerId = session.uid;
    }

    const outcome = await prisma.$transaction(async (tx) => {
      await lockIdentity(tx, { phone, cedula });
      const match = await findIdentityMatch(tx, { phone, cedula });

      if (match.kind === "CEDULA") {
        // La cédula identifica: es esa persona. Si quien registra puede verla,
        // se reutiliza; si no, se explica sin enseñar su ficha.
        if (await canAccessCustomer(scope, match.customer.id)) {
          return { type: "EXISTENTE" as const, customerId: match.customer.id, branchName: match.customer.branch.name };
        }
        return { type: "RESOLVER" as const, resolution: await describeAmbiguity(scope, session.roleEnum, match) };
      }
      if (match.kind === "AMBIGUA") {
        const resolution = await describeAmbiguity(scope, session.roleEnum, match);
        if (!input.confirmarNuevo || !resolution.canResolve || !resolution.canCreateNew) {
          return { type: "RESOLVER" as const, resolution };
        }
      }

      const created = await tx.customer.create({
        data: {
          branchId: branch.id,
          name,
          phone,
          phoneNormalized: phone,
          cedula: input.cedula?.trim() || null,
          cedulaNormalized: cedula,
          email,
          ...(assignedSellerId
            ? {
                assignedSellerId,
                assignedById: session.uid,
                assignedAt: new Date(),
              }
            : {}),
        },
      });
      if (match.kind === "AMBIGUA") {
        await tx.userAuditLog.create({
          data: {
            actorUserId: session.uid,
            action: "CUSTOMER_CREATED_DESPITE_MATCH",
            targetType: "Customer",
            targetId: created.id,
            description: `Registró a ${name} como cliente nuevo pese a coincidir el teléfono con ${match.candidates.length} cliente(s).`,
          },
        });
      }
      if (assignedSellerId) {
        await notifyUsers(tx, {
          userIds: [assignedSellerId],
          exceptUserId: session.uid,
          kind: "CLIENTE_ASIGNADO",
          title: "Te asignaron un cliente",
          body: `${name} · ${phone}`,
          customerId: created.id,
        });
      }
      return { type: "CREADO" as const, customerId: created.id };
    });

    if (outcome.type === "RESOLVER") {
      return {
        ok: false,
        error: outcome.resolution.reason,
        resolution: outcome.resolution,
      };
    }
    revalidatePath("/panel/clientes");
    return outcome.type === "EXISTENTE"
      ? { ok: true, customerId: outcome.customerId, deduped: true, branchName: outcome.branchName }
      : { ok: true, customerId: outcome.customerId, deduped: false, branchName: branch.name };
  } catch {
    return { ok: false, error: "No se pudo registrar el cliente." };
  }
}

// --- Lead → customer conversion (Patch CRM-INT1, CRM-INT2) ---------------

export type ConvertLeadResult =
  | { ok: true; customerId: string; created: boolean }
  | { ok: false; error: string; resolution?: IdentityResolutionNeeded };

/**
 * Cómo resolver una coincidencia que no es inequívoca: vincular con un cliente
 * concreto de entre las candidatas, o crear uno nuevo porque es otra persona.
 */
export type LeadConversionResolution =
  | { tipo: "VINCULAR"; customerId: string }
  | { tipo: "CREAR_NUEVO" };

/**
 * Convierte un lead en cliente, o lo enlaza con el cliente que ya existe.
 *
 * ## El eslabón que faltaba (CRM-INT1)
 *
 * `Lead.customerId` sólo lo escribía `createExpedienteAction`, que a su vez
 * exigía un cliente ya enlazado. Ninguna pantalla podía llevar un lead hasta un
 * crédito. Ésta es la acción que rompe ese círculo.
 *
 * ## Quién es (CRM-INT2)
 *
 * La versión de CRM-INT1 enlazaba con el primer cliente que compartiera
 * teléfono **o** cédula: un teléfono de familia bastaba para colgar el lead —y
 * luego su expediente y su crédito— de otra persona, y entre varias
 * coincidencias elegía el orden de las filas. Ahora decide
 * `findIdentityMatch`:
 *
 * - **Sin coincidencias** → se crea el cliente con los datos del lead, en su
 *   sucursal y en la cartera de su vendedor.
 * - **Una cédula válida que coincide** → se vincula, **si quien convierte ya
 *   puede ver a ese cliente**. Si no, pide resolución: vincularlo le daría
 *   acceso a la ficha completa de alguien por teclear su cédula en un lead.
 * - **Sólo el teléfono, o varias candidatas** → no se decide solo. Devuelve las
 *   candidatas (enmascaradas si quien pregunta no puede verlas) y espera una
 *   `resolucion` explícita: vincular con una candidata que pueda ver, o crear
 *   un cliente nuevo si ninguna comparte la cédula.
 *
 * Todo ocurre en una transacción bajo el candado de identidad: dos
 * conversiones simultáneas de la misma persona no crean dos clientes, y dos
 * conversiones del mismo lead no le cambian el cliente por debajo. Un cliente
 * existente **nunca se modifica** al vincularlo: ni nombre, ni teléfono, ni
 * cartera. Cada resolución explícita queda en `UserAuditLog`.
 *
 * Idempotente: un lead ya convertido devuelve su cliente, también cuando las
 * dos peticiones llegan a la vez (se relee el lead tras obtener el candado).
 */
export async function convertLeadToCustomerAction(input: {
  leadId: string;
  resolucion?: LeadConversionResolution | null;
}): Promise<ConvertLeadResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canOperateCrm(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const actorBranch = sessionBranchCode(session.branchId);
  const scope = getCrmScopeForUser(session.roleEnum, actorBranch, session.uid);

  try {
    const prisma = getPrisma();
    const lead = await prisma.lead.findUnique({
      where: { id: input.leadId },
      include: { branch: true, assignedSeller: true },
    });
    if (!lead || !leadInScope(scope, lead)) {
      return { ok: false, error: "El lead no existe o no está en tu alcance." };
    }
    if (lead.customerId) {
      return { ok: true, customerId: lead.customerId, created: false };
    }
    if (lead.status === "DESCARTADO") {
      return {
        ok: false,
        error: "El lead está descartado. Cámbiale el estado antes de convertirlo.",
      };
    }

    const phone = normalizePhone(lead.phone);
    const cedula = lead.cedula ? normalizeCedula(lead.cedula) || null : null;

    // La cartera de un cliente NUEVO es la del lead: quien ya lo atiende. Si el
    // lead no tiene vendedor válido, el vendedor que convierte se lo queda.
    let assignedSellerId: string | null = null;
    if (lead.assignedSellerId) {
      const seller = await resolveBranchSeller(prisma, lead.assignedSellerId, lead.branchId);
      if (seller.ok) assignedSellerId = seller.id;
    }
    if (
      !assignedSellerId &&
      (session.roleEnum === "VENDEDOR" || session.roleEnum === "LIDER_VENTAS")
    ) {
      assignedSellerId = session.uid;
    }

    const outcome = await prisma.$transaction(async (tx) => {
      await lockIdentity(tx, { phone, cedula });
      // Otra petición pudo convertir este mismo lead mientras se esperaba el
      // bloqueo (doble clic, dos pestañas). Se relee tras obtenerlo: sin esto la
      // segunda encontraba el cliente recién creado por la primera y pedía
      // «resolver» una coincidencia consigo misma.
      const current = await tx.lead.findUnique({
        where: { id: lead.id },
        select: { customerId: true },
      });
      if (current?.customerId) {
        return { type: "YA_CONVERTIDO" as const, customerId: current.customerId };
      }
      const match = await findIdentityMatch(tx, { phone, cedula });
      const candidateIds =
        match.kind === "CEDULA"
          ? [match.customer.id]
          : match.kind === "AMBIGUA"
            ? match.candidates.map((row) => row.id)
            : [];

      async function link(customerId: string, method: string) {
        // `customerId: null` en el `where`: si otra petición convirtió el lead a
        // la vez, ésta no le cambia el cliente por debajo.
        const linked = await tx.lead.updateMany({
          where: { id: lead!.id, customerId: null },
          data: { customerId },
        });
        if (linked.count === 0) throw new Error("LEAD_ALREADY_CONVERTED");
        await tx.userAuditLog.create({
          data: {
            actorUserId: session!.uid,
            action: "LEAD_LINKED_TO_CUSTOMER",
            targetType: "Lead",
            targetId: lead!.id,
            description: `Lead ${lead!.trackingCode} vinculado al cliente ${customerId} (${method}).`,
          },
        });
        return { type: "VINCULADO" as const, customerId };
      }

      const resolution = input.resolucion ?? null;
      if (resolution?.tipo === "VINCULAR") {
        // Sólo se vincula con una candidata real —una coincidencia de cédula o
        // teléfono—, nunca con un cliente cualquiera, y sólo si quien decide
        // puede verlo.
        if (!candidateIds.includes(resolution.customerId)) {
          return { type: "ERROR" as const, error: "Ese cliente no coincide con el teléfono ni la cédula del lead." };
        }
        if (!(await canAccessCustomer(scope, resolution.customerId))) {
          return { type: "ERROR" as const, error: "No puedes vincular un cliente que no está en tu alcance." };
        }
        return link(resolution.customerId, "resolución manual");
      }

      if (match.kind === "CEDULA" && !resolution) {
        if (await canAccessCustomer(scope, match.customer.id)) {
          return link(match.customer.id, "misma cédula");
        }
        return { type: "RESOLVER" as const, resolution: await describeAmbiguity(scope, session.roleEnum, match) };
      }

      if (match.kind !== "NINGUNA") {
        const needed = await describeAmbiguity(scope, session.roleEnum, match);
        if (resolution?.tipo !== "CREAR_NUEVO") {
          return { type: "RESOLVER" as const, resolution: needed };
        }
        if (!needed.canCreateNew) {
          return { type: "ERROR" as const, error: "Ya existe un cliente con esta cédula: no se crea otro. Vincúlalo." };
        }
        if (!needed.canResolve) {
          return { type: "ERROR" as const, error: "Un líder o gerente debe decidir si es otra persona." };
        }
      }

      if (!lead!.branch.isActive) {
        return {
          type: "ERROR" as const,
          error: `La sucursal ${lead!.branch.name} del lead está desactivada; no admite clientes nuevos.`,
        };
      }

      const created = await tx.customer.create({
        data: {
          branchId: lead!.branchId,
          name: lead!.name,
          phone,
          phoneNormalized: phone,
          cedula: lead!.cedula,
          cedulaNormalized: cedula,
          email: lead!.email,
          ...(assignedSellerId
            ? {
                assignedSellerId,
                assignedById: session!.uid,
                assignedAt: new Date(),
              }
            : {}),
        },
      });
      const linked = await tx.lead.updateMany({
        where: { id: lead!.id, customerId: null },
        data: { customerId: created.id },
      });
      if (linked.count === 0) throw new Error("LEAD_ALREADY_CONVERTED");
      if (match.kind !== "NINGUNA") {
        await tx.userAuditLog.create({
          data: {
            actorUserId: session!.uid,
            action: "LEAD_CONVERTED_DESPITE_MATCH",
            targetType: "Lead",
            targetId: lead!.id,
            description: `Lead ${lead!.trackingCode}: cliente nuevo ${created.id} pese a coincidir el teléfono con ${candidateIds.length} cliente(s).`,
          },
        });
      }
      if (assignedSellerId) {
        await notifyUsers(tx, {
          userIds: [assignedSellerId],
          exceptUserId: session!.uid,
          kind: "CLIENTE_ASIGNADO",
          title: "Tu lead ya es cliente",
          body: `${lead!.name} · ${phone}`,
          customerId: created.id,
        });
      }
      return { type: "CREADO" as const, customerId: created.id };
    });

    if (outcome.type === "ERROR") return { ok: false, error: outcome.error };
    if (outcome.type === "RESOLVER") {
      return { ok: false, error: outcome.resolution.reason, resolution: outcome.resolution };
    }
    if (outcome.type === "YA_CONVERTIDO") {
      return { ok: true, customerId: outcome.customerId, created: false };
    }
    revalidatePath("/panel/leads");
    revalidatePath("/panel/clientes");
    return {
      ok: true,
      customerId: outcome.customerId,
      created: outcome.type === "CREADO",
    };
  } catch (error) {
    if (error instanceof Error && error.message === "LEAD_ALREADY_CONVERTED") {
      return { ok: false, error: "Este lead acaba de convertirse. Recarga la ficha." };
    }
    return { ok: false, error: "No se pudo convertir el lead en cliente." };
  }
}

// --- Customer branch change (Patch CRM-INT1) -----------------------------

/**
 * Mueve un cliente a otra sucursal **sin tocar nada más de él**.
 *
 * Nombre, teléfono, cédula, correo, leads, expedientes, créditos, reservas y
 * ventas quedan exactamente como estaban: cada registro conserva la sucursal
 * en la que ocurrió. Lo único que cambia es qué equipo lo atiende a partir de
 * ahora.
 *
 * Si el vendedor que lo atendía no pertenece a la sucursal nueva, la cartera
 * queda sin asignar: un vendedor de otra sucursal no puede atender a un
 * cliente que ya no ve. El cambio queda en `UserAuditLog` con origen y destino.
 */
export async function updateCustomerBranchAction(input: {
  customerId: string;
  branchCode: string;
}): Promise<CrmActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canChangeCustomerBranch(session.roleEnum)) {
    return { ok: false, error: "No tienes permiso para cambiar la sucursal de un cliente." };
  }
  const actorBranch = sessionBranchCode(session.branchId);

  try {
    const prisma = getPrisma();
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      include: { branch: true, assignedSeller: true },
    });
    if (!customer) return { ok: false, error: "El cliente no existe." };
    // Un Gerente cede clientes de su sucursal; no toma los de otra.
    if (!canAccessBranch(session.roleEnum, actorBranch, customer.branch.code)) {
      return { ok: false, error: "El cliente no pertenece a tu sucursal." };
    }

    const target = await prisma.branch.findUnique({
      where: { code: (input.branchCode ?? "").trim() },
    });
    if (!target) return { ok: false, error: "La sucursal de destino no existe." };
    if (!target.isActive) {
      return { ok: false, error: `La sucursal ${target.name} está desactivada.` };
    }
    if (target.id === customer.branchId) return { ok: true };

    const keepSeller = customer.assignedSeller?.branchId === target.id;

    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          branchId: target.id,
          ...(keepSeller
            ? {}
            : customer.assignedSellerId
              ? { assignedSellerId: null, assignedById: session.uid, assignedAt: new Date() }
              : {}),
        },
      });
      await tx.userAuditLog.create({
        data: {
          actorUserId: session.uid,
          action: "CUSTOMER_BRANCH_CHANGED",
          targetType: "Customer",
          targetId: customer.id,
          description:
            `Cliente ${customer.name}: sucursal ${customer.branch.name} → ${target.name}` +
            (customer.assignedSellerId && !keepSeller
              ? `; se liberó la cartera de ${customer.assignedSeller?.name ?? "su vendedor"}.`
              : "."),
        },
      });
    });

    revalidatePath("/panel/clientes");
    revalidatePath(`/panel/clientes/${customer.id}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo cambiar la sucursal del cliente." };
  }
}

// --- Expediente (customer file) creation ---------------------------------

export type CreateExpedienteResult =
  | { ok: true; expedienteId: string; fileNumber: string }
  | { ok: false; error: string };

/**
 * Crea el expediente de un cliente (el «registro del cliente» sobre el que se
 * trabajan proforma, documentos y crédito).
 *
 * Patch CRM-INT1 — tres comprobaciones que faltaban:
 *
 * - **El cliente tiene que estar al alcance de quien crea.** Antes bastaba con
 *   conocer su id: un vendedor podía abrir un expediente sobre cualquier
 *   cliente de la empresa, y con él ganar acceso a su ficha.
 * - **El lead tiene que ser de ese cliente** (o no tener ninguno todavía, y
 *   entonces se enlaza) y estar al alcance del actor, no sólo en su sucursal.
 * - **El vendedor responsable tiene que ser un vendedor activo de la sucursal
 *   del expediente**, no cualquier id.
 *
 * La sucursal, si no llega, es la del lead o la del cliente.
 */
export async function createExpedienteAction(input: {
  customerId: string;
  branchCode?: string | null;
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
  if (!input.customerId) return { ok: false, error: "Selecciona un cliente." };

  const actorBranch = sessionBranchCode(session.branchId);
  const scope = getCrmScopeForUser(session.roleEnum, actorBranch, session.uid);

  try {
    const prisma = getPrisma();
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      include: { branch: true },
    });
    if (!customer || !(await canAccessCustomer(scope, customer.id))) {
      return { ok: false, error: "El cliente no existe o no está en tu alcance." };
    }

    let lead: {
      id: string;
      customerId: string | null;
      branchId: string;
      branch: { code: string };
    } | null = null;
    if (input.leadId) {
      const found = await prisma.lead.findUnique({
        where: { id: input.leadId },
        include: { branch: true },
      });
      if (!found || !leadInScope(scope, found)) {
        return { ok: false, error: "El lead no existe o no está en tu alcance." };
      }
      if (found.customerId && found.customerId !== customer.id) {
        return { ok: false, error: "Ese lead pertenece a otro cliente." };
      }
      // Patch CRM-INT2 — enlazar aquí un lead que aún no tiene cliente exige
      // la misma evidencia que la conversión: cédula o teléfono en común. Sin
      // esto, cualquier lead del alcance podía quedar colgado de cualquier
      // cliente visible, y con él su expediente y su crédito.
      if (!found.customerId && !leadMatchesCustomer(found, customer)) {
        return {
          ok: false,
          error:
            "El lead no comparte teléfono ni cédula con ese cliente. Conviértelo desde la ficha del lead.",
        };
      }
      lead = found;
    }

    const branchCode =
      (input.branchCode ?? "").trim() || lead?.branch.code || customer.branch.code;
    if (!canAccessBranch(session.roleEnum, actorBranch, branchCode)) {
      return { ok: false, error: "No puedes crear expedientes en esa sucursal." };
    }
    const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
    if (!branch) return { ok: false, error: "La sucursal no existe." };
    if (!branch.isActive) {
      return { ok: false, error: `La sucursal ${branch.name} está desactivada.` };
    }

    // A seller always owns their own expediente; supervisors may set a seller.
    let sellerId: string | null = null;
    if (session.roleEnum === "VENDEDOR") {
      sellerId = session.uid;
    } else if (input.sellerId?.trim()) {
      const seller = await resolveBranchSeller(prisma, input.sellerId.trim(), branch.id);
      if (!seller.ok) return seller;
      sellerId = seller.id;
    } else if (session.roleEnum === "LIDER_VENTAS") {
      sellerId = session.uid;
    }

    const fileNumber = generateCrmCode("EXP");

    const created = await prisma.$transaction(async (tx) => {
      const file = await tx.customerFile.create({
        data: {
          fileNumber,
          customerId: customer.id,
          leadId: lead?.id ?? null,
          branchId: branch.id,
          sellerId,
          motorcycleInterest: sanitizeText(input.motoInteres ?? "") || null,
          status: "ABIERTO",
          notes: sanitizeText(input.observaciones ?? "").slice(0, 500) || null,
        },
      });

      if (lead) {
        await tx.lead.update({
          where: { id: lead.id },
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
    revalidatePath(`/panel/clientes/${customer.id}`);
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
  /** Patch CRM-INT1 — campaña de la que vino, si se sabe. */
  campaignId?: string | null;
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
 * asignar o dárselo a alguien de la sucursal del lead. Patch CRM-INT1: la
 * asignación inicial deja su fecha y su fila en `LeadAssignment`.
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
    return {
      ok: false,
      error: isGlobalScopeRole(session.roleEnum)
        ? "Selecciona una sucursal de atención."
        : NO_BRANCH_ASSIGNED,
    };
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
    if (!branch.isActive) {
      return { ok: false, error: `La sucursal ${branch.name} está desactivada.` };
    }

    // Quién se queda el lead.
    let assignedSellerId: string | null = null;
    if (session.roleEnum === "VENDEDOR") {
      assignedSellerId = session.uid;
    } else if (input.vendedorId?.trim()) {
      if (!canAssignLeads(session.roleEnum)) {
        return { ok: false, error: "No tienes permiso para asignar leads." };
      }
      const seller = await resolveBranchSeller(prisma, input.vendedorId.trim(), branch.id);
      if (!seller.ok) {
        return {
          ok: false,
          error:
            seller.error === "El vendedor debe pertenecer a la misma sucursal."
              ? "Solo puedes asignar leads a vendedores de esa sucursal."
              : seller.error,
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
      catalogLabel = catalogModelLabel(model);
      catalogSlug = model.slug;
    }

    // Campaña, si la eligió. Aquí sí es un error: quien registra puede elegir
    // otra, y guardar el lead sin atribución en silencio le haría creer que la
    // atribuyó.
    let marketingCampaignId: string | null = null;
    if (input.campaignId?.trim()) {
      marketingCampaignId = await resolveAttributableCampaign(
        prisma,
        input.campaignId,
        branch.id,
        new Date(),
      );
      if (!marketingCampaignId) {
        return {
          ok: false,
          error: "Esa campaña no está vigente o no cubre la sucursal del lead.",
        };
      }
    }

    if (!input.forzarDuplicado) {
      const duplicate = await prisma.lead.findFirst({
        where: {
          status: { notIn: ["EXPEDIENTE", "DESCARTADO"] },
          OR: [
            // Patch CRM-INT2 — con y sin prefijo 505, como en la identidad.
            { phone: { in: phoneMatchKeys(phone) } },
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
    const created = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
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
          marketingCampaignId,
          campaignAttributionSource: marketingCampaignId ? "REGISTRO_MANUAL" : null,
          status: "NUEVO_LEAD",
          branchId: branch.id,
          createdById: session.uid,
          notes: sanitizeText(input.observaciones ?? "").slice(0, 500) || null,
        },
      });
      if (assignedSellerId) {
        await recordLeadAssignment(tx, {
          lead: { ...lead, assignedSellerId: null, firstAssignedAt: null },
          sellerId: assignedSellerId,
          assignedById: session.uid,
        });
        // Sólo cuando el lead nace en manos de otra persona. Un vendedor que
        // registra su propio lead ya sabe que lo tiene.
        await notifyUsers(tx, {
          userIds: [assignedSellerId],
          exceptUserId: session.uid,
          kind: "LEAD_ASIGNADO",
          title: "Te asignaron un lead",
          body: `${name} · ${phone}`,
          leadId: lead.id,
        });
      }
      return lead;
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
        motorcycleInterest: catalogModelLabel(model),
      },
    });
    revalidatePath("/panel/leads");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar la moto de interés." };
  }
}

/**
 * Patch CRM-INT1 — atribuye un lead a una campaña, o corrige la atribución.
 *
 * Es lo que permite que la cifra «leads del CRM» de la conciliación de
 * marketing refleje la realidad: el vendedor que pregunta «¿cómo supo de
 * nosotros?» lo anota aquí. Atribuir por primera vez lo hace quien trabaja el
 * lead; **cambiar** una atribución existente es supervisión, porque mueve la
 * cifra de una campaña a otra.
 *
 * Un lead cuenta para una sola campaña (`Lead.marketingCampaignId` es una
 * columna), que es la regla con la que la conciliación evita contarlo dos veces.
 */
export async function setLeadCampaignAction(input: {
  leadId: string;
  campaignId: string | null;
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
    if (!lead || !leadInScope(scope, lead)) {
      return { ok: false, error: "El lead no existe o no está en tu alcance." };
    }
    const next = input.campaignId?.trim() || null;
    if (next === lead.marketingCampaignId) return { ok: true };
    if (lead.marketingCampaignId && !canAssignLeads(session.roleEnum)) {
      return {
        ok: false,
        error: "El lead ya está atribuido a una campaña. Pide a tu líder o gerente que la corrija.",
      };
    }

    let campaignId: string | null = null;
    if (next) {
      campaignId = await resolveAttributableCampaign(prisma, next, lead.branchId, lead.createdAt);
      if (!campaignId) {
        return {
          ok: false,
          error:
            "Esa campaña no cubre la sucursal del lead, está finalizada o no estaba vigente cuando llegó el lead.",
        };
      }
    }

    await prisma.lead.update({
      where: { id: lead.id },
      // Patch CRM-INT3 — lo que una persona anota aquí manda: un vínculo de
      // Meta que se deshaga después no se lo quita.
      data: {
        marketingCampaignId: campaignId,
        campaignAttributionSource: campaignId ? "REGISTRO_MANUAL" : null,
      },
    });
    revalidatePath("/panel/leads");
    revalidatePath("/panel/marketing");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar la campaña del lead." };
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

    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          assignedSellerId: seller.id,
          assignedById: session.uid,
          assignedAt: new Date(),
        },
      });
      await notifyUsers(tx, {
        userIds: [seller.id],
        exceptUserId: session.uid,
        kind: "CLIENTE_ASIGNADO",
        title: "Te asignaron un cliente",
        body: `${customer.name} · ${customer.phone}`,
        customerId: customer.id,
      });
    });

    revalidatePath("/panel/clientes");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo asignar el cliente." };
  }
}
