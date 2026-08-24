/**
 * SMOKE-POS1.2-B — recepción de órdenes de compra en inventario.
 *
 *   npm run smoke:pos-purchase-receipts
 *
 * **El cuarto llamador del motor de inventario**, y el primero que además avanza
 * un documento. Lo que esta suite tiene que demostrar:
 *
 * 1. **Lo pendiente se respeta.** 40 de 100 deja 60; los 60 restantes cierran la
 *    orden; 61 se rechaza.
 * 2. **Inventario y orden son inseparables.** Un fallo a mitad no deja ni
 *    existencias movidas ni cantidades recibidas.
 * 3. **Bloquear el saldo no basta.** Dos recepciones concurrentes de la misma
 *    línea no pueden recibir de más, y eso exige bloquear también la orden.
 *
 * Reproduce el cuerpo transaccional de `receivePosPurchaseOrderAction`.
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
const TAG = `SMOKE-POS12B-${Date.now()}`;

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

function toMoney(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}
function toQuantity(value: number) {
  return new Prisma.Decimal(value.toFixed(3));
}

/** Copia del bloqueo del motor. */
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

type ReceiptResult =
  | { ok: true; status: string }
  | { ok: false; error: string };

/**
 * Reproduce `receivePosPurchaseOrderAction`.
 *
 * `lockOrder` existe para poder **quitar el bloqueo de la orden** y comprobar que
 * sin él la prueba de concurrencia falla. `failAfterFirstLine` fuerza el fallo
 * tras mover existencias de la primera línea.
 */
