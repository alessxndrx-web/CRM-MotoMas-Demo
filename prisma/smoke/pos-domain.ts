/**
 * SMOKE-POS1.0-A — dominio del punto de venta.
 *
 *   npm run smoke:pos-domain
 *
 * Reproduce el cuerpo transaccional de las acciones del POS, porque autorizan
 * contra la cookie de sesión y no se pueden invocar fuera de una petición. La
 * autorización queda fuera de cobertura, como en el resto de las suites Prisma.
 *
 * Lo que esta suite verifica además de la aritmética: que **nada del POS toca la
 * contabilidad**. El escenario final cuenta asientos y contabilizaciones para
 * probarlo, que es la promesa central del parche.
 *
 * Limpieza guiada por TAG: un fixture a medio construir se borra igual que uno
 * completo.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import {
  calculatePosLineTotal,
  calculatePosPaidTotal,
  calculatePosSaleTotals,
} from "@/server/pos/shared";

const prisma = new PrismaClient();
const TAG = `SMOKE-POS10A-${Date.now()}`;

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

type Ids = { branchId: string; userId: string; products: Record<string, string> };

async function createFixtures(): Promise<Ids> {
  const branch = await prisma.branch.create({
    data: { code: `${TAG}-suc`.toLowerCase(), name: `${TAG} sucursal` },
  });
  const user = await prisma.user.create({
    data: {
      name: `${TAG} cajero`,
      email: `${TAG.toLowerCase()}@smoke.local`,
      passwordHash: "smoke:not-a-real-hash",
      role: "CAJERO",
    },
  });

  const products: Record<string, string> = {};
  for (const [key, price] of [
    ["CASCO", 1000],
    ["ACEITE", 250],
    ["INACTIVO", 500],
  ] as const) {
    const product = await prisma.posProduct.create({
      data: {
        sku: `${TAG}-${key}`,
        barcode: `${TAG}-BC-${key}`,
        name: `${key} de prueba`,
        unitPrice: new Prisma.Decimal(price.toFixed(2)),
        isActive: key !== "INACTIVO",
      },
    });
    products[key] = product.id;
  }

  return { branchId: branch.id, userId: user.id, products };
}

async function cleanup() {
  const branches = await prisma.branch.findMany({
    where: { code: { startsWith: TAG.toLowerCase() } },
    select: { id: true },
  });
  const branchIds = branches.map((branch) => branch.id);
  const users = await prisma.user.findMany({
    where: { email: { startsWith: TAG.toLowerCase() } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const sales = await prisma.posSale.findMany({
    where: { branchId: { in: branchIds } },
    select: { id: true },
  });
  const saleIds = sales.map((sale) => sale.id);

  await prisma.posPayment.deleteMany({ where: { saleId: { in: saleIds } } });
  await prisma.posSaleItem.deleteMany({ where: { saleId: { in: saleIds } } });
  await prisma.posSale.deleteMany({ where: { id: { in: saleIds } } });
  await prisma.posProduct.deleteMany({ where: { sku: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
}

function toDecimal(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}
function toQuantity(value: number) {
  return new Prisma.Decimal(value.toFixed(3));
}

/** Reproduce `createPosSaleAction`. */
async function createSale(ids: Ids, suffix: string) {
  return prisma.posSale.create({
    data: {
      saleNumber: `${TAG}-${suffix}`,
      branchId: ids.branchId,
      cashierId: ids.userId,
      status: "BORRADOR",
    },
  });
}

/** Reproduce `recalculateSale`: reescribe el agregado desde sus líneas. */
async function recalculate(tx: Prisma.TransactionClient, saleId: string) {
  const items = await tx.posSaleItem.findMany({ where: { saleId } });
  const totals = calculatePosSaleTotals(
    items.map((item) => ({
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount),
      tax: Number(item.tax),
    })),
  );
  await tx.posSale.update({
    where: { id: saleId },
    data: {
      subtotal: toDecimal(totals.subtotal),
      discount: toDecimal(totals.discount),
      tax: toDecimal(totals.tax),
      total: toDecimal(totals.total),
    },
  });
  return totals;
}

