/**
 * SMOKE-POS1.1-C — ingresos manuales de inventario.
 *
 *   npm run smoke:pos-inventory-receipts
 *
 * **El primer flujo del repositorio que cambia existencias del mostrador**, así
 * que esta suite sí prueba aritmética de saldos, no solo estructura.
 *
 * Reproduce el cuerpo transaccional de `registerPosInventoryReceiptAction`
 * porque la acción autoriza contra la cookie de sesión y no se puede invocar
 * fuera de una petición. La autorización queda fuera de cobertura, como en el
 * resto de las suites Prisma.
 *
 * Lo que de verdad importa comprobar:
 *
 * 1. **La invariante `después = antes + cantidad`** en todo movimiento escrito.
 * 2. **Movimiento y saldo son inseparables**: un fallo a mitad no deja ni uno ni
 *    otro.
 * 3. **La concurrencia no pierde existencias.** Es la prueba del bloqueo de
 *    fila, y la más difícil de las que aquí se hacen.
 *
 * Limpieza guiada por TAG.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import { sanitizePosQuantity, sanitizePosText } from "@/server/pos/shared";

const prisma = new PrismaClient();
const TAG = `SMOKE-POS11C-${Date.now()}`;

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

type ReceiptResult =
  | { ok: true; movementId: string; before: number; after: number }
  | { ok: false; error: string };

/**
 * Reproduce `registerPosInventoryReceiptAction` sin la autorización.
 *
 * `failAfterMovement` existe solo para el escenario de rollback: fuerza el fallo
 * **después** de escribir el movimiento y **antes** de actualizar el saldo, que
 * es exactamente el instante en que una implementación no transaccional dejaría
 * la bitácora y el saldo divergentes.
 */
