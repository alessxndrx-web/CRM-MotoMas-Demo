/**
 * SMOKE-CRMAUD1 — la matriz de permisos del CRM, ejercitada rol por rol.
 *
 *   npm run smoke:crm-matriz
 *
 * ## Qué prueba y por qué así
 *
 * Rol × acción × resultado esperado, contra las **acciones y consultas reales**,
 * con cookie de sesión firmada por el mismo secreto y verificada por el mismo
 * código. Lo que se sustituye es el transporte, nunca la autorización.
 *
 * Existe porque la auditoría CRM-AUD1 encontró que los fallos de permisos de
 * este repositorio no aparecen al añadir un rol, sino **semanas después**, en la
 * función que decidió el alcance con `if (role === "GERENTE")` en lugar de
 * resolverlo. Una aserción por caso no lo habría cazado; una matriz sí.
 *
 * ## Lo que cubre
 *
 *   Alcance     — qué ve cada rol en leads, clientes, reservas y equipo.
 *   Acciones    — quién puede reportar venta, asignar, revisar comprobantes.
 *   Objeto      — el vendedor A contra los registros del vendedor B (IDOR).
 *   Búsqueda    — un filtro no puede sacar un registro fuera de alcance.
 *   Sesión      — dar de baja a un usuario corta su sesión ya, no en 8 horas.
 *
 * Trabaja sobre **dos sucursales propias** para que ningún dato preexistente
 * entre en las cuentas, y borra sus fixtures al terminar aunque algo falle.
 */
import { PrismaClient } from "@prisma/client";

import {
  getDashboardAlerts,
  getDashboardSellerPerformance,
  type AnalyticsContext,
} from "@/server/analytics/queries";
import {
  canAssignCustomers,
  canManagePaymentRequests,
  canManageSuppliers,
  canOperateCrm,
  canRegisterSales,
  canReviewReservationPaymentProofs,
  canViewCommercialReports,
  canViewCosts,
  canViewSellerPerformance,
  getCrmScopeForUser,
} from "@/server/auth/access";
import { getCurrentUserSession } from "@/server/auth/context";
import { roleEnumToSpanish, type UserRoleEnum } from "@/server/auth/roles";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
} from "@/server/auth/session";
import { listCustomers, listLeads } from "@/server/crm/queries";
import {
  cancelReservation,
  createReservation,
  readReservationPaymentProof,
} from "@/server/operations/actions";
import { listReservations } from "@/server/operations/queries";

const prisma = new PrismaClient();
const STAMP = Date.now();
const TAG = `SMOKE-CRMAUD1-${STAMP}`;
const CODE_A = `m1${String(STAMP).slice(-8)}`;
const CODE_B = `m2${String(STAMP).slice(-8)}`;

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

function jpeg(): File {
  const bytes = new Uint8Array(64);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  return new File([bytes as unknown as BlobPart], "c.jpg", { type: "image/jpeg" });
}

type Ctx = Awaited<ReturnType<typeof seed>>;

