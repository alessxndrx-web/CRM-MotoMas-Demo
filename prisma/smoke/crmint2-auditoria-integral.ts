/**
 * SMOKE-CRMINT2 — la auditoría independiente de CRM-INT1, contra la base viva.
 *
 *   npm run smoke:crm-int2
 *
 * ## Qué prueba
 *
 *   1. Identidad: teléfono normalizado (8 dígitos, `505…`, `+505 …`), cédula
 *      válida como única prueba definitiva, coincidencias ambiguas, cédulas
 *      duplicadas o en conflicto, vínculos no autorizados y entre sucursales,
 *      altas y conversiones simultáneas, y el expediente que exige evidencia.
 *   2. Autorización: Marketing invocando a mano acciones de CRM, POS,
 *      inventario, reservas, comprobantes, sucursales, catálogo y permisos;
 *      concesiones que se retiran y dejan de valer en la llamada siguiente;
 *      acceso horizontal y entre sucursales; tableros sin datos personales.
 *   3. Atribución de campañas: ventana de vigencia, sin atribución retroactiva
 *      inventada y totales de conciliación coherentes.
 *   4. Conciliación del catálogo: sugerencias exactas, posibles y ninguna;
 *      enlace individual y en bloque; carrera entre dos Administradores;
 *      alta de unidades que exige modelo; existencias por modelo después.
 *   5. Visión comercial del POS: brutas, anuladas, devoluciones, neto,
 *      compras sin importes, paginación y separación de la línea de motos.
 *   6. Comprobantes: subidas y revisiones simultáneas, tamaño, y la medición
 *      del costo de guardar los archivos en PostgreSQL.
 *
 * Trabaja sobre sucursales, usuarios y datos propios y los borra al terminar
 * aunque una aserción falle.
 */
import { PrismaClient } from "@prisma/client";

import { roleEnumToSpanish, type UserRoleEnum } from "@/server/auth/roles";
import {
  SESSION_COOKIE_NAME,
  createPortalToken,
  createSessionToken,
} from "@/server/auth/session";
import { createBranchAction } from "@/server/branches/actions";
import {
  bulkLinkExactUnitsAction,
  createCatalogModelAction,
  linkUnitToCatalogModelAction,
} from "@/server/catalog/actions";
import { listCatalogForAdmin, listUnlinkedUnits } from "@/server/catalog/queries";
import {
  assignCustomerAction,
  assignLeadAction,
  convertLeadToCustomerAction,
  createCustomerAction,
  createExpedienteAction,
  createLeadAction,
  createPublicLeadAction,
  setLeadCampaignAction,
} from "@/server/crm/actions";
import { registerEgress, registerIngress } from "@/server/inventory/actions";
import { createMarketingCampaignAction, saveCampaignLeadReportAction } from "@/server/marketing/actions";
import { getCommercialOverview } from "@/server/marketing/overview";
import { getPosOverview } from "@/server/marketing/overview-pos";
import { getCampaignReconciliation } from "@/server/marketing/queries";
import type { MarketingCampaignInput } from "@/server/marketing/shared";
import { connectMetaAdAccount } from "@/server/meta-ads/actions";
import {
  createMetaPageBranchMapping,
  deleteMetaPageBranchMapping,
  updateMetaPageBranchMapping,
} from "@/server/meta/actions";
import {
  createReservation,
  createSale,
  readReservationPaymentProof,
  reviewReservationPaymentProof,
  uploadReservationPaymentProof,
} from "@/server/operations/actions";
import { setDelegatedPermissionAction } from "@/server/permissions/actions";
import {
  checkoutPosSaleAction,
  createPosProductAction,
  createPosPurchaseOrderAction,
} from "@/server/pos/actions";
import { uploadPortalReservationProofAction } from "@/server/portal/proof-actions";

const prisma = new PrismaClient();
const STAMP = Date.now();
const TAG = `SMOKE-CRMINT2-${STAMP}`;
const SUFFIX = String(STAMP).slice(-7);
const CODES = { A: `i2a${SUFFIX}`, B: `i2b${SUFFIX}` };

let passed = 0;
let failed = 0;
const measurements: string[] = [];

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

/** Una llamada que lanza (p. ej. `redirect`) también es un rechazo. */
async function attempt<T extends { ok: boolean }>(
  run: () => Promise<T>,
): Promise<{ ok: boolean; error: string }> {
  try {
    const result = (await run()) as T & { error?: string };
    return { ok: result.ok, error: result.ok ? "" : String(result.error ?? "") };
  } catch (error) {
    return { ok: false, error: `lanzó: ${error instanceof Error ? error.message : String(error)}` };
  }
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

/** Número nacional de 8 dígitos, distinto por prefijo. */
function nat(prefix: string) {
  return `${prefix}${SUFFIX.slice(1)}`;
}

/** Cédula nicaragüense con forma válida: 13 dígitos y letra. */
function ced(n: string) {
  return `001${SUFFIX}${n}A`;
}

/**
 * Cabecera PNG y el resto aleatorio: una foto real no se comprime, y un
 * relleno periódico sí (TOAST lo reduciría y la medición mentiría).
 */
function png(size = 64): File {
  const bytes = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += 65_536) {
    crypto.getRandomValues(bytes.subarray(offset, Math.min(size, offset + 65_536)));
  }
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([bytes], "comprobante.png", { type: "image/png" });
}

