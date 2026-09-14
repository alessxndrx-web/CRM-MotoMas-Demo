/**
 * SMOKE-CRMAUD2 — ficha de cliente, avisos a empleados y paginación.
 *
 *   npm run smoke:crm-ficha
 *
 * ## Qué prueba
 *
 * Las tres piezas que CRM-AUD2 añade, contra las consultas y acciones reales,
 * con cookie de sesión firmada por el mismo secreto y verificada por el mismo
 * código.
 *
 *   Ficha        — quién la abre, quién no, y que sólo trae lo del cliente.
 *   Avisos       — destinatario correcto, aislamiento, lectura, sin fugas.
 *   Paginación   — límites, búsqueda, filtros, página inválida, sin ampliar
 *                  alcance por el camino.
 *
 * Trabaja sobre **dos sucursales propias** y borra sus fixtures al terminar
 * aunque una aserción falle.
 */
import { PrismaClient } from "@prisma/client";

import { getCrmScopeForUser } from "@/server/auth/access";
import { roleEnumToSpanish, type UserRoleEnum } from "@/server/auth/roles";
import { SESSION_COOKIE_NAME, createSessionToken } from "@/server/auth/session";
import { assignCustomerAction, assignLeadAction } from "@/server/crm/actions";
import {
  canAccessCustomer,
  getCustomerDetail,
  listCustomersPage,
  listLeadsPage,
} from "@/server/crm/queries";
import { createActivityAction } from "@/server/expedientes/actions";
import {
  getMyNotificationsAction,
  markNotificationsReadAction,
} from "@/server/notifications/actions";
import { hrefForNotification } from "@/server/notifications/shared";

const prisma = new PrismaClient();
const STAMP = Date.now();
const TAG = `SMOKE-CRMAUD2-${STAMP}`;
const CODE_A = `f1${String(STAMP).slice(-8)}`;
const CODE_B = `f2${String(STAMP).slice(-8)}`;

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
  const admin = await user("ADMIN", branchA.id, "admin");

  const mine = await prisma.customer.create({
    data: {
      branchId: branchA.id,
      name: `${TAG}-cliente-mio`,
      phone: `81${String(STAMP).slice(-6)}`,
      phoneNormalized: `81${String(STAMP).slice(-6)}`,
      assignedSellerId: vendA.id,
    },
  });
  const foreign = await prisma.customer.create({
    data: {
      branchId: branchA.id,
      name: `${TAG}-cliente-ajeno`,
      phone: `82${String(STAMP).slice(-6)}`,
      phoneNormalized: `82${String(STAMP).slice(-6)}`,
      assignedSellerId: vendA2.id,
    },
  });
  const otherBranch = await prisma.customer.create({
    data: {
      branchId: branchB.id,
      name: `${TAG}-cliente-sucursalB`,
      phone: `83${String(STAMP).slice(-6)}`,
      phoneNormalized: `83${String(STAMP).slice(-6)}`,
      assignedSellerId: vendB.id,
    },
  });

  // Historia comercial del cliente propio, para que la ficha tenga qué mostrar.
  const lead = await prisma.lead.create({
    data: {
      trackingCode: `${TAG}-SOL`,
      name: `${TAG}-cliente-mio`,
      phone: mine.phone,
      branchId: branchA.id,
      status: "ASIGNADO",
      originChannel: "Sucursal",
      assignedSellerId: vendA.id,
      customerId: mine.id,
    },
  });
  const file = await prisma.customerFile.create({
    data: {
      fileNumber: `${TAG}-EXP`,
      customerId: mine.id,
      leadId: lead.id,
      branchId: branchA.id,
      sellerId: vendA.id,
      status: "ABIERTO",
    },
  });
  await prisma.creditApplication.create({
    data: {
      customerFileId: file.id,
      customerId: mine.id,
      branchId: branchA.id,
      status: "EN_REVISION",
    },
  });
  const unit = await prisma.motorcycleUnit.create({
    data: {
      branchId: branchA.id,
      name: `${TAG}-moto`,
      brand: "Smoke",
      model: "X",
      year: 2026,
      chassisNumber: `${TAG}-CH`,
      entryDate: new Date(),
      status: "AVAILABLE",
    },
  });
  await prisma.reservation.create({
    data: {
      reservationNumber: `${TAG}-RES`,
      customerId: mine.id,
      motorcycleUnitId: unit.id,
      branchId: branchA.id,
      sellerId: vendA.id,
      status: "PENDIENTE_PAGO",
      activeUnitLock: unit.id,
    },
  });
  await prisma.paymentRequest.create({
    data: {
      requestNumber: `${TAG}-PAG`,
      branchId: branchA.id,
      customerId: mine.id,
      purpose: "SOLICITUD",
      concept: "Anticipo",
      amount: "500.00",
      currency: "NIO",
      status: "PENDIENTE",
      createdById: liderA.id,
    },
  });
  // Y un registro del cliente AJENO, para comprobar que no se cuela.
  await prisma.paymentRequest.create({
    data: {
      requestNumber: `${TAG}-PAG-AJENO`,
      branchId: branchA.id,
      customerId: foreign.id,
      purpose: "SOLICITUD",
      concept: "Ajeno",
      amount: "999.00",
      currency: "NIO",
      status: "PENDIENTE",
      createdById: liderA.id,
    },
  });

  // 30 leads del vendedor A: dos páginas con el tamaño por omisión de 25.
  for (let i = 0; i < 30; i += 1) {
    await prisma.lead.create({
      data: {
        trackingCode: `${TAG}-P${String(i).padStart(2, "0")}`,
        name: `${TAG}-paginado-${i}`,
        phone: `7${String(1000000 + i)}`,
        branchId: branchA.id,
        status: i % 2 === 0 ? "NUEVO_LEAD" : "CONTACTADO",
        assignedSellerId: vendA.id,
      },
    });
  }

  return {
    branchA,
    branchB,
    vendA,
    vendA2,
    vendB,
    liderA,
    admin,
    mine,
    foreign,
    otherBranch,
    lead,
    file,
  };
}

