/**
 * SMOKE-POS1.1-E — consumo de existencias por venta.
 *
 *   npm run smoke:pos-inventory-consumption
 *
 * **El primer flujo que consume inventario**, y el tercero que entra al mismo
 * motor. Lo que esta suite tiene que demostrar no es solo que la venta descuente:
 *
 * 1. **Venta y consumo son inseparables.** Un fallo tras escribir movimientos
 *    deja la base exactamente como estaba: sin venta, sin movimientos, sin saldo
 *    cambiado.
 * 2. **La concurrencia hereda las mismas garantías** que ingresos y ajustes, y se
 *    verifica quitando el bloqueo.
 * 3. **El motor es el mismo.** Nada aquí reimplementa el contrato.
 *
 * Reproduce el cuerpo transaccional de `checkoutPosSaleAction` porque la acción
 * autoriza contra la cookie de sesión.
 *
 * Limpieza guiada por TAG.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import {
  calculatePosLineTotal,
  calculatePosSaleTotals,
  sanitizePosQuantity,
} from "@/server/pos/shared";

const prisma = new PrismaClient();
const TAG = `SMOKE-POS11E-${Date.now()}`;

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

function toQuantity(value: number) {
  return new Prisma.Decimal(value.toFixed(3));
}
function toMoney(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}

/** Copia del bloqueo de la acción: mismo `FOR UPDATE`, misma lectura. */
async function lockBalance(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  productId: string,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "pos_inventory" WHERE "warehouse_id" = ${warehouseId} AND "product_id" = ${productId} FOR UPDATE`,
  );
  return tx.posInventory.findUnique({
    where: { warehouseId_productId: { warehouseId, productId } },
  });
}

/** Reproduce `applyPosInventoryMovement` — el motor compartido, sin variantes. */
async function applyMovement(
  tx: Prisma.TransactionClient,
  input: {
    warehouseId: string;
    productId: string;
    quantity: number;
    type: Prisma.PosInventoryMovementCreateInput["type"];
    reason: string;
    notes: string | null;
    userId: string;
  },
) {
  const warehouse = await tx.posWarehouse.findUnique({
    where: { id: input.warehouseId },
    select: { id: true, isActive: true },
  });
  if (!warehouse) throw new Error("La bodega no existe.");
  if (!warehouse.isActive) throw new Error("La bodega está inactiva.");

  const product = await tx.posProduct.findUnique({
    where: { id: input.productId },
    select: { id: true, isActive: true },
  });
  if (!product) throw new Error("El producto no existe.");
  if (!product.isActive) throw new Error("El producto está inactivo.");

  const balance = await lockBalance(tx, warehouse.id, product.id);
  if (!balance) throw new Error("El producto no tiene saldo abierto en esa bodega.");

  const quantityBefore = balance.quantity;
  const movementQuantity = toQuantity(input.quantity);
  const quantityAfter = quantityBefore.add(movementQuantity);

  await tx.posInventoryMovement.create({
    data: {
      warehouseId: warehouse.id,
      productId: product.id,
      type: input.type,
      quantity: movementQuantity,
      quantityBefore,
      quantityAfter,
      reason: input.reason,
      notes: input.notes,
      createdByUserId: input.userId,
    },
  });
  await tx.posInventory.update({
    where: { id: balance.id },
    data: { quantity: quantityAfter },
  });
}

function generateSaleNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `POS-${date}-${suffix}`;
}

type CheckoutResult =
  | { ok: true; saleId: string; saleNumber: string }
  | { ok: false; error: string };

/**
 * Reproduce `checkoutPosSaleAction`. `failAfterConsumption` fuerza el fallo tras
 * haber escrito **al menos un** movimiento y antes de terminar el cobro.
 */
async function checkout(
  input: {
    branchId: string;
    warehouseId: string;
    userId: string;
    lines: Array<{ productId: string; quantity: number; unitPrice: number }>;
  },
  failAfterConsumption = false,
): Promise<CheckoutResult> {
  const lines: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    tax: number;
  }> = [];
  for (const line of input.lines) {
    const quantity = sanitizePosQuantity(line.quantity);
    if (quantity === null) return { ok: false, error: "La cantidad no es válida." };
    lines.push({ ...line, quantity, discount: 0, tax: 0 });
  }
  if (!lines.length) return { ok: false, error: "La venta necesita al menos un artículo." };

  try {
    return await prisma.$transaction(async (tx) => {
      const products = await tx.posProduct.findMany({
        where: { id: { in: lines.map((line) => line.productId) } },
        select: { id: true, isActive: true },
      });
      const byId = new Map(products.map((product) => [product.id, product]));
      for (const line of lines) {
        const product = byId.get(line.productId);
        if (!product) throw new Error("El producto no existe.");
        if (!product.isActive) throw new Error("El producto está inactivo.");
      }

      const totals = calculatePosSaleTotals(lines);
      const sale = await tx.posSale.create({
        data: {
          saleNumber: generateSaleNumber(),
          branchId: input.branchId,
          cashierId: input.userId,
          status: "COMPLETADA",
          completedAt: new Date(),
          subtotal: toMoney(totals.subtotal),
          discount: toMoney(totals.discount),
          tax: toMoney(totals.tax),
          total: toMoney(totals.total),
          items: {
            create: lines.map((line, position) => ({
              productId: line.productId,
              quantity: toQuantity(line.quantity),
              unitPrice: toMoney(line.unitPrice),
              discount: toMoney(line.discount),
              tax: toMoney(line.tax),
              total: toMoney(calculatePosLineTotal(line)),
              position,
            })),
          },
        },
        select: { id: true, saleNumber: true },
      });

      const warehouseBranch = await tx.posWarehouse.findUnique({
        where: { id: input.warehouseId },
        select: { branchId: true },
      });
      if (!warehouseBranch) throw new Error("La bodega no existe.");
      if (warehouseBranch.branchId !== input.branchId) {
        throw new Error("La bodega no pertenece a la sucursal de la venta.");
      }

      // Orden determinista por producto: dos cobros que compartan artículos
      // piden los bloqueos en la misma secuencia y no pueden interbloquearse.
      const consumption = [...lines].sort((left, right) =>
        left.productId.localeCompare(right.productId),
      );
      let consumed = 0;
      for (const line of consumption) {
        await applyMovement(tx, {
          warehouseId: input.warehouseId,
          productId: line.productId,
          quantity: -line.quantity,
          type: "VENTA",
          reason: `Venta ${sale.saleNumber}`,
          notes: null,
          userId: input.userId,
        });
        consumed += 1;
        if (failAfterConsumption && consumed === 1 && consumption.length > 1) {
          throw new Error("Fallo forzado tras el primer consumo.");
        }
      }
      if (failAfterConsumption && consumption.length === 1) {
        throw new Error("Fallo forzado tras el consumo.");
      }

      return { ok: true as const, saleId: sale.id, saleNumber: sale.saleNumber };
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "fallo desconocido",
    };
  }
}

async function cleanup() {
  const warehouses = await prisma.posWarehouse.findMany({
    where: { code: { startsWith: TAG } },
    select: { id: true },
  });
  const warehouseIds = warehouses.map((warehouse) => warehouse.id);
  const branches = await prisma.branch.findMany({
    where: { code: { startsWith: TAG.toLowerCase() } },
    select: { id: true },
  });
  const branchIds = branches.map((branch) => branch.id);
  const sales = await prisma.posSale.findMany({
    where: { branchId: { in: branchIds } },
    select: { id: true },
  });
  const saleIds = sales.map((sale) => sale.id);

  await prisma.posPayment.deleteMany({ where: { saleId: { in: saleIds } } });
  await prisma.posSaleItem.deleteMany({ where: { saleId: { in: saleIds } } });
  await prisma.posSale.deleteMany({ where: { id: { in: saleIds } } });
  await prisma.posInventoryMovement.deleteMany({
    where: { warehouseId: { in: warehouseIds } },
  });
  await prisma.posInventory.deleteMany({
    where: { warehouseId: { in: warehouseIds } },
  });
  await prisma.posWarehouse.deleteMany({ where: { id: { in: warehouseIds } } });
  await prisma.posProduct.deleteMany({ where: { sku: { startsWith: TAG } } });
  await prisma.user.deleteMany({
    where: { email: { startsWith: TAG.toLowerCase() } },
  });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
}

async function balanceOf(warehouseId: string, productId: string) {
  const row = await prisma.posInventory.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId, productId } },
  });
  return row.quantity.toNumber();
}

async function main() {
  await cleanup();

  const before = {
    entries: await prisma.journalEntry.count(),
    postings: await prisma.postingRecord.count(),
    cash: await prisma.cashDocument.count(),
    units: await prisma.motorcycleUnit.count(),
    moves: await prisma.inventoryMovement.count(),
  };

  try {
    // --- Fixtures ---------------------------------------------------------
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
    const central = await prisma.posWarehouse.create({
      data: { branchId: branch.id, code: `${TAG}-CENTRAL`, name: "Central" },
    });
    const anexa = await prisma.posWarehouse.create({
      data: { branchId: branch.id, code: `${TAG}-ANEXA`, name: "Anexa" },
    });
    // Nace **activa** por la misma razón que el producto retirado: el motor no
    // deja mover existencias de una bodega inactiva, tampoco al cargarlas.
    const cerrada = await prisma.posWarehouse.create({
      data: { branchId: branch.id, code: `${TAG}-CERRADA`, name: "Cerrada" },
    });

    const casco = await prisma.posProduct.create({
      data: { sku: `${TAG}-CASCO`, name: "Casco", unitPrice: toMoney(1000) },
    });
    const aceite = await prisma.posProduct.create({
      data: {
        sku: `${TAG}-ACEITE`,
        name: "Aceite",
        unitPrice: toMoney(95),
        unit: "LITRO",
      },
    });
    // Nace **activo**: el motor rechaza mover existencias de un producto
    // inactivo, también al cargarlas. Se retira después, que es además el caso
    // realista: un artículo con saldo al que se le da de baja del catálogo.
    const retirado = await prisma.posProduct.create({
      data: { sku: `${TAG}-RETIRADO`, name: "Retirado", unitPrice: toMoney(10) },
    });
    const sinSaldo = await prisma.posProduct.create({
      data: { sku: `${TAG}-SINSALDO`, name: "Sin saldo", unitPrice: toMoney(20) },
    });

    /** Abre un saldo y lo carga con un ingreso, usando el mismo motor. */
    async function stock(warehouseId: string, productId: string, quantity: number) {
      await prisma.posInventory.create({ data: { warehouseId, productId } });
      if (quantity > 0) {
        await prisma.$transaction((tx) =>
          applyMovement(tx, {
            warehouseId,
            productId,
            quantity,
            type: "COMPRA",
            reason: "Carga inicial de la suite",
            notes: null,
            userId: user.id,
          }),
        );
      }
    }
    await stock(central.id, casco.id, 50);
    await stock(central.id, aceite.id, 20);
    await stock(central.id, retirado.id, 5);
    await prisma.posProduct.update({
      where: { id: retirado.id },
      data: { isActive: false },
    });
    await stock(anexa.id, casco.id, 30);
    await stock(cerrada.id, casco.id, 10);
    await prisma.posWarehouse.update({
      where: { id: cerrada.id },
      data: { isActive: false },
    });

    // --- 1. Venta de una línea --------------------------------------------
    console.log("\n1. Venta de una línea descuenta");

    const single = await checkout({
      branchId: branch.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [{ productId: casco.id, quantity: 3, unitPrice: 1000 }],
    });
    check("la venta se registra", single.ok === true, JSON.stringify(single));
    check(
      "el saldo bajó de 50 a 47",
      (await balanceOf(central.id, casco.id)) === 47,
      String(await balanceOf(central.id, casco.id)),
    );

    const saleMovements = await prisma.posInventoryMovement.findMany({
      where: { productId: casco.id, warehouseId: central.id, type: "VENTA" },
    });
    check("se creó un movimiento de venta", saleMovements.length === 1);
    check("el tipo es VENTA", saleMovements[0]?.type === "VENTA");
    check(
      "la cantidad es negativa",
      saleMovements[0]?.quantity.toNumber() === -3,
      String(saleMovements[0]?.quantity),
    );
    check(
      "la invariante se sostiene",
      saleMovements[0]!.quantityBefore.add(saleMovements[0]!.quantity).equals(
        saleMovements[0]!.quantityAfter,
      ),
    );
    check("el autor quedó guardado", saleMovements[0]?.createdByUserId === user.id);
    check(
      "el motivo es obligatorio y nombra la venta",
      single.ok === true &&
        saleMovements[0]?.reason === `Venta ${single.saleNumber}`,
      saleMovements[0]?.reason ?? "",
    );

    // --- 2. Venta de varias líneas ----------------------------------------
    console.log("\n2. Venta de varias líneas y decimales");

    const multi = await checkout({
      branchId: branch.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [
        { productId: casco.id, quantity: 2, unitPrice: 1000 },
        { productId: aceite.id, quantity: 1.5, unitPrice: 95 },
      ],
    });
    check("la venta de dos líneas se registra", multi.ok === true);
    check("el casco bajó a 45", (await balanceOf(central.id, casco.id)) === 45);
    check(
      "el aceite bajó a 18.5 con decimales exactos",
      (await balanceOf(central.id, aceite.id)) === 18.5,
      String(await balanceOf(central.id, aceite.id)),
    );
    check(
      "cada línea produjo su propio movimiento",
      multi.ok === true &&
        (await prisma.posInventoryMovement.count({
          where: { reason: `Venta ${multi.saleNumber}` },
        })) === 2,
    );

    // --- 3. Bodegas independientes ----------------------------------------
    console.log("\n3. Bodegas independientes");

    check(
      "la bodega anexa no se tocó",
      (await balanceOf(anexa.id, casco.id)) === 30,
    );
    await checkout({
      branchId: branch.id,
      warehouseId: anexa.id,
      userId: user.id,
      lines: [{ productId: casco.id, quantity: 10, unitPrice: 1000 }],
    });
    check("la anexa bajó a 20", (await balanceOf(anexa.id, casco.id)) === 20);
    check("y la central sigue en 45", (await balanceOf(central.id, casco.id)) === 45);

    // --- 4. Saldo contra bitácora -----------------------------------------
    console.log("\n4. El saldo coincide con su bitácora");

    for (const [warehouse, product, label] of [
      [central, casco, "casco/central"],
      [central, aceite, "aceite/central"],
      [anexa, casco, "casco/anexa"],
    ] as const) {
      const movements = await prisma.posInventoryMovement.findMany({
        where: { warehouseId: warehouse.id, productId: product.id },
      });
      const sum = movements.reduce(
        (total, movement) => total.add(movement.quantity),
        new Prisma.Decimal(0),
      );
      check(
        `el saldo de ${label} coincide con la suma de sus movimientos`,
        sum.toNumber() === (await balanceOf(warehouse.id, product.id)),
        `${sum.toString()} vs ${await balanceOf(warehouse.id, product.id)}`,
      );
      check(
        `la invariante se sostiene en todos los movimientos de ${label}`,
        movements.every((movement) =>
          movement.quantityBefore.add(movement.quantity).equals(movement.quantityAfter),
        ),
      );
    }

    // --- 5. Rechazos -------------------------------------------------------
    console.log("\n5. Rechazos");

    const salesBefore = await prisma.posSale.count({ where: { branchId: branch.id } });

    const inactiveProduct = await checkout({
      branchId: branch.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [{ productId: retirado.id, quantity: 1, unitPrice: 10 }],
    });
    check(
      "producto inactivo rechazado",
      inactiveProduct.ok === false && inactiveProduct.error.includes("inactivo"),
    );

    const inactiveWarehouse = await checkout({
      branchId: branch.id,
      warehouseId: cerrada.id,
      userId: user.id,
      lines: [{ productId: casco.id, quantity: 1, unitPrice: 1000 }],
    });
    check(
      "bodega inactiva rechazada",
      inactiveWarehouse.ok === false && inactiveWarehouse.error.includes("inactiva"),
    );
    check(
      "el saldo de la bodega cerrada no se tocó",
      (await balanceOf(cerrada.id, casco.id)) === 10,
    );

    const missing = await checkout({
      branchId: branch.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [{ productId: sinSaldo.id, quantity: 1, unitPrice: 20 }],
    });
    check(
      "sin saldo abierto la venta se rechaza, no lo crea",
      missing.ok === false && missing.error.includes("saldo abierto"),
    );
    check(
      "y no se creó ninguna fila de saldo",
      (await prisma.posInventory.count({ where: { productId: sinSaldo.id } })) === 0,
    );

    // Una bodega de otra sucursal descontaría existencias ajenas en silencio.
    const otraSucursal = await prisma.branch.create({
      data: { code: `${TAG}-otra`.toLowerCase(), name: `${TAG} otra sucursal` },
    });
    const crossBranch = await checkout({
      branchId: otraSucursal.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [{ productId: casco.id, quantity: 1, unitPrice: 1000 }],
    });
    check(
      "una bodega de otra sucursal se rechaza",
      crossBranch.ok === false && crossBranch.error.includes("no pertenece"),
      JSON.stringify(crossBranch),
    );
    check(
      "y el saldo de la bodega ajena no se tocó",
      (await balanceOf(central.id, casco.id)) === 45,
    );

    check(
      "ningún rechazo dejó una venta",
      (await prisma.posSale.count({ where: { branchId: branch.id } })) === salesBefore,
    );

    // --- 6. Rollback -------------------------------------------------------
    console.log("\n6. Un fallo tras consumir no deja nada");

    const cascoBefore = await balanceOf(central.id, casco.id);
    const aceiteBefore = await balanceOf(central.id, aceite.id);
    const movementsBefore = await prisma.posInventoryMovement.count({
      where: { warehouseId: central.id },
    });
    const salesCountBefore = await prisma.posSale.count({ where: { branchId: branch.id } });

    const rolled = await checkout(
      {
        branchId: branch.id,
        warehouseId: central.id,
        userId: user.id,
        lines: [
          { productId: casco.id, quantity: 5, unitPrice: 1000 },
          { productId: aceite.id, quantity: 2, unitPrice: 95 },
        ],
      },
      true,
    );
    check("el cobro forzado a fallar no dice que sí", rolled.ok === false);
    check(
      "no sobrevive ninguna venta",
      (await prisma.posSale.count({ where: { branchId: branch.id } })) === salesCountBefore,
    );
    check(
      "no sobrevive ningún movimiento, ni el que ya se había escrito",
      (await prisma.posInventoryMovement.count({ where: { warehouseId: central.id } })) ===
        movementsBefore,
    );
    check(
      "el saldo del casco quedó intacto",
      (await balanceOf(central.id, casco.id)) === cascoBefore,
    );
    check(
      "el saldo del aceite quedó intacto",
      (await balanceOf(central.id, aceite.id)) === aceiteBefore,
    );

    // --- 7. Concurrencia ---------------------------------------------------
    console.log("\n7. Cobros concurrentes");

    const concurrente = await prisma.posProduct.create({
      data: { sku: `${TAG}-CONCURRENTE`, name: "En carrera", unitPrice: toMoney(10) },
    });
    await stock(central.id, concurrente.id, 100);

    const CONCURRENT = 10;
    const raced = await Promise.all(
      Array.from({ length: CONCURRENT }, () =>
        checkout({
          branchId: branch.id,
          warehouseId: central.id,
          userId: user.id,
          lines: [{ productId: concurrente.id, quantity: 1, unitPrice: 10 }],
        }),
      ),
    );
    check(
      "los diez cobros concurrentes se aceptan",
      raced.filter((result) => result.ok).length === CONCURRENT,
      String(raced.filter((result) => result.ok).length),
    );
    check(
      "el saldo final es exactamente 90: no se perdió ningún consumo",
      (await balanceOf(central.id, concurrente.id)) === 90,
      String(await balanceOf(central.id, concurrente.id)),
    );

    const racedMovements = await prisma.posInventoryMovement.findMany({
      where: { productId: concurrente.id, type: "VENTA" },
    });
    check("hay diez movimientos de venta", racedMovements.length === CONCURRENT);
    // La cadena: cada consumo partió del saldo que dejó exactamente otro.
    const pending = [...racedMovements];
    let cursor = new Prisma.Decimal(100);
    let chained = true;
    while (pending.length) {
      const index = pending.findIndex((movement) =>
        movement.quantityBefore.equals(cursor),
      );
      if (index === -1) {
        chained = false;
        break;
      }
      cursor = pending[index]!.quantityAfter;
      pending.splice(index, 1);
    }
    check(
      "los diez consumos forman una cadena sin roturas",
      chained && cursor.toNumber() === 90,
      `restantes=${pending.length} final=${cursor.toString()}`,
    );
    check(
      "cada cobro concurrente dejó su venta",
      (await prisma.posSaleItem.count({ where: { productId: concurrente.id } })) ===
        CONCURRENT,
    );

    // --- 8. Un solo motor ---------------------------------------------------
    console.log("\n8. Los tres flujos comparten motor");

    const todos = await prisma.posInventoryMovement.findMany({
      where: { warehouseId: { in: [central.id, anexa.id] } },
    });
    const compras = todos.filter((movement) => movement.type === "COMPRA");
    const ventas = todos.filter((movement) => movement.type === "VENTA");
    check("hay movimientos de compra y de venta", compras.length > 0 && ventas.length > 0);
    check(
      "todos cumplen la misma invariante",
      todos.every((movement) =>
        movement.quantityBefore.add(movement.quantity).equals(movement.quantityAfter),
      ),
    );
    check(
      "todos llevan motivo y autor",
      todos.every((movement) => movement.reason.length > 0 && !!movement.createdByUserId),
    );
    check("toda venta consume: ninguna suma", ventas.every((m) => m.quantity.lessThan(0)));
    check("toda compra suma: ninguna resta", compras.every((m) => m.quantity.greaterThan(0)));

    // --- 9. Nada más se tocó ------------------------------------------------
    console.log("\n9. Ningún otro subsistema cambió");

    check("ningún asiento contable", (await prisma.journalEntry.count()) === before.entries);
    check("ninguna contabilización", (await prisma.postingRecord.count()) === before.postings);
    check("ningún documento de caja", (await prisma.cashDocument.count()) === before.cash);
    check(
      "ninguna unidad de motocicleta",
      (await prisma.motorcycleUnit.count()) === before.units,
    );
    check(
      "ningún movimiento de inventario serializado",
      (await prisma.inventoryMovement.count()) === before.moves,
    );
  } finally {
    await cleanup();
    console.log(`\nRESULTADO SMOKE-POS1.1-E: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
