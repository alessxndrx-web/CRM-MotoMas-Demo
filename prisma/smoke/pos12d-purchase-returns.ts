/**
 * SMOKE-POS1.2-D — devoluciones a proveedor.
 *
 *   npm run smoke:pos-purchase-returns
 *
 * **El primer flujo que revierte existencias después de recibirlas**, y el
 * quinto llamador del mismo motor. Lo que esta suite tiene que demostrar:
 *
 * 1. **Lo devolvible se respeta**: no se puede devolver más de lo recibido, ni
 *    dos veces lo mismo.
 * 2. **Las tres cantidades no se contradicen**: pedido, recibido y devuelto.
 * 3. **Bloquear el saldo no basta**, igual que en la recepción — y se comprueba
 *    quitando el bloqueo de la orden.
 * 4. **Nada más se mueve**: ni contabilidad, ni caja, ni cuentas por pagar.
 *
 * Reproduce el cuerpo transaccional de `returnPosPurchaseOrderAction`.
 *
 * Limpieza guiada por TAG.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import { sanitizePosQuantity, sanitizePosText } from "@/server/pos/shared";

const prisma = new PrismaClient();
const TAG = `SMOKE-POS12D-${Date.now()}`;

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

type ReturnResult = { ok: true } | { ok: false; error: string };

/**
 * Reproduce `returnPosPurchaseOrderAction`.
 *
 * `lockOrder` existe para poder **quitar el bloqueo de la cabecera** y comprobar
 * que sin él la prueba de concurrencia falla. `failAfterFirstLine` fuerza el
 * fallo tras devolver la primera línea.
 */
async function returnGoods(
  input: {
    orderId: string;
    warehouseId: string;
    userId: string;
    reason: string;
    lines: Array<{ itemId: string; quantity: number }>;
  },
  options: { lockOrder?: boolean; failAfterFirstLine?: boolean } = {},
): Promise<ReturnResult> {
  const lockOrder = options.lockOrder ?? true;

  if (!input.lines.length) {
    return { ok: false, error: "La devolución necesita al menos una línea." };
  }
  const reason = sanitizePosText(input.reason, 500);
  if (!reason) return { ok: false, error: "Indica el motivo de la devolución." };

  const requested: Array<{ itemId: string; quantity: number }> = [];
  for (const line of input.lines) {
    const quantity = sanitizePosQuantity(line.quantity);
    if (quantity === null) {
      return { ok: false, error: "La cantidad devuelta debe ser mayor que cero." };
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
          branch: { select: { id: true } },
          supplier: { select: { isActive: true } },
        },
      });
      if (!order) throw new Error("La orden de compra no existe.");
      if (order.status === "ANULADA") {
        throw new Error("Una orden anulada no tiene nada que devolver.");
      }
      if (order.status === "BORRADOR" || order.status === "APROBADA") {
        throw new Error("Esta orden todavía no ha recibido mercancía.");
      }
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
        const returnable = item.receivedQuantity.sub(item.returnedQuantity);
        if (returnable.lessThanOrEqualTo(0)) {
          throw new Error("Esa línea ya se devolvió por completo.");
        }
        if (toQuantity(line.quantity).greaterThan(returnable)) {
          throw new Error(
            `No puedes devolver más de lo recibido: quedan ${returnable.toString()}.`,
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
          quantity: -line.quantity,
          type: "DEVOLUCION",
          reason: `Devolución de orden ${order.orderNumber}: ${reason}`,
          notes: null,
          userId: input.userId,
        });
        await tx.posPurchaseOrderItem.update({
          where: { id: line.item.id },
          data: {
            returnedQuantity: line.item.returnedQuantity.add(toQuantity(line.quantity)),
          },
        });
        done += 1;
        if (options.failAfterFirstLine && done === 1 && ordered.length > 1) {
          throw new Error("Fallo forzado tras la primera línea.");
        }
      }

      return { ok: true as const };
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "fallo desconocido",
    };
  }
}

/**
 * El mensaje de error, o `null` si la operación tuvo éxito.
 *
 * Existe porque `ReturnResult` es una unión: acceder a `.error` directamente
 * compila mal y esconde el caso `ok: true` detrás de un `undefined` silencioso —
 * una aserción que pasa por accidente en vez de por razón.
 */