async function customerDetailMatrix(ctx: Ctx) {
  section("Ficha de cliente: quién entra y qué ve");

  const scopeVendA = getCrmScopeForUser("VENDEDOR", CODE_A, ctx.vendA.id);
  const scopeVendA2 = getCrmScopeForUser("VENDEDOR", CODE_A, ctx.vendA2.id);
  const scopeVendB = getCrmScopeForUser("VENDEDOR", CODE_B, ctx.vendB.id);
  const scopeLider = getCrmScopeForUser("LIDER_VENTAS", CODE_A, ctx.liderA.id);
  const scopeAdmin = getCrmScopeForUser("ADMIN", null, ctx.admin.id);

  const mine = await getCustomerDetail(scopeVendA, ctx.mine.id);
  check("VENDEDOR abre la ficha de SU cliente", mine !== null);

  const notMine = await getCustomerDetail(scopeVendA, ctx.foreign.id);
  check(
    "VENDEDOR NO abre la ficha del cliente de su companiero",
    notMine === null,
    notMine ? "la abrio" : "",
  );

  const otherBranch = await getCustomerDetail(scopeVendA, ctx.otherBranch.id);
  check(
    "VENDEDOR NO abre la ficha de otra sucursal",
    otherBranch === null,
    otherBranch ? "la abrio" : "",
  );

  const liderSees = await getCustomerDetail(scopeLider, ctx.foreign.id);
  check(
    "LIDER abre la ficha de cualquier cliente de su sucursal",
    liderSees !== null,
  );
  const liderBlocked = await getCustomerDetail(scopeLider, ctx.otherBranch.id);
  check(
    "LIDER NO abre la ficha de otra sucursal",
    liderBlocked === null,
    liderBlocked ? "la abrio" : "",
  );

  const adminSees = await getCustomerDetail(scopeAdmin, ctx.otherBranch.id);
  check("ADMIN abre cualquier ficha", adminSees !== null);

  // El compañero no alcanza al cliente de A ni por el predicado suelto.
  check(
    "canAccessCustomer coincide con la ficha",
    (await canAccessCustomer(scopeVendA2, ctx.mine.id)) === false &&
      (await canAccessCustomer(scopeVendA, ctx.mine.id)) === true,
  );
  check(
    "un VENDEDOR de otra sucursal tampoco pasa el predicado",
    (await canAccessCustomer(scopeVendB, ctx.mine.id)) === false,
  );

  if (!mine) return;

  section("Ficha de cliente: sólo trae lo de ese cliente");

  check("la ficha trae su lead de origen", mine.originLead?.trackingCode === `${TAG}-SOL`);
  check("la ficha trae su expediente", mine.expedientes.length === 1);
  check(
    "y el estado del credito del expediente",
    mine.expedientes[0]?.creditStatusLabel === "En revisión",
    mine.expedientes[0]?.creditStatusLabel ?? "sin credito",
  );
  check("la ficha trae su reserva", mine.reservations.length === 1);
  check(
    "y dice que esta sin comprobante",
    mine.reservations[0]?.paymentLabel === "Sin comprobante",
    mine.reservations[0]?.paymentLabel,
  );
  check("la ficha trae su cobro", mine.paymentRequests.length === 1);
  check(
    "y NO trae el cobro del cliente ajeno",
    !mine.paymentRequests.some((p) => p.requestNumber.includes("AJENO")),
  );
  check("la ficha no inventa ventas", mine.sales.length === 0);
}