async function receive(
  input: {
    orderId: string;
    warehouseId: string;
    userId: string;
    lines: Array<{ itemId: string; quantity: number }>;
  },
  options: { lockOrder?: boolean; failAfterFirstLine?: boolean } = {},
): Promise<ReceiptResult> {
  const lockOrder = options.lockOrder ?? true;

  if (!input.lines.length) {
    return { ok: false, error: "La recepción necesita al menos una línea." };
  }
  const requested: Array<{ itemId: string; quantity: number }> = [];
  for (const line of input.lines) {
    const quantity = sanitizePosQuantity(line.quantity);
    if (quantity === null) {
      return { ok: false, error: "La cantidad recibida debe ser mayor que cero." };
    }
    requested.push({ itemId: line.itemId, quantity });
  }

  try {
    return await prisma.$transaction(async (tx) => {
      if (lockOrder) {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "pos_purchase_orders" WHERE "id" = ${input.orderId} FOR UPDATE`,
        );
      }
      const order = await tx.posPurchaseOrder.findUnique({
        where: { id: input.orderId },
        include: {
          items: true,
          branch: { select: { id: true, code: true } },
          supplier: { select: { isActive: true } },
        },
      });
      if (!order) throw new Error("La orden de compra no existe.");
      if (order.status === "ANULADA") throw new Error("Una orden anulada no puede recibirse.");
      if (order.status === "BORRADOR") {
        throw new Error("Una orden en borrador todavía no puede recibirse.");
      }
      if (order.status === "RECIBIDA") throw new Error("Esta orden ya se recibió por completo.");
      if (!order.supplier.isActive) throw new Error("El proveedor está inactivo.");

      const warehouse = await tx.posWarehouse.findUnique({
        where: { id: input.warehouseId },
        select: { branchId: true },
      });
      if (!warehouse) throw new Error("La bodega no existe.");
      if (warehouse.branchId !== order.branch.id) {
        throw new Error("La bodega no pertenece a la sucursal de la orden.");
      }

      const itemsById = new Map(order.items.map((item) => [item.id, item]));
      const plan = [];
      for (const line of requested) {
        const item = itemsById.get(line.itemId);
        if (!item) throw new Error("La línea no pertenece a esta orden.");
        const pending = item.quantity.sub(item.receivedQuantity);
        if (pending.lessThanOrEqualTo(0)) {
          throw new Error("Esa línea ya se recibió por completo.");
        }
        if (toQuantity(line.quantity).greaterThan(pending)) {
          throw new Error(
            `No puedes recibir más de lo pendiente: quedan ${pending.toString()}.`,
          );
        }
        plan.push({ item, quantity: line.quantity });
      }

      const ordered = [...plan].sort((left, right) =>
        left.item.productId.localeCompare(right.item.productId),
      );
      let done = 0;
      for (const line of ordered) {
        await applyMovement(tx, {
          warehouseId: input.warehouseId,
          productId: line.item.productId,
          quantity: line.quantity,
          type: "COMPRA",
          reason: `Recepción de orden ${order.orderNumber}`,
          notes: null,
          userId: input.userId,
        });
        await tx.posPurchaseOrderItem.update({
          where: { id: line.item.id },
          data: {
            receivedQuantity: line.item.receivedQuantity.add(toQuantity(line.quantity)),
          },
        });
        done += 1;
        if (options.failAfterFirstLine && done === 1 && ordered.length > 1) {
          throw new Error("Fallo forzado tras la primera línea.");
        }
      }

      const after = await tx.posPurchaseOrderItem.findMany({
        where: { orderId: order.id },
        select: { quantity: true, receivedQuantity: true },
      });
      const complete = after.every((item) =>
        item.receivedQuantity.greaterThanOrEqualTo(item.quantity),
      );
      const started = after.some((item) => item.receivedQuantity.greaterThan(0));
      const nextStatus = complete ? "RECIBIDA" : started ? "RECIBIDA_PARCIAL" : order.status;

      const guarded = await tx.posPurchaseOrder.updateMany({
        where: { id: order.id, status: { in: ["APROBADA", "RECIBIDA_PARCIAL"] } },
        data: { status: nextStatus },
      });
      if (guarded.count !== 1) {
        throw new Error("La orden cambió de estado durante la recepción.");
      }

      return { ok: true as const, status: nextStatus };
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "fallo desconocido",
    };
  }
}

function generateOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `OC-${date}-${suffix}`;
}

async function cleanup() {
  const branches = await prisma.branch.findMany({
    where: { code: { startsWith: TAG.toLowerCase() } },
    select: { id: true },
  });
  const branchIds = branches.map((branch) => branch.id);
  const warehouses = await prisma.posWarehouse.findMany({
    where: { code: { startsWith: TAG } },
    select: { id: true },
  });
  const warehouseIds = warehouses.map((warehouse) => warehouse.id);
  const orders = await prisma.posPurchaseOrder.findMany({
    where: { branchId: { in: branchIds } },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);

  await prisma.posPurchaseOrderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.posPurchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.posInventoryMovement.deleteMany({
    where: { warehouseId: { in: warehouseIds } },
  });
  await prisma.posInventory.deleteMany({ where: { warehouseId: { in: warehouseIds } } });
  await prisma.posWarehouse.deleteMany({ where: { id: { in: warehouseIds } } });
  await prisma.posProduct.deleteMany({ where: { sku: { startsWith: TAG } } });
  await prisma.thirdParty.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG.toLowerCase() } } });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
}

async function balanceOf(warehouseId: string, productId: string) {
  const row = await prisma.posInventory.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId, productId } },
  });
  return row.quantity.toNumber();
}

async function itemState(itemId: string) {
  const item = await prisma.posPurchaseOrderItem.findUniqueOrThrow({
    where: { id: itemId },
  });
  return {
    received: item.receivedQuantity.toNumber(),
    pending: item.quantity.sub(item.receivedQuantity).toNumber(),
  };
}

async function statusOf(orderId: string) {
  return (await prisma.posPurchaseOrder.findUniqueOrThrow({ where: { id: orderId } }))
    .status;
}

async function main() {
  await cleanup();

  const before = {
    entries: await prisma.journalEntry.count(),
    postings: await prisma.postingRecord.count(),
    cash: await prisma.cashDocument.count(),
    serialized: await prisma.inventoryMovement.count(),
    units: await prisma.motorcycleUnit.count(),
  };

  try {
    // --- Fixtures ---------------------------------------------------------
    const branch = await prisma.branch.create({
      data: { code: `${TAG}-suc`.toLowerCase(), name: `${TAG} sucursal` },
    });
    const otherBranch = await prisma.branch.create({
      data: { code: `${TAG}-otra`.toLowerCase(), name: `${TAG} otra` },
    });
    const user = await prisma.user.create({
      data: {
        name: `${TAG} gerente`,
        email: `${TAG.toLowerCase()}@smoke.local`,
        passwordHash: "smoke:not-a-real-hash",
        role: "GERENTE",
      },
    });
    const supplier = await prisma.thirdParty.create({
      data: { branchId: branch.id, type: "PROVEEDOR", name: `${TAG} Proveedor` },
    });
    const central = await prisma.posWarehouse.create({
      data: { branchId: branch.id, code: `${TAG}-CENTRAL`, name: "Central" },
    });
    const ajena = await prisma.posWarehouse.create({
      data: { branchId: otherBranch.id, code: `${TAG}-AJENA`, name: "Ajena" },
    });
    const cerrada = await prisma.posWarehouse.create({
      data: { branchId: branch.id, code: `${TAG}-CERRADA`, name: "Cerrada" },
    });

    const casco = await prisma.posProduct.create({
      data: { sku: `${TAG}-CASCO`, name: "Casco", unitPrice: toMoney(1200) },
    });
    const aceite = await prisma.posProduct.create({
      data: {
        sku: `${TAG}-ACEITE`,
        name: "Aceite",
        unitPrice: toMoney(95),
        unit: "LITRO",
      },
    });
    const sinSaldo = await prisma.posProduct.create({
      data: { sku: `${TAG}-SINSALDO`, name: "Sin saldo", unitPrice: toMoney(5) },
    });
    const retirado = await prisma.posProduct.create({
      data: { sku: `${TAG}-RETIRADO`, name: "Retirado", unitPrice: toMoney(5) },
    });

    for (const [warehouse, product] of [
      [central, casco],
      [central, aceite],
      [central, retirado],
      [cerrada, casco],
      [ajena, casco],
    ] as const) {
      await prisma.posInventory.create({
        data: { warehouseId: warehouse.id, productId: product.id },
      });
    }
    await prisma.posWarehouse.update({
      where: { id: cerrada.id },
      data: { isActive: false },
    });

    /** Crea una orden aprobada con sus líneas. */
    async function approvedOrder(
      lines: Array<{ productId: string; quantity: number; unitCost: number }>,
    ) {
      const totals = calculatePosSaleTotals(
        lines.map((line) => ({ quantity: line.quantity, unitPrice: line.unitCost })),
      );
      return prisma.posPurchaseOrder.create({
        data: {
          orderNumber: generateOrderNumber(),
          branchId: branch.id,
          supplierId: supplier.id,
          status: "APROBADA",
          approvedById: user.id,
          approvedAt: new Date(),
          subtotal: toMoney(totals.subtotal),
          total: toMoney(totals.total),
          createdByUserId: user.id,
          items: {
            create: lines.map((line, position) => ({
              productId: line.productId,
              quantity: toQuantity(line.quantity),
              unitCost: toMoney(line.unitCost),
              total: toMoney(
                calculatePosLineTotal({
                  quantity: line.quantity,
                  unitPrice: line.unitCost,
                }),
              ),
              position,
            })),
          },
        },
        include: { items: { orderBy: { position: "asc" } } },
      });
    }

    // --- 1. Recepción parcial ----------------------------------------------
    console.log("\n1. Recepción parcial: 40 de 100 deja 60");

    const order = await approvedOrder([{ productId: casco.id, quantity: 100, unitCost: 800 }]);
    const line = order.items[0]!;

    check("la orden parte de APROBADA", order.status === "APROBADA");
    check("nada recibido al inicio", (await itemState(line.id)).received === 0);

    const partial = await receive({
      orderId: order.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [{ itemId: line.id, quantity: 40 }],
    });
    check("la recepción parcial se registra", partial.ok === true, JSON.stringify(partial));
    const afterPartial = await itemState(line.id);
    check("recibido 40", afterPartial.received === 40, String(afterPartial.received));
    check("pendiente 60", afterPartial.pending === 60, String(afterPartial.pending));
    check("la orden pasa a RECIBIDA_PARCIAL", (await statusOf(order.id)) === "RECIBIDA_PARCIAL");
    check("el inventario subió a 40", (await balanceOf(central.id, casco.id)) === 40);

    const movement = await prisma.posInventoryMovement.findFirstOrThrow({
      where: { reason: `Recepción de orden ${order.orderNumber}` },
    });
    check("el movimiento es de tipo COMPRA", movement.type === "COMPRA");
    check("la cantidad es positiva", movement.quantity.toNumber() === 40);
    check("guarda el autor", movement.createdByUserId === user.id);
    check("el motivo nombra la orden", movement.reason.includes(order.orderNumber));
    check(
      "la invariante del motor se sostiene",
      movement.quantityBefore.add(movement.quantity).equals(movement.quantityAfter),
    );

    // --- 2. Recibir de más ---------------------------------------------------
    console.log("\n2. No se puede recibir más de lo pendiente");

    const excess = await receive({
      orderId: order.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [{ itemId: line.id, quantity: 61 }],
    });
    check(
      "61 sobre 60 pendientes se rechaza",
      excess.ok === false && excess.error.includes("más de lo pendiente"),
      JSON.stringify(excess),
    );
    check("el inventario no cambió", (await balanceOf(central.id, casco.id)) === 40);
    check("lo recibido no cambió", (await itemState(line.id)).received === 40);

    // --- 3. Completar --------------------------------------------------------
    console.log("\n3. Los 60 restantes cierran la orden");

    const rest = await receive({
      orderId: order.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [{ itemId: line.id, quantity: 60 }],
    });
    check("la segunda recepción se registra", rest.ok === true);
    check("recibido 100", (await itemState(line.id)).received === 100);
    check("pendiente 0", (await itemState(line.id)).pending === 0);
    check("la orden pasa a RECIBIDA", (await statusOf(order.id)) === "RECIBIDA");
    check("el inventario llegó a 100", (await balanceOf(central.id, casco.id)) === 100);

    const closed = await receive({
      orderId: order.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [{ itemId: line.id, quantity: 1 }],
    });
    check(
      "una orden ya recibida no admite más",
      closed.ok === false && closed.error.includes("ya se recibió"),
    );

    // --- 4. Varias líneas y decimales ---------------------------------------
    console.log("\n4. Varias líneas y decimales");

    const multi = await approvedOrder([
      { productId: casco.id, quantity: 10, unitCost: 800 },
      { productId: aceite.id, quantity: 7.5, unitCost: 60 },
    ]);
    const cascoLine = multi.items[0]!;
    const aceiteLine = multi.items[1]!;

    const both = await receive({
      orderId: multi.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [
        { itemId: cascoLine.id, quantity: 10 },
        { itemId: aceiteLine.id, quantity: 2.25 },
      ],
    });
    check("la recepción de dos líneas se registra", both.ok === true);
    check("el casco quedó completo", (await itemState(cascoLine.id)).pending === 0);
    check(
      "el aceite quedó pendiente con decimales exactos",
      (await itemState(aceiteLine.id)).pending === 5.25,
      String((await itemState(aceiteLine.id)).pending),
    );
    check(
      "una línea completa y otra no dejan la orden PARCIAL",
      (await statusOf(multi.id)) === "RECIBIDA_PARCIAL",
    );
    check(
      "el inventario del aceite subió 2.25",
      (await balanceOf(central.id, aceite.id)) === 2.25,
    );
    check(
      "el inventario del casco subió 10 sobre los 100 anteriores",
      (await balanceOf(central.id, casco.id)) === 110,
    );

    const finishAceite = await receive({
      orderId: multi.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [{ itemId: aceiteLine.id, quantity: 5.25 }],
    });
    check("cerrar la última línea cierra la orden", finishAceite.ok === true);
    check("la orden queda RECIBIDA", (await statusOf(multi.id)) === "RECIBIDA");
    check(
      "el aceite acumuló 7.5 exacto",
      (await balanceOf(central.id, aceite.id)) === 7.5,
      String(await balanceOf(central.id, aceite.id)),
    );

    // --- 5. Saldo contra bitácora --------------------------------------------
    console.log("\n5. El saldo coincide con su bitácora");

    for (const [product, label] of [
      [casco, "casco"],
      [aceite, "aceite"],
    ] as const) {
      const movements = await prisma.posInventoryMovement.findMany({
        where: { warehouseId: central.id, productId: product.id },
      });
      const sum = movements.reduce(
        (total, item) => total.add(item.quantity),
        new Prisma.Decimal(0),
      );
      check(
        `el saldo de ${label} coincide con la suma de sus movimientos`,
        sum.toNumber() === (await balanceOf(central.id, product.id)),
        `${sum.toString()} vs ${await balanceOf(central.id, product.id)}`,
      );
      check(
        `todos los movimientos de ${label} son de tipo COMPRA`,
        movements.every((item) => item.type === "COMPRA"),
      );
    }

    // --- 6. Rechazos -----------------------------------------------------------
    console.log("\n6. Rechazos");

    const validation = await approvedOrder([
      { productId: casco.id, quantity: 5, unitCost: 100 },
    ]);
    const validationLine = validation.items[0]!;

    check(
      "cantidad cero rechazada",
      (await receive({
        orderId: validation.id,
        warehouseId: central.id,
        userId: user.id,
        lines: [{ itemId: validationLine.id, quantity: 0 }],
      })).ok === false,
    );
    check(
      "cantidad negativa rechazada",
      (await receive({
        orderId: validation.id,
        warehouseId: central.id,
        userId: user.id,
        lines: [{ itemId: validationLine.id, quantity: -3 }],
      })).ok === false,
    );

    const wrongWarehouse = await receive({
      orderId: validation.id,
      warehouseId: ajena.id,
      userId: user.id,
      lines: [{ itemId: validationLine.id, quantity: 1 }],
    });
    check(
      "bodega de otra sucursal rechazada",
      wrongWarehouse.ok === false && wrongWarehouse.error.includes("no pertenece"),
    );

    const closedWarehouse = await receive({
      orderId: validation.id,
      warehouseId: cerrada.id,
      userId: user.id,
      lines: [{ itemId: validationLine.id, quantity: 1 }],
    });
    check(
      "bodega inactiva rechazada",
      closedWarehouse.ok === false && closedWarehouse.error.includes("inactiva"),
    );

    // Producto inactivo: el motor lo detiene.
    const inactiveOrder = await approvedOrder([
      { productId: retirado.id, quantity: 2, unitCost: 5 },
    ]);
    await prisma.posProduct.update({
      where: { id: retirado.id },
      data: { isActive: false },
    });
    const inactiveProduct = await receive({
      orderId: inactiveOrder.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [{ itemId: inactiveOrder.items[0]!.id, quantity: 1 }],
    });
    check(
      "producto inactivo rechazado",
      inactiveProduct.ok === false && inactiveProduct.error.includes("inactivo"),
    );
    await prisma.posProduct.update({
      where: { id: retirado.id },
      data: { isActive: true },
    });

    // Sin saldo abierto: la recepción no lo crea.
    const noBalanceOrder = await approvedOrder([
      { productId: sinSaldo.id, quantity: 2, unitCost: 5 },
    ]);
    const noBalance = await receive({
      orderId: noBalanceOrder.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [{ itemId: noBalanceOrder.items[0]!.id, quantity: 1 }],
    });
    check(
      "sin saldo abierto la recepción se rechaza",
      noBalance.ok === false && noBalance.error.includes("saldo abierto"),
    );
    check(
      "y no creó ninguna fila de saldo",
      (await prisma.posInventory.count({ where: { productId: sinSaldo.id } })) === 0,
    );

    // Proveedor inactivo.
    await prisma.thirdParty.update({
      where: { id: supplier.id },
      data: { isActive: false },
    });
    const inactiveSupplier = await receive({
      orderId: validation.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [{ itemId: validationLine.id, quantity: 1 }],
    });
    check(
      "proveedor inactivo rechazado",
      inactiveSupplier.ok === false && inactiveSupplier.error.includes("inactivo"),
    );
    await prisma.thirdParty.update({
      where: { id: supplier.id },
      data: { isActive: true },
    });

    // Orden en borrador y orden anulada.
    const draft = await prisma.posPurchaseOrder.create({
      data: {
        orderNumber: generateOrderNumber(),
        branchId: branch.id,
        supplierId: supplier.id,
        createdByUserId: user.id,
        items: {
          create: [
            { productId: casco.id, quantity: toQuantity(1), unitCost: toMoney(1) },
          ],
        },
      },
      include: { items: true },
    });
    const draftReceipt = await receive({
      orderId: draft.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [{ itemId: draft.items[0]!.id, quantity: 1 }],
    });
    check(
      "una orden en borrador no puede recibirse",
      draftReceipt.ok === false && draftReceipt.error.includes("borrador"),
    );

    await prisma.posPurchaseOrder.update({
      where: { id: draft.id },
      data: { status: "ANULADA", cancelledById: user.id, cancelledAt: new Date() },
    });
    const cancelledReceipt = await receive({
      orderId: draft.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [{ itemId: draft.items[0]!.id, quantity: 1 }],
    });
    check(
      "una orden anulada no puede recibirse",
      cancelledReceipt.ok === false && cancelledReceipt.error.includes("anulada"),
    );

    // Línea de otra orden.
    const foreignLine = await receive({
      orderId: validation.id,
      warehouseId: central.id,
      userId: user.id,
      lines: [{ itemId: multi.items[0]!.id, quantity: 1 }],
    });
    check(
      "una línea de otra orden se rechaza",
      foreignLine.ok === false && foreignLine.error.includes("no pertenece"),
    );

    // --- 7. Rollback ------------------------------------------------------------
    console.log("\n7. Un fallo a mitad no deja nada");

    const rollbackOrder = await approvedOrder([
      { productId: casco.id, quantity: 5, unitCost: 100 },
      { productId: aceite.id, quantity: 5, unitCost: 50 },
    ]);
    const cascoBefore = await balanceOf(central.id, casco.id);
    const aceiteBefore = await balanceOf(central.id, aceite.id);
    const movementsBefore = await prisma.posInventoryMovement.count({
      where: { warehouseId: central.id },
    });

    const rolled = await receive(
      {
        orderId: rollbackOrder.id,
        warehouseId: central.id,
        userId: user.id,
        lines: [
          { itemId: rollbackOrder.items[0]!.id, quantity: 5 },
          { itemId: rollbackOrder.items[1]!.id, quantity: 5 },
        ],
      },
      { failAfterFirstLine: true },
    );
    check("la recepción forzada a fallar no dice que sí", rolled.ok === false);
    check(
      "ningún movimiento sobrevive",
      (await prisma.posInventoryMovement.count({ where: { warehouseId: central.id } })) ===
        movementsBefore,
    );
    check("el saldo del casco quedó intacto", (await balanceOf(central.id, casco.id)) === cascoBefore);
    check(
      "el saldo del aceite quedó intacto",
      (await balanceOf(central.id, aceite.id)) === aceiteBefore,
    );
    check(
      "ninguna cantidad recibida sobrevive",
      (await itemState(rollbackOrder.items[0]!.id)).received === 0,
    );
    check("la orden sigue APROBADA", (await statusOf(rollbackOrder.id)) === "APROBADA");

    // --- 8. Concurrencia --------------------------------------------------------
    console.log("\n8. Dos recepciones concurrentes no pueden recibir de más");

    const raceOrder = await approvedOrder([
      { productId: casco.id, quantity: 100, unitCost: 10 },
    ]);
    const raceLine = raceOrder.items[0]!;
    const raceBalanceBefore = await balanceOf(central.id, casco.id);

    // Ambas piden 60 sobre 100 pendientes: solo una puede caber.
    const races = await Promise.all([
      receive({
        orderId: raceOrder.id,
        warehouseId: central.id,
        userId: user.id,
        lines: [{ itemId: raceLine.id, quantity: 60 }],
      }),
      receive({
        orderId: raceOrder.id,
        warehouseId: central.id,
        userId: user.id,
        lines: [{ itemId: raceLine.id, quantity: 60 }],
      }),
    ]);
    const accepted = races.filter((result) => result.ok).length;
    check(
      "exactamente una de las dos recepciones concurrentes gana",
      accepted === 1,
      `${accepted}: ${JSON.stringify(races)}`,
    );
    check(
      "lo recibido no supera lo pedido",
      (await itemState(raceLine.id)).received === 60,
      String((await itemState(raceLine.id)).received),
    );
    check(
      "el inventario subió exactamente 60",
      (await balanceOf(central.id, casco.id)) === raceBalanceBefore + 60,
      String(await balanceOf(central.id, casco.id)),
    );

    // --- 9. Sin el bloqueo de la orden, la prueba falla -------------------------
    console.log("\n9. Bloquear el saldo no basta: sin FOR UPDATE en la orden");

    const unlockedOrder = await approvedOrder([
      { productId: casco.id, quantity: 100, unitCost: 10 },
    ]);
    const unlockedLine = unlockedOrder.items[0]!;
    const unlockedBefore = await balanceOf(central.id, casco.id);

    const unlocked = await Promise.all([
      receive(
        {
          orderId: unlockedOrder.id,
          warehouseId: central.id,
          userId: user.id,
          lines: [{ itemId: unlockedLine.id, quantity: 60 }],
        },
        { lockOrder: false },
      ),
      receive(
        {
          orderId: unlockedOrder.id,
          warehouseId: central.id,
          userId: user.id,
          lines: [{ itemId: unlockedLine.id, quantity: 60 }],
        },
        { lockOrder: false },
      ),
    ]);
    const overReceived = (await itemState(unlockedLine.id)).received;
    const overBalance = (await balanceOf(central.id, casco.id)) - unlockedBefore;
    // **Esta aserción documenta el fallo, no lo aprueba.**
    //
    // Sin bloquear la orden, las dos recepciones leen `recibido = 0`, ambas creen
    // que caben 60 y ambas escriben `0 + 60 = 60`: una **actualización perdida**
    // sobre la línea. El resultado es peor que recibir de más:
    //
    //   · el inventario sube **120**, con su bitácora cuadrando;
    //   · la orden dice **60 recibidos y 40 pendientes**.
    //
    // Es decir, **la bitácora y el documento se descuadran entre sí**, y esos 40
    // "pendientes" fantasma permitirían recibir hasta 160 unidades de una orden de
    // 100. Exactamente la razón de bloquear la cabecera antes de leer las líneas.
    check(
      "sin el bloqueo de la orden, inventario y orden se descuadran entre sí",
      unlocked.filter((result) => result.ok).length === 2 &&
        overBalance === 120 &&
        overReceived === 60,
      `aceptadas=${unlocked.filter((r) => r.ok).length} recibido=${overReceived} saldo=+${overBalance}`,
    );

    // --- 10. Nada más se tocó ----------------------------------------------------
    console.log("\n10. Ningún otro subsistema cambió");

    check("ningún asiento contable", (await prisma.journalEntry.count()) === before.entries);
    check("ninguna contabilización", (await prisma.postingRecord.count()) === before.postings);
    check("ningún documento de caja", (await prisma.cashDocument.count()) === before.cash);
    check(
      "ningún movimiento de inventario serializado",
      (await prisma.inventoryMovement.count()) === before.serialized,
    );
    check(
      "ninguna unidad de motocicleta",
      (await prisma.motorcycleUnit.count()) === before.units,
    );

    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pos_purchase_order_items'
    `;
    const names = columns.map((column) => column.column_name);
    check(
      "la línea guarda lo recibido y no lo pendiente",
      names.includes("received_quantity") && !names.includes("pending_quantity"),
      names.join(","),
    );
  } finally {
    await cleanup();
    console.log(`\nRESULTADO SMOKE-POS1.2-B: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