async function seed() {
  const branchA = await prisma.branch.create({
    data: { code: CODE_A, name: `${TAG}-A`, isActive: true },
  });
  const branchB = await prisma.branch.create({
    data: { code: CODE_B, name: `${TAG}-B`, isActive: true },
  });

  async function user(role: UserRoleEnum, branchId: string, tag: string) {
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

  const vendA = await user("VENDEDOR", branchA.id, "vendA");
  const vendA2 = await user("VENDEDOR", branchA.id, "vendA2");
  const vendB = await user("VENDEDOR", branchB.id, "vendB");
  const liderA = await user("LIDER_VENTAS", branchA.id, "liderA");
  const gerenteA = await user("GERENTE", branchA.id, "gerA");
  const admin = await user("ADMIN", branchA.id, "admin");

  async function customer(tag: string, phone: string, branchId: string, sellerId: string) {
    return prisma.customer.create({
      data: {
        branchId,
        name: `${TAG}-${tag}`,
        phone,
        phoneNormalized: phone,
        assignedSellerId: sellerId,
      },
    });
  }

  const custA = await customer("cliA", `81${String(STAMP).slice(-6)}`, branchA.id, vendA.id);
  const custA2 = await customer("cliA2", `82${String(STAMP).slice(-6)}`, branchA.id, vendA2.id);

  for (const [tag, branchId, sellerId] of [
    ["leadA", branchA.id, vendA.id],
    ["leadA2", branchA.id, vendA2.id],
    ["leadB", branchB.id, vendB.id],
  ] as const) {
    await prisma.lead.create({
      data: {
        trackingCode: `${TAG}-${tag}`,
        name: `${TAG}-${tag}`,
        phone: `9${String(STAMP).slice(-7)}`.slice(0, 8),
        branchId,
        status: "ASIGNADO",
        assignedSellerId: sellerId,
      },
    });
  }
  // Un lead sin asignar en A, para la alerta de reparto.
  await prisma.lead.create({
    data: {
      trackingCode: `${TAG}-huerfano`,
      name: `${TAG}-huerfano`,
      phone: `70000000`,
      branchId: branchA.id,
      status: "NUEVO_LEAD",
    },
  });

  const units: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const unit = await prisma.motorcycleUnit.create({
      data: {
        branchId: branchA.id,
        name: `${TAG}-moto${i}`,
        brand: "Smoke",
        model: `M${i}`,
        year: 2026,
        chassisNumber: `${TAG}-CH${i}`,
        entryDate: new Date(),
        status: "AVAILABLE",
      },
    });
    units.push(unit.id);
  }

  return {
    branchA,
    branchB,
    vendA,
    vendA2,
    vendB,
    liderA,
    gerenteA,
    admin,
    custA,
    custA2,
    units,
  };
}

/** Rol × predicado × esperado. Pura, sin base: es la tabla de la verdad. */
function predicateMatrix() {
  section("Matriz de predicados (access.ts)");

  const rows: Array<[UserRoleEnum, string, boolean]> = [
    ["VENDEDOR", "canOperateCrm", true],
    ["VENDEDOR", "canRegisterSales", false],
    ["VENDEDOR", "canAssignCustomers", false],
    ["VENDEDOR", "canReviewReservationPaymentProofs", false],
    ["VENDEDOR", "canManagePaymentRequests", false],
    ["VENDEDOR", "canViewSellerPerformance", false],
    ["VENDEDOR", "canViewCommercialReports", false],
    ["VENDEDOR", "canManageSuppliers", false],
    ["VENDEDOR", "canViewCosts", false],

    ["LIDER_VENTAS", "canOperateCrm", true],
    ["LIDER_VENTAS", "canRegisterSales", true],
    ["LIDER_VENTAS", "canAssignCustomers", true],
    ["LIDER_VENTAS", "canReviewReservationPaymentProofs", true],
    ["LIDER_VENTAS", "canManagePaymentRequests", true],
    ["LIDER_VENTAS", "canViewSellerPerformance", true],
    ["LIDER_VENTAS", "canViewCommercialReports", true],
    ["LIDER_VENTAS", "canManageSuppliers", false],
    ["LIDER_VENTAS", "canViewCosts", false],

    ["GERENTE", "canRegisterSales", true],
    ["GERENTE", "canManageSuppliers", true],
    ["GERENTE", "canViewCosts", true],

    ["ADMIN", "canRegisterSales", true],
    ["ADMIN", "canManageSuppliers", true],

    ["CAJERO", "canOperateCrm", false],
    ["CAJERO", "canRegisterSales", false],
    ["CONTADOR", "canOperateCrm", false],
    ["CONTADOR", "canManageSuppliers", true],
    ["MARKETING", "canOperateCrm", false],
    ["SOPORTE_TECNICO", "canOperateCrm", false],
  ];

  const fns: Record<string, (r: UserRoleEnum) => boolean> = {
    canOperateCrm,
    canRegisterSales,
    canAssignCustomers,
    canReviewReservationPaymentProofs,
    canManagePaymentRequests,
    canViewSellerPerformance,
    canViewCommercialReports,
    canManageSuppliers,
    canViewCosts,
  };

  for (const [role, fn, expected] of rows) {
    const actual = fns[fn](role);
    check(
      `${role.padEnd(15)} ${fn.padEnd(34)} = ${expected}`,
      actual === expected,
      `devolvio ${actual}`,
    );
  }
}