function errorOf(result: ReturnResult): string | null {
  return result.ok ? null : result.error;
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

async function lineState(itemId: string) {
  const item = await prisma.posPurchaseOrderItem.findUniqueOrThrow({
    where: { id: itemId },
  });
  return {
    ordered: item.quantity.toNumber(),
    received: item.receivedQuantity.toNumber(),
    returned: item.returnedQuantity.toNumber(),
    pending: item.quantity.sub(item.receivedQuantity).toNumber(),
    returnable: item.receivedQuantity.sub(item.returnedQuantity).toNumber(),
  };
}

async function main() {
  await cleanup();

  const before = {
    entries: await prisma.journalEntry.count(),
    postings: await prisma.postingRecord.count(),
    cash: await prisma.cashDocument.count(),
    receivables: await prisma.receivableDocument.count(),
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
    const retirado = await prisma.posProduct.create({
      data: { sku: `${TAG}-RETIRADO`, name: "Retirado", unitPrice: toMoney(10) },
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

    /** Crea una orden ya recibida y carga el inventario que trajo. */
    async function receivedOrder(
      lines: Array<{ productId: string; ordered: number; received: number }>,
      status: "RECIBIDA" | "RECIBIDA_PARCIAL" | "APROBADA" | "ANULADA" = "RECIBIDA",
    ) {
      const order = await prisma.posPurchaseOrder.create({
        data: {
          orderNumber: generateOrderNumber(),
          branchId: branch.id,
          supplierId: supplier.id,
          status,
          createdByUserId: user.id,
          subtotal: toMoney(1000),
          total: toMoney(1000),
          items: {
            create: lines.map((line, position) => ({
              productId: line.productId,
              quantity: toQuantity(line.ordered),
              unitCost: toMoney(100),
              total: toMoney(line.ordered * 100),
              receivedQuantity: toQuantity(line.received),
              position,
            })),
          },
        },
        include: { items: { orderBy: { position: "asc" } } },
      });
      // El inventario que la recepción habría dejado.
      for (const line of lines) {
        if (line.received <= 0) continue;
        await prisma.$transaction((tx) =>
          applyMovement(tx, {
            warehouseId: central.id,
            productId: line.productId,
            quantity: line.received,
            type: "COMPRA",
            reason: `Recepción de orden ${order.orderNumber}`,
            notes: null,
            userId: user.id,
          }),
        );
      }
      return order;
    }

    // --- 1. Devolución parcial ---------------------------------------------
    console.log("\n1. Devolución parcial");

    const order = await receivedOrder([
      { productId: casco.id, ordered: 100, received: 100 },
    ]);
    const line = order.items[0]!;
    check("el inventario partió de 100", (await balanceOf(central.id, casco.id)) === 100);
    check("nada devuelto al inicio", (await lineState(line.id)).returned === 0);

    const partial = await returnGoods({
      orderId: order.id,
      warehouseId: central.id,
      userId: user.id,
      reason: "Diez cascos llegaron rayados",
      lines: [{ itemId: line.id, quantity: 10 }],
    });
    check("la devolución parcial se registra", partial.ok === true, JSON.stringify(partial));

    const afterPartial = await lineState(line.id);
    check("devuelto 10", afterPartial.returned === 10);
    check("devolvible baja a 90", afterPartial.returnable === 90);
    check("recibido no cambia", afterPartial.received === 100);
    check(
      "**lo pendiente no cambia** (P-28)",
      afterPartial.pending === 0,
      String(afterPartial.pending),
    );
    check("el inventario bajó a 90", (await balanceOf(central.id, casco.id)) === 90);

    const movement = await prisma.posInventoryMovement.findFirstOrThrow({
      where: { type: "DEVOLUCION", productId: casco.id },
    });
    check("el movimiento es de tipo DEVOLUCION", movement.type === "DEVOLUCION");
    check("la cantidad es negativa", movement.quantity.toNumber() === -10);
    check("guarda el autor", movement.createdByUserId === user.id);
    check(
      "el motivo es obligatorio y nombra orden y causa",
      movement.reason.includes(order.orderNumber) && movement.reason.includes("rayados"),
      movement.reason,
    );
    check(
      "la invariante del motor se sostiene",
      movement.quantityBefore.add(movement.quantity).equals(movement.quantityAfter),
    );
    check(
      "el estado de la orden no cambió (P-29)",
      (await prisma.posPurchaseOrder.findUniqueOrThrow({ where: { id: order.id } }))
        .status === "RECIBIDA",
    );

    // --- 2. Devoluciones sucesivas y devolución completa ---------------------
    console.log("\n2. Devoluciones sucesivas hasta completar");

    await returnGoods({
      orderId: order.id,
      warehouseId: central.id,
      userId: user.id,
      reason: "Segunda tanda",
      lines: [{ itemId: line.id, quantity: 40 }],
    });
    check("dos devoluciones acumulan a 50", (await lineState(line.id)).returned === 50);

    const rest = await returnGoods({
      orderId: order.id,
      warehouseId: central.id,
      userId: user.id,
      reason: "El resto",
      lines: [{ itemId: line.id, quantity: 50 }],
    });
    check("la última devolución completa la línea", rest.ok === true);
    const complete = await lineState(line.id);
    check("devuelto 100", complete.returned === 100);
    check("devolvible 0", complete.returnable === 0);
    check("el inventario volvió a 0", (await balanceOf(central.id, casco.id)) === 0);

    const exhausted = await returnGoods({
      orderId: order.id,
      warehouseId: central.id,
      userId: user.id,
      reason: "Una más",
      lines: [{ itemId: line.id, quantity: 1 }],
    });
    check(
      "una línea ya devuelta por completo no admite más",
      exhausted.ok === false && exhausted.error.includes("ya se devolvió"),
    );

    // --- 3. Devolver de más --------------------------------------------------
    console.log("\n3. No se puede devolver más de lo recibido");

    const overOrder = await receivedOrder([
      { productId: casco.id, ordered: 20, received: 12 },
    ], "RECIBIDA_PARCIAL");
    const overLine = overOrder.items[0]!;
    const overBalance = await balanceOf(central.id, casco.id);

    const over = await returnGoods({
      orderId: overOrder.id,
      warehouseId: central.id,
      userId: user.id,
      reason: "Intento de exceso",
      lines: [{ itemId: overLine.id, quantity: 13 }],
    });
    check(
      "13 sobre 12 recibidos se rechaza",
      over.ok === false && over.error.includes("más de lo recibido"),
      JSON.stringify(over),
    );
    check("el inventario no cambió", (await balanceOf(central.id, casco.id)) === overBalance);
    check("nada quedó devuelto", (await lineState(overLine.id)).returned === 0);
    check(
      "devolver se limita a lo recibido, no a lo pedido",
      (await lineState(overLine.id)).returnable === 12,
    );

    // --- 4. Varios productos y decimales -------------------------------------
    console.log("\n4. Varios productos y decimales");

    const multi = await receivedOrder([
      { productId: casco.id, ordered: 5, received: 5 },
      { productId: aceite.id, ordered: 8, received: 8 },
    ]);
    const cascoLine = multi.items[0]!;
    const aceiteLine = multi.items[1]!;
    const cascoBefore = await balanceOf(central.id, casco.id);
    const aceiteBefore = await balanceOf(central.id, aceite.id);

    const both = await returnGoods({
      orderId: multi.id,
      warehouseId: central.id,
      userId: user.id,
      reason: "Dos líneas a la vez",
      lines: [
        { itemId: cascoLine.id, quantity: 2 },
        { itemId: aceiteLine.id, quantity: 1.25 },
      ],
    });
    check("la devolución de dos líneas se registra", both.ok === true);
    check(
      "el casco bajó 2",
      (await balanceOf(central.id, casco.id)) === cascoBefore - 2,
    );
    check(
      "el aceite bajó 1.25 exacto",
      (await balanceOf(central.id, aceite.id)) === aceiteBefore - 1.25,
      String(await balanceOf(central.id, aceite.id)),
    );
    check(
      "el aceite queda devolvible 6.75",
      (await lineState(aceiteLine.id)).returnable === 6.75,
      String((await lineState(aceiteLine.id)).returnable),
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
        `la invariante se sostiene en todos los movimientos de ${label}`,
        movements.every((item) =>
          item.quantityBefore.add(item.quantity).equals(item.quantityAfter),
        ),
      );
    }
    const returns = await prisma.posInventoryMovement.findMany({
      where: { warehouseId: central.id, type: "DEVOLUCION" },
    });
    check(
      "toda devolución resta: ninguna suma",
      returns.length > 0 && returns.every((item) => item.quantity.lessThan(0)),
    );

    // --- 6. Rechazos -----------------------------------------------------------
    console.log("\n6. Rechazos");

    const validation = await receivedOrder([
      { productId: casco.id, ordered: 5, received: 5 },
    ]);
    const validationLine = validation.items[0]!;

    check(
      "cantidad cero rechazada",
      (await returnGoods({
        orderId: validation.id,
        warehouseId: central.id,
        userId: user.id,
        reason: "x",
        lines: [{ itemId: validationLine.id, quantity: 0 }],
      })).ok === false,
    );
    check(
      "cantidad negativa rechazada",
      (await returnGoods({
        orderId: validation.id,
        warehouseId: central.id,
        userId: user.id,
        reason: "x",
        lines: [{ itemId: validationLine.id, quantity: -2 }],
      })).ok === false,
    );
    check(
      "motivo vacío rechazado",
      (await returnGoods({
        orderId: validation.id,
        warehouseId: central.id,
        userId: user.id,
        reason: "   ",
        lines: [{ itemId: validationLine.id, quantity: 1 }],
      })).ok === false,
    );
    check(
      "bodega de otra sucursal rechazada",
      errorOf(await returnGoods({
        orderId: validation.id,
        warehouseId: ajena.id,
        userId: user.id,
        reason: "x",
        lines: [{ itemId: validationLine.id, quantity: 1 }],
      }))?.includes("no pertenece") === true,
    );
    check(
      "bodega inactiva rechazada",
      errorOf(await returnGoods({
        orderId: validation.id,
        warehouseId: cerrada.id,
        userId: user.id,
        reason: "x",
        lines: [{ itemId: validationLine.id, quantity: 1 }],
      }))?.includes("inactiva") === true,
    );
    check(
      "línea de otra orden rechazada",
      errorOf(await returnGoods({
        orderId: validation.id,
        warehouseId: central.id,
        userId: user.id,
        reason: "x",
        lines: [{ itemId: cascoLine.id, quantity: 1 }],
      }))?.includes("no pertenece") === true,
    );

    // Producto inactivo: el motor lo detiene.
    const inactiveOrder = await receivedOrder([
      { productId: retirado.id, ordered: 3, received: 3 },
    ]);
    await prisma.posProduct.update({
      where: { id: retirado.id },
      data: { isActive: false },
    });
    check(
      "producto inactivo rechazado",
      errorOf(await returnGoods({
        orderId: inactiveOrder.id,
        warehouseId: central.id,
        userId: user.id,
        reason: "x",
        lines: [{ itemId: inactiveOrder.items[0]!.id, quantity: 1 }],
      }))?.includes("inactivo") === true,
    );
    await prisma.posProduct.update({
      where: { id: retirado.id },
      data: { isActive: true },
    });

    // Proveedor inactivo.
    await prisma.thirdParty.update({
      where: { id: supplier.id },
      data: { isActive: false },
    });
    check(
      "proveedor inactivo rechazado",
      errorOf(await returnGoods({
        orderId: validation.id,
        warehouseId: central.id,
        userId: user.id,
        reason: "x",
        lines: [{ itemId: validationLine.id, quantity: 1 }],
      }))?.includes("inactivo") === true,
    );
    await prisma.thirdParty.update({
      where: { id: supplier.id },
      data: { isActive: true },
    });

    // Órdenes que no han recibido nada.
    const approved = await receivedOrder(
      [{ productId: casco.id, ordered: 4, received: 0 }],
      "APROBADA",
    );
    check(
      "una orden sin mercancía recibida no admite devolución",
      errorOf(await returnGoods({
        orderId: approved.id,
        warehouseId: central.id,
        userId: user.id,
        reason: "x",
        lines: [{ itemId: approved.items[0]!.id, quantity: 1 }],
      }))?.includes("todavía no ha recibido") === true,
    );

    const cancelled = await receivedOrder(
      [{ productId: casco.id, ordered: 4, received: 0 }],
      "ANULADA",
    );
    check(
      "una orden anulada no tiene nada que devolver",
      errorOf(await returnGoods({
        orderId: cancelled.id,
        warehouseId: central.id,
        userId: user.id,
        reason: "x",
        lines: [{ itemId: cancelled.items[0]!.id, quantity: 1 }],
      }))?.includes("anulada") === true,
    );

    // --- 7. Rollback ------------------------------------------------------------
    console.log("\n7. Un fallo tras la primera línea no deja nada");

    const rollbackOrder = await receivedOrder([
      { productId: casco.id, ordered: 6, received: 6 },
      { productId: aceite.id, ordered: 6, received: 6 },
    ]);
    const cascoState = await balanceOf(central.id, casco.id);
    const aceiteState = await balanceOf(central.id, aceite.id);
    const movementsBefore = await prisma.posInventoryMovement.count({
      where: { warehouseId: central.id },
    });

    const rolled = await returnGoods(
      {
        orderId: rollbackOrder.id,
        warehouseId: central.id,
        userId: user.id,
        reason: "Debe deshacerse",
        lines: [
          { itemId: rollbackOrder.items[0]!.id, quantity: 6 },
          { itemId: rollbackOrder.items[1]!.id, quantity: 6 },
        ],
      },
      { failAfterFirstLine: true },
    );
    check("la devolución forzada a fallar no dice que sí", rolled.ok === false);
    check(
      "ningún movimiento sobrevive",
      (await prisma.posInventoryMovement.count({ where: { warehouseId: central.id } })) ===
        movementsBefore,
    );
    check("el saldo del casco quedó intacto", (await balanceOf(central.id, casco.id)) === cascoState);
    check(
      "el saldo del aceite quedó intacto",
      (await balanceOf(central.id, aceite.id)) === aceiteState,
    );
    check(
      "ninguna cantidad devuelta sobrevive",
      (await lineState(rollbackOrder.items[0]!.id)).returned === 0,
    );

    // --- 8. Concurrencia ---------------------------------------------------------
    console.log("\n8. Dos devoluciones concurrentes no pueden devolver de más");

    const raceOrder = await receivedOrder([
      { productId: casco.id, ordered: 50, received: 50 },
    ]);
    const raceLine = raceOrder.items[0]!;
    const raceBefore = await balanceOf(central.id, casco.id);

    const races = await Promise.all([
      returnGoods({
        orderId: raceOrder.id,
        warehouseId: central.id,
        userId: user.id,
        reason: "Carrera A",
        lines: [{ itemId: raceLine.id, quantity: 30 }],
      }),
      returnGoods({
        orderId: raceOrder.id,
        warehouseId: central.id,
        userId: user.id,
        reason: "Carrera B",
        lines: [{ itemId: raceLine.id, quantity: 30 }],
      }),
    ]);
    check(
      "exactamente una de las dos gana",
      races.filter((result) => result.ok).length === 1,
      JSON.stringify(races),
    );
    check(
      "lo devuelto no supera lo recibido",
      (await lineState(raceLine.id)).returned === 30,
      String((await lineState(raceLine.id)).returned),
    );
    check(
      "el inventario bajó exactamente 30",
      (await balanceOf(central.id, casco.id)) === raceBefore - 30,
    );

    // --- 9. Sin el bloqueo de la orden, la prueba falla --------------------------
    console.log("\n9. Bloquear el saldo no basta");

    const unlockedOrder = await receivedOrder([
      { productId: casco.id, ordered: 50, received: 50 },
    ]);
    const unlockedLine = unlockedOrder.items[0]!;
    const unlockedBefore = await balanceOf(central.id, casco.id);

    const unlocked = await Promise.all([
      returnGoods(
        {
          orderId: unlockedOrder.id,
          warehouseId: central.id,
          userId: user.id,
          reason: "Sin bloqueo A",
          lines: [{ itemId: unlockedLine.id, quantity: 30 }],
        },
        { lockOrder: false },
      ),
      returnGoods(
        {
          orderId: unlockedOrder.id,
          warehouseId: central.id,
          userId: user.id,
          reason: "Sin bloqueo B",
          lines: [{ itemId: unlockedLine.id, quantity: 30 }],
        },
        { lockOrder: false },
      ),
    ]);
    const overReturned = (await lineState(unlockedLine.id)).returned;
    const overMoved = unlockedBefore - (await balanceOf(central.id, casco.id));
    // **Documenta el fallo, no lo aprueba.** Sin bloquear la orden las dos leen
    // `devuelto = 0`, ambas creen que caben 30, y ambas escriben `0 + 30 = 30`:
    // el inventario baja 60 mientras el documento registra 30. Bitácora y
    // documento se descuadran entre sí, igual que en POS1.2-B.
    check(
      "sin el bloqueo de la orden, inventario y documento se descuadran",
      unlocked.filter((result) => result.ok).length === 2 &&
        overMoved === 60 &&
        overReturned === 30,
      `aceptadas=${unlocked.filter((r) => r.ok).length} devuelto=${overReturned} salió=${overMoved}`,
    );

    // --- 10. Nada más se tocó ------------------------------------------------------
    console.log("\n10. Una devolución no crea contabilidad, caja ni deuda");

    check("ningún asiento contable", (await prisma.journalEntry.count()) === before.entries);
    check("ninguna contabilización", (await prisma.postingRecord.count()) === before.postings);
    check("ningún documento de caja", (await prisma.cashDocument.count()) === before.cash);
    check(
      "ninguna cuenta por cobrar ni por pagar",
      (await prisma.receivableDocument.count()) === before.receivables,
    );
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
      "la línea guarda pedido, recibido y devuelto, y ningún derivado",
      names.includes("quantity") &&
        names.includes("received_quantity") &&
        names.includes("returned_quantity") &&
        !names.includes("pending_quantity") &&
        !names.includes("returnable_quantity"),
      names.join(","),
    );
  } finally {
    await cleanup();
    console.log(`\nRESULTADO SMOKE-POS1.2-D: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
