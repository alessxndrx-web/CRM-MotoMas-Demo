/**
 * SMOKE-CRMINT1 — el flujo lead → crédito, el catálogo, los comprobantes del
 * cliente y el marketing multisucursal, contra la base viva.
 *
 *   npm run smoke:crm-int1
 *
 * ## Qué prueba
 *
 * Los diecinueve puntos de verificación del encargo, cada uno contra las
 * acciones y consultas reales, con sesiones firmadas por el mismo secreto y
 * revalidadas contra la base por el mismo código que usa el panel:
 *
 *    1. Alta de cliente con sucursal válida.
 *    2. Sucursal inválida o no autorizada.
 *    3. Conversión de lead en cliente.
 *    4. Alta del expediente (registro del cliente).
 *    5. Alta de la solicitud de crédito.
 *    6. Fecha de la asignación inicial del lead.
 *    7. Historial de reasignaciones.
 *    8. Selección de modelo desde el catálogo.
 *    9. Comprobante subido por el cliente.
 *   10. Permisos de verificación del comprobante.
 *   11. Campaña con tres o más sucursales.
 *   12. Campaña con varios modelos.
 *   13. Edición de una campaña existente.
 *   14. Cifras manuales de leads por sucursal.
 *   15. Conciliación contra los leads del CRM.
 *   16. Lectura global de Marketing.
 *   17. Edición entre sucursales no autorizada.
 *   18. Conservación de las campañas existentes.
 *   19. Conservación de clientes y datos financieros.
 *
 * Trabaja sobre **sucursales y usuarios propios** y los borra al terminar
 * aunque una aserción falle. Las filas que ya había en la base se cuentan antes
 * y después: el smoke no las toca.
 */
import { PrismaClient } from "@prisma/client";

import {
  canViewCommercialOverview,
  getCrmScopeForUser,
  getMarketingScopeForUser,
} from "@/server/auth/access";
import { roleEnumToSpanish, type UserRoleEnum } from "@/server/auth/roles";
import {
  SESSION_COOKIE_NAME,
  createPortalToken,
  createSessionToken,
} from "@/server/auth/session";
import { createBranchAction, updateBranchAction } from "@/server/branches/actions";
import {
  createCatalogModelAction,
  setCatalogModelActiveAction,
} from "@/server/catalog/actions";
import { listCatalogOptions } from "@/server/catalog/queries";
import { PENDING_BRAND } from "@/server/catalog/shared";
import {
  assignLeadAction,
  convertLeadToCustomerAction,
  createCustomerAction,
  createExpedienteAction,
  createLeadAction,
  createPublicLeadAction,
  setLeadCampaignAction,
  updateCustomerBranchAction,
} from "@/server/crm/actions";
import {
  getLeadDetail,
  listCustomersPage,
  listLeadAssignments,
} from "@/server/crm/queries";
import { saveCreditApplicationAction } from "@/server/expedientes/actions";
import { registerIngress } from "@/server/inventory/actions";
import {
  archiveMarketingCampaignAction,
  confirmCampaignLeadReportAction,
  createMarketingCampaignAction,
  reviewCampaignLeadReportAction,
  saveCampaignLeadReportAction,
  updateMarketingCampaignAction,
} from "@/server/marketing/actions";
import { getCommercialOverview } from "@/server/marketing/overview";
import {
  getCampaignReconciliation,
  listCampaignChanges,
  listMarketingCampaigns,
} from "@/server/marketing/queries";
import type { MarketingCampaignInput } from "@/server/marketing/shared";
import {
  createReservation,
  readReservationPaymentProof,
  reviewReservationPaymentProof,
  uploadReservationPaymentProof,
} from "@/server/operations/actions";
import { setDelegatedPermissionAction } from "@/server/permissions/actions";
import { resolveGrantCoverage } from "@/server/permissions/service";
import {
  getPortalReservationsAction,
  uploadPortalReservationProofAction,
} from "@/server/portal/proof-actions";