async function activityOnCustomer(ctx: Ctx) {
  section("Actividad colgada del cliente");

  await signInAs("VENDEDOR", ctx.vendA.id, CODE_A);
  const ok = await createActivityAction({
    type: "LLAMADA",
    description: "Llamada desde la ficha",
    customerId: ctx.mine.id,
  });
  check("VENDEDOR registra actividad sobre SU cliente", ok.ok, ok.ok ? "" : ok.error);

  const denied = await createActivityAction({
    type: "NOTA",
    description: "No deberia poder",
    customerId: ctx.foreign.id,
  });
  check(
    "VENDEDOR NO registra actividad sobre el cliente ajeno",
    !denied.ok,
    denied.ok ? "lo dejo pasar" : "",
  );

  const scopeVendA = getCrmScopeForUser("VENDEDOR", CODE_A, ctx.vendA.id);
  const detail = await getCustomerDetail(scopeVendA, ctx.mine.id);
  check(
    "la actividad aparece en la ficha",
    (detail?.activities.length ?? 0) >= 1,
  );
  check(
    "y la sucursal salio del cliente, no de quien llama",
    (await prisma.activity.findFirst({
      where: { customerId: ctx.mine.id },
      select: { branchId: true },
    }))?.branchId === ctx.branchA.id,
  );
}

