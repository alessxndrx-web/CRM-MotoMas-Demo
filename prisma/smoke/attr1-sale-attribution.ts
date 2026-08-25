/**
 * SMOKE-ATTR-1 — la venta anota de qué lead salió, y el informe cruza las islas.
 *
 *   npm run smoke:attr1
 *
 * ## Qué prueba
 *
 * La acción de cobro **real**, con cookie de mostrador firmada, no una copia de
 * su cuerpo. Es la primera modificación de `checkoutPosSaleAction` desde DEV-A y
 * lo que más importa demostrar no es que la atribución funcione, sino que **no
 * ha cambiado nada de lo que ya hacía**: totales, pagos, inventario, turno,
 * idempotencia y el orden de las validaciones.
 *
 *   1. Cliente con dos leads → la venta se atribuye al MÁS RECIENTE.
 *   2. Cliente sin leads → `attributedLeadId` nulo y el cobro pasa igual.
 *   3. Venta de mostrador sin cliente → nulo.
 *   4. Los totales los sigue derivando el servidor de las líneas.
 *   5. El inventario baja lo vendido y el movimiento sigue llevando `saleId`.
 *   6. Efectivo sin turno abierto: sigue rechazándose y sin dejar rastro (D3).
 *   7. Efectivo con turno abierto: sigue guardando el `shiftId` (D3).
 *   8. Idempotencia: la misma clave sigue devolviendo la misma venta (POS5.0).
 *   9. Cliente inexistente: la validación sigue delante de la atribución.
 *  10. El informe: gasto sin leads, leads sin gasto, monedas mixtas y la
 *      ventana de fechas exacta por sus dos extremos.
 *
 * Trabaja sobre una **sucursal propia** para que ningún lead ni ninguna venta
 * preexistente de la base de desarrollo entre en las cuentas. Crea sus fixtures
 * con prefijo reconocible y **los borra al terminar**, incluso si una aserción
 * falla.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import {
  POS_SESSION_COOKIE_NAME,
  createPosSessionToken,
} from "@/server/auth/session";
import { getMarketingAttributionReport } from "@/server/marketing/queries";
import { resolveMetaAdDatePresetRange } from "@/server/meta-ads/shared";
import { checkoutPosSaleAction } from "@/server/pos/actions";

const prisma = new PrismaClient();
const STAMP = Date.now();
const TAG = `SMOKE-ATTR1-${STAMP}`;
const BRANCH_CODE = `A1${String(STAMP).slice(-8)}`;

const ACC_IG = `act_811${STAMP}`;
const ACC_TT = `act_812${STAMP}`;
const ACC_WA = `act_813${STAMP}`;
const ACC_REF_A = `act_814${STAMP}`;
const ACC_REF_B = `act_815${STAMP}`;
const ALL_ACCOUNTS = [ACC_IG, ACC_TT, ACC_WA, ACC_REF_A, ACC_REF_B];

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  OK    ${name}`);
  } else {
    failed += 1;
    console.log(`  FALLA ${name} ${detail}`);
  }
}

type SmokeGlobals = { __motomasSmokeCookies?: Record<string, string> };

const MINUTES_5 = 5 * 60 * 1000;
const DAYS = 24 * 60 * 60 * 1000;

// Los ids que las pruebas comparten, rellenados por `seed`.
let branchId = "";
let userId = "";
let operatorId = "";
let warehouseId = "";
let productA = "";
let productB = "";
let customerWithLeads = "";
let customerWithoutLeads = "";
let leadInstagram = "";
let leadFacebook = "";

async function seed() {
  const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
  userId = user.id;

  const branch = await prisma.branch.create({
    data: { code: BRANCH_CODE, name: `${TAG} Sucursal` },
    select: { id: true },
  });
  branchId = branch.id;

  const operator = await prisma.posOperator.create({
    data: {
      username: `${TAG.toLowerCase()}-op`,
      passwordHash: "x",
      userId,
      branchId,
    },
    select: { id: true, sessionVersion: true, username: true },
  });
  operatorId = operator.id;

  const warehouse = await prisma.posWarehouse.create({
    data: { branchId, code: `${TAG}-BOD`, name: `${TAG} Bodega` },
    select: { id: true },
  });
  warehouseId = warehouse.id;

  for (const suffix of ["A", "B"]) {
    const product = await prisma.posProduct.create({
      data: { sku: `${TAG}-${suffix}`, name: `Artículo ${suffix}`, unitPrice: 100 },
      select: { id: true },
    });
    if (suffix === "A") productA = product.id;
    else productB = product.id;
    await prisma.posInventory.create({
      data: {
        warehouseId,
        productId: product.id,
        quantity: new Prisma.Decimal(100),
      },
    });
  }

  const withLeads = await prisma.customer.create({
    data: {
      branchId,
      name: `${TAG} Cliente con leads`,
      phone: "88880001",
      phoneNormalized: `${STAMP}0001`,
    },
    select: { id: true },
  });
  customerWithLeads = withLeads.id;

  const withoutLeads = await prisma.customer.create({
    data: {
      branchId,
      name: `${TAG} Cliente sin leads`,
      phone: "88880002",
      phoneNormalized: `${STAMP}0002`,
    },
    select: { id: true },
  });
  customerWithoutLeads = withoutLeads.id;

  /*
   * **El de Instagram se inserta PRIMERO y es el más reciente.** Así el orden de
   * inserción (y por tanto el del cuid) apunta al contrario que `createdAt`: una
   * implementación que ordenara por id en vez de por fecha elegiría el de
   * Facebook y esta prueba lo vería.
   */
  const instagram = await prisma.lead.create({
    data: {
      trackingCode: `${TAG}-IG`,
      name: `${TAG} Lead IG`,
      phone: "88880003",
      branchId,
      customerId: customerWithLeads,
      originChannel: "Instagram Ads",
      createdAt: new Date(Date.now() - MINUTES_5),
    },
    select: { id: true },
  });
  leadInstagram = instagram.id;

  const facebook = await prisma.lead.create({
    data: {
      trackingCode: `${TAG}-FB`,
      name: `${TAG} Lead FB`,
      phone: "88880004",
      branchId,
      customerId: customerWithLeads,
      originChannel: "Facebook Ads",
      createdAt: new Date(Date.now() - 10 * DAYS),
    },
    select: { id: true },
  });
  leadFacebook = facebook.id;

  // Leads sin cliente: cuentan en el informe por su canal y NO pueden competir
  // por ser «el lead más reciente» de nadie.
  for (const [suffix, channel] of [
    ["WA", "WhatsApp"],
    ["REF", "Referido"],
  ] as const) {
    await prisma.lead.create({
      data: {
        trackingCode: `${TAG}-${suffix}`,
        name: `${TAG} Lead ${suffix}`,
        phone: "88880005",
        branchId,
        originChannel: channel,
        createdAt: new Date(Date.now() - MINUTES_5),
      },
    });
  }

  // --- Cuentas publicitarias, fotos y campañas enlazadas ------------------
  const accounts = new Map<string, string>();
  for (const adAccountId of ALL_ACCOUNTS) {
    const account = await prisma.metaAdAccount.create({
      data: { adAccountId, label: `${TAG} ${adAccountId}`, currency: "NIO" },
      select: { id: true },
    });
    accounts.set(adAccountId, account.id);
  }

  // ACC_WA se queda a propósito SIN foto: es el caso «sin datos».
  const snapshots: Array<[string, string, string]> = [
    [ACC_IG, "300.00", "NIO"],
    [ACC_TT, "150.00", "NIO"],
    [ACC_REF_A, "50.00", "NIO"],
    [ACC_REF_B, "20.00", "USD"],
  ];
  for (const [adAccountId, spend, currency] of snapshots) {
    await prisma.metaAdMetricSnapshot.create({
      data: {
        adAccountId,
        datePreset: "HOY",
        impressions: BigInt(1000),
        clicks: BigInt(40),
        spend: new Prisma.Decimal(spend),
        currency,
        ctr: new Prisma.Decimal("4.0000"),
        cpc: new Prisma.Decimal("1.2500"),
      },
    });
  }

  const campaigns: Array<[string, string, string]> = [
    ["IG", "INSTAGRAM_ADS", ACC_IG],
    ["TT", "TIKTOK", ACC_TT],
    // Segunda campaña sobre LA MISMA cuenta: su gasto no puede contarse dos
    // veces por estar enlazado dos veces.
    ["TT2", "TIKTOK", ACC_TT],
    ["WA", "WHATSAPP", ACC_WA],
    ["REFA", "REFERRAL", ACC_REF_A],
    ["REFB", "REFERRAL", ACC_REF_B],
  ];
  for (const [suffix, channel, adAccountId] of campaigns) {
    await prisma.marketingCampaign.create({
      data: {
        name: `${TAG} ${suffix}`,
        channel: channel as Prisma.MarketingCampaignCreateInput["channel"],
        objective: "LEADS",
        startsAt: new Date(),
        createdById: userId,
        targetBranchId: branchId,
        metaAdAccountId: accounts.get(adAccountId) ?? null,
      },
    });
  }

  // La sesión de mostrador: firmada con el mismo secreto y verificada contra la
  // base por el mismo código que en producción. Lo que se sustituye es el
  // transporte de la cookie, no la autorización.
  const token = await createPosSessionToken({
    operatorId,
    auditUserId: userId,
    username: operator.username,
    branchId,
    branchCode: BRANCH_CODE,
    branchName: `${TAG} Sucursal`,
    sessionVersion: operator.sessionVersion,
  });
  (globalThis as unknown as SmokeGlobals).__motomasSmokeCookies = {
    [POS_SESSION_COOKIE_NAME]: token,
  };
}