const prisma = new PrismaClient();
const STAMP = Date.now();
const TAG = `SMOKE-CRMINT1-${STAMP}`;
const SUFFIX = String(STAMP).slice(-7);
const CODES = {
  A: `i1a${SUFFIX}`,
  B: `i1b${SUFFIX}`,
  C: `i1c${SUFFIX}`,
  D: `i1d${SUFFIX}`,
};

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  OK    ${name}`);
  } else {
    failed += 1;
    console.log(`  FALLO ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n  --- ${title} ---`);
}

function errorOf(result: { ok: boolean } & Record<string, unknown>): string {
  return result.ok ? "" : String(result.error ?? "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function signInAs(role: UserRoleEnum, userId: string, branchCode: string) {
  const token = await createSessionToken({
    uid: userId,
    email: `${userId}@smoke.local`,
    name: userId,
    role: roleEnumToSpanish[role],
    roleEnum: role,
    branchId: branchCode as never,
    branchName: "Smoke",
  });
  (globalThis as Record<string, unknown>).__motomasSmokeCookies = {
    [SESSION_COOKIE_NAME]: token,
  };
}

function phone(prefix: string) {
  return `${prefix}${SUFFIX}`.slice(0, 10);
}

function png(): File {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...Array.from({ length: 64 }, (_, index) => (index * 7 + STAMP) % 251),
  ]);
  return new File([bytes], "comprobante.png", { type: "image/png" });
}

function fakeJpeg(): File {
  return new File([new TextEncoder().encode("MZ esto no es una imagen")], "foto.jpg", {
    type: "image/jpeg",
  });
}

function campaignInput(overrides: Partial<MarketingCampaignInput>): MarketingCampaignInput {
  return {
    name: `${TAG}-campaña`,
    channel: "FACEBOOK_ADS",
    branchCodes: [],
    catalogModelIds: [],
    estimatedBudget: 1500,
    startsAt: new Date().toISOString().slice(0, 10),
    endsAt: null,
    status: "ACTIVE",
    objective: "LEADS",
    description: "Campaña de prueba",
    metaAdAccountId: null,
    ...overrides,
  };
}

async function baseline() {
  const testBranchCodes = Object.values(CODES);
  const [customers, campaigns, cashDocuments, accountingDocuments, journalEntries, credits] =
    await Promise.all([
      prisma.customer.count({ where: { branch: { code: { notIn: testBranchCodes } } } }),
      prisma.marketingCampaign.findMany({
        where: { name: { not: { startsWith: "SMOKE-CRMINT1" } } },
        select: { id: true, targetBranchId: true, updatedAt: true },
        orderBy: { id: "asc" },
      }),
      prisma.cashDocument.count(),
      prisma.accountingDocument.count(),
      prisma.journalEntry.count(),
      prisma.creditApplication.count({ where: { branch: { code: { notIn: testBranchCodes } } } }),
    ]);
  return { customers, campaigns, cashDocuments, accountingDocuments, journalEntries, credits };
}

async function seed() {
  const [A, B, C] = await Promise.all(
    (["A", "B", "C"] as const).map((key) =>
      prisma.branch.create({
        data: { code: CODES[key], name: `${TAG}-${key}`, isActive: true },
      }),
    ),
  );
  const D = await prisma.branch.create({
    data: { code: CODES.D, name: `${TAG}-D`, isActive: false },
  });

  async function user(role: UserRoleEnum, branchId: string | null, tag: string) {
    return prisma.user.create({
      data: {
        name: `${TAG}-${tag}`,
        email: `${TAG}-${tag}@smoke.local`.toLowerCase(),
        passwordHash: "x:y",
        role,
        branchId,
      },
    });
  }

  return {
    A,
    B,
    C,
    D,
    admin: await user("ADMIN", null, "admin"),
    gerA: await user("GERENTE", A.id, "gerA"),
    liderA: await user("LIDER_VENTAS", A.id, "liderA"),
    vendA: await user("VENDEDOR", A.id, "vendA"),
    vendA2: await user("VENDEDOR", A.id, "vendA2"),
    liderB: await user("LIDER_VENTAS", B.id, "liderB"),
    vendB: await user("VENDEDOR", B.id, "vendB"),
    mktAll: await user("MARKETING", null, "mktAll"),
    mktA: await user("MARKETING", null, "mktA"),
    mktNone: await user("MARKETING", null, "mktNone"),
  };
}

type Ctx = Awaited<ReturnType<typeof seed>>;

async function main() {
  const before = await baseline();
  const ctx: Ctx = await seed();
  const as = {
    admin: () => signInAs("ADMIN", ctx.admin.id, "all"),
    gerA: () => signInAs("GERENTE", ctx.gerA.id, CODES.A),
    liderA: () => signInAs("LIDER_VENTAS", ctx.liderA.id, CODES.A),
    vendA: () => signInAs("VENDEDOR", ctx.vendA.id, CODES.A),
    vendA2: () => signInAs("VENDEDOR", ctx.vendA2.id, CODES.A),
    liderB: () => signInAs("LIDER_VENTAS", ctx.liderB.id, CODES.B),
    vendB: () => signInAs("VENDEDOR", ctx.vendB.id, CODES.B),
    mktAll: () => signInAs("MARKETING", ctx.mktAll.id, "all"),
    mktA: () => signInAs("MARKETING", ctx.mktA.id, "all"),
    mktNone: () => signInAs("MARKETING", ctx.mktNone.id, "all"),
  };

  // ---------------------------------------------------------------------
  section("Sucursales (administración)");
  await as.admin();
  const dupBranch = await createBranchAction({ name: ctx.A.name });
  check("no se duplica una sucursal existente", !dupBranch.ok, errorOf(dupBranch));
  const deactivateA = await updateBranchAction({
    code: CODES.A,
    name: ctx.A.name,
    isActive: false,
  });
  check(
    "no se desactiva una sucursal con usuarios activos",
    !deactivateA.ok && errorOf(deactivateA).includes("usuario"),
    errorOf(deactivateA),
  );
  await as.gerA();
  const gerBranch = await createBranchAction({ name: `${TAG}-X` });
  check("un Gerente no crea sucursales", !gerBranch.ok);

  // ---------------------------------------------------------------------
  section("1-2. Alta de cliente y sucursal");
  await as.vendA();
  const vendCustomer = await createCustomerAction({
    nombre: `${TAG} Cliente Vendedor`,
    telefono: phone("811"),
    correo: "cliente@example.com",
  });
  check(
    "1. un vendedor sin clientes registra uno: la sucursal la pone el servidor",
    vendCustomer.ok && vendCustomer.branchName === ctx.A.name,
    errorOf(vendCustomer),
  );
  const vendCustomerId = vendCustomer.ok ? vendCustomer.customerId : "";
  const vendCustomerRow = await prisma.customer.findUnique({ where: { id: vendCustomerId } });
  check(
    "1. queda en la cartera de quien lo registra",
    vendCustomerRow?.assignedSellerId === ctx.vendA.id && vendCustomerRow?.branchId === ctx.A.id,
  );
  const vendPage = await listCustomersPage(
    getCrmScopeForUser("VENDEDOR", CODES.A, ctx.vendA.id),
    { q: phone("811") },
  );
  check(
    "1. y el vendedor lo encuentra en su lista para seguir trabajando",
    vendPage.rows.some((row) => row.id === vendCustomerId),
  );
  const vendOtherBranch = await createCustomerAction({
    nombre: `${TAG} Intruso`,
    telefono: phone("812"),
    branchCode: CODES.B,
  });
  check("2. un vendedor no registra clientes en otra sucursal", !vendOtherBranch.ok);

  await as.liderA();
  const liderCustomer = await createCustomerAction({
    nombre: `${TAG} Cliente Líder`,
    telefono: phone("813"),
  });
  const liderCustomerRow = liderCustomer.ok
    ? await prisma.customer.findUnique({ where: { id: liderCustomer.customerId } })
    : null;
  check(
    "1. un líder registra y se lo queda si no elige a otro",
    liderCustomerRow?.assignedSellerId === ctx.liderA.id,
    errorOf(liderCustomer),
  );

  await as.admin();
  const adminNoBranch = await createCustomerAction({
    nombre: `${TAG} Sin sucursal`,
    telefono: phone("814"),
  });
  check("2. un rol global tiene que elegir sucursal", !adminNoBranch.ok);
  const adminInactive = await createCustomerAction({
    nombre: `${TAG} Inactiva`,
    telefono: phone("815"),
    branchCode: CODES.D,
  });
  check(
    "2. una sucursal desactivada no admite clientes",
    !adminInactive.ok && errorOf(adminInactive).includes("desactivada"),
    errorOf(adminInactive),
  );
  const adminWrongSeller = await createCustomerAction({
    nombre: `${TAG} Vendedor ajeno`,
    telefono: phone("816"),
    branchCode: CODES.B,
    vendedorId: ctx.vendA.id,
  });
  check("2. no se asigna a un vendedor de otra sucursal", !adminWrongSeller.ok);
  const adminCustomerB = await createCustomerAction({
    nombre: `${TAG} Cliente B`,
    telefono: phone("817"),
    branchCode: CODES.B,
    vendedorId: ctx.vendB.id,
  });
  check(
    "1. el administrador registra en la sucursal elegida y asigna vendedor",
    adminCustomerB.ok && adminCustomerB.branchName === ctx.B.name,
    errorOf(adminCustomerB),
  );
  const customerBId = adminCustomerB.ok ? adminCustomerB.customerId : "";

  await as.vendA();
  const clash = await createCustomerAction({
    nombre: `${TAG} Duplicado`,
    telefono: phone("817"),
  });
  // Patch CRM-INT2 — el teléfono solo ya no identifica: la coincidencia se
  // devuelve para que alguien la resuelva, y la ajena llega enmascarada.
  const clashCandidate = !clash.ok ? clash.resolution?.candidates[0] : undefined;
  check(
    "2. un cliente de otra sucursal no se «crea» en silencio: se explica",
    !clash.ok &&
      clashCandidate?.branchName === ctx.B.name &&
      !clashCandidate.accessible &&
      clashCandidate.customerId === null,
    errorOf(clash),
  );
  const dedup = await createCustomerAction({
    nombre: `${TAG} Repetido`,
    telefono: phone("811"),
  });
  check(
    "1. el mismo teléfono propio no se duplica en silencio: se ofrece el existente",
    !dedup.ok &&
      dedup.resolution?.candidates.some(
        (candidate) => candidate.customerId === vendCustomerId && candidate.accessible,
      ) === true,
    errorOf(dedup),
  );

  // ---------------------------------------------------------------------
  section("8. Catálogo de motocicletas");
  await as.gerA();
  const gerModel = await createCatalogModelAction({ brand: "Prueba", model: `${TAG}-no` });
  check("8. un Gerente no mantiene el catálogo", !gerModel.ok);
  await as.admin();
  const model = await createCatalogModelAction({
    brand: "Smoke",
    model: `Modelo ${SUFFIX}`,
    version: "ABS",
    year: 2027,
  });
  check("8. el administrador da de alta un modelo", model.ok, errorOf(model));
  const modelId = model.ok ? model.id : "";
  const model2 = await createCatalogModelAction({
    brand: "Smoke",
    model: `Segundo ${SUFFIX}`,
    year: 2026,
  });
  const model2Id = model2.ok ? model2.id : "";
  const duplicateModel = await createCatalogModelAction({
    brand: "smoke",
    model: `modelo ${SUFFIX}`,
    version: "abs",
    year: 2027,
  });
  check("8. un modelo repetido se rechaza", !duplicateModel.ok, errorOf(duplicateModel));
  const options = await listCatalogOptions();
  check(
    "8. las etiquetas del catálogo no muestran la marca de relleno",
    options.every((option) => !option.label.includes(PENDING_BRAND)),
  );
  check(
    "8. el modelo nuevo aparece con marca, versión y año",
    options.some((option) => option.id === modelId && option.label === `Smoke Modelo ${SUFFIX} ABS (2027)`),
  );
  const ns400 = await prisma.motorcycleCatalogModel.findUnique({ where: { slug: "pulsar-ns400z" } });
  check("8. el seed añadió los modelos del portal que faltaban (Pulsar NS400Z)", Boolean(ns400));

  await as.gerA();
  const ingress = await registerIngress({
    catalogModelId: modelId,
    name: "",
    brand: "",
    model: "",
    year: "2027",
    chassisNumber: `CH-${TAG}-1`,
    engineNumber: "",
    color: "Rojo",
    branchCode: CODES.A,
    entryDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const unit = await prisma.motorcycleUnit.findUnique({
    where: { chassisNumber: `CH-${TAG}-1`.toUpperCase() },
  });
  check(
    "8. el alta de unidad queda enlazada a su modelo del catálogo",
    ingress.ok && unit?.catalogModelId === modelId && unit?.brand === "Smoke",
    errorOf(ingress),
  );
  const unit2 = await prisma.motorcycleUnit.create({
    data: {
      branchId: ctx.A.id,
      catalogModelId: modelId,
      name: "Smoke 2",
      brand: "Smoke",
      model: `Modelo ${SUFFIX}`,
      year: 2027,
      chassisNumber: `CH-${TAG}-2`,
      entryDate: new Date(),
    },
  });

  await as.admin();
  const deactivated = await setCatalogModelActiveAction({ id: model2Id, isActive: false });
  check(
    "8. un modelo dado de baja desaparece de los selectores",
    deactivated.ok && !(await listCatalogOptions()).some((option) => option.id === model2Id),
  );
  await as.liderA();
  const inactiveLead = await createLeadAction({
    nombre: `${TAG} Lead modelo inactivo`,
    telefono: phone("823"),
    origen: "Presencial",
    catalogModelId: model2Id,
  });
  check("8. no se registra un lead con un modelo dado de baja", !inactiveLead.ok);
  await as.admin();
  const reactivated = await setCatalogModelActiveAction({ id: model2Id, isActive: true });
  check("8. y se puede reactivar sin perder nada", reactivated.ok);

  // ---------------------------------------------------------------------
  section("6-7. Leads: asignación e historial");
  await as.liderA();
  const lead1 = await createLeadAction({
    nombre: `${TAG} Lead Uno`,
    telefono: phone("821"),
    origen: "Presencial",
    catalogModelId: modelId,
    vendedorId: ctx.vendA.id,
  });
  check("6. el líder registra un lead asignado", lead1.ok, errorOf(lead1));
  const lead1Id = lead1.ok ? lead1.leadId : "";
  const lead1Row = await prisma.lead.findUnique({ where: { id: lead1Id } });
  const firstAssigned = lead1Row?.firstAssignedAt ?? null;
  check(
    "6. la asignación inicial guarda fecha inicial y fecha actual",
    Boolean(firstAssigned) &&
      lead1Row?.assignedAt?.getTime() === firstAssigned?.getTime() &&
      lead1Row?.status === "ASIGNADO",
  );
  let history = await prisma.leadAssignment.findMany({
    where: { leadId: lead1Id },
    orderBy: { assignedAt: "asc" },
  });
  check(
    "6. queda una fila de historial con quién asignó y en qué sucursal",
    history.length === 1 &&
      history[0].sellerId === ctx.vendA.id &&
      history[0].previousSellerId === null &&
      history[0].assignedById === ctx.liderA.id &&
      history[0].branchId === ctx.A.id,
  );
  const detail = await getLeadDetail(getCrmScopeForUser("LIDER_VENTAS", CODES.A, ctx.liderA.id), lead1Id);
  check(
    "8. la ficha del lead muestra el modelo y las unidades disponibles en su sucursal",
    detail?.motorcycle?.catalogModelId === modelId && detail.motorcycle.availableUnitsInBranch === 2,
    `disponibles=${detail?.motorcycle?.availableUnitsInBranch}`,
  );

  await sleep(15);
  const reassign = await assignLeadAction({ leadId: lead1Id, sellerId: ctx.vendA2.id });
  check("7. el líder reasigna el lead", reassign.ok, errorOf(reassign));
  const lead1After = await prisma.lead.findUnique({ where: { id: lead1Id } });
  history = await prisma.leadAssignment.findMany({
    where: { leadId: lead1Id },
    orderBy: { assignedAt: "asc" },
  });
  check(
    "7. la reasignación añade historia sin borrar la anterior",
    history.length === 2 &&
      history[1].previousSellerId === ctx.vendA.id &&
      history[1].sellerId === ctx.vendA2.id,
  );
  check(
    "7. la fecha inicial se conserva y la actual avanza",
    lead1After?.firstAssignedAt?.getTime() === firstAssigned?.getTime() &&
      (lead1After?.assignedAt?.getTime() ?? 0) > (firstAssigned?.getTime() ?? 0),
  );
  await assignLeadAction({ leadId: lead1Id, sellerId: ctx.vendA2.id });
  check(
    "7. volver a elegir al mismo vendedor no escribe historia",
    (await prisma.leadAssignment.count({ where: { leadId: lead1Id } })) === 2,
  );
  const listed = await listLeadAssignments([lead1Id]);
  check(
    "7. el historial se lee con nombres, del más reciente al más antiguo",
    listed[lead1Id]?.length === 2 && listed[lead1Id][0].previousSellerName !== null,
  );

  const legacyLead = await prisma.lead.create({
    data: {
      trackingCode: `SOL-${TAG}-LEGACY`,
      name: `${TAG} Lead Antiguo`,
      phone: phone("822"),
      branchId: ctx.A.id,
      status: "ASIGNADO",
      assignedSellerId: ctx.vendA.id,
    },
  });
  await assignLeadAction({ leadId: legacyLead.id, sellerId: ctx.vendA2.id });
  const legacyAfter = await prisma.lead.findUnique({ where: { id: legacyLead.id } });
  check(
    "6. un lead asignado antes del registro no recibe una fecha inicial inventada",
    legacyAfter?.firstAssignedAt === null && legacyAfter?.assignedAt !== null,
  );

  await as.vendA();
  const vendAssign = await assignLeadAction({ leadId: lead1Id, sellerId: ctx.vendA.id });
  check("7. un vendedor no reasigna leads", !vendAssign.ok);

  // ---------------------------------------------------------------------
  section("3-5. Lead → cliente → expediente → crédito");
  await as.vendA2();
  const conversion = await convertLeadToCustomerAction({ leadId: lead1Id });
  check(
    "3. el vendedor convierte su lead en cliente",
    conversion.ok && conversion.created,
    errorOf(conversion),
  );
  const leadCustomerId = conversion.ok ? conversion.customerId : "";
  const leadCustomer = await prisma.customer.findUnique({ where: { id: leadCustomerId } });
  check(
    "3-4. el cliente nace en la sucursal del lead y en la cartera de su vendedor",
    leadCustomer?.branchId === ctx.A.id && leadCustomer?.assignedSellerId === ctx.vendA2.id,
  );
  check(
    "3. el lead queda enlazado al cliente",
    (await prisma.lead.findUnique({ where: { id: lead1Id } }))?.customerId === leadCustomerId,
  );
  const again = await convertLeadToCustomerAction({ leadId: lead1Id });
  check(
    "3. convertir dos veces devuelve el mismo cliente",
    again.ok && again.customerId === leadCustomerId && !again.created,
  );

  await as.vendB();
  const foreignConvert = await convertLeadToCustomerAction({ leadId: lead1Id });
  check("3. un vendedor de otra sucursal no convierte el lead", !foreignConvert.ok);

  await as.vendA();
  const leadSame = await createLeadAction({
    nombre: `${TAG} Lead mismo contacto`,
    telefono: phone("811"),
    origen: "Sucursal",
    forzarDuplicado: true,
  });
  const askSame = leadSame.ok
    ? await convertLeadToCustomerAction({ leadId: leadSame.leadId })
    : { ok: true as const, customerId: "", created: false };
  check(
    "3. mismo teléfono sin cédula: se pide confirmar a quién pertenece",
    !askSame.ok && askSame.resolution?.candidates[0]?.customerId === vendCustomerId,
    errorOf(askSame),
  );
  const linkSame = leadSame.ok
    ? await convertLeadToCustomerAction({
        leadId: leadSame.leadId,
        resolucion: { tipo: "VINCULAR", customerId: vendCustomerId },
      })
    : { ok: false as const, error: "sin lead" };
  check(
    "3. si el cliente ya existe en la sucursal, se vincula en lugar de duplicarlo",
    linkSame.ok && linkSame.customerId === vendCustomerId && !linkSame.created,
    errorOf(linkSame),
  );
  const leadCross = await createLeadAction({
    nombre: `${TAG} Lead de otra sucursal`,
    telefono: phone("817"),
    origen: "Sucursal",
    forzarDuplicado: true,
  });
  const crossConvert = leadCross.ok
    ? await convertLeadToCustomerAction({ leadId: leadCross.leadId })
    : { ok: true as const, customerId: "", created: false };
  check(
    "3. un cliente de otra sucursal no se vincula desde un lead cualquiera",
    !crossConvert.ok,
  );

  await as.vendA2();
  const expediente = await createExpedienteAction({
    customerId: leadCustomerId,
    leadId: lead1Id,
    motoInteres: "Smoke",
  });
  check("4. se crea el expediente del cliente", expediente.ok, errorOf(expediente));
  const fileId = expediente.ok ? expediente.expedienteId : "";
  const file = await prisma.customerFile.findUnique({ where: { id: fileId } });
  const lead1Final = await prisma.lead.findUnique({ where: { id: lead1Id } });
  check(
    "4. el expediente queda en la sucursal correcta, del vendedor, y el lead pasa a EXPEDIENTE",
    file?.branchId === ctx.A.id &&
      file?.sellerId === ctx.vendA2.id &&
      file?.customerId === leadCustomerId &&
      lead1Final?.status === "EXPEDIENTE",
  );

  await as.vendB();
  const foreignFile = await createExpedienteAction({ customerId: leadCustomerId });
  check("4. no se crea expediente para un cliente fuera de alcance", !foreignFile.ok);
  await as.liderA();
  const wrongSellerFile = await createExpedienteAction({
    customerId: leadCustomerId,
    sellerId: ctx.vendB.id,
  });
  check("4. el vendedor responsable debe ser de la sucursal", !wrongSellerFile.ok);

  await as.vendA2();
  const credit = await saveCreditApplicationAction({
    customerFileId: fileId,
    financialInstitution: "Financiera Smoke",
    financingType: "FINANCIERA_EXTERNA",
    amount: 1500,
    downPayment: 200,
    termMonths: 24,
    currency: "USD",
    requestedAt: new Date().toISOString(),
  });
  const creditRow = await prisma.creditApplication.findUnique({ where: { customerFileId: fileId } });
  check(
    "5. se crea la solicitud de crédito sobre el expediente",
    credit.ok && creditRow?.status === "PENDIENTE" && creditRow.amount?.toString() === "1500",
    errorOf(credit),
  );
  check(
    "5. el crédito queda atado al cliente y a la sucursal correctos",
    creditRow?.customerId === leadCustomerId && creditRow?.branchId === ctx.A.id,
  );
  const closed = await createExpedienteAction({ customerId: leadCustomerId });
  if (closed.ok) {
    await prisma.customerFile.update({
      where: { id: closed.expedienteId },
      data: { status: "CANCELADO" },
    });
    const closedCredit = await saveCreditApplicationAction({
      customerFileId: closed.expedienteId,
      amount: 900,
    });
    check("5. un expediente cancelado no admite un crédito nuevo", !closedCredit.ok);
  } else {
    check("5. (preparación) segundo expediente", false, errorOf(closed));
  }

  // ---------------------------------------------------------------------
  section("9-10. Comprobante del cliente y su verificación");
  const reservation = await createReservation({
    customerId: leadCustomerId,
    motorcycleUnitId: unit?.id ?? "",
    customerFileId: fileId,
  });
  check("(preparación) reserva pendiente de pago", reservation.ok, errorOf(reservation));
  const reservationId = reservation.ok ? reservation.reservationId : "";
  const token = await createPortalToken({ customerId: leadCustomerId, trackingCode: lead1Row?.trackingCode ?? "" });
  const otherToken = await createPortalToken({ customerId: customerBId, trackingCode: "X" });

  const portalList = await getPortalReservationsAction(token);
  check(
    "9. el cliente ve su reserva y puede enviar comprobante",
    portalList.ok && portalList.reservations.some((row) => row.id === reservationId && row.canUploadProof),
  );
  const foreignUpload = await uploadPortalReservationProofAction({
    token: otherToken,
    reservationId,
    file: png(),
  });
  check("9. otro cliente no puede subir a esta reserva", !foreignUpload.ok, errorOf(foreignUpload));
  const fakeUpload = await uploadPortalReservationProofAction({ token, reservationId, file: fakeJpeg() });
  check("9. un archivo que miente sobre su tipo se rechaza", !fakeUpload.ok, errorOf(fakeUpload));
  const upload = await uploadPortalReservationProofAction({
    token,
    reservationId,
    file: png(),
    monto: "150",
    moneda: "USD",
    metodo: "TRANSFERENCIA",
    referencia: "REF-1",
  });
  check("9. el cliente sube su comprobante", upload.ok, errorOf(upload));
  let resRow = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { motorcycleUnit: true, paymentProofs: { orderBy: { uploadedAt: "desc" } } },
  });
  check(
    "9. queda PENDIENTE_REVISION, del cliente, sin autor empleado",
    resRow?.paymentProofs[0]?.status === "PENDIENTE_REVISION" &&
      resRow.paymentProofs[0].source === "PORTAL_CLIENTE" &&
      resRow.paymentProofs[0].uploadedByCustomerId === leadCustomerId &&
      resRow.paymentProofs[0].uploadedById === null,
  );
  check(
    "9. subir la imagen NO confirma el pago ni aparta la unidad",
    resRow?.status === "PENDIENTE_PAGO" && resRow.motorcycleUnit.status === "AVAILABLE",
  );
  check(
    "9. el cliente recibe «recibido», y la sucursal un aviso para revisar",
    (await prisma.customerNotification.count({
      where: { customerId: leadCustomerId, kind: "COMPROBANTE_RECIBIDO" },
    })) === 1 &&
      (await prisma.userNotification.count({
        where: { reservationId, kind: "COMPROBANTE_POR_REVISAR", userId: ctx.liderA.id },
      })) === 1,
  );
  const second = await uploadPortalReservationProofAction({ token, reservationId, file: png() });
  check("9. no se sube otro mientras uno espera verificación", !second.ok);

  await as.vendA2();
  const sellerReview = await reviewReservationPaymentProof({ reservationId, aprobar: true });
  check("10. un vendedor no verifica comprobantes", !sellerReview.ok);
  const sellerRead = await readReservationPaymentProof({ reservationId });
  check(
    "10. el vendedor de la reserva sí puede ver la imagen",
    sellerRead.ok && sellerRead.dataUri.startsWith("data:image/png;base64,"),
  );
  await as.liderB();
  const foreignReview = await reviewReservationPaymentProof({
    reservationId,
    aprobar: false,
    notas: "No corresponde",
  });
  check("10. un líder de otra sucursal no verifica", !foreignReview.ok);
  await as.vendB();
  const foreignRead = await readReservationPaymentProof({ reservationId });
  check("10. un vendedor de otra sucursal no ve la imagen", !foreignRead.ok);

  await as.liderA();
  const noReason = await reviewReservationPaymentProof({ reservationId, aprobar: false });
  check("10. rechazar exige un motivo", !noReason.ok);
  const reject = await reviewReservationPaymentProof({
    reservationId,
    aprobar: false,
    notas: "El monto no coincide con la reserva.",
  });
  check("10. el líder de la sucursal rechaza con motivo", reject.ok, errorOf(reject));
  resRow = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { motorcycleUnit: true, paymentProofs: { orderBy: { uploadedAt: "desc" } } },
  });
  check(
    "10. queda registrado quién y cuándo, con el motivo",
    resRow?.paymentProofs[0]?.status === "RECHAZADO" &&
      resRow.paymentProofs[0].reviewedById === ctx.liderA.id &&
      resRow.paymentProofs[0].reviewedAt !== null &&
      resRow.paymentProofs[0].reviewNotes === "El monto no coincide con la reserva.",
  );
  const afterReject = await getPortalReservationsAction(token);
  const afterRejectRow = afterReject.ok
    ? afterReject.reservations.find((row) => row.id === reservationId)
    : undefined;
  check(
    "9. el cliente ve el motivo y puede volver a enviar",
    afterRejectRow?.canUploadProof === true &&
      afterRejectRow.latestProof?.rejectionReason === "El monto no coincide con la reserva.",
  );
  const retry = await uploadPortalReservationProofAction({ token, reservationId, file: png() });
  check("9. tras un rechazo se puede subir otro comprobante", retry.ok, errorOf(retry));
  const approve = await reviewReservationPaymentProof({ reservationId, aprobar: true });
  resRow = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { motorcycleUnit: true, paymentProofs: { orderBy: { uploadedAt: "desc" } } },
  });
  check(
    "10. verificar el comprobante del cliente es lo que aparta la unidad",
    approve.ok &&
      resRow?.status === "ACTIVA" &&
      resRow.motorcycleUnit.status === "RESERVED" &&
      resRow.paymentProofs[0].status === "APROBADO" &&
      resRow.paymentProofs.length === 2,
    errorOf(approve),
  );
  check(
    "10. y deja el movimiento de inventario de la reserva",
    (await prisma.inventoryMovement.count({
      where: { motorcycleUnitId: unit?.id ?? "", type: "RESERVA" },
    })) === 1,
  );

  // Camino del panel: el rechazo ya no bloquea un segundo comprobante.
  await as.vendA2();
  const res2 = await createReservation({ customerId: leadCustomerId, motorcycleUnitId: unit2.id });
  const res2Id = res2.ok ? res2.reservationId : "";
  const staffUpload = await uploadReservationPaymentProof({ reservationId: res2Id, file: png() });
  await as.liderA();
  const staffReject = await reviewReservationPaymentProof({
    reservationId: res2Id,
    aprobar: false,
    notas: "Imagen ilegible.",
  });
  const unit2After = await prisma.motorcycleUnit.findUnique({ where: { id: unit2.id } });
  await as.vendA2();
  const staffRetry = await uploadReservationPaymentProof({ reservationId: res2Id, file: png() });
  check(
    "10. panel: rechazar libera la unidad y permite subir otro comprobante",
    staffUpload.ok && staffReject.ok && unit2After?.status === "AVAILABLE" && staffRetry.ok,
    [errorOf(staffUpload), errorOf(staffReject), errorOf(staffRetry)].join(" | "),
  );

  // ---------------------------------------------------------------------
  section("11-17. Marketing multisucursal, edición, conciliación y permisos");
  await as.gerA();
  const gerGrant = await setDelegatedPermissionAction({
    userId: ctx.mktA.id,
    permission: "MARKETING_GESTIONAR_CAMPANAS",
    mode: "ALL",
  });
  check("17. sólo el administrador concede permisos de Marketing", !gerGrant.ok);
  await as.admin();
  const grants = await Promise.all([
    setDelegatedPermissionAction({ userId: ctx.mktAll.id, permission: "MARKETING_GESTIONAR_CAMPANAS", mode: "ALL" }),
    setDelegatedPermissionAction({ userId: ctx.mktAll.id, permission: "MARKETING_REPORTAR_LEADS", mode: "ALL" }),
    setDelegatedPermissionAction({ userId: ctx.mktA.id, permission: "MARKETING_GESTIONAR_CAMPANAS", mode: "BRANCHES", branchCodes: [CODES.A] }),
    setDelegatedPermissionAction({ userId: ctx.mktA.id, permission: "MARKETING_REPORTAR_LEADS", mode: "BRANCHES", branchCodes: [CODES.A] }),
  ]);
  check("(preparación) permisos concedidos", grants.every((grant) => grant.ok));
  const grantToSeller = await setDelegatedPermissionAction({
    userId: ctx.vendA.id,
    permission: "MARKETING_REPORTAR_LEADS",
    mode: "ALL",
  });
  check("17. los permisos de Marketing no se conceden a otros roles", !grantToSeller.ok);

  await as.mktNone();
  const noGrant = await createMarketingCampaignAction(campaignInput({ branchCodes: [CODES.A] }));
  check("17. un usuario de Marketing sin concesión ve pero no crea", !noGrant.ok);
  await as.mktA();
  const crossCreate = await createMarketingCampaignAction(
    campaignInput({ branchCodes: [CODES.A, CODES.B] }),
  );
  check("17. con permiso sólo en A no crea una campaña de A y B", !crossCreate.ok);
  const allCreate = await createMarketingCampaignAction(campaignInput({ branchCodes: [] }));
  check("17. con permiso sólo en A no crea una campaña de toda la empresa", !allCreate.ok);
  const c2 = await createMarketingCampaignAction(
    campaignInput({ name: `${TAG}-A`, branchCodes: [CODES.A] }),
  );
  check("17. con permiso en A sí crea una campaña de A", c2.ok, errorOf(c2));
  const c2Id = c2.ok ? c2.id : "";

  await as.mktAll();
  const c1 = await createMarketingCampaignAction(
    campaignInput({
      name: `${TAG}-ABC`,
      branchCodes: [CODES.A, CODES.B, CODES.C],
      catalogModelIds: [modelId, model2Id],
    }),
  );
  check("11. se crea una campaña con tres sucursales", c1.ok, errorOf(c1));
  const c1Id = c1.ok ? c1.id : "";
  const c1Row = await prisma.marketingCampaign.findUnique({
    where: { id: c1Id },
    include: { branches: true, models: true },
  });
  check(
    "11. las tres sucursales quedan guardadas",
    c1Row?.branches.length === 3 && c1Row.targetBranchId === null,
  );
  check("12. los dos modelos del catálogo quedan guardados", c1Row?.models.length === 2);
  const c2Row = await prisma.marketingCampaign.findUnique({ where: { id: c2Id } });
  check(
    "11. una campaña de una sola sucursal mantiene la columna heredada",
    c2Row?.targetBranchId === ctx.A.id,
  );

  const mktACoverage = await resolveGrantCoverage(prisma, { id: ctx.mktA.id, role: "MARKETING" }, "MARKETING_GESTIONAR_CAMPANAS");
  const mktAView = await listMarketingCampaigns({ level: "global" }, true, mktACoverage);
  check(
    "16-17. Marketing con permiso en A ve la campaña de tres sucursales, sin poder editarla",
    mktAView.some((row) => row.id === c1Id && !row.canEdit) &&
      mktAView.some((row) => row.id === c2Id && row.canEdit),
  );
  await as.mktA();
  const crossEdit = await updateMarketingCampaignAction(
    c1Id,
    campaignInput({ name: `${TAG}-hack`, branchCodes: [CODES.A] }),
  );
  check("17. no edita una campaña que cubre sucursales ajenas (ni quitándoselas)", !crossEdit.ok);

  // Leads atribuidos a la campaña, por los tres caminos.
  const publicLead = await createPublicLeadAction({
    nombre: `${TAG} Portal`,
    telefono: phone("831"),
    sucursalDeseada: CODES.A,
    motoSlug: "pulsar-ns400z",
    motoInteres: "Pulsar NS400Z",
    campaignId: c1Id,
    utmSource: "facebook",
  });
  const publicLeadRow = publicLead.ok
    ? await prisma.lead.findUnique({ where: { trackingCode: publicLead.trackingCode } })
    : null;
  check(
    "15. el enlace de campaña atribuye el lead del portal (antes se perdía)",
    publicLeadRow?.marketingCampaignId === c1Id && publicLeadRow.utmSource === "facebook",
  );
  check(
    "8. el lead del portal resuelve su modelo por el slug del portal",
    publicLeadRow?.catalogModelId === ns400?.id,
  );
  const dominar = await prisma.motorcycleCatalogModel.findUnique({ where: { slug: "bajaj-dominar-250" } });
  if (dominar?.isActive) {
    const byName = await createPublicLeadAction({
      nombre: `${TAG} Portal Dominar`,
      telefono: phone("832"),
      sucursalDeseada: CODES.A,
      motoSlug: "dominar-250",
      motoInteres: "Dominar 250",
    });
    const byNameRow = byName.ok
      ? await prisma.lead.findUnique({ where: { trackingCode: byName.trackingCode } })
      : null;
    check(
      "8. «Dominar 250» del portal se resuelve al modelo del catálogo por nombre exacto",
      byNameRow?.catalogModelId === dominar.id,
    );
  }

  await as.vendB();
  const manualB = await createLeadAction({
    nombre: `${TAG} Lead B`,
    telefono: phone("833"),
    origen: "Presencial",
    campaignId: c1Id,
  });
  check("15. un lead manual se atribuye a la campaña en su sucursal", manualB.ok, errorOf(manualB));
  await as.vendA();
  const plainLead = await createLeadAction({
    nombre: `${TAG} Lead sin campaña`,
    telefono: phone("834"),
    origen: "Presencial",
  });
  const plainLeadId = plainLead.ok ? plainLead.leadId : "";
  const setCampaign = await setLeadCampaignAction({ leadId: plainLeadId, campaignId: c1Id });
  check("15. el vendedor anota la campaña de su lead", setCampaign.ok, errorOf(setCampaign));
  const changeCampaign = await setLeadCampaignAction({ leadId: plainLeadId, campaignId: c2Id });
  check("17. cambiar una atribución ya hecha es de supervisión", !changeCampaign.ok);

  await as.mktAll();
  const editC1 = await updateMarketingCampaignAction(
    c1Id,
    campaignInput({
      name: `${TAG}-AB`,
      branchCodes: [CODES.A, CODES.B],
      catalogModelIds: [modelId],
    }),
  );
  check("13. se edita nombre, sucursales y modelos de una campaña", editC1.ok, errorOf(editC1));
  const c1Edited = await prisma.marketingCampaign.findUnique({
    where: { id: c1Id },
    include: { branches: true, models: true },
  });
  check(
    "13. los cambios quedan aplicados",
    c1Edited?.name === `${TAG}-AB` && c1Edited.branches.length === 2 && c1Edited.models.length === 1,
  );
  const dropA = await updateMarketingCampaignAction(
    c1Id,
    campaignInput({ name: `${TAG}-AB`, branchCodes: [CODES.B], catalogModelIds: [modelId] }),
  );
  check(
    "13. no se quita una sucursal que ya tiene leads atribuidos",
    !dropA.ok && errorOf(dropA).includes(ctx.A.name),
    errorOf(dropA),
  );
  const outsideLead = await createPublicLeadAction({
    nombre: `${TAG} Portal C`,
    telefono: phone("835"),
    sucursalDeseada: CODES.C,
    campaignId: c1Id,
  });
  const outsideRow = outsideLead.ok
    ? await prisma.lead.findUnique({ where: { trackingCode: outsideLead.trackingCode } })
    : null;
  check(
    "15. una sucursal que la campaña ya no cubre no recibe su atribución",
    outsideLead.ok && outsideRow?.marketingCampaignId === null,
  );

  const reportA = await saveCampaignLeadReportAction({ campaignId: c1Id, branchCode: CODES.A, reportedLeads: 25, notes: "Meta" });
  const reportB = await saveCampaignLeadReportAction({ campaignId: c1Id, branchCode: CODES.B, reportedLeads: 18 });
  check("14. Marketing registra las cifras por sucursal", reportA.ok && reportB.ok);
  const reportC = await saveCampaignLeadReportAction({ campaignId: c1Id, branchCode: CODES.C, reportedLeads: 3 });
  check("14. no se reporta una sucursal que la campaña no cubre", !reportC.ok);
  const reportNeg = await saveCampaignLeadReportAction({ campaignId: c1Id, branchCode: CODES.A, reportedLeads: -2 });
  check("14. una cifra negativa se rechaza", !reportNeg.ok);
  await saveCampaignLeadReportAction({ campaignId: c1Id, branchCode: CODES.A, reportedLeads: 26 });
  const reportRow = await prisma.marketingCampaignLeadReport.findUnique({
    where: { campaignId_branchId: { campaignId: c1Id, branchId: ctx.A.id } },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
  check(
    "14. corregir la cifra guarda quién, cuándo y el valor anterior",
    reportRow?.reportedLeads === 26 &&
      reportRow.reportedById === ctx.mktAll.id &&
      reportRow.events.length === 2 &&
      reportRow.events[1].previousValue === 25,
  );
  await as.mktA();
  const mktAReportB = await saveCampaignLeadReportAction({ campaignId: c1Id, branchCode: CODES.B, reportedLeads: 1 });
  check("17. con permiso sólo en A no reporta la sucursal B", !mktAReportB.ok);

  await as.vendA();
  const vendConfirm = await confirmCampaignLeadReportAction({ campaignId: c1Id, branchCode: CODES.A, confirmedLeads: 3 });
  check("17. un vendedor no confirma cifras", !vendConfirm.ok);
  await as.liderA();
  const liderConfirmB = await confirmCampaignLeadReportAction({ campaignId: c1Id, branchCode: CODES.B, confirmedLeads: 18 });
  check("17. el líder no confirma la sucursal de otro", !liderConfirmB.ok);
  const liderConfirmA = await confirmCampaignLeadReportAction({ campaignId: c1Id, branchCode: CODES.A, confirmedLeads: 20, notes: "Llegaron 20" });
  check("14. el líder confirma lo que recibió su sucursal", liderConfirmA.ok, errorOf(liderConfirmA));
  const noReport = await confirmCampaignLeadReportAction({ campaignId: c2Id, branchCode: CODES.A, confirmedLeads: 1 });
  check("14. no se confirma lo que Marketing todavía no reportó", !noReport.ok);

  await as.mktAll();
  const reviewB = await reviewCampaignLeadReportAction({ campaignId: c1Id, branchCode: CODES.B });
  check("15. no se revisa una sucursal sin confirmar", !reviewB.ok);
  const reviewA = await reviewCampaignLeadReportAction({ campaignId: c1Id, branchCode: CODES.A });
  check("15. Marketing revisa la conciliación confirmada", reviewA.ok);

  const crmInA = await prisma.lead.count({ where: { marketingCampaignId: c1Id, branchId: ctx.A.id } });
  const crmInB = await prisma.lead.count({ where: { marketingCampaignId: c1Id, branchId: ctx.B.id } });
  const crmTotal = await prisma.lead.count({ where: { marketingCampaignId: c1Id } });
  const mktAllReport = await resolveGrantCoverage(prisma, { id: ctx.mktAll.id, role: "MARKETING" }, "MARKETING_REPORTAR_LEADS");
  const reconciliation = await getCampaignReconciliation({ level: "global" }, c1Id, {
    reportCoverage: mktAllReport,
    canConfirm: false,
    branchCode: null,
  });
  const rowA = reconciliation?.rows.find((row) => row.branchCode === CODES.A);
  const rowB = reconciliation?.rows.find((row) => row.branchCode === CODES.B);
  check(
    "15. la fila de A distingue reportado, confirmado y leads del CRM",
    rowA?.reportedLeads === 26 &&
      rowA.confirmedLeads === 20 &&
      rowA.crmLeads === crmInA &&
      rowA.differenceVsCrm === 26 - crmInA &&
      rowA.status === "CON_DIFERENCIA" &&
      rowA.reviewedAt !== null,
    JSON.stringify({ rowA, crmInA }),
  );
  check(
    "15. la fila de B cuenta su lead del CRM y queda pendiente de confirmar",
    rowB?.crmLeads === crmInB && rowB.status === "PENDIENTE_CONFIRMACION",
  );
  check(
    "15. el total consolidado cuenta cada lead una sola vez",
    reconciliation?.totals.crmLeads === crmTotal &&
      reconciliation.totals.reportedLeads === 44 &&
      reconciliation.consolidated,
    JSON.stringify(reconciliation?.totals),
  );
  const liderView = await getCampaignReconciliation(
    getMarketingScopeForUser("LIDER_VENTAS", CODES.A),
    c1Id,
    { reportCoverage: null, canConfirm: true, branchCode: CODES.A },
  );
  check(
    "15. el líder ve sólo la fila de su sucursal, sin consolidado",
    liderView?.rows.length === 1 && liderView.rows[0].branchCode === CODES.A && !liderView.consolidated,
  );
  check(
    "15. ningún número se «cuadra» tocando leads",
    (await prisma.lead.count({ where: { marketingCampaignId: c1Id } })) === crmTotal,
  );

  const archive = await archiveMarketingCampaignAction(c1Id);
  const lockedEdit = await updateMarketingCampaignAction(
    c1Id,
    campaignInput({
      name: `${TAG}-AB`,
      status: "COMPLETED",
      branchCodes: [CODES.A, CODES.B, CODES.C],
      catalogModelIds: [modelId],
    }),
  );
  check(
    "13. una campaña finalizada no cambia sus sucursales",
    archive.ok && !lockedEdit.ok && errorOf(lockedEdit).includes("finalizada"),
    errorOf(lockedEdit),
  );
  const renameCompleted = await updateMarketingCampaignAction(
    c1Id,
    campaignInput({
      name: `${TAG}-AB final`,
      status: "COMPLETED",
      branchCodes: [CODES.A, CODES.B],
      catalogModelIds: [modelId],
      description: "Cerrada",
    }),
  );
  check("13. pero sí su nombre y descripción", renameCompleted.ok, errorOf(renameCompleted));
  const changes = await listCampaignChanges(c1Id);
  check(
    "13. cada cambio queda en el historial de la campaña",
    changes.length === 4 && changes.some((change) => change.description.includes("sucursales")),
    `cambios=${changes.length}`,
  );
  const reportsAfterEdit = await prisma.marketingCampaignLeadReport.count({ where: { campaignId: c1Id } });
  check("13. editar la campaña no borra sus cifras reportadas", reportsAfterEdit === 2);

  // ---------------------------------------------------------------------
  section("16. Lectura global de Marketing");
  check(
    "16. Marketing y Administrador ven la visión comercial; el resto no",
    canViewCommercialOverview("MARKETING") &&
      canViewCommercialOverview("ADMIN") &&
      !canViewCommercialOverview("GERENTE") &&
      !canViewCommercialOverview("VENDEDOR"),
  );
  const overview = await getCommercialOverview({ branchCode: null, period: "todo" });
  check(
    "16. la visión consolidada incluye las sucursales de prueba",
    [CODES.A, CODES.B, CODES.C].every((code) =>
      overview?.byBranch.some((row) => row.branchCode === code),
    ),
  );
  const leadKeys = Object.keys(overview?.recentLeads[0] ?? {});
  check(
    "16. las listas no exponen nombre, teléfono, cédula ni correo del cliente",
    !["name", "phone", "cedula", "email", "notes"].some((key) => leadKeys.includes(key)),
    leadKeys.join(","),
  );
  const overviewA = await getCommercialOverview({ branchCode: CODES.A, period: "todo" });
  check(
    "16. el filtro por sucursal reduce la vista a una",
    overviewA?.byBranch.length === 1 && overviewA.byBranch[0].branchCode === CODES.A,
  );
  const overviewBad = await getCommercialOverview({ branchCode: "no-existe", period: "todo" });
  check("16. un código inventado no ensancha a «todas»", overviewBad === null);

  // ---------------------------------------------------------------------
  section("18-19. Conservación de datos");
  await as.gerA();
  const move = await updateCustomerBranchAction({ customerId: vendCustomerId, branchCode: CODES.B });
  check("19. el gerente cede un cliente de su sucursal a otra", move.ok, errorOf(move));
  const moved = await prisma.customer.findUnique({ where: { id: vendCustomerId } });
  check(
    "19. cambiar la sucursal conserva nombre, teléfono y correo",
    moved?.branchId === ctx.B.id &&
      moved.name === `${TAG} Cliente Vendedor` &&
      moved.phoneNormalized === phone("811") &&
      moved.email === "cliente@example.com",
  );
  check(
    "19. su vendedor de otra sucursal se libera, y sus leads conservan su sucursal",
    moved?.assignedSellerId === null &&
      (await prisma.lead.count({ where: { customerId: vendCustomerId, branchId: ctx.A.id } })) >= 1,
  );
  const takeBack = await updateCustomerBranchAction({ customerId: vendCustomerId, branchCode: CODES.A });
  check("19. un gerente no toma clientes de otra sucursal", !takeBack.ok);

  const after = await baseline();
  check("19. los clientes ajenos al smoke siguen intactos", after.customers === before.customers);
  check(
    "19. ningún documento de caja, contable ni asiento se creó",
    after.cashDocuments === before.cashDocuments &&
      after.accountingDocuments === before.accountingDocuments &&
      after.journalEntries === before.journalEntries,
  );
  check("19. los créditos ajenos al smoke siguen intactos", after.credits === before.credits);
  check(
    "18. las campañas existentes no se tocaron",
    JSON.stringify(after.campaigns) === JSON.stringify(before.campaigns),
  );
  const orphaned = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM marketing_campaigns c
    WHERE c.target_branch_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM marketing_campaign_branches b
        WHERE b.campaign_id = c.id AND b.branch_id = c.target_branch_id
      )`;
  check(
    "18. toda campaña con sucursal heredada la conserva en la tabla nueva",
    Number(orphaned[0]?.count ?? 1) === 0,
  );
}