async function notificationMatrix(ctx: Ctx) {
  section("Avisos a empleados");

  // El líder asigna un lead al vendedor A2.
  await signInAs("LIDER_VENTAS", ctx.liderA.id, CODE_A);
  const assigned = await assignLeadAction({
    leadId: ctx.lead.id,
    sellerId: ctx.vendA2.id,
  });
  check("el LIDER asigna un lead", assigned.ok, assigned.ok ? "" : assigned.error);

  // El destinatario lo recibe.
  await signInAs("VENDEDOR", ctx.vendA2.id, CODE_A);
  const forA2 = await getMyNotificationsAction();
  check(
    "el vendedor destinatario recibe el aviso",
    forA2.notifications.some((n) => n.kind === "LEAD_ASIGNADO"),
    forA2.notifications.map((n) => n.kind).join(", ") || "ninguno",
  );
  check("y cuenta como no leido", forA2.unread >= 1, `unread=${forA2.unread}`);
  check(
    "el enlace apunta al lead concreto, no a la lista",
    forA2.notifications
      .find((n) => n.kind === "LEAD_ASIGNADO")
      ?.href.includes(encodeURIComponent(`${TAG}-SOL`)) === true,
    forA2.notifications.find((n) => n.kind === "LEAD_ASIGNADO")?.href,
  );

  // Nadie más lo recibe.
  await signInAs("VENDEDOR", ctx.vendA.id, CODE_A);
  const forA = await getMyNotificationsAction();
  check(
    "otro vendedor de la MISMA sucursal no lo recibe",
    !forA.notifications.some((n) => n.kind === "LEAD_ASIGNADO"),
  );
  await signInAs("VENDEDOR", ctx.vendB.id, CODE_B);
  const forB = await getMyNotificationsAction();
  check(
    "un vendedor de OTRA sucursal no recibe nada",
    forB.notifications.length === 0,
    `${forB.notifications.length} avisos`,
  );

  // Quien ejecuta la accion no se avisa a si mismo.
  await signInAs("LIDER_VENTAS", ctx.liderA.id, CODE_A);
  const beforeSelf = await getMyNotificationsAction();
  await assignCustomerAction({ customerId: ctx.mine.id, sellerId: ctx.liderA.id });
  const afterSelf = await getMyNotificationsAction();
  check(
    "el actor NO se avisa a si mismo",
    afterSelf.notifications.length === beforeSelf.notifications.length,
    `antes=${beforeSelf.notifications.length} despues=${afterSelf.notifications.length}`,
  );

  // Marcar como leido es por destinatario: el ajeno no se puede tocar.
  await signInAs("VENDEDOR", ctx.vendA2.id, CODE_A);
  const target = (await getMyNotificationsAction()).notifications[0];
  await signInAs("VENDEDOR", ctx.vendB.id, CODE_B);
  await markNotificationsReadAction({ notificationId: target.id });
  const stillUnread = await prisma.userNotification.findUnique({
    where: { id: target.id },
    select: { readAt: true },
  });
  check(
    "un empleado NO puede marcar como leido el aviso de otro",
    stillUnread?.readAt === null,
    stillUnread?.readAt ? "lo marco" : "",
  );

  await signInAs("VENDEDOR", ctx.vendA2.id, CODE_A);
  await markNotificationsReadAction({ notificationId: target.id });
  const nowRead = await prisma.userNotification.findUnique({
    where: { id: target.id },
    select: { readAt: true },
  });
  check("el destinatario SI puede marcarlo", nowRead?.readAt !== null);
  const afterRead = await getMyNotificationsAction();
  check(
    "el contador de no leidos baja",
    afterRead.unread < forA2.unread,
    `${forA2.unread} -> ${afterRead.unread}`,
  );

  // La ruta se deriva, no se guarda.
  check(
    "la ruta de un aviso de cliente lleva a su ficha",
    hrefForNotification({
      kind: "CLIENTE_ASIGNADO",
      customerId: ctx.mine.id,
      leadTrackingCode: null,
    }) === `/panel/clientes/${ctx.mine.id}`,
  );
}

