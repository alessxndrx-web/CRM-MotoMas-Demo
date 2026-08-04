/**
 * SMOKE-POS1.1-B — cimiento del inventario del mostrador.
 *
 *   npm run smoke:pos-inventory-foundation
 *
 * Este parche **no mueve ningún saldo**, así que lo que la suite puede probar no
 * es aritmética de existencias: es que las estructuras aguanten lo que los
 * parches futuros les van a exigir.
 *
 * Lo que de verdad importa comprobar:
 *
 * 1. **Los dos inventarios no se tocan.** Ninguna moto, ninguna unidad, ningún
 *    `InventoryMovement`. Es la premisa que justificó crear un modelo aparte.
 * 2. **La identidad del saldo aguanta.** Un producto no puede tener dos saldos en
 *    la misma bodega, y sí puede tenerlos en bodegas distintas.
 * 3. **Las claves foráneas protegen.** Borrar una bodega con saldo o un producto
 *    con historial debe fallar, no arrastrar filas.
 * 4. **La invariante de la bitácora se sostiene**: `después = antes + cantidad`.
 *
 * Limpieza guiada por TAG: un fixture a medio construir se borra igual que uno
 * completo.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import {
  isPosInventoryMovementTypeValue,
  posInventoryMovementTypeValues,
  sanitizePosInventoryQuantity,
  sanitizePosMovementQuantity,
} from "@/server/pos/shared";

const prisma = new PrismaClient();
const TAG = `SMOKE-POS11B-${Date.now()}`;

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

function qty(value: number) {
  return new Prisma.Decimal(value.toFixed(3));
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

async function main() {
  await cleanup();

  // Estado del inventario serializado y de la contabilidad ANTES de todo.
  const before = {
    units: await prisma.motorcycleUnit.count(),
    moves: await prisma.inventoryMovement.count(),
    entries: await prisma.journalEntry.count(),
    postings: await prisma.postingRecord.count(),
    cash: await prisma.cashDocument.count(),
    sales: await prisma.posSale.count(),
    saleItems: await prisma.posSaleItem.count(),
  };

  try {
    // --- Fixtures ---------------------------------------------------------
    const branchA = await prisma.branch.create({
      data: { code: `${TAG}-a`.toLowerCase(), name: `${TAG} sucursal A` },
    });
    const branchB = await prisma.branch.create({
      data: { code: `${TAG}-b`.toLowerCase(), name: `${TAG} sucursal B` },
    });
    const user = await prisma.user.create({
      data: {
        name: `${TAG} cajero`,
        email: `${TAG.toLowerCase()}@smoke.local`,
        passwordHash: "smoke:not-a-real-hash",
        role: "CAJERO",
      },
    });
    const filtro = await prisma.posProduct.create({
      data: {
        sku: `${TAG}-FILTRO`,
        name: "Filtro de aceite",
        unitPrice: new Prisma.Decimal("120.00"),
        unit: "UNIDAD",
        minimumStock: qty(5),
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

    // --- 1. Bodegas -------------------------------------------------------
    console.log("\n1. Bodegas");

    const central = await prisma.posWarehouse.create({
      data: {
        branchId: branchA.id,
        code: `${TAG}-PRINCIPAL`,
        name: "Bodega principal",
      },
    });
    check("bodega creada", !!central.id);
    check("nace activa", central.isActive === true);
    check("pertenece a una sucursal", central.branchId === branchA.id);

    let duplicate = false;
    try {
      await prisma.posWarehouse.create({
        data: {
          branchId: branchA.id,
          code: `${TAG}-PRINCIPAL`,
          name: "Otra con el mismo código",
        },
      });
    } catch {
      duplicate = true;
    }
    check("código duplicado en la misma sucursal rechazado", duplicate);

    // El mismo código en otra sucursal SÍ debe poder existir: la unicidad es por
    // sucursal, no global.
    const otherBranchSameCode = await prisma.posWarehouse.create({
      data: {
        branchId: branchB.id,
        code: `${TAG}-PRINCIPAL`,
        name: "Principal de la otra sucursal",
      },
    });
    check(
      "el mismo código en otra sucursal sí es válido",
      !!otherBranchSameCode.id,
    );

    const secundaria = await prisma.posWarehouse.create({
      data: {
        branchId: branchA.id,
        code: `${TAG}-SECUNDARIA`,
        name: "Bodega secundaria",
      },
    });
    check("dos bodegas en la misma sucursal", !!secundaria.id);

    const inactive = await prisma.posWarehouse.update({
      where: { id: secundaria.id },
      data: { isActive: false },
    });
    check("una bodega se retira con isActive, no se borra", inactive.isActive === false);
    await prisma.posWarehouse.update({
      where: { id: secundaria.id },
      data: { isActive: true },
    });

    // --- 2. Saldos --------------------------------------------------------
    console.log("\n2. Saldos");

    const balance = await prisma.posInventory.create({
      data: { warehouseId: central.id, productId: filtro.id },
    });
    check("fila de saldo creada", !!balance.id);
    check(
      "el saldo empieza en cero",
      Number(balance.quantity) === 0,
      String(balance.quantity),
    );

    let duplicateBalance = false;
    try {
      await prisma.posInventory.create({
        data: { warehouseId: central.id, productId: filtro.id },
      });
    } catch {
      duplicateBalance = true;
    }
    check(
      "un producto no puede tener dos saldos en la misma bodega",
      duplicateBalance,
    );

    // El mismo producto en dos bodegas: saldos independientes.
    const balanceOther = await prisma.posInventory.create({
      data: { warehouseId: secundaria.id, productId: filtro.id },
    });
    check(
      "el mismo producto tiene saldo en varias bodegas",
      !!balanceOther.id && balanceOther.id !== balance.id,
    );
    check(
      "los saldos de dos bodegas son independientes",
      Number(balanceOther.quantity) === 0,
    );

    // Varios productos en una bodega.
    const balanceAceite = await prisma.posInventory.create({
      data: { warehouseId: central.id, productId: aceite.id },
    });
    check("una bodega guarda varios productos", !!balanceAceite.id);
    check(
      "la bodega cuenta dos filas de saldo",
      (await prisma.posInventory.count({ where: { warehouseId: central.id } })) === 2,
    );

    // --- 3. Movimientos ---------------------------------------------------
    console.log("\n3. Movimientos");

    const movement = await prisma.posInventoryMovement.create({
      data: {
        warehouseId: central.id,
        productId: filtro.id,
        type: "INICIAL",
        quantity: qty(10),
        quantityBefore: qty(0),
        quantityAfter: qty(10),
        reason: "Carga inicial de inventario",
        createdByUserId: user.id,
      },
    });
    check("movimiento creado", !!movement.id);
    check("tipo INICIAL guardado", movement.type === "INICIAL");
    check("motivo obligatorio guardado", movement.reason.length > 0);
    check("autor guardado", movement.createdByUserId === user.id);
    check(
      "invariante: después = antes + cantidad",
      Number(movement.quantityAfter) ===
        Number(movement.quantityBefore) + Number(movement.quantity),
    );

    // Salida: cantidad negativa, y la invariante se sostiene igual.
    const exit = await prisma.posInventoryMovement.create({
      data: {
        warehouseId: central.id,
        productId: filtro.id,
        type: "VENTA",
        quantity: qty(-3),
        quantityBefore: qty(10),
        quantityAfter: qty(7),
        reason: "Venta de mostrador",
        createdByUserId: user.id,
      },
    });
    check("una salida se registra con cantidad negativa", Number(exit.quantity) === -3);
    check(
      "la invariante se sostiene también en la salida",
      Number(exit.quantityAfter) ===
        Number(exit.quantityBefore) + Number(exit.quantity),
    );

    // Tres decimales sobreviven al viaje a Postgres.
    const fractional = await prisma.posInventoryMovement.create({
      data: {
        warehouseId: central.id,
        productId: aceite.id,
        type: "COMPRA",
        quantity: qty(2.5),
        quantityBefore: qty(0),
        quantityAfter: qty(2.5),
        reason: "Compra de aceite a granel",
        createdByUserId: user.id,
      },
    });
    check(
      "tres decimales sobreviven a la base",
      Number(fractional.quantity) === 2.5,
      String(fractional.quantity),
    );

    // --- 4. Cobertura del enum -------------------------------------------
    console.log("\n4. Cobertura del enum");

    check(
      "el vocabulario tiene los siete tipos del encargo",
      posInventoryMovementTypeValues.length === 7,
      String(posInventoryMovementTypeValues.length),
    );
    check("INICIAL reconocido", isPosInventoryMovementTypeValue("INICIAL"));
    check("tipo inventado rechazado", !isPosInventoryMovementTypeValue("MERMA"));

    // Cada valor de TypeScript existe en el enum de PostgreSQL.
    let allTypesWritable = true;
    for (const type of posInventoryMovementTypeValues) {
      try {
        await prisma.posInventoryMovement.create({
          data: {
            warehouseId: central.id,
            productId: filtro.id,
            type,
            quantity: qty(1),
            quantityBefore: qty(0),
            quantityAfter: qty(1),
            reason: `Cobertura de ${type}`,
            createdByUserId: user.id,
          },
        });
      } catch {
        allTypesWritable = false;
      }
    }
    check("los siete tipos son escribibles en la base", allTypesWritable);

    // --- 5. Protección referencial ---------------------------------------
    console.log("\n5. Protección referencial");

    let warehouseProtected = false;
    try {
      await prisma.posWarehouse.delete({ where: { id: central.id } });
    } catch {
      warehouseProtected = true;
    }
    check("no se puede borrar una bodega en uso", warehouseProtected);

    let productProtected = false;
    try {
      await prisma.posProduct.delete({ where: { id: filtro.id } });
    } catch {
      productProtected = true;
    }
    check("no se puede borrar un producto con saldo", productProtected);

    check(
      "el intento fallido no borró nada de la bodega",
      (await prisma.posWarehouse.count({ where: { id: central.id } })) === 1,
    );
    check(
      "el intento fallido no borró el saldo",
      (await prisma.posInventory.count({ where: { warehouseId: central.id } })) === 2,
    );

    let orphanBalance = false;
    try {
      await prisma.posInventory.create({
        data: { warehouseId: "no-existe", productId: filtro.id },
      });
    } catch {
      orphanBalance = true;
    }
    check("bodega inexistente rechazada por la clave foránea", orphanBalance);

    let orphanMovement = false;
    try {
      await prisma.posInventoryMovement.create({
        data: {
          warehouseId: central.id,
          productId: "no-existe",
          type: "AJUSTE",
          quantity: qty(1),
          quantityBefore: qty(0),
          quantityAfter: qty(1),
          reason: "Producto inexistente",
          createdByUserId: user.id,
        },
      });
    } catch {
      orphanMovement = true;
    }
    check("producto inexistente rechazado por la clave foránea", orphanMovement);

    // --- 5b. Concurrencia al abrir un saldo -------------------------------
    console.log("\n5b. Abrir un saldo es idempotente bajo concurrencia");

    // Reproduce la carrera que `openPosInventoryAction` tiene que absorber: dos
    // aperturas simultáneas del mismo par. Una gana, la otra choca contra el
    // índice único, y el resultado debe ser **una** fila, no una excepción.
    const racedProduct = await prisma.posProduct.create({
      data: {
        sku: `${TAG}-CARRERA`,
        name: "Producto en carrera",
        unitPrice: new Prisma.Decimal("10.00"),
      },
    });
    const attempts = await Promise.allSettled([
      prisma.posInventory.create({
        data: { warehouseId: central.id, productId: racedProduct.id },
      }),
      prisma.posInventory.create({
        data: { warehouseId: central.id, productId: racedProduct.id },
      }),
    ]);
    const won = attempts.filter((result) => result.status === "fulfilled").length;
    check("exactamente una apertura concurrente gana", won === 1, String(won));
    check(
      "queda exactamente una fila de saldo para ese par",
      (await prisma.posInventory.count({
        where: { warehouseId: central.id, productId: racedProduct.id },
      })) === 1,
    );

    // --- 6. Saneadores ----------------------------------------------------
    console.log("\n6. Saneadores");

    check("cantidad de movimiento positiva aceptada", sanitizePosMovementQuantity(5) === 5);
    check("cantidad de movimiento negativa aceptada", sanitizePosMovementQuantity(-5) === -5);
    check("un movimiento de cero se rechaza", sanitizePosMovementQuantity(0) === null);
    check(
      "cantidad de movimiento no finita rechazada",
      sanitizePosMovementQuantity(Number.NaN) === null,
    );
    check(
      "cantidad de movimiento con tres decimales",
      sanitizePosMovementQuantity(1.25) === 1.25,
    );

    check("saldo cero aceptado", sanitizePosInventoryQuantity(0) === 0);
    // El negativo NO se rechaza: si las existencias pueden bajar de cero es P-8,
    // y esconder esa regla en un saneador sería inventarla.
    check("saldo negativo aceptado, porque P-8 sigue abierta", sanitizePosInventoryQuantity(-3) === -3);

    // --- 7. El inventario serializado no se tocó --------------------------
    console.log("\n7. Los dos inventarios no se tocan");

    check(
      "ninguna unidad de motocicleta creada",
      (await prisma.motorcycleUnit.count()) === before.units,
    );
    check(
      "ningún InventoryMovement creado",
      (await prisma.inventoryMovement.count()) === before.moves,
    );

    // Y a la inversa: ninguna tabla nueva referencia a la otra.
    const fks = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      WHERE c.table_name IN ('pos_warehouses','pos_inventory','pos_inventory_movements')
    `;
    const columns = fks.map((row) => `${row.table_name}.${row.column_name}`);
    check(
      "ninguna tabla nueva referencia una motocicleta",
      !columns.some((column) => column.includes("motorcycle")),
      columns.join(","),
    );

    // --- 8. Nada de contabilidad, caja ni ventas -------------------------
    console.log("\n8. Nada de contabilidad, caja ni ventas");

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
    check("ninguna venta POS creada", (await prisma.posSale.count()) === before.sales);
    check(
      "ninguna línea de venta tocada",
      (await prisma.posSaleItem.count()) === before.saleItems,
    );

    // La bitácora solo se añade: no existe columna para editarla.
    const movementColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pos_inventory_movements'
    `;
    check(
      "la bitácora no tiene updated_at: solo se añade",
      !movementColumns.some((row) => row.column_name === "updated_at"),
    );

    // Y ningún saldo cambió por sí solo durante toda la suite: este parche no
    // mueve existencias, y esa es su promesa central.
    const finalBalances = await prisma.posInventory.findMany({
      where: { warehouseId: { in: [central.id, secundaria.id] } },
      select: { quantity: true },
    });
    check(
      "ningún saldo se movió: todos siguen en cero",
      finalBalances.every((row) => Number(row.quantity) === 0),
      finalBalances.map((row) => String(row.quantity)).join(","),
    );
  } finally {
    await cleanup();
    console.log(`\nRESULTADO SMOKE-POS1.1-B: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