async function cleanup() {
  const branches = await prisma.branch.findMany({
    where: { code: { in: Object.values(CODES) } },
    select: { id: true },
  });
  const branchIds = branches.map((branch) => branch.id);
  const users = await prisma.user.findMany({
    where: { email: { startsWith: TAG.toLowerCase() } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const inBranches = { branchId: { in: branchIds } };

  await prisma.userNotification.deleteMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        { customer: inBranches },
        { lead: inBranches },
        { reservation: inBranches },
      ],
    },
  });
  await prisma.customerNotification.deleteMany({ where: { customer: inBranches } });
  await prisma.reservationPaymentProof.deleteMany({ where: { reservation: inBranches } });
  await prisma.storedFile.deleteMany({ where: inBranches });
  await prisma.activity.deleteMany({ where: inBranches });
  await prisma.inventoryMovement.deleteMany({ where: inBranches });
  await prisma.sale.deleteMany({ where: inBranches });
  await prisma.reservation.deleteMany({ where: inBranches });
  await prisma.creditApplication.deleteMany({ where: inBranches });
  await prisma.customerFile.deleteMany({ where: inBranches });
  await prisma.lead.deleteMany({ where: inBranches });
  await prisma.marketingCampaign.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.customer.deleteMany({ where: inBranches });
  await prisma.motorcycleUnit.deleteMany({ where: inBranches });
  await prisma.motorcycleCatalogModel.deleteMany({
    where: { brand: "Smoke", model: { contains: SUFFIX } },
  });
  await prisma.userAuditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
}

main()
  .catch((error) => {
    failed += 1;
    console.error("\n  ERROR", error);
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch (error) {
      failed += 1;
      console.error("\n  ERROR en la limpieza", error);
    }
    await prisma.$disconnect();
    console.log(`\n  ${passed} OK · ${failed} fallos\n`);
    process.exit(failed === 0 ? 0 : 1);
  });