async function paginationMatrix(ctx: Ctx) {
  section("Paginacion y busqueda");

  const scope = getCrmScopeForUser("VENDEDOR", CODE_A, ctx.vendA.id);

  /*
   * El total esperado se cuenta contra la base, no se escribe a mano.
   *
   * Las secciones anteriores reasignan un lead, asi que una cifra fija aqui
   * ataria esta prueba al ORDEN en que se ejecutan las demas: fallaria al mover
   * una seccion sin que nada del producto hubiera cambiado. Lo que esta prueba
   * mide es que la paginacion parta bien un conjunto, no cuantos hay.
   */
  const expected = await prisma.lead.count({
    where: {
      OR: [{ assignedSellerId: ctx.vendA.id }, { createdById: ctx.vendA.id }],
    },
  });
  const lastPageSize = expected % 25 === 0 ? 25 : expected % 25;

  const p1 = await listLeadsPage(scope, {});
  check("la primera pagina trae 25 filas", p1.rows.length === 25, `${p1.rows.length}`);
  check(
    "y el total cuenta todas las del alcance",
    p1.total === expected,
    `total=${p1.total} esperado=${expected}`,
  );
  check("la pagina resuelta es la 1", p1.page === 1);

  const p2 = await listLeadsPage(scope, { page: 2 });
  check(
    "la segunda pagina trae el resto",
    p2.rows.length === lastPageSize,
    `${p2.rows.length} esperado=${lastPageSize}`,
  );
  check(
    "sin repetir filas entre paginas",
    !p2.rows.some((row) => p1.rows.some((first) => first.id === row.id)),
  );

  const beyond = await listLeadsPage(scope, { page: 99 });
  check("una pagina mas alla del final sale vacia, no revienta", beyond.rows.length === 0);
  check("y conserva el total", beyond.total === expected);

  for (const bad of [0, -3, Number.NaN]) {
    const page = await listLeadsPage(scope, { page: bad });
    check(
      `una pagina invalida (${String(bad)}) cae en la primera`,
      page.page === 1 && page.rows.length === 25,
      `page=${page.page} filas=${page.rows.length}`,
    );
  }

  const filtered = await listLeadsPage(scope, { status: "NUEVO_LEAD" });
  check(
    "el filtro de estado recorta el total, no solo la pagina",
    filtered.total === 15,
    `total=${filtered.total}`,
  );
  check(
    "y todas las filas cumplen el filtro",
    filtered.rows.every((row) => row.status === "NUEVO_LEAD"),
  );

  const searched = await listLeadsPage(scope, { q: `${TAG}-P01` });
  check("la busqueda encuentra el lead exacto", searched.total === 1, `${searched.total}`);

  // Y el total NO puede revelar lo que el alcance esconde.
  const scopeA2 = getCrmScopeForUser("VENDEDOR", CODE_A, ctx.vendA2.id);
  const foreignPage = await listLeadsPage(scopeA2, {});
  check(
    "otro vendedor ve su propio total, no el de la sucursal",
    foreignPage.total <= 1,
    `total=${foreignPage.total}`,
  );
  const probing = await listLeadsPage(scopeA2, { q: `${TAG}-P01` });
  check(
    "buscar un lead ajeno devuelve total 0, sin delatar que existe",
    probing.total === 0,
    `total=${probing.total}`,
  );

  const customers = await listCustomersPage(scope, {});
  check(
    "clientes tambien pagina con su total",
    customers.total >= 1 && customers.pageSize === 25,
    `total=${customers.total} pageSize=${customers.pageSize}`,
  );
}

async function main() {
  console.log(`\n  ${TAG}\n`);
  const ctx = await seed();
  await customerDetailMatrix(ctx);
  await activityOnCustomer(ctx);
  await notificationMatrix(ctx);
  await paginationMatrix(ctx);
}

async function cleanup() {
  for (const code of [CODE_A, CODE_B]) {
    const branch = await prisma.branch.findUnique({ where: { code } });
    if (!branch) continue;
    const where = { branchId: branch.id };
    await prisma.userNotification.deleteMany({
      where: { user: { branchId: branch.id } },
    });
    await prisma.customerNotification.deleteMany({
      where: { customer: where },
    });
    await prisma.paymentRequest.deleteMany({ where });
    await prisma.reservationPaymentProof.deleteMany({
      where: { reservation: where },
    });
    await prisma.activity.deleteMany({ where });
    await prisma.inventoryMovement.deleteMany({ where });
    await prisma.sale.deleteMany({ where });
    await prisma.reservation.deleteMany({ where });
    await prisma.creditApplication.deleteMany({ where });
    await prisma.customerFile.deleteMany({ where });
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