async function scopeMatrix(ctx: Ctx) {
  section("Alcance de datos por rol");

  const cases: Array<[string, UserRoleEnum, string, string, number, number]> = [
    // etiqueta, rol, userId, branchCode, leads esperados, filas de equipo
    ["VENDEDOR A", "VENDEDOR", ctx.vendA.id, CODE_A, 1, 0],
    ["LIDER A", "LIDER_VENTAS", ctx.liderA.id, CODE_A, 3, 3],
    ["GERENTE A", "GERENTE", ctx.gerenteA.id, CODE_A, 3, 3],
  ];

  for (const [label, role, userId, branchCode, leadsExp, teamExp] of cases) {
    const scope = getCrmScopeForUser(role, branchCode, userId);
    const leads = await listLeads(scope);
    const team = await getDashboardSellerPerformance({
      role,
      branchCode,
      userId,
    } as AnalyticsContext);
    const foraneos = team.filter((t) => t.branchName === `${TAG}-B`);

    check(`${label}: ve ${leadsExp} leads`, leads.length === leadsExp, `vio ${leads.length}`);
    check(
      `${label}: ve ${teamExp} filas de equipo`,
      team.length === teamExp,
      `vio ${team.length}`,
    );
    check(
      `${label}: NINGUNA fila de otra sucursal`,
      foraneos.length === 0,
      `${foraneos.length} filas foraneas`,
    );
  }

  // Un vendedor jamas ve leads de un companiero.
  const scopeA = getCrmScopeForUser("VENDEDOR", CODE_A, ctx.vendA.id);
  const leadsA = await listLeads(scopeA);
  check(
    "VENDEDOR A no ve el lead de su companiero A2",
    !leadsA.some((l) => l.trackingCode === `${TAG}-leadA2`),
  );
  const clientesA = await listCustomers(scopeA);
  check(
    "VENDEDOR A no ve el cliente de su companiero A2",
    !clientesA.some((c) => c.id === ctx.custA2.id),
  );
}

async function searchCannotWidenScope(ctx: Ctx) {
  section("La busqueda no amplia el alcance");

  const scopeA = getCrmScopeForUser("VENDEDOR", CODE_A, ctx.vendA.id);
  // Se busca EXACTAMENTE el lead del companiero, por su codigo.
  const byCode = await listLeads(scopeA, { q: `${TAG}-leadA2` });
  check(
    "buscar por el codigo del lead ajeno no lo devuelve",
    byCode.length === 0,
    `devolvio ${byCode.length}`,
  );
  const byName = await listCustomers(scopeA, { q: `${TAG}-cliA2` });
  check(
    "buscar por el nombre del cliente ajeno no lo devuelve",
    byName.length === 0,
    `devolvio ${byName.length}`,
  );
  // Y encuentra lo propio, para que la prueba anterior signifique algo.
  const own = await listLeads(scopeA, { q: `${TAG}-leadA` });
  check("pero SI encuentra el propio", own.length === 1, `devolvio ${own.length}`);
}

async function reservationMatrix(ctx: Ctx) {
  section("Reservas: ver, actuar y leer el comprobante");

  await signInAs("VENDEDOR", ctx.vendA.id, CODE_A);
  const created = await createReservation({
    customerId: ctx.custA.id,
    motorcycleUnitId: ctx.units[0],
  });
  check("VENDEDOR A crea una reserva", created.ok, created.ok ? "" : created.error);
  if (!created.ok) return;

  const reservationId = created.reservationId;

  // Comprobante, para poder probar su lectura.
  const uploaded = await (
    await import("@/server/operations/actions")
  ).uploadReservationPaymentProof({ reservationId, file: jpeg() });
  check("VENDEDOR A sube el comprobante", uploaded.ok, uploaded.ok ? "" : uploaded.error);

  // El LIDER ve la reserva del equipo Y puede actuar sobre ella.
  const liderScope = getCrmScopeForUser("LIDER_VENTAS", CODE_A, ctx.liderA.id);
  const liderVe = await listReservations(liderScope);
  check(
    "LIDER ve la reserva de su vendedor",
    liderVe.some((r) => r.id === reservationId),
  );

  await signInAs("LIDER_VENTAS", ctx.liderA.id, CODE_A);
  const liderLee = await readReservationPaymentProof({ reservationId });
  check(
    "LIDER puede VER el comprobante que debe aprobar",
    liderLee.ok,
    liderLee.ok ? "" : liderLee.error,
  );

  // El vendedor de OTRA sucursal no puede leerlo: autorizacion a nivel objeto.
  await signInAs("VENDEDOR", ctx.vendB.id, CODE_B);
  const ajeno = await readReservationPaymentProof({ reservationId });
  check(
    "VENDEDOR de otra sucursal NO puede leer el comprobante",
    !ajeno.ok,
    ajeno.ok ? "lo leyo" : "",
  );

  // Y el companiero de la misma sucursal tampoco: alcance personal.
  await signInAs("VENDEDOR", ctx.vendA2.id, CODE_A);
  const companiero = await readReservationPaymentProof({ reservationId });
  check(
    "VENDEDOR companiero NO puede leer el comprobante ajeno",
    !companiero.ok,
    companiero.ok ? "lo leyo" : "",
  );

  // El LIDER cancela la reserva de su equipo: antes se lo rechazaba.
  await signInAs("LIDER_VENTAS", ctx.liderA.id, CODE_A);
  const cancel = await cancelReservation({ reservationId });
  check(
    "LIDER puede cancelar la reserva de su equipo",
    cancel.ok,
    cancel.ok ? "" : cancel.error,
  );
}