async function registerReceipt(
  input: {
    warehouseId: string;
    productId: string;
    quantity: number;
    reason: string;
    notes?: string | null;
    userId: string;
  },
  failAfterMovement = false,
): Promise<ReceiptResult> {
  const quantity = sanitizePosQuantity(input.quantity);
  if (quantity === null) {
    return { ok: false, error: "La cantidad del ingreso debe ser mayor que cero." };
  }
  const reason = sanitizePosText(input.reason, 500);
  if (!reason) return { ok: false, error: "El motivo del ingreso es obligatorio." };

  try {
    return await prisma.$transaction(async (tx) => {
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
      if (!balance) {
        throw new Error("El producto no tiene saldo abierto en esa bodega.");
      }

      const quantityBefore = balance.quantity;
      const movementQuantity = toQuantity(quantity);
      const quantityAfter = quantityBefore.add(movementQuantity);

      const movement = await tx.posInventoryMovement.create({
        data: {
          warehouseId: warehouse.id,
          productId: product.id,
          type: "COMPRA",
          quantity: movementQuantity,
          quantityBefore,
          quantityAfter,
          reason,
          notes: sanitizePosText(input.notes),
          createdByUserId: input.userId,
        },
        select: { id: true },
      });

      if (failAfterMovement) throw new Error("Fallo forzado tras el movimiento.");

      await tx.posInventory.update({
        where: { id: balance.id },
        data: { quantity: quantityAfter },
      });

      return {
        ok: true as const,
        movementId: movement.id,
        before: quantityBefore.toNumber(),
        after: quantityAfter.toNumber(),
      };
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
  await prisma.branch.deleteMany({
    where: { code: { startsWith: TAG.toLowerCase() } },
  });
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
    sales: await prisma.posSale.count(),
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
      data: { branchId: branch.id, code: `${TAG}-CENTRAL`, name: "Bodega central" },
    });
    const anexa = await prisma.posWarehouse.create({
      data: { branchId: branch.id, code: `${TAG}-ANEXA`, name: "Bodega anexa" },
    });
    const cerrada = await prisma.posWarehouse.create({
      data: {
        branchId: branch.id,
        code: `${TAG}-CERRADA`,
        name: "Bodega cerrada",
        isActive: false,
      },
    });
    const filtro = await prisma.posProduct.create({
      data: {
        sku: `${TAG}-FILTRO`,
        name: "Filtro de aceite",
        unitPrice: new Prisma.Decimal("120.00"),
      },
    });
    const aceite = await prisma.posProduct.create({
      data: {
        sku: `${TAG}-ACEITE`,
        name: "Aceite a granel",
        unitPrice: new Prisma.Decimal("95.00"),
        unit: "LITRO",
      },
    });
    const retirado = await prisma.posProduct.create({
      data: {
        sku: `${TAG}-RETIRADO`,
        name: "Producto retirado",
        unitPrice: new Prisma.Decimal("10.00"),
        isActive: false,
      },
    });

    // Saldos abiertos por POS1.1-B; este parche no los crea.
    for (const [warehouse, product] of [
      [central, filtro],
      [central, aceite],
      [anexa, filtro],
      [cerrada, filtro],
      [central, retirado],
    ] as const) {
      await prisma.posInventory.create({
        data: { warehouseId: warehouse.id, productId: product.id },
      });
    }

    const receipt = (
      warehouseId: string,
      productId: string,
      quantity: number,
      reason = "Ingreso manual de prueba",
    ) => registerReceipt({ warehouseId, productId, quantity, reason, userId: user.id });

    // --- 1. Primer ingreso sobre saldo cero -------------------------------
    console.log("\n1. Primer ingreso sobre saldo cero");

    const first = await receipt(central.id, filtro.id, 10);
    check("el ingreso se registra", first.ok === true, JSON.stringify(first));
    if (first.ok) {
      check("el saldo anterior era cero", first.before === 0, String(first.before));
      check("el saldo posterior es 10", first.after === 10, String(first.after));
    }
    check(
      "el saldo guardado quedó en 10",
      (await balanceOf(central.id, filtro.id)) === 10,
    );
    check(
      "quedó exactamente un movimiento",
      (await prisma.posInventoryMovement.count({
        where: { warehouseId: central.id, productId: filtro.id },
      })) === 1,
    );

    // --- 2. Ingresos sucesivos --------------------------------------------
    console.log("\n2. Ingresos sucesivos acumulan");

    const second = await receipt(central.id, filtro.id, 5);
    check("segundo ingreso aceptado", second.ok === true);
    if (second.ok) {
      check("parte del saldo que dejó el primero", second.before === 10);
      check("acumula a 15", second.after === 15);
    }
    await receipt(central.id, filtro.id, 2);
    check(
      "tres ingresos dejan el saldo en 17",
      (await balanceOf(central.id, filtro.id)) === 17,
    );
    check(
      "y tres movimientos en la bitácora",
      (await prisma.posInventoryMovement.count({
        where: { warehouseId: central.id, productId: filtro.id },
      })) === 3,
    );

    // --- 3. Cantidades decimales ------------------------------------------
    console.log("\n3. Cantidades decimales");

    await receipt(central.id, aceite.id, 2.5, "Ingreso de aceite a granel");
    await receipt(central.id, aceite.id, 0.125);
    check(
      "los tres decimales se acumulan exactos",
      (await balanceOf(central.id, aceite.id)) === 2.625,
      String(await balanceOf(central.id, aceite.id)),
    );

    // --- 4. Independencia entre productos y bodegas ------------------------
    console.log("\n4. Productos y bodegas son independientes");

    check(
      "el saldo del filtro no cambió al ingresar aceite",
      (await balanceOf(central.id, filtro.id)) === 17,
    );

    await receipt(anexa.id, filtro.id, 4);
    check("el mismo producto en otra bodega", (await balanceOf(anexa.id, filtro.id)) === 4);
    check(
      "y la bodega central sigue en 17",
      (await balanceOf(central.id, filtro.id)) === 17,
    );

    // --- 5. Rechazos -------------------------------------------------------
    console.log("\n5. Rechazos");

    const zero = await receipt(central.id, filtro.id, 0);
    check("cantidad cero rechazada", zero.ok === false);
    const negative = await receipt(central.id, filtro.id, -5);
    check("cantidad negativa rechazada", negative.ok === false);
    check(
      "ningún rechazo tocó el saldo",
      (await balanceOf(central.id, filtro.id)) === 17,
    );

    const inactiveWarehouse = await receipt(cerrada.id, filtro.id, 3);
    check(
      "bodega inactiva rechazada",
      inactiveWarehouse.ok === false &&
        inactiveWarehouse.error.includes("inactiva"),
    );
    check(
      "y su saldo sigue en cero",
      (await balanceOf(cerrada.id, filtro.id)) === 0,
    );

    const inactiveProduct = await receipt(central.id, retirado.id, 3);
    check(
      "producto inactivo rechazado",
      inactiveProduct.ok === false && inactiveProduct.error.includes("inactivo"),
    );
    check(
      "y su saldo sigue en cero",
      (await balanceOf(central.id, retirado.id)) === 0,
    );

    const noReason = await registerReceipt({
      warehouseId: central.id,
      productId: filtro.id,
      quantity: 1,
      reason: "   ",
      userId: user.id,
    });
    check("motivo vacío rechazado", noReason.ok === false);

    // Este parche no abre saldos: es responsabilidad de POS1.1-B.
    const sinSaldo = await prisma.posProduct.create({
      data: {
        sku: `${TAG}-SINSALDO`,
        name: "Producto sin saldo abierto",
        unitPrice: new Prisma.Decimal("1.00"),
      },
    });
    const missingBalance = await receipt(central.id, sinSaldo.id, 1);
    check(
      "sin saldo abierto el ingreso se rechaza, no lo crea",
      missingBalance.ok === false && missingBalance.error.includes("saldo abierto"),
    );
    check(
      "y no se creó ninguna fila de saldo",
      (await prisma.posInventory.count({ where: { productId: sinSaldo.id } })) === 0,
    );

    // --- 6. Claves foráneas -----------------------------------------------
    console.log("\n6. Claves foráneas y RESTRICT");

    const ghostWarehouse = await receipt("no-existe", filtro.id, 1);
    check("bodega inexistente rechazada", ghostWarehouse.ok === false);
    const ghostProduct = await receipt(central.id, "no-existe", 1);
    check("producto inexistente rechazado", ghostProduct.ok === false);

    let warehouseProtected = false;
    try {
      await prisma.posWarehouse.delete({ where: { id: central.id } });
    } catch {
      warehouseProtected = true;
    }
    check("no se puede borrar una bodega con movimientos", warehouseProtected);

    let productProtected = false;
    try {
      await prisma.posProduct.delete({ where: { id: filtro.id } });
    } catch {
      productProtected = true;
    }
    check("no se puede borrar un producto con movimientos", productProtected);

    let userProtected = false;
    try {
      await prisma.user.delete({ where: { id: user.id } });
    } catch {
      userProtected = true;
    }
    check("no se puede borrar al autor de un movimiento", userProtected);

    check(
      "los intentos fallidos no alteraron el saldo",
      (await balanceOf(central.id, filtro.id)) === 17,
    );

    // --- 7. La invariante --------------------------------------------------
    console.log("\n7. La invariante de la bitácora");

    const allMovements = await prisma.posInventoryMovement.findMany({
      where: { warehouseId: { in: [central.id, anexa.id] } },
    });
    check(
      "hay movimientos que examinar",
      allMovements.length > 0,
      String(allMovements.length),
    );
    const invariantHolds = allMovements.every((movement) =>
      movement.quantityBefore.add(movement.quantity).equals(movement.quantityAfter),
    );
    check(
      "después = antes + cantidad en TODOS los movimientos",
      invariantHolds,
      String(allMovements.length),
    );
    const allPositive = allMovements.every((movement) =>
      movement.quantity.greaterThan(0),
    );
    check("todo ingreso tiene cantidad positiva", allPositive);
    const allTyped = allMovements.every((movement) => movement.type === "COMPRA");
    check("todo ingreso se registra como COMPRA", allTyped);
    const allAuthored = allMovements.every(
      (movement) => movement.createdByUserId === user.id && movement.reason.length > 0,
    );
    check("todo movimiento tiene autor y motivo", allAuthored);

    // El saldo guardado coincide con la suma de la bitácora: es la comprobación
    // que justifica haber desnormalizado el saldo en POS1.1-B.
    const ledgerSum = allMovements
      .filter((movement) => movement.productId === filtro.id && movement.warehouseId === central.id)
      .reduce((sum, movement) => sum.add(movement.quantity), new Prisma.Decimal(0));
    check(
      "el saldo guardado coincide con la suma de sus movimientos",
      ledgerSum.toNumber() === (await balanceOf(central.id, filtro.id)),
      `${ledgerSum.toString()} vs ${await balanceOf(central.id, filtro.id)}`,
    );

    // --- 8. Rollback -------------------------------------------------------
    console.log("\n8. Un fallo a mitad no deja nada");

    const balanceBeforeRollback = await balanceOf(central.id, filtro.id);
    const movementsBeforeRollback = await prisma.posInventoryMovement.count({
      where: { warehouseId: central.id, productId: filtro.id },
    });

    const rolled = await registerReceipt(
      {
        warehouseId: central.id,
        productId: filtro.id,
        quantity: 99,
        reason: "Este ingreso debe deshacerse",
        userId: user.id,
      },
      true,
    );
    check("el ingreso forzado a fallar no dice que sí", rolled.ok === false);
    check(
      "el saldo quedó exactamente como estaba",
      (await balanceOf(central.id, filtro.id)) === balanceBeforeRollback,
    );
    check(
      "y el movimiento ya escrito se deshizo con la transacción",
      (await prisma.posInventoryMovement.count({
        where: { warehouseId: central.id, productId: filtro.id },
      })) === movementsBeforeRollback,
    );

    // --- 9. Concurrencia ---------------------------------------------------
    console.log("\n9. Concurrencia: el bloqueo de fila no pierde existencias");

    const concurrentProduct = await prisma.posProduct.create({
      data: {
        sku: `${TAG}-CONCURRENTE`,
        name: "Producto en carrera",
        unitPrice: new Prisma.Decimal("50.00"),
      },
    });
    await prisma.posInventory.create({
      data: { warehouseId: central.id, productId: concurrentProduct.id },
    });

    // Diez ingresos de 1 simultáneos contra el mismo saldo. Sin `FOR UPDATE`,
    // bajo READ COMMITTED, varios leerían el mismo "antes" y el saldo final
    // quedaría por debajo de 10: la actualización perdida clásica.
    const CONCURRENT = 10;
    const results = await Promise.all(
      Array.from({ length: CONCURRENT }, (_, index) =>
        receipt(central.id, concurrentProduct.id, 1, `Ingreso concurrente ${index}`),
      ),
    );
    const accepted = results.filter((result) => result.ok).length;
    check(
      "los diez ingresos concurrentes se aceptan",
      accepted === CONCURRENT,
      String(accepted),
    );
    check(
      "el saldo final es exactamente 10: no se perdió ninguno",
      (await balanceOf(central.id, concurrentProduct.id)) === CONCURRENT,
      String(await balanceOf(central.id, concurrentProduct.id)),
    );

    const concurrentMovements = await prisma.posInventoryMovement.findMany({
      where: { productId: concurrentProduct.id },
      orderBy: { quantityBefore: "asc" },
    });
    check(
      "hay diez movimientos",
      concurrentMovements.length === CONCURRENT,
      String(concurrentMovements.length),
    );
    // La prueba real del bloqueo: si dos hubieran leído el mismo saldo, habría
    // dos movimientos con el mismo `quantityBefore`.
    const befores = concurrentMovements.map((movement) => movement.quantityBefore.toString());
    check(
      "ningún par de movimientos leyó el mismo saldo anterior",
      new Set(befores).size === CONCURRENT,
      befores.join(","),
    );
    // Y encadenan sin huecos: 0→1→2→…→10.
    const chained = concurrentMovements.every(
      (movement, index) => movement.quantityBefore.toNumber() === index,
    );
    check("los movimientos encadenan sin huecos", chained, befores.join(","));

    // --- 10. Nada más se tocó ---------------------------------------------
    console.log("\n10. Ningún otro subsistema cambió");

    check(
      "ningún asiento contable",
      (await prisma.journalEntry.count()) === before.entries,
    );
    check(
      "ninguna contabilización",
      (await prisma.postingRecord.count()) === before.postings,
    );
    check(
      "ningún documento de caja",
      (await prisma.cashDocument.count()) === before.cash,
    );
    check(
      "ninguna unidad de motocicleta",
      (await prisma.motorcycleUnit.count()) === before.units,
    );
    check(
      "ningún movimiento de inventario serializado",
      (await prisma.inventoryMovement.count()) === before.moves,
    );
    check("ninguna venta POS", (await prisma.posSale.count()) === before.sales);
  } finally {
    await cleanup();
    console.log(`\nRESULTADO SMOKE-POS1.1-C: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