/** Reproduce `addPosSaleItemAction`. */
async function addItem(
  ids: Ids,
  saleId: string,
  input: {
    product: string;
    quantity: number;
    unitPrice?: number;
    discount?: number;
    tax?: number;
  },
): Promise<{ ok: true; itemId: string } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.posSale.findUnique({ where: { id: saleId } });
    if (!sale) return { ok: false as const, error: "La venta no existe." };
    if (sale.status !== "BORRADOR") {
      return { ok: false as const, error: "Solo puedes modificar una venta en borrador." };
    }
    const product = await tx.posProduct.findUniqueOrThrow({
      where: { id: ids.products[input.product] },
    });
    if (!product.isActive) {
      return { ok: false as const, error: "El producto está inactivo." };
    }
    const unitPrice = input.unitPrice ?? Number(product.unitPrice);
    const discount = input.discount ?? 0;
    const tax = input.tax ?? 0;
    const position = await tx.posSaleItem.count({ where: { saleId } });
    const item = await tx.posSaleItem.create({
      data: {
        saleId,
        productId: product.id,
        quantity: toQuantity(input.quantity),
        unitPrice: toDecimal(unitPrice),
        discount: toDecimal(discount),
        tax: toDecimal(tax),
        total: toDecimal(
          calculatePosLineTotal({
            quantity: input.quantity,
            unitPrice,
            discount,
            tax,
          }),
        ),
        position,
      },
    });
    await recalculate(tx, saleId);
    return { ok: true as const, itemId: item.id };
  });
}

/** Reproduce `removePosSaleItemAction`. */
async function removeItem(itemId: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.posSaleItem.findUnique({
      where: { id: itemId },
      include: { sale: { select: { id: true, status: true } } },
    });
    if (!item) return { ok: false as const, error: "El artículo no existe." };
    if (item.sale.status !== "BORRADOR") {
      return { ok: false as const, error: "Solo puedes modificar una venta en borrador." };
    }
    await tx.posSaleItem.delete({ where: { id: item.id } });
    await recalculate(tx, item.sale.id);
    return { ok: true as const };
  });
}

/** Reproduce `addPosPaymentAction`. */
async function addPayment(
  saleId: string,
  method: "EFECTIVO" | "TARJETA" | "TRANSFERENCIA" | "CHEQUE",
  amount: number,
) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.posSale.findUnique({ where: { id: saleId } });
    if (!sale) return { ok: false as const, error: "La venta no existe." };
    if (sale.status !== "BORRADOR") {
      return { ok: false as const, error: "Solo puedes modificar una venta en borrador." };
    }
    await tx.posPayment.create({
      data: { saleId, method, amount: toDecimal(amount) },
    });
    return { ok: true as const };
  });
}

/** Reproduce `completePosSaleAction`. */
async function completeSale(saleId: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.posSale.findUnique({
      where: { id: saleId },
      include: { _count: { select: { items: true } } },
    });
    if (!sale) return { ok: false as const, error: "La venta no existe." };
    if (sale.status !== "BORRADOR") {
      return { ok: false as const, error: "Solo puedes modificar una venta en borrador." };
    }
    if (!sale._count.items) {
      return { ok: false as const, error: "La venta necesita al menos un artículo." };
    }
    const guarded = await tx.posSale.updateMany({
      where: { id: saleId, status: "BORRADOR" },
      data: { status: "COMPLETADA", completedAt: new Date() },
    });
    if (guarded.count !== 1) {
      return { ok: false as const, error: "Solo puedes modificar una venta en borrador." };
    }
    return { ok: true as const };
  });
}

/** Reproduce `cancelPosSaleAction`. */
async function cancelSale(saleId: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.posSale.findUnique({ where: { id: saleId } });
    if (!sale) return { ok: false as const, error: "La venta no existe." };
    if (sale.status !== "BORRADOR") {
      return { ok: false as const, error: "Solo puedes modificar una venta en borrador." };
    }
    const guarded = await tx.posSale.updateMany({
      where: { id: saleId, status: "BORRADOR" },
      data: { status: "ANULADA", cancelledAt: new Date() },
    });
    if (guarded.count !== 1) {
      return { ok: false as const, error: "Solo puedes modificar una venta en borrador." };
    }
    return { ok: true as const };
  });
}

async function stored(saleId: string) {
  return prisma.posSale.findUniqueOrThrow({ where: { id: saleId } });
}

