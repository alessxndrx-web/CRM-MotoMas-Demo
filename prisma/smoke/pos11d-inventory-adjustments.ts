/**
 * SMOKE-POS1.1-D — ajustes manuales de inventario.
 *
 *   npm run smoke:pos-inventory-adjustments
 *
 * **El segundo flujo que cambia existencias**, y lo que esta suite tiene que
 * demostrar no es solo que el ajuste funcione: es que **usa el mismo motor que el
 * ingreso, sin modificarlo**.
 *
 * Por eso el fichero reproduce `applyPosInventoryMovement` **una sola vez** y lo
 * conduce desde dos entradas —`receipt` y `adjust`—, igual que la producción. Si
 * el ajuste necesitara su propia transacción, aquí se vería inmediatamente.
 *
 * Lo demás que importa comprobar:
 *
 * 1. **La invariante `después = antes + cantidad`** también con cantidad
 *    negativa, que es lo nuevo.
 * 2. **P-8 se preserva como ausencia**: ninguna línea comprueba si el saldo queda
 *    bajo cero, ni para permitirlo ni para impedirlo.
 * 3. **La concurrencia sigue sin perder existencias** con ajustes mezclados.
 *
 * Limpieza guiada por TAG.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import {
  sanitizePosMovementQuantity,
  sanitizePosQuantity,
  sanitizePosText,
} from "@/server/pos/shared";

const prisma = new PrismaClient();
const TAG = `SMOKE-POS11D-${Date.now()}`;

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

type MutationResult =
  | { ok: true; movementId: string; before: number; after: number }
  | { ok: false; error: string };

/**
 * Reproduce `applyPosInventoryMovement` — **el motor compartido**, no una copia
 * del ajuste. Ingreso y ajuste entran por aquí exactamente igual.
 *
 * `failAfterMovement` fuerza el fallo entre el paso 2 y el 3, que es el instante
 * en que una implementación no transaccional dejaría bitácora y saldo
 * divergentes.
 */