async function alertsMatrix(ctx: Ctx) {
  section("Alertas de Inicio");

  const liderAlerts = await getDashboardAlerts({
    role: "LIDER_VENTAS",
    branchCode: CODE_A,
    userId: ctx.liderA.id,
  });
  check(
    "el LIDER ve la alerta de leads sin asignar",
    liderAlerts.some((a) => a.id === "unassigned-leads"),
    liderAlerts.map((a) => a.id).join(", ") || "sin alertas",
  );

  const vendAlerts = await getDashboardAlerts({
    role: "VENDEDOR",
    branchCode: CODE_A,
    userId: ctx.vendA.id,
  });
  check(
    "el VENDEDOR no recibe la alerta de reparto, que no puede resolver",
    !vendAlerts.some((a) => a.id === "unassigned-leads"),
  );
}

async function sessionRevocation(ctx: Ctx) {
  section("Revocacion de sesion");

  await signInAs("VENDEDOR", ctx.vendA.id, CODE_A);
  const before = await getCurrentUserSession();
  check("con el usuario activo, la sesion resuelve", before !== null);

  await prisma.user.update({
    where: { id: ctx.vendA.id },
    data: { isActive: false },
  });
  const after = await getCurrentUserSession();
  check(
    "dar de baja al usuario corta su sesion YA, con el mismo testigo",
    after === null,
    after ? "la sesion seguia viva" : "",
  );

  // Un cambio de rol tambien surte efecto sin volver a entrar.
  await prisma.user.update({
    where: { id: ctx.vendA.id },
    data: { isActive: true, role: "LIDER_VENTAS" },
  });
  const promoted = await getCurrentUserSession();
  check(
    "promover a LIDER_VENTAS surte efecto sin nuevo inicio de sesion",
    promoted?.roleEnum === "LIDER_VENTAS",
    `roleEnum = ${promoted?.roleEnum}`,
  );
  await prisma.user.update({
    where: { id: ctx.vendA.id },
    data: { role: "VENDEDOR" },
  });
}

async function main() {
  console.log(`\n  ${TAG}\n`);
  predicateMatrix();
  const ctx = await seed();
  await scopeMatrix(ctx);
  await searchCannotWidenScope(ctx);
  await reservationMatrix(ctx);
  await alertsMatrix(ctx);
  await sessionRevocation(ctx);
}

async function cleanup() {
  for (const code of [CODE_A, CODE_B]) {
    const branch = await prisma.branch.findUnique({ where: { code } });
    if (!branch) continue;
    const where = { branchId: branch.id };
    await prisma.customerNotification.deleteMany({ where: { customer: where } });
    await prisma.reservationPaymentProof.deleteMany({
      where: { reservation: where },
    });
    await prisma.activity.deleteMany({ where });
    await prisma.inventoryMovement.deleteMany({ where });
    await prisma.sale.deleteMany({ where });
    await prisma.reservation.deleteMany({ where });
    await prisma.storedFile.deleteMany({ where });
    await prisma.lead.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.motorcycleUnit.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.branch.delete({ where: { id: branch.id } });
  }
}

main()
  .catch((error) => {
    failed += 1;
    console.error("\n  ERROR", error);
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    console.log(`\n  ${passed} OK · ${failed} fallos\n`);
    process.exit(failed === 0 ? 0 : 1);
  });