async function main() {
  let ids: Ids | null = null;
  const entriesBefore = await prisma.journalEntry.count();
  const postingsBefore = await prisma.postingRecord.count();

  try {
    ids = await createFixtures();

    console.log("\n=== 1. Aritmética de línea y de venta ===");
    check(
      "línea: cantidad × precio − descuento + impuesto",
      calculatePosLineTotal({ quantity: 2, unitPrice: 1000, discount: 100, tax: 300 }) === 2200,
    );
    check(
      "el descuento no puede volver negativa la línea",
      calculatePosLineTotal({ quantity: 1, unitPrice: 100, discount: 500 }) === 0,
    );
    const totals = calculatePosSaleTotals([
      { quantity: 2, unitPrice: 1000, discount: 100, tax: 300 },
      { quantity: 1, unitPrice: 250, tax: 37.5 },
    ]);
    check("subtotal = suma de los brutos", totals.subtotal === 2250, String(totals.subtotal));
    check("descuento = suma de los de línea", totals.discount === 100);
    check("impuesto = suma de los de línea", totals.tax === 337.5);
    check("total = subtotal − descuento + impuesto", totals.total === 2487.5, String(totals.total));

    console.log("\n=== 2. Crear borrador ===");
    const sale = await createSale(ids, "V1");
    check("nace en BORRADOR", (await stored(sale.id)).status === "BORRADOR");
    check("sin importes", Number((await stored(sale.id)).total) === 0);
    check("cliente opcional: nace sin cliente", (await stored(sale.id)).customerId === null);
    check("identidad = número de venta", sale.saleNumber.startsWith(TAG));

    console.log("\n=== 3. Agregar artículos y recalcular ===");
    const first = await addItem(ids, sale.id, {
      product: "CASCO",
      quantity: 2,
      discount: 100,
      tax: 300,
    });
    check("agrega el primero", first.ok, first.ok ? "" : first.error);
    await addItem(ids, sale.id, { product: "ACEITE", quantity: 1, tax: 37.5 });

    const afterItems = await stored(sale.id);
    check("subtotal almacenado", Number(afterItems.subtotal) === 2250, String(afterItems.subtotal));
    check("descuento almacenado", Number(afterItems.discount) === 100);
    check("impuesto almacenado", Number(afterItems.tax) === 337.5);
    check("total almacenado", Number(afterItems.total) === 2487.5, String(afterItems.total));
    check(
      "el precio sale del catálogo cuando no se indica",
      Number(
        (await prisma.posSaleItem.findFirstOrThrow({
          where: { saleId: sale.id, position: 1 },
        })).unitPrice,
      ) === 250,
    );

    console.log("\n=== 4. Precio manual y producto inactivo ===");
    const manual = await addItem(ids, sale.id, {
      product: "CASCO",
      quantity: 1,
      unitPrice: 900,
    });
    check("acepta precio manual", manual.ok);
    check(
      "el manual se guardó",
      Number(
        (await prisma.posSaleItem.findFirstOrThrow({
          where: { saleId: sale.id, position: 2 },
        })).unitPrice,
      ) === 900,
    );
    const inactive = await addItem(ids, sale.id, { product: "INACTIVO", quantity: 1 });
    check("rechaza un producto inactivo", !inactive.ok, inactive.ok ? "aceptó" : "");

    console.log("\n=== 5. Quitar un artículo recalcula ===");
    const removed = await removeItem(manual.ok ? manual.itemId : "");
    check("quita", removed.ok, removed.ok ? "" : removed.error);
    check(
      "el total vuelve al anterior",
      Number((await stored(sale.id)).total) === 2487.5,
      String(Number((await stored(sale.id)).total)),
    );

    console.log("\n=== 6. Varios pagos ===");
    check("efectivo", (await addPayment(sale.id, "EFECTIVO", 1000)).ok);
    check("tarjeta", (await addPayment(sale.id, "TARJETA", 1487.5)).ok);
    const payments = await prisma.posPayment.findMany({ where: { saleId: sale.id } });
    check("dos pagos registrados", payments.length === 2);
    check(
      "los pagos cubren el total",
      calculatePosPaidTotal(payments.map((p) => ({ amount: Number(p.amount) }))) === 2487.5,
    );

    console.log("\n=== 7. Completar ===");
    const completed = await completeSale(sale.id);
    check("completa", completed.ok, completed.ok ? "" : completed.error);
    const done = await stored(sale.id);
    check("queda COMPLETADA", done.status === "COMPLETADA");
    check("sella la fecha", done.completedAt !== null);

    console.log("\n=== 8. Una venta completada es inmutable ===");
    const lateItem = await addItem(ids, sale.id, { product: "ACEITE", quantity: 1 });
    check("no admite artículos", !lateItem.ok, lateItem.ok ? "aceptó" : "");
    const latePayment = await addPayment(sale.id, "EFECTIVO", 10);
    check("no admite pagos", !latePayment.ok, latePayment.ok ? "aceptó" : "");
    const lateCancel = await cancelSale(sale.id);
    check("no se puede anular", !lateCancel.ok, lateCancel.ok ? "aceptó" : "");
    const twice = await completeSale(sale.id);
    check("no se completa dos veces", !twice.ok, twice.ok ? "aceptó" : "");
    check(
      "los importes no cambiaron",
      Number((await stored(sale.id)).total) === 2487.5,
    );

    console.log("\n=== 9. Completar sin artículos ===");
    const empty = await createSale(ids, "V2");
    const emptyComplete = await completeSale(empty.id);
    check("rechazado", !emptyComplete.ok, emptyComplete.ok ? "aceptó" : "");
    check(
      "el mensaje nombra la regla",
      !emptyComplete.ok && emptyComplete.error.includes("al menos un artículo"),
      emptyComplete.ok ? "" : emptyComplete.error,
    );
    check("sigue en BORRADOR", (await stored(empty.id)).status === "BORRADOR");

    console.log("\n=== 10. Anular un borrador ===");
    const cancelled = await cancelSale(empty.id);
    check("anula", cancelled.ok, cancelled.ok ? "" : cancelled.error);
    check("queda ANULADA", (await stored(empty.id)).status === "ANULADA");
    check("sella la fecha", (await stored(empty.id)).cancelledAt !== null);
    const afterCancel = await addItem(ids, empty.id, { product: "ACEITE", quantity: 1 });
    check("una anulada tampoco admite artículos", !afterCancel.ok);

    console.log("\n=== 11. Número de venta duplicado ===");
    let duplicate = false;
    try {
      await prisma.posSale.create({
        data: {
          saleNumber: sale.saleNumber,
          branchId: ids.branchId,
          cashierId: ids.userId,
          status: "BORRADOR",
        },
      });
    } catch {
      duplicate = true;
    }
    check("el índice único lo impide", duplicate);

    console.log("\n=== 12. SKU y código de barras duplicados ===");
    let dupSku = false;
    try {
      await prisma.posProduct.create({
        data: { sku: `${TAG}-CASCO`, name: "Otro", unitPrice: toDecimal(1) },
      });
    } catch {
      dupSku = true;
    }
    check("SKU único", dupSku);
    let dupBarcode = false;
    try {
      await prisma.posProduct.create({
        data: {
          sku: `${TAG}-OTRO`,
          barcode: `${TAG}-BC-CASCO`,
          name: "Otro",
          unitPrice: toDecimal(1),
        },
      });
    } catch {
      dupBarcode = true;
    }
    check("código de barras único", dupBarcode);

    console.log("\n=== 13. Completar de forma concurrente ===");
    const race = await createSale(ids, "V3");
    await addItem(ids, race.id, { product: "ACEITE", quantity: 1 });
    const [a, b] = await Promise.all([completeSale(race.id), completeSale(race.id)]);
    check("solo una gana", a.ok !== b.ok, `a=${a.ok} b=${b.ok}`);
    check("queda COMPLETADA una sola vez", (await stored(race.id)).status === "COMPLETADA");

    console.log("\n=== 14. Rollback: un artículo inválido no deja rastro ===");
    const rollback = await createSale(ids, "V4");
    const itemsBefore = await prisma.posSaleItem.count({ where: { saleId: rollback.id } });
    const bad = await addItem(ids, rollback.id, { product: "INACTIVO", quantity: 1 });
    check("rechazado", !bad.ok);
    check(
      "sin artículos nuevos",
      (await prisma.posSaleItem.count({ where: { saleId: rollback.id } })) === itemsBefore,
    );
    check("los importes siguen en cero", Number((await stored(rollback.id)).total) === 0);

    console.log("\n=== 15. El POS no toca la contabilidad ===");
    // La promesa central del parche: ningún asiento, ninguna contabilización.
    check(
      "ningún asiento nuevo",
      (await prisma.journalEntry.count()) === entriesBefore,
      String((await prisma.journalEntry.count()) - entriesBefore),
    );
    check(
      "ningún registro de contabilización nuevo",
      (await prisma.postingRecord.count()) === postingsBefore,
    );
    check(
      "ningún documento de caja",
      (await prisma.cashDocument.count({ where: { branchId: ids.branchId } })) === 0,
    );
    check(
      "ningún movimiento de inventario",
      (await prisma.inventoryMovement.count({ where: { branchId: ids.branchId } })) === 0,
    );
  } finally {
    await cleanup();
    console.log(`\nRESULTADO SMOKE-POS1.0-A: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