function line(productId: string, quantity: number, unitPrice: number) {
  return { productId, quantity, unitPrice, discount: 0, tax: 0 };
}

async function saleById(saleId: string) {
  return prisma.posSale.findUniqueOrThrow({
    where: { id: saleId },
    select: {
      id: true,
      total: true,
      subtotal: true,
      shiftId: true,
      customerId: true,
      status: true,
      attributedLeadId: true,
      attributedLead: { select: { originChannel: true } },
      payments: { select: { method: true, amount: true } },
      items: { select: { productId: true, quantity: true } },
    },
  });
}

async function stockOf(productId: string): Promise<number> {
  const row = await prisma.posInventory.findFirstOrThrow({
    where: { warehouseId, productId },
    select: { quantity: true },
  });
  return row.quantity.toNumber();
}

function rowFor(
  report: Awaited<ReturnType<typeof getMarketingAttributionReport>>,
  channel: string,
) {
  return report.rows.find((row) => row.channel === channel);
}

async function main() {
  console.log(`\nSMOKE-ATTR-1 — atribución de venta y informe (${TAG})\n`);
  await seed();

  // =======================================================================
  // 1. La atribución en el cobro real
  // =======================================================================

  const stockBefore = await stockOf(productA);

  const sale1 = await checkoutPosSaleAction({
    warehouseId,
    customerId: customerWithLeads,
    lines: [line(productA, 2, 100), line(productB, 1, 50)],
    payments: [{ method: "TARJETA", amount: 250 }],
  });
  check(
    "el cobro de un cliente con leads se completa",
    sale1.ok,
    sale1.ok ? "" : sale1.error,
  );
  if (!sale1.ok) throw new Error("sin venta no hay nada que comprobar");
  const persisted1 = await saleById(sale1.saleId);

  check(
    "la venta se atribuye al lead MÁS RECIENTE del cliente",
    persisted1.attributedLeadId === leadInstagram,
    `esperado=${leadInstagram} obtenido=${persisted1.attributedLeadId}`,
  );
  check(
    "no se atribuye al más antiguo aunque se insertara después",
    persisted1.attributedLeadId !== leadFacebook,
  );
  check(
    "el canal se lee por la relación, no por una copia en la venta",
    persisted1.attributedLead?.originChannel === "Instagram Ads",
    `canal=${persisted1.attributedLead?.originChannel}`,
  );

  const sale2 = await checkoutPosSaleAction({
    warehouseId,
    customerId: customerWithoutLeads,
    lines: [line(productA, 1, 100)],
    payments: [{ method: "TARJETA", amount: 100 }],
  });
  check("el cobro de un cliente sin leads se completa", sale2.ok, sale2.ok ? "" : sale2.error);
  if (!sale2.ok) throw new Error("sin venta no hay nada que comprobar");
  const persisted2 = await saleById(sale2.saleId);
  check(
    "un cliente sin leads deja la atribución nula, y el cobro pasa igual",
    persisted2.attributedLeadId === null && persisted2.status === "COMPLETADA",
    `atribucion=${persisted2.attributedLeadId} estado=${persisted2.status}`,
  );

  const sale3 = await checkoutPosSaleAction({
    warehouseId,
    lines: [line(productA, 1, 100)],
    payments: [{ method: "TARJETA", amount: 100 }],
  });
  check("la venta de mostrador sin cliente se completa", sale3.ok, sale3.ok ? "" : sale3.error);
  if (!sale3.ok) throw new Error("sin venta no hay nada que comprobar");
  const persisted3 = await saleById(sale3.saleId);
  check(
    "una venta sin cliente deja la atribución nula",
    persisted3.attributedLeadId === null && persisted3.customerId === null,
    `atribucion=${persisted3.attributedLeadId}`,
  );

  // =======================================================================
  // 2. Lo que el cobro ya hacía, intacto
  // =======================================================================

  check(
    "los totales los sigue derivando el servidor de las líneas",
    persisted1.subtotal.toNumber() === 250 && persisted1.total.toNumber() === 250,
    `subtotal=${persisted1.subtotal} total=${persisted1.total}`,
  );
  check(
    "los pagos se siguen guardando tal cual",
    persisted1.payments.length === 1 &&
      persisted1.payments[0]!.method === "TARJETA" &&
      persisted1.payments[0]!.amount.toNumber() === 250,
  );
  check(
    "las líneas se siguen guardando completas",
    persisted1.items.length === 2,
    `lineas=${persisted1.items.length}`,
  );
  check(
    "el inventario bajó exactamente lo vendido (2 + 1 + 1)",
    (await stockOf(productA)) === stockBefore - 4,
    `antes=${stockBefore} ahora=${await stockOf(productA)}`,
  );

  const movements = await prisma.posInventoryMovement.findMany({
    where: { saleId: sale1.saleId },
    select: { id: true, type: true },
  });
  check(
    "P-13 intacto: los movimientos siguen apuntando a su venta",
    movements.length === 2 && movements.every((move) => move.type === "VENTA"),
    `movimientos=${movements.length}`,
  );

  // --- D3: el efectivo sigue exigiendo turno -----------------------------
  const stockBeforeRejected = await stockOf(productA);
  const salesBeforeRejected = await prisma.posSale.count({ where: { branchId } });
  const rejected = await checkoutPosSaleAction({
    warehouseId,
    customerId: customerWithLeads,
    lines: [line(productA, 1, 100)],
    payments: [{ method: "EFECTIVO", amount: 100 }],
  });
  check(
    "D3 intacto: el efectivo sin turno abierto se sigue rechazando",
    !rejected.ok && rejected.code === "NO_OPEN_SHIFT",
    rejected.ok ? "pasó" : `code=${rejected.code}`,
  );
  check(
    "el rechazo sigue sin dejar rastro: ni venta ni consumo de mercancía",
    (await prisma.posSale.count({ where: { branchId } })) === salesBeforeRejected &&
      (await stockOf(productA)) === stockBeforeRejected,
  );

  const shift = await prisma.posCashShift.create({
    data: {
      branchId,
      operatorId,
      openedByUserId: userId,
      openingFloat: new Prisma.Decimal(1000),
      notes: TAG,
    },
    select: { id: true },
  });
  const sale5 = await checkoutPosSaleAction({
    warehouseId,
    customerId: customerWithLeads,
    lines: [line(productA, 1, 120)],
    payments: [{ method: "EFECTIVO", amount: 120 }],
  });
  check(
    "D3 intacto: con turno abierto el cobro en efectivo pasa",
    sale5.ok,
    sale5.ok ? "" : sale5.error,
  );
  if (!sale5.ok) throw new Error("sin venta en efectivo no hay nada que comprobar");
  const persisted5 = await saleById(sale5.saleId);
  check(
    "la venta en efectivo sigue guardando su turno",
    persisted5.shiftId === shift.id,
    `turno=${persisted5.shiftId}`,
  );
  check(
    "y además queda atribuida: el camino del turno no estorba a la atribución",
    persisted5.attributedLeadId === leadInstagram,
  );

  // --- POS5.0: la idempotencia sigue siendo la misma ---------------------
  const key = `${TAG}-IDEM`;
  const first = await checkoutPosSaleAction({
    idempotencyKey: key,
    warehouseId,
    lines: [line(productB, 1, 70)],
    payments: [{ method: "TARJETA", amount: 70 }],
  });
  const second = await checkoutPosSaleAction({
    idempotencyKey: key,
    warehouseId,
    lines: [line(productB, 1, 70)],
    payments: [{ method: "TARJETA", amount: 70 }],
  });
  check(
    "POS5.0 intacto: la misma clave devuelve la misma venta",
    first.ok && second.ok && first.saleId === second.saleId,
    first.ok && second.ok ? `${first.saleId} vs ${second.saleId}` : "una falló",
  );
  check(
    "y no creó una segunda venta con esa clave",
    (await prisma.posSale.count({ where: { idempotencyKey: key } })) === 1,
  );

  // --- La validación existente sigue por delante de la atribución --------
  const unknownCustomer = await checkoutPosSaleAction({
    warehouseId,
    customerId: `${TAG}-no-existe`,
    lines: [line(productA, 1, 100)],
    payments: [{ method: "TARJETA", amount: 100 }],
  });
  check(
    "un cliente inexistente se sigue rechazando con su mensaje de siempre",
    !unknownCustomer.ok && unknownCustomer.error === "El cliente no existe.",
    unknownCustomer.ok ? "pasó" : unknownCustomer.error,
  );

  // =======================================================================
  // 3. El informe
  // =======================================================================

  const report = await getMarketingAttributionReport("HOY", BRANCH_CODE);

  const instagram = rowFor(report, "Instagram Ads");
  check(
    "Instagram Ads: gasto, leads y ventas en la misma fila",
    instagram?.spend === 300 &&
      instagram?.leads === 1 &&
      instagram?.salesCount === 2,
    JSON.stringify(instagram),
  );
  check(
    "el coste por lead se calcula cuando hay gasto y leads",
    instagram?.costPerLead === 300,
    `cpl=${instagram?.costPerLead}`,
  );
  check(
    "el importe vendido suma las dos ventas atribuidas (250 + 120)",
    instagram?.salesTotal === 370,
    `total=${instagram?.salesTotal}`,
  );

  const tiktok = rowFor(report, "TikTok");
  check(
    "un canal con gasto y CERO leads aparece igual, con su gasto correcto",
    tiktok?.spend === 150 && tiktok?.leads === 0,
    JSON.stringify(tiktok),
  );
  check(
    "y su coste por lead es nulo, no una división entre cero ni un 0.00",
    tiktok?.costPerLead === null,
    `cpl=${tiktok?.costPerLead}`,
  );
  check(
    "dos campañas sobre la misma cuenta no cuentan su gasto dos veces",
    tiktok?.linkedAccounts === 1,
    `cuentas=${tiktok?.linkedAccounts}`,
  );

  const whatsapp = rowFor(report, "WhatsApp");
  check(
    "una cuenta enlazada sin foto del periodo da «sin datos», no cero",
    whatsapp?.spend === null && whatsapp?.linkedAccounts === 1,
    JSON.stringify(whatsapp),
  );
  check(
    "sin gasto conocido no se inventa un coste por lead aunque haya leads",
    whatsapp?.leads === 1 && whatsapp?.costPerLead === null,
    `leads=${whatsapp?.leads} cpl=${whatsapp?.costPerLead}`,
  );

  const referido = rowFor(report, "Referido");
  check(
    "dos monedas distintas no se suman: el gasto queda nulo y marcado",
    referido?.spend === null && referido?.mixedCurrency === true,
    JSON.stringify(referido),
  );

  check(
    "un canal sin leads, sin ventas y sin cuenta en la ventana no aparece",
    rowFor(report, "Facebook Ads") === undefined,
  );

  const monthly = await getMarketingAttributionReport("ULTIMOS_30D", BRANCH_CODE);
  check(
    "el mismo canal sí aparece cuando la ventana lo alcanza (lead de hace 10 días)",
    rowFor(monthly, "Facebook Ads")?.leads === 1,
    `leads=${rowFor(monthly, "Facebook Ads")?.leads}`,
  );

  // --- La ventana, por sus dos extremos ----------------------------------
  const today = resolveMetaAdDatePresetRange("HOY");
  await prisma.posSale.update({
    where: { id: sale1.saleId },
    data: { completedAt: today.from },
  });
  await prisma.posSale.update({
    where: { id: sale5.saleId },
    data: { completedAt: today.to },
  });
  const bounded = await getMarketingAttributionReport("HOY", BRANCH_CODE);
  const boundedRow = rowFor(bounded, "Instagram Ads");
  check(
    "el extremo inferior entra y el superior no: 1 venta, no 0 ni 2",
    boundedRow?.salesCount === 1 && boundedRow?.salesTotal === 250,
    JSON.stringify(boundedRow),
  );

  // --- La sucursal acota leads y ventas ----------------------------------
  const otherBranch = await getMarketingAttributionReport("HOY", `${BRANCH_CODE}-X`);
  check(
    "un código de sucursal desconocido devuelve el informe vacío, no cifras globales",
    otherBranch.rows.length === 0,
    `filas=${otherBranch.rows.length}`,
  );

  // --- Las cinco ventanas -------------------------------------------------
  const noon = new Date(2026, 8, 15, 12, 0, 0); // 15 de septiembre de 2026
  const ranges = {
    HOY: resolveMetaAdDatePresetRange("HOY", noon),
    ULTIMOS_7D: resolveMetaAdDatePresetRange("ULTIMOS_7D", noon),
    ULTIMOS_30D: resolveMetaAdDatePresetRange("ULTIMOS_30D", noon),
    ESTE_MES: resolveMetaAdDatePresetRange("ESTE_MES", noon),
    MES_PASADO: resolveMetaAdDatePresetRange("MES_PASADO", noon),
  };
  const day = (date: Date) =>
    `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  check(
    "HOY es el día natural, de las 00:00 a las 00:00 del siguiente",
    day(ranges.HOY.from) === "2026-9-15" && day(ranges.HOY.to) === "2026-9-16",
    `${day(ranges.HOY.from)} → ${day(ranges.HOY.to)}`,
  );
  check(
    "ULTIMOS_7D son siete días CONTANDO hoy",
    day(ranges.ULTIMOS_7D.from) === "2026-9-9" &&
      day(ranges.ULTIMOS_7D.to) === "2026-9-16",
    `${day(ranges.ULTIMOS_7D.from)} → ${day(ranges.ULTIMOS_7D.to)}`,
  );
  check(
    "ULTIMOS_30D son treinta días contando hoy, cruzando el cambio de mes",
    day(ranges.ULTIMOS_30D.from) === "2026-8-17" &&
      day(ranges.ULTIMOS_30D.to) === "2026-9-16",
    `${day(ranges.ULTIMOS_30D.from)} → ${day(ranges.ULTIMOS_30D.to)}`,
  );
  check(
    "ESTE_MES va del día 1 al día 1 del siguiente",
    day(ranges.ESTE_MES.from) === "2026-9-1" &&
      day(ranges.ESTE_MES.to) === "2026-10-1",
    `${day(ranges.ESTE_MES.from)} → ${day(ranges.ESTE_MES.to)}`,
  );
  check(
    "MES_PASADO es el mes anterior entero",
    day(ranges.MES_PASADO.from) === "2026-8-1" &&
      day(ranges.MES_PASADO.to) === "2026-9-1",
    `${day(ranges.MES_PASADO.from)} → ${day(ranges.MES_PASADO.to)}`,
  );
  check(
    "enero hacia atrás cae en diciembre del año anterior, sin aritmética a mano",
    day(resolveMetaAdDatePresetRange("MES_PASADO", new Date(2027, 0, 10)).from) ===
      "2026-12-1",
  );
}

async function cleanup() {
  if (!branchId) return;
  // Orden impuesto por las claves foráneas: los movimientos sujetan la venta
  // (`Restrict`), la venta sujeta el turno, y todo cuelga de la sucursal.
  await prisma.posInventoryMovement.deleteMany({ where: { warehouseId } });
  await prisma.posSale.deleteMany({ where: { branchId } });
  await prisma.posCashShift.deleteMany({ where: { branchId } });
  await prisma.posInventory.deleteMany({ where: { warehouseId } });
  await prisma.posWarehouse.deleteMany({ where: { branchId } });
  await prisma.posProduct.deleteMany({ where: { sku: { startsWith: TAG } } });
  await prisma.marketingCampaign.deleteMany({ where: { targetBranchId: branchId } });
  await prisma.metaAdMetricSnapshot.deleteMany({
    where: { adAccountId: { in: ALL_ACCOUNTS } },
  });
  await prisma.metaAdAccount.deleteMany({
    where: { adAccountId: { in: ALL_ACCOUNTS } },
  });
  await prisma.lead.deleteMany({ where: { branchId } });
  await prisma.customer.deleteMany({ where: { branchId } });
  await prisma.posOperator.deleteMany({ where: { branchId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
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