function campaignInput(overrides: Partial<MarketingCampaignInput>): MarketingCampaignInput {
  return {
    name: `${TAG}-campaña`,
    channel: "FACEBOOK_ADS",
    branchCodes: [],
    catalogModelIds: [],
    estimatedBudget: 1000,
    startsAt: new Date().toISOString().slice(0, 10),
    endsAt: null,
    status: "ACTIVE",
    objective: "LEADS",
    description: "Campaña de prueba",
    metaAdAccountId: null,
    ...overrides,
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function timed<T>(run: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const start = performance.now();
  const value = await run();
  return { ms: performance.now() - start, value };
}

const DAY = 24 * 60 * 60 * 1000;

async function seed() {
  const A = await prisma.branch.create({ data: { code: CODES.A, name: `${TAG}-A`, isActive: true } });
  const B = await prisma.branch.create({ data: { code: CODES.B, name: `${TAG}-B`, isActive: true } });
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
    admin: await user("ADMIN", null, "admin"),
    admin2: await user("ADMIN", null, "admin2"),
    gerA: await user("GERENTE", A.id, "gerA"),
    liderA: await user("LIDER_VENTAS", A.id, "liderA"),
    vendA: await user("VENDEDOR", A.id, "vendA"),
    vendA2: await user("VENDEDOR", A.id, "vendA2"),
    liderB: await user("LIDER_VENTAS", B.id, "liderB"),
    vendB: await user("VENDEDOR", B.id, "vendB"),
    mkt: await user("MARKETING", null, "mkt"),
  };
}

type Ctx = Awaited<ReturnType<typeof seed>>;

async function main() {
  const ctx: Ctx = await seed();
  const as = {
    admin: () => signInAs("ADMIN", ctx.admin.id, "all"),
    admin2: () => signInAs("ADMIN", ctx.admin2.id, "all"),
    gerA: () => signInAs("GERENTE", ctx.gerA.id, CODES.A),
    liderA: () => signInAs("LIDER_VENTAS", ctx.liderA.id, CODES.A),
    vendA: () => signInAs("VENDEDOR", ctx.vendA.id, CODES.A),
    vendA2: () => signInAs("VENDEDOR", ctx.vendA2.id, CODES.A),
    liderB: () => signInAs("LIDER_VENTAS", ctx.liderB.id, CODES.B),
    vendB: () => signInAs("VENDEDOR", ctx.vendB.id, CODES.B),
    mkt: () => signInAs("MARKETING", ctx.mkt.id, "all"),
  };

  // =====================================================================
  section("1. Identidad: teléfono y cédula");
  await as.vendA();
  const ana = await createCustomerAction({ nombre: `${TAG} Ana`, telefono: nat("51") });
  check("1. alta de un cliente nuevo", ana.ok && !ana.deduped, errorOf(ana));
  const anaId = ana.ok ? ana.customerId : "";

  const anaPrefixed = await createCustomerAction({
    nombre: `${TAG} Ana con prefijo`,
    telefono: `+505 ${nat("51").slice(0, 4)}-${nat("51").slice(4)}`,
  });
  check(
    "1. el mismo teléfono con +505 se reconoce, y sin cédula no se da por la misma persona",
    !anaPrefixed.ok &&
      anaPrefixed.resolution?.candidates.length === 1 &&
      anaPrefixed.resolution.candidates[0].customerId === anaId &&
      anaPrefixed.resolution.candidates[0].matchedBy.join() === "TELEFONO",
    errorOf(anaPrefixed),
  );
  check(
    "1. la coincidencia sólo por teléfono no crea ni fusiona nada",
    (await prisma.customer.count({ where: { name: { startsWith: `${TAG} Ana` } } })) === 1,
  );
  const anaSister = await createCustomerAction({
    nombre: `${TAG} Ana hermana`,
    telefono: nat("51"),
    confirmarNuevo: true,
  });
  check(
    "1. quien ve a la candidata puede confirmar que es otra persona, y queda auditado",
    anaSister.ok &&
      !anaSister.deduped &&
      (await prisma.userAuditLog.count({
        where: { actorUserId: ctx.vendA.id, action: "CUSTOMER_CREATED_DESPITE_MATCH" },
      })) === 1,
    errorOf(anaSister),
  );
  const anaSisterId = anaSister.ok ? anaSister.customerId : "";
  const twoOnPhone = await createCustomerAction({ nombre: `${TAG} Tercera`, telefono: nat("51") });
  check(
    "1. con dos clientes en el mismo teléfono, se enseñan los dos",
    !twoOnPhone.ok && twoOnPhone.resolution?.candidates.length === 2,
  );

  const berta = await createCustomerAction({
    nombre: `${TAG} Berta`,
    telefono: nat("52"),
    cedula: ced("001"),
  });
  const bertaId = berta.ok ? berta.customerId : "";
  const bertaAgain = await createCustomerAction({
    nombre: `${TAG} Berta otra vez`,
    telefono: nat("53"),
    cedula: ced("001"),
  });
  check(
    "1. la misma cédula válida identifica: se reutiliza el cliente, aunque cambie el teléfono",
    berta.ok && bertaAgain.ok && bertaAgain.deduped && bertaAgain.customerId === bertaId,
    errorOf(bertaAgain),
  );
  const bertaTwin = await createCustomerAction({
    nombre: `${TAG} Otra persona`,
    telefono: nat("52"),
    cedula: ced("002"),
  });
  check(
    "1. mismo teléfono con otra cédula válida es otra persona: se crea sin preguntar",
    bertaTwin.ok && !bertaTwin.deduped && bertaTwin.customerId !== bertaId,
    errorOf(bertaTwin),
  );
  const bertaBadCedula = await createCustomerAction({
    nombre: `${TAG} Cédula mal escrita`,
    telefono: nat("52"),
    cedula: "12345",
  });
  check(
    "1. una cédula sin forma válida no es prueba: vuelve a ser coincidencia por teléfono",
    !bertaBadCedula.ok &&
      bertaBadCedula.resolution?.candidates.length === 2 &&
      bertaBadCedula.resolution.candidates.every((row) => row.matchedBy.join() === "TELEFONO"),
    errorOf(bertaBadCedula),
  );

  // Datos heredados: dos clientes con la misma cédula (no hay índice único).
  const legacy = await Promise.all(
    ["1", "2"].map((n) =>
      prisma.customer.create({
        data: {
          branchId: ctx.A.id,
          name: `${TAG} Duplicada ${n}`,
          phone: nat(`6${n}`),
          phoneNormalized: nat(`6${n}`),
          cedula: ced("003"),
          cedulaNormalized: ced("003"),
          assignedSellerId: ctx.vendA.id,
        },
      }),
    ),
  );
  const dupCedula = await createCustomerAction({
    nombre: `${TAG} Duplicada 3`,
    telefono: nat("63"),
    cedula: ced("003"),
    confirmarNuevo: true,
  });
  check(
    "1. cédula repetida en datos heredados: se pide decidir y NO se crea una tercera",
    !dupCedula.ok &&
      dupCedula.resolution?.canCreateNew === false &&
      dupCedula.resolution.candidates.map((row) => row.customerId).sort().join() ===
        legacy.map((row) => row.id).sort().join() &&
      (await prisma.customer.count({ where: { cedulaNormalized: ced("003") } })) === 2,
    errorOf(dupCedula),
  );

  section("1. Identidad entre sucursales");
  await as.admin();
  const carla = await createCustomerAction({
    nombre: `${TAG} Carla`,
    telefono: nat("54"),
    cedula: ced("004"),
    branchCode: CODES.B,
    vendedorId: ctx.vendB.id,
  });
  const carlaId = carla.ok ? carla.customerId : "";
  check("(preparación) cliente en la sucursal B", carla.ok, errorOf(carla));

  await as.vendA();
  const carlaByPhone = await createCustomerAction({ nombre: `${TAG} Carla?`, telefono: nat("54") });
  const masked = !carlaByPhone.ok ? carlaByPhone.resolution?.candidates[0] : undefined;
  check(
    "1. la candidata de otra sucursal llega enmascarada, sin identificador",
    !!masked &&
      !masked.accessible &&
      masked.customerId === null &&
      masked.displayPhone.startsWith("****") &&
      !masked.displayName.includes("Carla") &&
      carlaByPhone.ok === false &&
      carlaByPhone.resolution?.canResolve === false,
    JSON.stringify(masked),
  );
  const vendForce = await createCustomerAction({
    nombre: `${TAG} Carla?`,
    telefono: nat("54"),
    confirmarNuevo: true,
  });
  check(
    "1. un vendedor no puede declarar «otra persona» frente a una candidata que no ve",
    !vendForce.ok && (await prisma.customer.count({ where: { phoneNormalized: nat("54") } })) === 1,
  );
  const carlaByCedula = await createCustomerAction({
    nombre: `${TAG} Carla`,
    telefono: nat("55"),
    cedula: ced("004"),
    confirmarNuevo: true,
  });
  check(
    "1. la misma cédula en otra sucursal no se duplica ni se revela",
    !carlaByCedula.ok &&
      carlaByCedula.resolution?.candidates[0]?.customerId === null &&
      (await prisma.customer.count({ where: { cedulaNormalized: ced("004") } })) === 1,
  );
  await as.liderA();
  const liderForce = await createCustomerAction({
    nombre: `${TAG} Homónima de teléfono`,
    telefono: nat("54"),
    confirmarNuevo: true,
  });
  check(
    "1. un líder sí decide que es otra persona (teléfono compartido), auditado",
    liderForce.ok &&
      (await prisma.userAuditLog.count({
        where: { actorUserId: ctx.liderA.id, action: "CUSTOMER_CREATED_DESPITE_MATCH" },
      })) === 1,
    errorOf(liderForce),
  );

  section("1. Conversión de leads");
  const metaLead = await createPublicLeadAction({
    nombre: `${TAG} Ana desde Meta`,
    telefono: `505${nat("51")}`,
    sucursalDeseada: CODES.A,
  });
  const metaLeadRow = metaLead.ok
    ? await prisma.lead.findUnique({ where: { trackingCode: metaLead.trackingCode } })
    : null;
  const metaLeadId = metaLeadRow?.id ?? "";
  const askMeta = await convertLeadToCustomerAction({ leadId: metaLeadId });
  check(
    "1. un lead con 505… encuentra a los clientes de 8 dígitos y pide decidir",
    !askMeta.ok &&
      (askMeta.resolution?.candidates.map((row) => row.customerId).sort().join() ?? "") ===
        [anaId, anaSisterId].sort().join(),
    errorOf(askMeta),
  );
  const linkWrong = await convertLeadToCustomerAction({
    leadId: metaLeadId,
    resolucion: { tipo: "VINCULAR", customerId: bertaId },
  });
  check("1. no se vincula con un cliente que no es candidata", !linkWrong.ok);
  const linkForeign = await convertLeadToCustomerAction({
    leadId: metaLeadId,
    resolucion: { tipo: "VINCULAR", customerId: carlaId },
  });
  check("1. no se vincula con un cliente de otra sucursal", !linkForeign.ok);
  const linkAna = await convertLeadToCustomerAction({
    leadId: metaLeadId,
    resolucion: { tipo: "VINCULAR", customerId: anaId },
  });
  check(
    "1. vincular a la candidata elegida conserva el cliente y queda auditado",
    linkAna.ok &&
      !linkAna.created &&
      linkAna.customerId === anaId &&
      (await prisma.userAuditLog.count({
        where: { action: "LEAD_LINKED_TO_CUSTOMER", targetId: metaLeadId },
      })) === 1,
    errorOf(linkAna),
  );
  check(
    "1. vincular no sobrescribe el cliente existente",
    (await prisma.customer.findUnique({ where: { id: anaId } }))?.name === `${TAG} Ana`,
  );

  const bertaLead = await createLeadAction({
    nombre: `${TAG} Berta lead`,
    telefono: nat("56"),
    cedula: ced("001"),
    origen: "Sucursal",
    forzarDuplicado: true,
  });
  const bertaLeadId = bertaLead.ok ? bertaLead.leadId : "";
  const bertaConvert = await convertLeadToCustomerAction({ leadId: bertaLeadId });
  check(
    "1. un lead con la cédula de un cliente accesible se vincula solo",
    bertaConvert.ok && !bertaConvert.created && bertaConvert.customerId === bertaId,
    errorOf(bertaConvert),
  );

  const carlaLead = await createLeadAction({
    nombre: `${TAG} Carla lead`,
    telefono: nat("57"),
    cedula: ced("004"),
    origen: "Sucursal",
    forzarDuplicado: true,
  });
  const carlaLeadId = carlaLead.ok ? carlaLead.leadId : "";
  const carlaConvert = await convertLeadToCustomerAction({ leadId: carlaLeadId });
  const carlaNew = await convertLeadToCustomerAction({
    leadId: carlaLeadId,
    resolucion: { tipo: "CREAR_NUEVO" },
  });
  check(
    "1. cédula de un cliente de otra sucursal: ni se vincula ni se crea otro",
    !carlaConvert.ok &&
      !carlaNew.ok &&
      (await prisma.customer.count({ where: { cedulaNormalized: ced("004") } })) === 1,
    `${errorOf(carlaConvert)} | ${errorOf(carlaNew)}`,
  );

  const phoneLead = await createLeadAction({
    nombre: `${TAG} Dora`,
    telefono: nat("51"),
    origen: "Sucursal",
    forzarDuplicado: true,
  });
  const doraNew = phoneLead.ok
    ? await convertLeadToCustomerAction({ leadId: phoneLead.leadId, resolucion: { tipo: "CREAR_NUEVO" } })
    : { ok: false as const, error: "sin lead" };
  check(
    "1. «es otra persona» en una conversión crea cliente nuevo y lo audita",
    doraNew.ok &&
      doraNew.created &&
      (await prisma.userAuditLog.count({
        where: { action: "LEAD_CONVERTED_DESPITE_MATCH", actorUserId: ctx.liderA.id },
      })) === 1,
    errorOf(doraNew),
  );

  await as.vendB();
  const vendBConvert = await convertLeadToCustomerAction({ leadId: bertaLeadId });
  check("1. un vendedor de otra sucursal no convierte leads ajenos", !vendBConvert.ok);
  await as.vendA();
  const vendAssign = await assignCustomerAction({ customerId: anaId, sellerId: ctx.vendA2.id });
  check("1. un vendedor no reparte cartera", !vendAssign.ok);
  const vendAssignLead = await assignLeadAction({ leadId: bertaLeadId, sellerId: ctx.vendA.id });
  check("1. un vendedor no asigna leads", !vendAssignLead.ok);

  section("1. Concurrencia");
  await as.liderA();
  const twinLeads = await Promise.all(
    ["71", "72"].map((prefix) =>
      createLeadAction({
        nombre: `${TAG} Gemela ${prefix}`,
        telefono: nat(prefix),
        cedula: ced("005"),
        origen: "Sucursal",
        forzarDuplicado: true,
      }),
    ),
  );
  const twinResults = await Promise.all(
    twinLeads.map((lead) =>
      lead.ok ? convertLeadToCustomerAction({ leadId: lead.leadId }) : Promise.resolve({ ok: false as const, error: "sin lead" }),
    ),
  );
  check(
    "1. dos conversiones simultáneas con la misma cédula producen un solo cliente",
    twinResults.every((result) => result.ok) &&
      (await prisma.customer.count({ where: { cedulaNormalized: ced("005") } })) === 1 &&
      twinResults.filter((result) => result.ok && result.created).length === 1,
    twinResults.map((result) => errorOf(result)).join(" | "),
  );

  const sameLead = await createLeadAction({
    nombre: `${TAG} Doble clic`,
    telefono: nat("73"),
    origen: "Sucursal",
    forzarDuplicado: true,
  });
  const sameLeadId = sameLead.ok ? sameLead.leadId : "";
  const doubleClick = await Promise.all([
    convertLeadToCustomerAction({ leadId: sameLeadId }),
    convertLeadToCustomerAction({ leadId: sameLeadId }),
  ]);
  check(
    "1. el mismo lead convertido dos veces a la vez: un cliente, las dos respuestas lo nombran",
    doubleClick.every((result) => result.ok) &&
      doubleClick[0].ok &&
      doubleClick[1].ok &&
      doubleClick[0].customerId === doubleClick[1].customerId &&
      (await prisma.customer.count({ where: { phoneNormalized: nat("73") } })) === 1,
    doubleClick.map((result) => errorOf(result)).join(" | "),
  );

  const racePhone = await Promise.all([
    createCustomerAction({ nombre: `${TAG} Carrera 1`, telefono: nat("74") }),
    createCustomerAction({ nombre: `${TAG} Carrera 2`, telefono: nat("74") }),
  ]);
  check(
    "1. dos altas simultáneas con el mismo teléfono: una crea, la otra pide decidir",
    racePhone.filter((result) => result.ok).length === 1 &&
      (await prisma.customer.count({ where: { phoneNormalized: nat("74") } })) === 1,
  );
  const raceCedula = await Promise.all([
    createCustomerAction({ nombre: `${TAG} Cédula 1`, telefono: nat("75"), cedula: ced("006") }),
    createCustomerAction({ nombre: `${TAG} Cédula 2`, telefono: nat("76"), cedula: ced("006") }),
  ]);
  check(
    "1. dos altas simultáneas con la misma cédula: un cliente, la otra lo reutiliza",
    raceCedula.every((result) => result.ok) &&
      raceCedula.filter((result) => result.ok && result.deduped).length === 1 &&
      (await prisma.customer.count({ where: { cedulaNormalized: ced("006") } })) === 1,
  );

  section("1. Expediente con evidencia");
  const strangerLead = await createLeadAction({
    nombre: `${TAG} Desconocido`,
    telefono: nat("77"),
    origen: "Sucursal",
    forzarDuplicado: true,
  });
  const strangerFile = strangerLead.ok
    ? await createExpedienteAction({ customerId: anaId, leadId: strangerLead.leadId })
    : { ok: false as const, error: "sin lead" };
  check(
    "1. no se abre expediente uniendo un lead con un cliente que no comparte teléfono ni cédula",
    !strangerFile.ok && errorOf(strangerFile).includes("no comparte"),
    errorOf(strangerFile),
  );
  const anaLead = await createLeadAction({
    nombre: `${TAG} Ana, otra consulta`,
    telefono: `505${nat("51")}`,
    origen: "Sucursal",
    forzarDuplicado: true,
  });
  const anaFile = anaLead.ok
    ? await createExpedienteAction({ customerId: anaId, leadId: anaLead.leadId })
    : { ok: false as const, error: "sin lead" };
  check("1. con el mismo teléfono (aunque lleve 505) sí se abre", anaFile.ok, errorOf(anaFile));

  await as.vendA2();
  const horizontalFile = await createExpedienteAction({ customerId: anaId });
  check("2. un vendedor no abre expedientes de la cartera de otro (horizontal)", !horizontalFile.ok);

  // =====================================================================
  section("2. Autorización: Marketing sin concesiones");
  const unit = await prisma.motorcycleUnit.create({
    data: {
      branchId: ctx.A.id,
      name: `${TAG} Unidad`,
      brand: "Smoke",
      model: `Aut${SUFFIX}`,
      year: 2026,
      chassisNumber: `${TAG}-AUT`,
      entryDate: new Date(),
    },
  });
  await as.liderA();
  const resForAuth = await createReservation({ customerId: anaId, motorcycleUnitId: unit.id });
  const resForAuthId = resForAuth.ok ? resForAuth.reservationId : "";
  const proofForAuth = await uploadReservationPaymentProof({ reservationId: resForAuthId, file: png() });
  check("(preparación) reserva con comprobante", resForAuth.ok && proofForAuth.ok, `${errorOf(resForAuth)} ${errorOf(proofForAuth)}`);

  await as.mkt();
  const denied: Array<[string, () => Promise<{ ok: boolean }>]> = [
    ["crear cliente", () => createCustomerAction({ nombre: `${TAG} M`, telefono: nat("81") })],
    ["crear lead", () => createLeadAction({ nombre: `${TAG} M`, telefono: nat("82"), origen: "Sucursal", branchCode: CODES.A })],
    ["asignar lead", () => assignLeadAction({ leadId: bertaLeadId, sellerId: ctx.vendA.id })],
    ["convertir lead", () => convertLeadToCustomerAction({ leadId: sameLeadId })],
    ["abrir expediente", () => createExpedienteAction({ customerId: anaId })],
    ["repartir cartera", () => assignCustomerAction({ customerId: anaId, sellerId: null })],
    ["ingreso de inventario", () => registerIngress({ catalogModelId: "x", name: "x", brand: "x", model: "x", year: "2026", chassisNumber: `${TAG}-M`, engineNumber: "", color: "", branchCode: CODES.A, entryDate: "2026-01-01", notes: "" })],
    ["egreso de inventario", () => registerEgress({ unitId: unit.id, reason: "VENTA", exitDate: "2026-01-01", notes: "" } as never)],
    ["crear reserva", () => createReservation({ customerId: anaId, motorcycleUnitId: unit.id })],
    ["subir comprobante", () => uploadReservationPaymentProof({ reservationId: resForAuthId, file: png() })],
    ["verificar comprobante", () => reviewReservationPaymentProof({ reservationId: resForAuthId, aprobar: true })],
    ["ver la imagen del comprobante", () => readReservationPaymentProof({ reservationId: resForAuthId })],
    ["reportar venta de moto", () => createSale({ customerId: anaId, motorcycleUnitId: unit.id, type: "CONTADO" })],
    ["crear producto POS", () => createPosProductAction({ sku: `${TAG}-M`, name: "x", unitPrice: 1 } as never)],
    ["crear compra POS", () => createPosPurchaseOrderAction({ branchCode: CODES.A, supplierId: "x", lines: [{ productId: "x", quantity: 1, unitCost: 1 }] as never })],
    ["cobrar en el POS", () => checkoutPosSaleAction({ warehouseId: "x", lines: [{ productId: "x", quantity: 1, unitPrice: 1 }], payments: [] } as never)],
    ["crear sucursal", () => createBranchAction({ name: `${TAG}-M` })],
    ["alta en el catálogo", () => createCatalogModelAction({ brand: "Smoke", model: `${TAG}-M` })],
    ["conciliar una unidad", () => linkUnitToCatalogModelAction({ unitId: unit.id, catalogModelId: "x" })],
    ["conciliar en bloque", () => bulkLinkExactUnitsAction({ unitIds: [unit.id] })],
    ["concederse permisos", () => setDelegatedPermissionAction({ userId: ctx.mkt.id, permission: "MARKETING_GESTIONAR_CAMPANAS", mode: "ALL" })],
    ["crear campaña sin concesión", () => createMarketingCampaignAction(campaignInput({ branchCodes: [CODES.A] }))],
    ["reportar cifras sin concesión", () => saveCampaignLeadReportAction({ campaignId: "x", branchCode: CODES.A, reportedLeads: 3 })],
    ["mapear página de Meta sin concesión", () => createMetaPageBranchMapping({ pageId: `9${SUFFIX}1`, branchCode: CODES.A, label: null, isActive: true })],
    ["conectar cuenta publicitaria sin concesión", () => connectMetaAdAccount(`act_${SUFFIX}`)],
  ];
  for (const [name, run] of denied) {
    const result = await attempt(run);
    check(`2. Marketing no puede: ${name}`, !result.ok, result.error);
  }
  check(
    "2. y nada de eso dejó filas",
    (await prisma.customer.count({ where: { phoneNormalized: nat("81") } })) === 0 &&
      (await prisma.lead.count({ where: { phone: nat("82") } })) === 0 &&
      (await prisma.metaPageBranch.count({ where: { branchId: ctx.A.id } })) === 0 &&
      (await prisma.userPermissionGrant.count({ where: { userId: ctx.mkt.id } })) === 0,
  );

  section("2. Concesiones que se retiran");
  await as.admin();
  await setDelegatedPermissionAction({ userId: ctx.mkt.id, permission: "MARKETING_GESTIONAR_INTEGRACIONES", mode: "ALL" });
  await as.mkt();
  const mapped = await createMetaPageBranchMapping({ pageId: `9${SUFFIX}2`, branchCode: CODES.A, label: null, isActive: true });
  check("2. con la concesión de integraciones, Marketing mapea una página", mapped.ok, errorOf(mapped));
  const mappingId = mapped.ok ? mapped.id : "";
  await as.admin();
  await setDelegatedPermissionAction({ userId: ctx.mkt.id, permission: "MARKETING_GESTIONAR_INTEGRACIONES", mode: "NONE" });
  await as.mkt();
  const afterRevokeUpdate = await attempt(() =>
    updateMetaPageBranchMapping(mappingId, { pageId: `9${SUFFIX}2`, branchCode: CODES.B, label: null, isActive: true }),
  );
  const afterRevokeDelete = await attempt(() => deleteMetaPageBranchMapping(mappingId));
  check(
    "2. retirada la concesión, la llamada siguiente ya se rechaza (sin cerrar sesión)",
    !afterRevokeUpdate.ok && !afterRevokeDelete.ok &&
      (await prisma.metaPageBranch.findUnique({ where: { id: mappingId } }))?.branchId === ctx.A.id,
  );
  await as.admin();
  await setDelegatedPermissionAction({
    userId: ctx.mkt.id,
    permission: "MARKETING_GESTIONAR_INTEGRACIONES",
    mode: "BRANCHES",
    branchCodes: [CODES.A],
  });
  await as.mkt();
  const crossMapping = await attempt(() =>
    createMetaPageBranchMapping({ pageId: `9${SUFFIX}3`, branchCode: CODES.B, label: null, isActive: true }),
  );
  check("2. con concesión sólo en A no mapea páginas a B", !crossMapping.ok);
  const adAccountPartial = await attempt(() => connectMetaAdAccount(`act_${SUFFIX}`));
  check(
    "2. conectar cuentas publicitarias exige la concesión en todas las sucursales",
    !adAccountPartial.ok && adAccountPartial.error.toLowerCase().includes("permiso"),
    adAccountPartial.error,
  );
  await as.admin();
  await setDelegatedPermissionAction({
    userId: ctx.mkt.id,
    permission: "MARKETING_GESTIONAR_CAMPANAS",
    mode: "BRANCHES",
    branchCodes: [CODES.A],
  });
  await as.mkt();
  const campaignA = await createMarketingCampaignAction(campaignInput({ name: `${TAG}-A`, branchCodes: [CODES.A] }));
  const campaignB = await createMarketingCampaignAction(campaignInput({ name: `${TAG}-B`, branchCodes: [CODES.B] }));
  check("2. concesión por sucursal: crea en A, no en B", campaignA.ok && !campaignB.ok, errorOf(campaignA));
  await as.admin();
  await setDelegatedPermissionAction({ userId: ctx.mkt.id, permission: "MARKETING_GESTIONAR_CAMPANAS", mode: "NONE" });
  await as.mkt();
  const afterRevokeCampaign = await createMarketingCampaignAction(campaignInput({ name: `${TAG}-A2`, branchCodes: [CODES.A] }));
  check("2. retirada, ya no crea ni en A", !afterRevokeCampaign.ok);

  await as.gerA();
  const gerGrant = await setDelegatedPermissionAction({ userId: ctx.mkt.id, permission: "MARKETING_GESTIONAR_CAMPANAS", mode: "ALL" });
  check("2. un Gerente no concede permisos de Marketing (escalada)", !gerGrant.ok);

  await prisma.user.update({ where: { id: ctx.mkt.id }, data: { isActive: false } });
  await as.mkt();
  const deactivated = await attempt(() =>
    createMetaPageBranchMapping({ pageId: `9${SUFFIX}4`, branchCode: CODES.A, label: null, isActive: true }),
  );
  check("2. un usuario desactivado queda fuera aunque su cookie siga firmada", !deactivated.ok);
  await prisma.user.update({ where: { id: ctx.mkt.id }, data: { isActive: true } });

  // =====================================================================
  section("3. Atribución de campañas");
  const mkCampaign = (name: string, startsAt: Date, endsAt: Date | null) =>
    prisma.marketingCampaign.create({
      data: {
        name: `${TAG}-${name}`,
        channel: "FACEBOOK_ADS",
        objective: "LEADS",
        status: "ACTIVE",
        startsAt,
        endsAt,
        createdById: ctx.admin.id,
        branches: { create: [{ branchId: ctx.A.id }] },
      },
    });
  const now = Date.now();
  const future = await mkCampaign("futura", new Date(now + 10 * DAY), null);
  const past = await mkCampaign("pasada", new Date(now - 60 * DAY), new Date(now - 30 * DAY));
  const live = await mkCampaign("vigente", new Date(now - DAY), null);

  const publicLead = async (campaignId: string, prefix: string) => {
    const result = await createPublicLeadAction({
      nombre: `${TAG} Web ${prefix}`,
      telefono: nat(prefix),
      sucursalDeseada: CODES.A,
      campaignId,
      utmSource: "facebook",
    });
    return result.ok ? prisma.lead.findUnique({ where: { trackingCode: result.trackingCode } }) : null;
  };
  const leadFuture = await publicLead(future.id, "91");
  const leadPast = await publicLead(past.id, "92");
  const leadLive = await publicLead(live.id, "93");
  check(
    "3. el enlace de una campaña que aún no empieza no atribuye, pero el lead entra con su UTM",
    !!leadFuture && leadFuture.marketingCampaignId === null && leadFuture.utmSource === "facebook",
  );
  check("3. el enlace de una campaña terminada hace un mes no atribuye", !!leadPast && leadPast.marketingCampaignId === null);
  check("3. el enlace de la campaña vigente atribuye", leadLive?.marketingCampaignId === live.id);

  await as.liderA();
  const manualFuture = await createLeadAction({
    nombre: `${TAG} Manual futura`,
    telefono: nat("94"),
    origen: "Sucursal",
    campaignId: future.id,
    forzarDuplicado: true,
  });
  check("3. un lead manual no se atribuye a una campaña que no había empezado", !manualFuture.ok);

  const oldLead = await createLeadAction({
    nombre: `${TAG} Lead antiguo`,
    telefono: nat("95"),
    origen: "Sucursal",
    forzarDuplicado: true,
  });
  const oldLeadId = oldLead.ok ? oldLead.leadId : "";
  await prisma.lead.update({ where: { id: oldLeadId }, data: { createdAt: new Date(now - 40 * DAY) } });
  const retroLive = await setLeadCampaignAction({ leadId: oldLeadId, campaignId: live.id });
  check(
    "3. no se inventa atribución retroactiva: un lead de hace 40 días no es de una campaña de ayer",
    !retroLive.ok,
  );
  const inWindow = await setLeadCampaignAction({ leadId: oldLeadId, campaignId: past.id });
  check(
    "3. sí se puede corregir hacia la campaña que estaba vigente cuando llegó",
    inWindow.ok,
    errorOf(inWindow),
  );

  const reconciliation = await getCampaignReconciliation({ level: "global" }, live.id, {
    reportCoverage: null,
    canConfirm: false,
    branchCode: null,
  });
  const crmForLive = await prisma.lead.count({ where: { marketingCampaignId: live.id } });
  check(
    "3. la conciliación cuenta cada lead una vez y sus filas suman el total",
    reconciliation?.totals.crmLeads === crmForLive &&
      (reconciliation?.rows.reduce((sum, row) => sum + row.crmLeads, 0) ?? -1) === crmForLive,
  );

  // =====================================================================
  section("4. Conciliación del catálogo");
  await as.admin();
  const recModel = await createCatalogModelAction({ brand: "Smoke", model: `Rec${SUFFIX}`, year: 2026 });
  const ambModel1 = await createCatalogModelAction({ brand: "Smoke", model: `Amb${SUFFIX}`, year: 2026 });
  const ambModel2 = await createCatalogModelAction({ brand: "Smoke", model: `Amb${SUFFIX}` });
  const recId = recModel.ok ? recModel.id : "";
  const amb1Id = ambModel1.ok ? ambModel1.id : "";
  const amb2Id = ambModel2.ok ? ambModel2.id : "";
  check("(preparación) modelos del catálogo", recModel.ok && ambModel1.ok && ambModel2.ok);

  const mkUnit = (key: string, brand: string, model: string, year: number) =>
    prisma.motorcycleUnit.create({
      data: {
        branchId: ctx.A.id,
        name: `${brand} ${model}`,
        brand,
        model,
        year,
        chassisNumber: `${TAG}-${key}`,
        entryDate: new Date(),
      },
    });
  const uExact = await mkUnit("EXA", "SMOKE", `rec ${SUFFIX}`, 2026);
  const uTwo = await mkUnit("DOS", "Smoke", `Amb${SUFFIX}`, 2026);
  const uYear = await mkUnit("ANO", "Smoke", `Rec${SUFFIX}`, 2020);
  const uNone = await mkUnit("NAD", "Otra", `Nada${SUFFIX}`, 2026);
  const unlinked = await listUnlinkedUnits();
  const suggestionOf = (id: string) => unlinked.units.find((row) => row.id === id)?.suggestion;
  check(
    "4. misma marca y modelo (sin mayúsculas ni espacios) y mismo año: sugerencia exacta",
    suggestionOf(uExact.id)?.confidence === "EXACTA" && suggestionOf(uExact.id)?.candidates[0]?.id === recId,
    JSON.stringify(suggestionOf(uExact.id)),
  );
  check(
    "4. dos modelos compatibles: sólo «posible», con los dos candidatos",
    suggestionOf(uTwo.id)?.confidence === "POSIBLE" && suggestionOf(uTwo.id)?.candidates.length === 2,
  );
  check("4. año distinto: «posible», no exacta", suggestionOf(uYear.id)?.confidence === "POSIBLE");
  check("4. sin modelo parecido: ninguna sugerencia", suggestionOf(uNone.id)?.confidence === "NINGUNA");
  check(
    "4. sugerir no enlaza nada",
    (await prisma.motorcycleUnit.count({
      where: { id: { in: [uExact.id, uTwo.id, uYear.id, uNone.id] }, catalogModelId: { not: null } },
    })) === 0,
  );

  const availableBefore = (await listCatalogForAdmin()).find((row) => row.id === recId)?.availableUnits ?? -1;
  await as.gerA();
  const gerLink = await linkUnitToCatalogModelAction({ unitId: uExact.id, catalogModelId: recId });
  check("4. un Gerente no concilia unidades", !gerLink.ok);
  await as.admin();
  const bulk = await bulkLinkExactUnitsAction({ unitIds: [uExact.id, uTwo.id, uYear.id, uNone.id] });
  check(
    "4. en bloque sólo se enlazan las exactas (recalculadas en el servidor)",
    bulk.ok && bulk.linked === 1 && bulk.skipped === 3,
    JSON.stringify(bulk),
  );
  const exactAfter = await prisma.motorcycleUnit.findUnique({ where: { id: uExact.id } });
  check(
    "4. enlazar no cambia estado, sucursal ni el texto registrado",
    exactAfter?.catalogModelId === recId &&
      exactAfter.status === "AVAILABLE" &&
      exactAfter.branchId === ctx.A.id &&
      exactAfter.model === `rec ${SUFFIX}`,
  );
  check(
    "4. las existencias del modelo suben con la unidad enlazada",
    (await listCatalogForAdmin()).find((row) => row.id === recId)?.availableUnits === availableBefore + 1,
  );
  check(
    "4. cada enlace queda en la auditoría",
    (await prisma.userAuditLog.count({ where: { action: "UNIT_CATALOG_LINKED", targetId: uExact.id } })) === 1,
  );
  const relink = await linkUnitToCatalogModelAction({ unitId: uExact.id, catalogModelId: amb1Id });
  check("4. una unidad ya enlazada no se reescribe desde la conciliación", !relink.ok);

  const race = await Promise.all([
    linkUnitToCatalogModelAction({ unitId: uTwo.id, catalogModelId: amb1Id }),
    (async () => {
      await as.admin2();
      return linkUnitToCatalogModelAction({ unitId: uTwo.id, catalogModelId: amb2Id });
    })(),
  ]);
  const uTwoAfter = await prisma.motorcycleUnit.findUnique({ where: { id: uTwo.id } });
  check(
    "4. dos Administradores eligiendo a la vez: gana uno, el otro recibe «ya estaba enlazada»",
    race.filter((result) => result.ok).length === 1 &&
      [amb1Id, amb2Id].includes(uTwoAfter?.catalogModelId ?? "") &&
      (await prisma.userAuditLog.count({ where: { action: "UNIT_CATALOG_LINKED", targetId: uTwo.id } })) === 1,
    race.map((result) => errorOf(result)).join(" | "),
  );
  await as.admin();
  const manualNone = await linkUnitToCatalogModelAction({ unitId: uNone.id, catalogModelId: recId });
  const noneAudit = await prisma.userAuditLog.findFirst({ where: { action: "UNIT_CATALOG_LINKED", targetId: uNone.id } });
  check(
    "4. una elección sin sugerencia se permite al Administrador y se audita como manual",
    manualNone.ok && (noneAudit?.description ?? "").includes("elección manual"),
  );

  const noModel = await registerIngress({
    catalogModelId: "",
    name: "x",
    brand: "Smoke",
    model: "x",
    year: "2026",
    chassisNumber: `${TAG}-SINMODELO`,
    engineNumber: "",
    color: "",
    branchCode: CODES.A,
    entryDate: new Date().toISOString().slice(0, 10),
    notes: "",
  } as never);
  check("4. el alta de una unidad sin modelo del catálogo se rechaza", !noModel.ok, errorOf(noModel));
  const withModel = await registerIngress({
    catalogModelId: recId,
    name: "",
    brand: "Smoke",
    model: "",
    year: "2026",
    chassisNumber: `${TAG}-CONMODELO`,
    engineNumber: "",
    color: "",
    branchCode: CODES.A,
    entryDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  check(
    "4. con modelo, la unidad nace enlazada",
    withModel.ok &&
      (await prisma.motorcycleUnit.findUnique({ where: { chassisNumber: `${TAG}-CONMODELO` } }))?.catalogModelId === recId,
    errorOf(withModel),
  );

  // =====================================================================
  section("5. Visión comercial: repuestos (POS)");
  const product = await prisma.posProduct.create({ data: { sku: `${TAG}-SKU`, name: "Filtro smoke", unitPrice: 100 } });
  const warehouse = await prisma.posWarehouse.create({ data: { branchId: ctx.A.id, code: `W${SUFFIX}`, name: "Bodega smoke" } });
  const operator = await prisma.posOperator.create({
    data: { username: `${TAG}-op`.toLowerCase(), passwordHash: "x:y", userId: ctx.liderA.id, branchId: ctx.A.id },
  });
  const posSale = (n: string, status: "COMPLETADA" | "ANULADA", total: number, quantity: number) =>
    prisma.posSale.create({
      data: {
        saleNumber: `${TAG}-V${n}`,
        branchId: ctx.A.id,
        cashierId: ctx.liderA.id,
        customerId: anaId,
        status,
        subtotal: total,
        total,
        completedAt: status === "COMPLETADA" ? new Date() : null,
        cancelledAt: status === "ANULADA" ? new Date() : null,
        warehouseId: warehouse.id,
        items: {
          create: [{ productId: product.id, productName: "Filtro smoke", quantity, unitPrice: total / quantity, total }],
        },
      },
      include: { items: true },
    });
  const sale1 = await posSale("1", "COMPLETADA", 100, 3);
  await posSale("2", "COMPLETADA", 200, 2);
  await posSale("3", "ANULADA", 999, 1);
  await prisma.posSaleReturn.create({
    data: {
      returnNumber: `${TAG}-D1`,
      saleId: sale1.id,
      branchId: ctx.A.id,
      warehouseId: warehouse.id,
      operatorId: operator.id,
      reason: "Smoke",
      cashRefunded: 33.33,
      createdByUserId: ctx.liderA.id,
      items: { create: [{ saleItemId: sale1.items[0].id, quantity: 1 }] },
    },
  });
  const supplier = await prisma.thirdParty.create({
    data: { branchId: ctx.A.id, type: "PROVEEDOR", name: `${TAG} Proveedor secreto` },
  });
  await prisma.posPurchaseOrder.create({
    data: {
      orderNumber: `${TAG}-OC1`,
      branchId: ctx.A.id,
      supplierId: supplier.id,
      status: "RECIBIDA_PARCIAL",
      total: 9876.5,
      createdByUserId: ctx.liderA.id,
      items: { create: [{ productId: product.id, quantity: 10, receivedQuantity: 4, unitCost: 987.65, total: 9876.5 }] },
    },
  });

  const pos = await getPosOverview({ branchCode: CODES.A, period: "30d", salesPage: 1, purchasesPage: 1 });
  check(
    "5. brutas = sólo completadas; las anuladas se cuentan aparte y no suman",
    pos?.kpis.completedSales === 2 && pos.kpis.grossSales === "300.00" && pos.kpis.cancelledSales === 1,
    JSON.stringify(pos?.kpis),
  );
  check(
    "5. lo devuelto se valora a prorrata de la línea (1 de 3 sobre 100,00 = 33,33) y el neto lo resta",
    pos?.kpis.returns === 1 &&
      pos.kpis.returnedValue === "33.33" &&
      pos.kpis.cashRefunded === "33.33" &&
      pos.kpis.netSales === "266.67",
  );
  check(
    "5. la fila de la sucursal cuadra con los totales",
    pos?.byBranch.length === 1 &&
      pos.byBranch[0].grossSales === "300.00" &&
      pos.byBranch[0].netSales === "266.67" &&
      pos.byBranch[0].purchaseOrders === 1 &&
      pos.byBranch[0].receivedOrders === 1,
  );
  check(
    "5. compras en cantidades y estado, sin proveedor, costo ni importe",
    pos?.purchases.rows[0]?.orderedQuantity === "10" &&
      pos.purchases.rows[0].receivedQuantity === "4" &&
      !JSON.stringify(pos).includes("987.65") &&
      !JSON.stringify(pos).includes("9876.5") &&
      !JSON.stringify(pos).includes("Proveedor secreto"),
  );
  const saleKeys = Object.keys(pos?.sales.rows[0] ?? {});
  check(
    "5. las ventas de mostrador no llevan cliente ni cajero",
    saleKeys.length > 0 &&
      !["customer", "customerId", "customerName", "cashier", "cashierId", "operator"].some((key) => saleKeys.includes(key)) &&
      !JSON.stringify(pos?.sales).includes(`${TAG} Ana`),
  );
  const motos = await getCommercialOverview({ branchCode: CODES.A, period: "30d" });
  check(
    "5. la línea de motos no cuenta las ventas del POS",
    motos?.kpis.sales === (await prisma.sale.count({ where: { branchId: ctx.A.id } })),
  );
  const posB = await getPosOverview({ branchCode: CODES.B, period: "30d", salesPage: 1, purchasesPage: 1 });
  check("5. el filtro de sucursal reduce", posB?.kpis.completedSales === 0 && posB.byBranch.length === 1);
  check(
    "5. un código inventado no ensancha a «todas»",
    (await getPosOverview({ branchCode: "no-existe", period: "30d", salesPage: 1, purchasesPage: 1 })) === null,
  );
  await prisma.posSale.createMany({
    data: Array.from({ length: 20 }, (_, index) => ({
      saleNumber: `${TAG}-P${index}`,
      branchId: ctx.A.id,
      cashierId: ctx.liderA.id,
      status: "COMPLETADA" as const,
      total: 10,
      completedAt: new Date(Date.now() - index * 1000),
    })),
  });
  const page2 = await getPosOverview({ branchCode: CODES.A, period: "30d", salesPage: 2, purchasesPage: 1 });
  check(
    "5. la lista pagina: 23 ventas, 20 por página, 3 en la segunda",
    page2?.sales.total === 23 && page2.sales.rows.length === 3 && page2.sales.pageSize === 20,
  );
  const motosKeys = [
    ...Object.keys(motos?.recentLeads[0] ?? {}),
    ...Object.keys(motos?.recentReservations[0] ?? {}),
    ...Object.keys(motos?.recentSales[0] ?? {}),
  ];
  check(
    "2. el tablero de motos no expone nombre, teléfono, cédula ni correo",
    !["name", "phone", "cedula", "email", "notes", "customerName"].some((key) => motosKeys.includes(key)) &&
      !JSON.stringify(motos).includes(nat("51")),
  );

  // =====================================================================
  section("6. Comprobantes: concurrencia, tamaño y rendimiento");
  const mkPortalUnit = (key: string) =>
    prisma.motorcycleUnit.create({
      data: {
        branchId: ctx.A.id,
        catalogModelId: recId,
        name: `${TAG} ${key}`,
        brand: "Smoke",
        model: `Rec${SUFFIX}`,
        year: 2026,
        chassisNumber: `${TAG}-${key}`,
        entryDate: new Date(),
      },
    });
  const unitR1 = await mkPortalUnit("R1");
  const unitR2 = await mkPortalUnit("R2");
  const unitR3 = await mkPortalUnit("R3");
  await as.liderA();
  const r1 = await createReservation({ customerId: bertaId, motorcycleUnitId: unitR1.id });
  const r2 = await createReservation({ customerId: bertaId, motorcycleUnitId: unitR2.id });
  const r1Id = r1.ok ? r1.reservationId : "";
  const r2Id = r2.ok ? r2.reservationId : "";
  const bertaTracking = (await prisma.lead.findUnique({ where: { id: bertaLeadId } }))?.trackingCode ?? "X";
  const token = await createPortalToken({ customerId: bertaId, trackingCode: bertaTracking });

  const uploads = await Promise.all([
    attempt(() => uploadPortalReservationProofAction({ token, reservationId: r1Id, file: png() })),
    attempt(() => uploadPortalReservationProofAction({ token, reservationId: r1Id, file: png() })),
  ]);
  check(
    "6. dos envíos simultáneos del cliente: uno queda en revisión, el otro se rechaza",
    uploads.filter((result) => result.ok).length === 1 &&
      (await prisma.reservationPaymentProof.count({ where: { reservationId: r1Id, status: "PENDIENTE_REVISION" } })) === 1,
    uploads.map((result) => errorOf(result)).join(" | "),
  );
  const r1Row = await prisma.reservation.findUnique({ where: { id: r1Id }, include: { motorcycleUnit: true } });
  check(
    "6. subir no confirma el pago ni aparta la unidad",
    r1Row?.status === "PENDIENTE_PAGO" && r1Row.motorcycleUnit.status === "AVAILABLE",
  );
  const oversize = await uploadPortalReservationProofAction({
    token,
    reservationId: r2Id,
    file: png(5 * 1024 * 1024 + 1),
  });
  check("6. un archivo de más de 5 MiB se rechaza", !oversize.ok, errorOf(oversize));

  const approvals = await Promise.all([
    attempt(() => reviewReservationPaymentProof({ reservationId: r1Id, aprobar: true })),
    attempt(async () => {
      await as.gerA();
      return reviewReservationPaymentProof({ reservationId: r1Id, aprobar: true });
    }),
  ]);
  const r1After = await prisma.reservation.findUnique({
    where: { id: r1Id },
    include: { motorcycleUnit: true, paymentProofs: true },
  });
  check(
    "6. dos verificaciones simultáneas: una gana, una sola reserva de inventario",
    approvals.filter((result) => result.ok).length === 1 &&
      r1After?.status === "ACTIVA" &&
      r1After.motorcycleUnit.status === "RESERVED" &&
      r1After.paymentProofs.filter((proof) => proof.status === "APROBADO").length === 1 &&
      (await prisma.inventoryMovement.count({ where: { motorcycleUnitId: unitR1.id, type: "RESERVA" } })) === 1,
    approvals.map((result) => errorOf(result)).join(" | "),
  );

  await uploadPortalReservationProofAction({ token, reservationId: r2Id, file: png() });
  await as.liderA();
  const mixed = await Promise.all([
    attempt(() => reviewReservationPaymentProof({ reservationId: r2Id, aprobar: true })),
    attempt(async () => {
      await as.gerA();
      return reviewReservationPaymentProof({ reservationId: r2Id, aprobar: false, notas: "Monto ilegible." });
    }),
  ]);
  const r2After = await prisma.reservation.findUnique({
    where: { id: r2Id },
    include: { motorcycleUnit: true, paymentProofs: true },
  });
  const approvedWon = r2After?.paymentProofs[0]?.status === "APROBADO";
  check(
    "6. aprobar y rechazar a la vez: gana uno y el estado es coherente con él",
    mixed.filter((result) => result.ok).length === 1 &&
      (approvedWon
        ? r2After?.status === "ACTIVA" && r2After.motorcycleUnit.status === "RESERVED"
        : r2After?.status === "PENDIENTE_PAGO" && r2After.motorcycleUnit.status === "AVAILABLE"),
    `${mixed.map((result) => errorOf(result)).join(" | ")} → ${r2After?.paymentProofs[0]?.status}`,
  );

  // Rendimiento: un comprobante de ~4,9 MB guardado en PostgreSQL.
  await as.liderA();
  const r3 = await createReservation({ customerId: bertaId, motorcycleUnitId: unitR3.id });
  const r3Id = r3.ok ? r3.reservationId : "";
  const bigUpload = await timed(() =>
    uploadReservationPaymentProof({ reservationId: r3Id, file: png(Math.floor(4.9 * 1024 * 1024)) }),
  );
  check("6. (medición) se sube un comprobante de 4,9 MB", bigUpload.value.ok, errorOf(bigUpload.value));
  measurements.push(`subida de 4,9 MB (panel, incluye SHA-256 y escritura): ${bigUpload.ms.toFixed(0)} ms`);

  const withBytes: number[] = [];
  const withoutBytes: number[] = [];
  let bytesLoaded = 0;
  for (let round = 0; round < 5; round += 1) {
    const heavy = await timed(() =>
      prisma.reservation.findMany({
        where: { branchId: ctx.A.id },
        include: { paymentProofs: { include: { storedFile: true } } },
      }),
    );
    withBytes.push(heavy.ms);
    bytesLoaded = heavy.value.reduce(
      (sum, row) => sum + row.paymentProofs.reduce((acc, proof) => acc + (proof.storedFile?.data.length ?? 0), 0),
      0,
    );
    const light = await timed(() =>
      prisma.reservation.findMany({
        where: { branchId: ctx.A.id },
        include: {
          paymentProofs: {
            include: { storedFile: { select: { id: true, mimeType: true, sizeBytes: true, originalName: true } } },
          },
        },
      }),
    );
    withoutBytes.push(light.ms);
  }
  measurements.push(
    `listado de reservas de la sucursal con bytes (como HEAD 13d3ecb): mediana ${median(withBytes).toFixed(1)} ms, ${(bytesLoaded / 1024 / 1024).toFixed(2)} MB traídos`,
  );
  measurements.push(`listado sin bytes (como CRM-INT1): mediana ${median(withoutBytes).toFixed(1)} ms, 0 MB de archivos`);
  check("6. (medición) el listado sin bytes es más barato", median(withoutBytes) < median(withBytes));
  const read = await timed(() => readReservationPaymentProof({ reservationId: r3Id }));
  measurements.push(
    `abrir el comprobante de 4,9 MB como data URI: ${read.ms.toFixed(0)} ms, ${((read.value.ok ? read.value.dataUri.length : 0) / 1024 / 1024).toFixed(2)} MB de texto`,
  );
  const tableSize = await prisma.$queryRaw<Array<{ size: string }>>`
    SELECT pg_size_pretty(pg_total_relation_size('stored_files')) AS size`;
  measurements.push(`tamaño total de stored_files (incluye TOAST) en esta base: ${tableSize[0]?.size ?? "?"}`);
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

  await prisma.posSaleReturnItem.deleteMany({ where: { return: inBranches } });
  await prisma.posSaleReturn.deleteMany({ where: inBranches });
  await prisma.posSale.deleteMany({ where: inBranches });
  await prisma.posPurchaseOrder.deleteMany({ where: inBranches });
  await prisma.posOperator.deleteMany({ where: inBranches });
  await prisma.posWarehouse.deleteMany({ where: inBranches });
  await prisma.posProduct.deleteMany({ where: { sku: { startsWith: TAG } } });
  await prisma.thirdParty.deleteMany({ where: inBranches });
  await prisma.metaPageBranch.deleteMany({ where: inBranches });
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
  await prisma.userPermissionGrant.deleteMany({ where: { userId: { in: userIds } } });
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
    if (measurements.length) {
      console.log("\n  --- Mediciones (informativas, no son aserciones) ---");
      for (const line of measurements) console.log(`  MEDIDA ${line}`);
    }
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