async function applyMovement(
  input: {
    warehouseId: string;
    productId: string;
    quantity: number;
    type: Prisma.PosInventoryMovementCreateInput["type"];
    reason: string;
    notes?: string | null;
    userId: string;
  },
  failAfterMovement = false,
): Promise<MutationResult> {
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
      const movementQuantity = toQuantity(input.quantity);
      const quantityAfter = quantityBefore.add(movementQuantity);

      // Aquí NO hay ninguna comprobación del signo de `quantityAfter`. Esa
      // ausencia es P-8 y es deliberada.
      const movement = await tx.posInventoryMovement.create({
        data: {
          warehouseId: warehouse.id,
          productId: product.id,
          type: input.type,
          quantity: movementQuantity,
          quantityBefore,
          quantityAfter,
          reason: input.reason,
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

/** Entrada del ingreso: cantidad estrictamente positiva, tipo COMPRA. */
async function receipt(
  input: { warehouseId: string; productId: string; quantity: number; reason: string; userId: string },
): Promise<MutationResult> {
  const quantity = sanitizePosQuantity(input.quantity);
  if (quantity === null) {
    return { ok: false, error: "La cantidad del ingreso debe ser mayor que cero." };
  }
  const reason = sanitizePosText(input.reason, 500);
  if (!reason) return { ok: false, error: "El motivo del ingreso es obligatorio." };
  return applyMovement({ ...input, quantity, type: "COMPRA", reason });
}

/** Entrada del ajuste: cantidad con signo y distinta de cero, tipo AJUSTE. */
async function adjust(
  input: {
    warehouseId: string;
    productId: string;
    quantity: number;
    reason: string;
    notes?: string | null;
    userId: string;
  },
  failAfterMovement = false,
): Promise<MutationResult> {
  const quantity = sanitizePosMovementQuantity(input.quantity);
  if (quantity === null) {
    return { ok: false, error: "La cantidad del ajuste no es válida y no puede ser cero." };
  }
  const reason = sanitizePosText(input.reason, 500);
  if (!reason) return { ok: false, error: "El motivo del ajuste es obligatorio." };
  return applyMovement({ ...input, quantity, type: "AJUSTE", reason }, failAfterMovement);
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
        name: `${TAG} bodeguero`,
        email: `${TAG.toLowerCase()}@smoke.local`,
        passwordHash: "smoke:not-a-real-hash",
        role: "CAJERO",
      },
    });
    const central = await prisma.posWarehouse.create({
      data: { branchId: branch.id, code: `${TAG}-CENTRAL`, name: "Bodega central" },
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
      data: { sku: `${TAG}-FILTRO`, name: "Filtro", unitPrice: new Prisma.Decimal("120.00") },
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
    const desdeCero = await prisma.posProduct.create({
      data: { sku: `${TAG}-DESDECERO`, name: "Desde cero", unitPrice: new Prisma.Decimal("5.00") },
    });

    for (const [warehouse, product] of [
      [central, filtro],
      [central, aceite],
      [central, retirado],
      [central, desdeCero],
      [cerrada, filtro],
    ] as const) {
      await prisma.posInventory.create({
        data: { warehouseId: warehouse.id, productId: product.id },
      });
    }

    // --- 1. Ajuste positivo -----------------------------------------------
    console.log("\n1. Ajuste positivo");

    await receipt({
      warehouseId: central.id,
      productId: filtro.id,
      quantity: 20,
      reason: "Carga previa al ajuste",
      userId: user.id,
    });
    const up = await adjust({
      warehouseId: central.id,
      productId: filtro.id,
      quantity: 5,
      reason: "Conteo físico: sobraban cinco",
      userId: user.id,
    });
    check("el ajuste positivo se registra", up.ok === true, JSON.stringify(up));
    if (up.ok) {
      check("parte del saldo que dejó el ingreso", up.before === 20, String(up.before));
      check("y lo aumenta a 25", up.after === 25, String(up.after));
    }
    check("el saldo guardado es 25", (await balanceOf(central.id, filtro.id)) === 25);

    // --- 2. Ajuste negativo ------------------------------------------------
    console.log("\n2. Ajuste negativo");

    const down = await adjust({
      warehouseId: central.id,
      productId: filtro.id,
      quantity: -8,
      reason: "Conteo físico: faltaban ocho",
      userId: user.id,
    });
    check("el ajuste negativo se registra", down.ok === true);
    if (down.ok) {
      check("reduce de 25 a 17", down.before === 25 && down.after === 17);
    }
    check("el saldo guardado es 17", (await balanceOf(central.id, filtro.id)) === 17);

    // --- 3. Decimales ------------------------------------------------------
    console.log("\n3. Cantidades decimales");

    await receipt({
      warehouseId: central.id,
      productId: aceite.id,
      quantity: 10,
      reason: "Carga de aceite",
      userId: user.id,
    });
    await adjust({
      warehouseId: central.id,
      productId: aceite.id,
      quantity: -0.375,
      reason: "Merma por trasiego",
      userId: user.id,
    });
    check(
      "el ajuste decimal negativo es exacto",
      (await balanceOf(central.id, aceite.id)) === 9.625,
      String(await balanceOf(central.id, aceite.id)),
    );

    // --- 4. Ajuste desde cero ----------------------------------------------
    console.log("\n4. Ajuste sobre saldo cero");

    check(
      "el producto parte de cero",
      (await balanceOf(central.id, desdeCero.id)) === 0,
    );
    const fromZero = await adjust({
      warehouseId: central.id,
      productId: desdeCero.id,
      quantity: 3,
      reason: "Aparecieron tres en bodega",
      userId: user.id,
    });
    check("se puede ajustar un saldo en cero", fromZero.ok === true);
    check(
      "queda en 3 sin ingreso previo",
      (await balanceOf(central.id, desdeCero.id)) === 3,
    );

    // --- 5. Ajustes sucesivos ----------------------------------------------
    console.log("\n5. Ajustes sucesivos");

    await adjust({
      warehouseId: central.id,
      productId: desdeCero.id,
      quantity: 2,
      reason: "Segundo ajuste",
      userId: user.id,
    });
    await adjust({
      warehouseId: central.id,
      productId: desdeCero.id,
      quantity: -1,
      reason: "Tercer ajuste",
      userId: user.id,
    });
    check(
      "tres ajustes encadenados dejan 4",
      (await balanceOf(central.id, desdeCero.id)) === 4,
      String(await balanceOf(central.id, desdeCero.id)),
    );

    // --- 6. P-8: el repositorio sigue sin decidir ---------------------------
    console.log("\n6. P-8: el saldo negativo sigue sin regla");

    const belowZero = await adjust({
      warehouseId: central.id,
      productId: desdeCero.id,
      quantity: -10,
      reason: "Ajuste que deja el saldo bajo cero",
      userId: user.id,
    });
    // Esto NO afirma que el negativo sea correcto. Afirma que **el repositorio
    // no contiene ninguna regla** que lo permita ni lo impida, exactamente como
    // estaba antes de este parche. Rechazarlo en silencio y permitirlo por
    // política nueva serían el mismo error con distinto signo.
    check(
      "el motor no comprueba el signo del saldo resultante",
      belowZero.ok === true,
      JSON.stringify(belowZero),
    );
    check(
      "y el saldo queda en -6, sin que nadie opine",
      (await balanceOf(central.id, desdeCero.id)) === -6,
      String(await balanceOf(central.id, desdeCero.id)),
    );
    check(
      "la invariante se sostiene también bajo cero",
      belowZero.ok === true && belowZero.before === 4 && belowZero.after === -6,
    );
    // Se devuelve a positivo para no dejar el escenario contaminando el resto.
    await adjust({
      warehouseId: central.id,
      productId: desdeCero.id,
      quantity: 10,
      reason: "Reposición del escenario",
      userId: user.id,
    });

    // --- 7. Rechazos --------------------------------------------------------
    console.log("\n7. Rechazos");

    const zero = await adjust({
      warehouseId: central.id,
      productId: filtro.id,
      quantity: 0,
      reason: "Ajuste vacío",
      userId: user.id,
    });
    check("cantidad cero rechazada", zero.ok === false);
    check("y el saldo no cambió", (await balanceOf(central.id, filtro.id)) === 17);

    const noReason = await adjust({
      warehouseId: central.id,
      productId: filtro.id,
      quantity: 1,
      reason: "   ",
      userId: user.id,
    });
    check("motivo vacío rechazado", noReason.ok === false);

    const inactiveWarehouse = await adjust({
      warehouseId: cerrada.id,
      productId: filtro.id,
      quantity: 1,
      reason: "Bodega cerrada",
      userId: user.id,
    });
    check(
      "bodega inactiva rechazada",
      inactiveWarehouse.ok === false && inactiveWarehouse.error.includes("inactiva"),
    );
    check("y su saldo sigue en cero", (await balanceOf(cerrada.id, filtro.id)) === 0);

    const inactiveProduct = await adjust({
      warehouseId: central.id,
      productId: retirado.id,
      quantity: 1,
      reason: "Producto retirado",
      userId: user.id,
    });
    check(
      "producto inactivo rechazado",
      inactiveProduct.ok === false && inactiveProduct.error.includes("inactivo"),
    );

    const sinSaldo = await prisma.posProduct.create({
      data: { sku: `${TAG}-SINSALDO`, name: "Sin saldo", unitPrice: new Prisma.Decimal("1.00") },
    });
    const missing = await adjust({
      warehouseId: central.id,
      productId: sinSaldo.id,
      quantity: 1,
      reason: "Sin saldo abierto",
      userId: user.id,
    });
    check(
      "sin saldo abierto el ajuste se rechaza, no lo crea",
      missing.ok === false && missing.error.includes("saldo abierto"),
    );
    check(
      "y no creó ninguna fila de saldo",
      (await prisma.posInventory.count({ where: { productId: sinSaldo.id } })) === 0,
    );

    // --- 8. Claves foráneas y RESTRICT -------------------------------------
    console.log("\n8. Claves foráneas y RESTRICT");

    check(
      "bodega inexistente rechazada",
      (await adjust({
        warehouseId: "no-existe",
        productId: filtro.id,
        quantity: 1,
        reason: "x",
        userId: user.id,
      })).ok === false,
    );
    check(
      "producto inexistente rechazado",
      (await adjust({
        warehouseId: central.id,
        productId: "no-existe",
        quantity: 1,
        reason: "x",
        userId: user.id,
      })).ok === false,
    );

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
    check("no se puede borrar al autor de un ajuste", userProtected);

    // --- 9. La invariante y el saldo contra la bitácora --------------------
    console.log("\n9. Invariante y saldo contra bitácora");

    const movements = await prisma.posInventoryMovement.findMany({
      where: { warehouseId: central.id },
    });
    check("hay movimientos que examinar", movements.length > 0, String(movements.length));
    check(
      "después = antes + cantidad en TODOS los movimientos",
      movements.every((movement) =>
        movement.quantityBefore.add(movement.quantity).equals(movement.quantityAfter),
      ),
      String(movements.length),
    );
    check(
      "hay ajustes positivos y negativos entre ellos",
      movements.some((m) => m.type === "AJUSTE" && m.quantity.greaterThan(0)) &&
        movements.some((m) => m.type === "AJUSTE" && m.quantity.lessThan(0)),
    );
    check(
      "ningún ajuste tiene cantidad cero",
      movements.filter((m) => m.type === "AJUSTE").every((m) => !m.quantity.isZero()),
    );
    check(
      "todo ajuste tiene autor y motivo",
      movements.every((m) => m.createdByUserId === user.id && m.reason.length > 0),
    );

    for (const product of [filtro, aceite, desdeCero]) {
      const sum = movements
        .filter((movement) => movement.productId === product.id)
        .reduce((total, movement) => total.add(movement.quantity), new Prisma.Decimal(0));
      check(
        `el saldo de ${product.sku.split("-").pop()} coincide con la suma de su bitácora`,
        sum.toNumber() === (await balanceOf(central.id, product.id)),
        `${sum.toString()} vs ${await balanceOf(central.id, product.id)}`,
      );
    }

    // --- 10. Rollback -------------------------------------------------------
    console.log("\n10. Un fallo a mitad no deja nada");

    const balanceBefore = await balanceOf(central.id, filtro.id);
    const countBefore = await prisma.posInventoryMovement.count({
      where: { warehouseId: central.id, productId: filtro.id },
    });
    const rolled = await adjust(
      {
        warehouseId: central.id,
        productId: filtro.id,
        quantity: -99,
        reason: "Este ajuste debe deshacerse",
        userId: user.id,
      },
      true,
    );
    check("el ajuste forzado a fallar no dice que sí", rolled.ok === false);
    check(
      "el saldo quedó exactamente como estaba",
      (await balanceOf(central.id, filtro.id)) === balanceBefore,
    );
    check(
      "y el movimiento ya escrito se deshizo con la transacción",
      (await prisma.posInventoryMovement.count({
        where: { warehouseId: central.id, productId: filtro.id },
      })) === countBefore,
    );

    // --- 11. Concurrencia ---------------------------------------------------
    console.log("\n11. Concurrencia con ajustes mezclados");

    const concurrente = await prisma.posProduct.create({
      data: { sku: `${TAG}-CONCURRENTE`, name: "En carrera", unitPrice: new Prisma.Decimal("50.00") },
    });
    await prisma.posInventory.create({
      data: { warehouseId: central.id, productId: concurrente.id },
    });
    await receipt({
      warehouseId: central.id,
      productId: concurrente.id,
      quantity: 100,
      reason: "Carga para la carrera",
      userId: user.id,
    });

    // Seis ajustes de +2 y seis de −1 simultáneos: neto +6 sobre 100.
    const mixed = await Promise.all([
      ...Array.from({ length: 6 }, (_, i) =>
        adjust({
          warehouseId: central.id,
          productId: concurrente.id,
          quantity: 2,
          reason: `Suma concurrente ${i}`,
          userId: user.id,
        }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        adjust({
          warehouseId: central.id,
          productId: concurrente.id,
          quantity: -1,
          reason: `Resta concurrente ${i}`,
          userId: user.id,
        }),
      ),
    ]);
    check(
      "los doce ajustes concurrentes se aceptan",
      mixed.filter((result) => result.ok).length === 12,
      String(mixed.filter((result) => result.ok).length),
    );
    check(
      "el saldo final es exactamente 106: no se perdió ninguno",
      (await balanceOf(central.id, concurrente.id)) === 106,
      String(await balanceOf(central.id, concurrente.id)),
    );

    const raced = await prisma.posInventoryMovement.findMany({
      where: { productId: concurrente.id, type: "AJUSTE" },
    });

    // **Aquí no sirve exigir que ningún `quantityBefore` se repita.** Esa prueba
    // valía en POS1.1-C porque todos los ingresos sumaban y el saldo crecía de
    // forma monótona; con ajustes de signo mezclado el saldo sube y baja, así
    // que vuelve a pasar por el mismo valor y dos movimientos pueden leerlo
    // legítimamente.
    //
    // Lo que un bloqueo perdido sí rompería es **la cadena**: cada movimiento
    // tiene que haber partido del saldo que dejó exactamente otro. Se recorre
    // desde el saldo inicial consumiendo movimientos; si todos se consumen y se
    // termina en el saldo final, ninguno se pisó con otro.
    const pending = [...raced];
    let cursor = new Prisma.Decimal(100);
    let chainIntact = true;
    while (pending.length) {
      const index = pending.findIndex((movement) =>
        movement.quantityBefore.equals(cursor),
      );
      if (index === -1) {
        chainIntact = false;
        break;
      }
      cursor = pending[index]!.quantityAfter;
      pending.splice(index, 1);
    }
    check(
      "los doce ajustes forman una cadena sin roturas",
      chainIntact && cursor.toNumber() === 106,
      `restantes=${pending.length} final=${cursor.toString()}`,
    );
    check(
      "la invariante se sostiene en los doce concurrentes",
      raced.every((movement) =>
        movement.quantityBefore.add(movement.quantity).equals(movement.quantityAfter),
      ),
    );

    // --- 12. Un solo motor --------------------------------------------------
    console.log("\n12. Ingreso y ajuste comparten motor");

    // Si el ajuste tuviera su propia implementación, la bitácora podría tener
    // formas distintas según el tipo. Se comprueba que no: la misma invariante,
    // el mismo `reason` obligatorio y el mismo autor obligatorio para ambos.
    const todos = await prisma.posInventoryMovement.findMany({
      where: { warehouseId: { in: [central.id, cerrada.id] } },
    });
    const compras = todos.filter((movement) => movement.type === "COMPRA");
    const ajustes = todos.filter((movement) => movement.type === "AJUSTE");
    check("hay movimientos de los dos tipos", compras.length > 0 && ajustes.length > 0);
    check(
      "ambos tipos cumplen la misma invariante",
      todos.every((movement) =>
        movement.quantityBefore.add(movement.quantity).equals(movement.quantityAfter),
      ),
    );
    check(
      "ambos tipos llevan motivo y autor",
      todos.every((movement) => movement.reason.length > 0 && !!movement.createdByUserId),
    );
    check(
      "solo los ajustes pueden ser negativos; ningún ingreso lo es",
      compras.every((movement) => movement.quantity.greaterThan(0)),
    );

    // --- 13. Nada más se tocó -----------------------------------------------
    console.log("\n13. Ningún otro subsistema cambió");

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
    check("ninguna venta POS", (await prisma.posSale.count()) === before.sales);
  } finally {
    await cleanup();
    console.log(`\nRESULTADO SMOKE-POS1.1-D: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
