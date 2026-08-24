/**
 * SMOKE-P-13 — qué venta produjo cada movimiento de inventario.
 *
 *   npm run smoke:p13
 *
 * ## Qué prueba
 *
 * Que `PosInventoryMovement.saleId` se llena **solo** cuando el movimiento nace
 * de un cobro, y que la consulta que las devoluciones harán —«dame los
 * movimientos de esta venta»— devuelve exactamente sus líneas.
 *
 * La otra mitad importa igual: un ajuste manual y una recepción de compra **no**
 * son ventas y tienen que quedarse en `NULL`. Un campo que se llena siempre no
 * distingue nada.
 *
 * Lo que NO cubre: el camino real de la acción de cobro, que necesita la cookie
 * firmada de mostrador y vive en `e2e/pos-inventario-venta.spec.ts`. Aquí se
 * comprueba la restricción de la base y la forma de la consulta.
 *
 * Crea sus fixtures con prefijo reconocible y **los borra al terminar**, incluso
 * si una aserción falla.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const TAG = `SMOKE-P13-${Date.now()}`;

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

async function main() {
  console.log(`\nSMOKE-P-13 — movimiento → venta (${TAG})\n`);

  const branch = await prisma.branch.findFirstOrThrow({ select: { id: true } });
  const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
  const warehouse = await prisma.posWarehouse.create({
    data: { branchId: branch.id, code: `${TAG}-BOD`, name: `${TAG} Bodega` },
    select: { id: true },
  });
  const products = await Promise.all(
    ["A", "B"].map((suffix) =>
      prisma.posProduct.create({
        data: { sku: `${TAG}-${suffix}`, name: `Artículo ${suffix}`, unitPrice: 100 },
        select: { id: true },
      }),
    ),
  );
  for (const product of products) {
    await prisma.posInventory.create({
      data: {
        warehouseId: warehouse.id,
        productId: product.id,
        quantity: new Prisma.Decimal(50),
      },
    });
  }

  // --- Una venta de dos líneas, con sus dos movimientos ------------------
  const sale = await prisma.posSale.create({
    data: {
      saleNumber: `${TAG}-V1`,
      branchId: branch.id,
      cashierId: user.id,
      status: "COMPLETADA",
      subtotal: 200,
      total: 200,
      completedAt: new Date(),
      items: {
        create: products.map((product, position) => ({
          productId: product.id,
          productName: `Artículo ${position}`,
          productSku: `${TAG}-${position}`,
          quantity: 1,
          unitPrice: 100,
          total: 100,
          position,
        })),
      },
    },
    select: { id: true },
  });

  for (const product of products) {
    await prisma.posInventoryMovement.create({
      data: {
        warehouseId: warehouse.id,
        productId: product.id,
        type: "VENTA",
        quantity: new Prisma.Decimal(-1),
        quantityBefore: new Prisma.Decimal(50),
        quantityAfter: new Prisma.Decimal(49),
        reason: `Venta ${TAG}-V1`,
        createdByUserId: user.id,
        saleId: sale.id,
      },
    });
  }

  // --- Un ajuste manual y una recepción: **no** son ventas ---------------
  await prisma.posInventoryMovement.create({
    data: {
      warehouseId: warehouse.id,
      productId: products[0]!.id,
      type: "AJUSTE",
      quantity: new Prisma.Decimal(5),
      quantityBefore: new Prisma.Decimal(49),
      quantityAfter: new Prisma.Decimal(54),
      reason: `${TAG} ajuste manual`,
      createdByUserId: user.id,
    },
  });
  await prisma.posInventoryMovement.create({
    data: {
      warehouseId: warehouse.id,
      productId: products[1]!.id,
      type: "COMPRA",
      quantity: new Prisma.Decimal(10),
      quantityBefore: new Prisma.Decimal(49),
      quantityAfter: new Prisma.Decimal(59),
      reason: `${TAG} recepción`,
      createdByUserId: user.id,
    },
  });

  // --- 1. La consulta que las devoluciones harán -------------------------
  const ofSale = await prisma.posInventoryMovement.findMany({
    where: { saleId: sale.id },
    select: { id: true, type: true, saleId: true },
  });
  check(
    "la venta de dos líneas produjo dos movimientos consultables por saleId",
    ofSale.length === 2,
    `movimientos=${ofSale.length}`,
  );
  check(
    "todos comparten el mismo saleId",
    ofSale.every((movement) => movement.saleId === sale.id),
  );
  check(
    "todos son de tipo VENTA",
    ofSale.every((movement) => movement.type === "VENTA"),
  );

  const lines = await prisma.posSaleItem.count({ where: { saleId: sale.id } });
  check(
    "hay un movimiento por línea de la venta",
    ofSale.length === lines,
    `líneas=${lines} movimientos=${ofSale.length}`,
  );

  // --- 2. Lo que NO es venta se queda en NULL ---------------------------
  const notSales = await prisma.posInventoryMovement.findMany({
    where: {
      warehouseId: warehouse.id,
      type: { in: ["AJUSTE", "COMPRA"] },
    },
    select: { type: true, saleId: true },
  });
  check(
    "el ajuste y la recepción existen",
    notSales.length === 2,
    `encontrados=${notSales.length}`,
  );
  check(
    "ninguno de los dos se atribuye a una venta",
    notSales.every((movement) => movement.saleId === null),
    JSON.stringify(notSales),
  );

  // Y no aparecen en la consulta de la venta: el campo distingue de verdad.
  check(
    "la consulta por saleId no arrastra los movimientos ajenos",
    ofSale.length === 2 && notSales.length === 2,
  );

  // --- 3. `Restrict`: una venta con movimientos no se borra --------------
  let blocked = false;
  try {
    await prisma.posSale.delete({ where: { id: sale.id } });
  } catch (error) {
    blocked =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003";
  }
  check("una venta con movimientos atribuidos no se puede borrar", blocked);

  // --- 4. `reason` sigue intacto ----------------------------------------
  const withReason = await prisma.posInventoryMovement.findFirstOrThrow({
    where: { saleId: sale.id },
    select: { reason: true },
  });
  check(
    "reason conserva su texto legible; saleId no lo sustituye",
    withReason.reason === `Venta ${TAG}-V1`,
    `reason=${withReason.reason}`,
  );
}

main()
  .catch((error) => {
    failed += 1;
    console.error("  ERROR", error);
  })
  .finally(async () => {
    await prisma.posInventoryMovement.deleteMany({
      where: { warehouse: { code: { startsWith: TAG } } },
    });
    await prisma.posInventory.deleteMany({
      where: { warehouse: { code: { startsWith: TAG } } },
    });
    await prisma.posSaleItem.deleteMany({
      where: { sale: { saleNumber: { startsWith: TAG } } },
    });
    await prisma.posSale.deleteMany({ where: { saleNumber: { startsWith: TAG } } });
    await prisma.posWarehouse.deleteMany({ where: { code: { startsWith: TAG } } });
    await prisma.posProduct.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.$disconnect();
    console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
    process.exit(failed === 0 ? 0 : 1);
  });
