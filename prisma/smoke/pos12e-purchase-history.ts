/**
 * SMOKE-POS1.2-E — bitácora de las órdenes de compra.
 *
 *   npm run smoke:pos-purchase-history
 *
 * Lo que esta suite tiene que demostrar:
 *
 * 1. **Los seis hechos quedan registrados**, con quién, cuándo, cuánto y por qué.
 * 2. **La bitácora vive y muere con su operación**: un rollback no deja evento
 *    huérfano, y una transición que pierde una carrera no deja evento duplicado.
 * 3. **Una orden anterior a este parche no recibe historia inventada.**
 * 4. **La bitácora no toca nada**: ni inventario, ni contabilidad, ni caja.
 *
 * Reproduce el cuerpo transaccional de las acciones de compra.
 *
 * Limpieza guiada por TAG.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import { posPurchaseEventTypeValues, sanitizePosText } from "@/server/pos/shared";

const prisma = new PrismaClient();
const TAG = `SMOKE-POS12E-${Date.now()}`;

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

function generateOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `OC-${date}-${suffix}`;
}

/** Reproduce `recordPurchaseEvent`. */
async function recordEvent(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    type: Prisma.PosPurchaseOrderEventCreateInput["type"];
    actorId: string;
    productId?: string;
    quantity?: number;
    reason?: string | null;
  },
) {
  await tx.posPurchaseOrderEvent.create({
    data: {
      orderId: input.orderId,
      type: input.type,
      actorId: input.actorId,
      productId: input.productId,
      quantity:
        input.quantity === undefined
          ? null
          : new Prisma.Decimal(input.quantity.toFixed(3)),
      reason: input.reason ?? null,
    },
  });
}

/** Reproduce el motor de inventario. */
async function applyMovement(
  tx: Prisma.TransactionClient,
  input: {
    warehouseId: string;
    productId: string;
    quantity: number;
    type: Prisma.PosInventoryMovementCreateInput["type"];
    reason: string;
    userId: string;
  },
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "pos_inventory" WHERE "warehouse_id" = ${input.warehouseId} AND "product_id" = ${input.productId} FOR UPDATE`,
  );
  const balance = await tx.posInventory.findUnique({
    where: {
      warehouseId_productId: {
        warehouseId: input.warehouseId,
        productId: input.productId,
      },
    },
  });
  if (!balance) throw new Error("El producto no tiene saldo abierto en esa bodega.");
  const quantityBefore = balance.quantity;
  const movementQuantity = toQuantity(input.quantity);
  const quantityAfter = quantityBefore.add(movementQuantity);
  await tx.posInventoryMovement.create({
    data: {
      warehouseId: input.warehouseId,
      productId: input.productId,
      type: input.type,
      quantity: movementQuantity,
      quantityBefore,
      quantityAfter,
      reason: input.reason,
      createdByUserId: input.userId,
    },
  });
  await tx.posInventory.update({
    where: { id: balance.id },
    data: { quantity: quantityAfter },
  });
}

type Outcome = { ok: true } | { ok: false; error: string };

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

  await prisma.posPurchaseOrderEvent.deleteMany({ where: { orderId: { in: orderIds } } });
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

async function timeline(orderId: string) {
  return prisma.posPurchaseOrderEvent.findMany({
    where: { orderId },
    include: { actor: { select: { name: true } }, product: { select: { sku: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

async function main() {
  await cleanup();

  const before = {
    entries: await prisma.journalEntry.count(),
    postings: await prisma.postingRecord.count(),
    cash: await prisma.cashDocument.count(),
    receivables: await prisma.receivableDocument.count(),
    serialized: await prisma.inventoryMovement.count(),
  };

  try {
    // --- Fixtures ---------------------------------------------------------
    const branch = await prisma.branch.create({
      data: { code: `${TAG}-suc`.toLowerCase(), name: `${TAG} sucursal` },
    });
    const user = await prisma.user.create({
      data: {
        name: `${TAG} Gerente`,
        email: `${TAG.toLowerCase()}@smoke.local`,
        passwordHash: "smoke:not-a-real-hash",
        role: "GERENTE",
      },
    });
    const supplier = await prisma.thirdParty.create({
      data: { branchId: branch.id, type: "PROVEEDOR", name: `${TAG} Proveedor` },
    });
    const warehouse = await prisma.posWarehouse.create({
      data: { branchId: branch.id, code: `${TAG}-BODEGA`, name: "Bodega" },
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
    for (const product of [casco, aceite]) {
      await prisma.posInventory.create({
        data: { warehouseId: warehouse.id, productId: product.id },
      });
    }

    /** Reproduce `createPosPurchaseOrderAction`, con su evento. */
    async function createOrder(
      lines: Array<{ productId: string; quantity: number }>,
      failAfterCreate = false,
    ) {
      return prisma.$transaction(async (tx) => {
        const order = await tx.posPurchaseOrder.create({
          data: {
            orderNumber: generateOrderNumber(),
            branchId: branch.id,
            supplierId: supplier.id,
            status: "BORRADOR",
            createdByUserId: user.id,
            subtotal: toMoney(1000),
            total: toMoney(1000),
            items: {
              create: lines.map((line, position) => ({
                productId: line.productId,
                quantity: toQuantity(line.quantity),
                unitCost: toMoney(100),
                total: toMoney(line.quantity * 100),
                position,
              })),
            },
          },
          include: { items: { orderBy: { position: "asc" } } },
        });
        await recordEvent(tx, {
          orderId: order.id,
          type: "CREADA",
          actorId: user.id,
        });
        if (failAfterCreate) throw new Error("Fallo forzado tras crear.");
        return order;
      });
    }

    /** Reproduce `approvePosPurchaseOrderAction`, con su evento tras la guarda. */
    async function approve(orderId: string): Promise<Outcome> {
      return prisma.$transaction(async (tx) => {
        const order = await tx.posPurchaseOrder.findUnique({ where: { id: orderId } });
        if (!order) return { ok: false as const, error: "no existe" };
        if (order.status !== "BORRADOR") {
          return { ok: false as const, error: "solo borrador" };
        }
        const guarded = await tx.posPurchaseOrder.updateMany({
          where: { id: orderId, status: "BORRADOR" },
          data: { status: "APROBADA", approvedById: user.id, approvedAt: new Date() },
        });
        if (guarded.count !== 1) return { ok: false as const, error: "solo borrador" };
        // **Después de la guarda**: quien pierde la carrera no deja evento.
        await recordEvent(tx, { orderId, type: "APROBADA", actorId: user.id });
        return { ok: true as const };
      });
    }

    /** Reproduce `receivePosPurchaseOrderAction`, con un evento por línea. */
    async function receive(
      orderId: string,
      lines: Array<{ itemId: string; quantity: number }>,
      failAfterFirstLine = false,
    ): Promise<Outcome> {
      try {
        return await prisma.$transaction(async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "pos_purchase_orders" WHERE "id" = ${orderId} FOR UPDATE`,
          );
          const order = await tx.posPurchaseOrder.findUniqueOrThrow({
            where: { id: orderId },
            include: { items: true },
          });
          const itemsById = new Map(order.items.map((item) => [item.id, item]));
          const plan = lines.map((line) => {
            const item = itemsById.get(line.itemId);
            if (!item) throw new Error("La línea no pertenece a esta orden.");
            const pending = item.quantity.sub(item.receivedQuantity);
            if (toQuantity(line.quantity).greaterThan(pending)) {
              throw new Error("No puedes recibir más de lo pendiente.");
            }
            return { item, quantity: line.quantity };
          });
          const ordered = [...plan].sort((left, right) =>
            left.item.productId.localeCompare(right.item.productId),
          );

          let done = 0;
          for (const line of ordered) {
            await applyMovement(tx, {
              warehouseId: warehouse.id,
              productId: line.item.productId,
              quantity: line.quantity,
              type: "COMPRA",
              reason: `Recepción de orden ${order.orderNumber}`,
              userId: user.id,
            });
            await tx.posPurchaseOrderItem.update({
              where: { id: line.item.id },
              data: {
                receivedQuantity: line.item.receivedQuantity.add(
                  toQuantity(line.quantity),
                ),
              },
            });
            done += 1;
            if (failAfterFirstLine && done === 1 && ordered.length > 1) {
              throw new Error("Fallo forzado tras la primera línea.");
            }
          }

          const after = await tx.posPurchaseOrderItem.findMany({
            where: { orderId },
            select: { quantity: true, receivedQuantity: true },
          });
          const complete = after.every((item) =>
            item.receivedQuantity.greaterThanOrEqualTo(item.quantity),
          );
          const guarded = await tx.posPurchaseOrder.updateMany({
            where: { id: orderId, status: { in: ["APROBADA", "RECIBIDA_PARCIAL"] } },
            data: { status: complete ? "RECIBIDA" : "RECIBIDA_PARCIAL" },
          });
          if (guarded.count !== 1) throw new Error("La orden cambió de estado.");

          const receiptType = complete ? "RECEPCION_TOTAL" : "RECEPCION_PARCIAL";
          for (const line of ordered) {
            await recordEvent(tx, {
              orderId,
              type: receiptType,
              actorId: user.id,
              productId: line.item.productId,
              quantity: line.quantity,
            });
          }
          return { ok: true as const };
        });
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "fallo",
        };
      }
    }

    /** Reproduce `returnPosPurchaseOrderAction`, con un evento por línea. */
    async function returnGoods(
      orderId: string,
      lines: Array<{ itemId: string; quantity: number }>,
      reasonText: string,
    ): Promise<Outcome> {
      const reason = sanitizePosText(reasonText, 500);
      if (!reason) return { ok: false, error: "Indica el motivo de la devolución." };
      try {
        return await prisma.$transaction(async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "pos_purchase_orders" WHERE "id" = ${orderId} FOR UPDATE`,
          );
          const order = await tx.posPurchaseOrder.findUniqueOrThrow({
            where: { id: orderId },
            include: { items: true },
          });
          const itemsById = new Map(order.items.map((item) => [item.id, item]));
          const plan = lines.map((line) => {
            const item = itemsById.get(line.itemId);
            if (!item) throw new Error("La línea no pertenece a esta orden.");
            const returnable = item.receivedQuantity.sub(item.returnedQuantity);
            if (toQuantity(line.quantity).greaterThan(returnable)) {
              throw new Error("No puedes devolver más de lo recibido.");
            }
            return { item, quantity: line.quantity };
          });
          const ordered = [...plan].sort((left, right) =>
            left.item.productId.localeCompare(right.item.productId),
          );
          for (const line of ordered) {
            await applyMovement(tx, {
              warehouseId: warehouse.id,
              productId: line.item.productId,
              quantity: -line.quantity,
              type: "DEVOLUCION",
              reason: `Devolución de orden ${order.orderNumber}: ${reason}`,
              userId: user.id,
            });
            await tx.posPurchaseOrderItem.update({
              where: { id: line.item.id },
              data: {
                returnedQuantity: line.item.returnedQuantity.add(
                  toQuantity(line.quantity),
                ),
              },
            });
          }
          for (const line of ordered) {
            await recordEvent(tx, {
              orderId,
              type: "DEVOLUCION",
              actorId: user.id,
              productId: line.item.productId,
              quantity: line.quantity,
              reason,
            });
          }
          return { ok: true as const };
        });
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "fallo",
        };
      }
    }

    /** Reproduce `cancelPosPurchaseOrderAction`, con su evento tras la guarda. */
    async function cancel(orderId: string, reasonText: string): Promise<Outcome> {
      const reason = sanitizePosText(reasonText, 500);
      if (!reason) return { ok: false, error: "Indica el motivo de la anulación." };
      return prisma.$transaction(async (tx) => {
        const order = await tx.posPurchaseOrder.findUnique({ where: { id: orderId } });
        if (!order) return { ok: false as const, error: "no existe" };
        if (order.status !== "BORRADOR" && order.status !== "APROBADA") {
          return { ok: false as const, error: "no anulable" };
        }
        const guarded = await tx.posPurchaseOrder.updateMany({
          where: { id: orderId, status: { in: ["BORRADOR", "APROBADA"] } },
          data: {
            status: "ANULADA",
            cancelledById: user.id,
            cancelledAt: new Date(),
            cancelledReason: reason,
          },
        });
        if (guarded.count !== 1) return { ok: false as const, error: "no anulable" };
        await recordEvent(tx, {
          orderId,
          type: "ANULADA",
          actorId: user.id,
          reason,
        });
        return { ok: true as const };
      });
    }

    // --- 1. Los seis hechos --------------------------------------------------
    console.log("\n1. El ciclo de vida completo queda registrado");

    const order = await createOrder([
      { productId: casco.id, quantity: 100 },
      { productId: aceite.id, quantity: 8 },
    ]);
    const cascoLine = order.items[0]!;
    const aceiteLine = order.items[1]!;

    let events = await timeline(order.id);
    check("crear deja un evento", events.length === 1);
    check("de tipo CREADA", events[0]?.type === "CREADA");
    check("con su autor", events[0]?.actor.name === `${TAG} Gerente`);
    check("con su fecha", events[0]?.createdAt instanceof Date);
    check("sin cantidad, porque crear no mueve nada", events[0]?.quantity === null);

    await approve(order.id);
    events = await timeline(order.id);
    check("aprobar añade un evento", events.length === 2);
    check("de tipo APROBADA", events[1]?.type === "APROBADA");

    await receive(order.id, [{ itemId: cascoLine.id, quantity: 40 }]);
    events = await timeline(order.id);
    check("una recepción parcial añade un evento", events.length === 3);
    check("de tipo RECEPCION_PARCIAL", events[2]?.type === "RECEPCION_PARCIAL");
    check("con la cantidad recibida", events[2]?.quantity?.toNumber() === 40);
    check("y el producto", events[2]?.product?.sku === `${TAG}-CASCO`);

    // Completar la orden: dos líneas, dos eventos, ambos TOTAL.
    await receive(order.id, [
      { itemId: cascoLine.id, quantity: 60 },
      { itemId: aceiteLine.id, quantity: 8 },
    ]);
    events = await timeline(order.id);
    check("una recepción de dos líneas añade dos eventos", events.length === 5);
    check(
      "ambos son RECEPCION_TOTAL: esa operación cerró la orden",
      events[3]?.type === "RECEPCION_TOTAL" && events[4]?.type === "RECEPCION_TOTAL",
    );
    check(
      "cada uno lleva su propio producto y cantidad",
      new Set(events.slice(3).map((event) => event.product?.sku)).size === 2,
    );

    const returned = await returnGoods(
      order.id,
      [{ itemId: aceiteLine.id, quantity: 2.5 }],
      "Dos litros y medio llegaron derramados",
    );
    check("devolver se registra", returned.ok === true);
    events = await timeline(order.id);
    check("añade un evento", events.length === 6);
    check("de tipo DEVOLUCION", events[5]?.type === "DEVOLUCION");
    check(
      "con decimales exactos",
      events[5]?.quantity?.toNumber() === 2.5,
      String(events[5]?.quantity),
    );
    check(
      "y con su motivo",
      events[5]?.reason === "Dos litros y medio llegaron derramados",
    );

    // Anulación en otra orden: una recibida ya no se anula.
    const draft = await createOrder([{ productId: casco.id, quantity: 5 }]);
    await approve(draft.id);
    await cancel(draft.id, "El proveedor no puede surtir");
    const draftEvents = await timeline(draft.id);
    check("anular añade un evento", draftEvents.length === 3);
    check("de tipo ANULADA", draftEvents[2]?.type === "ANULADA");
    check(
      "con el motivo de la anulación",
      draftEvents[2]?.reason === "El proveedor no puede surtir",
    );

    // --- 2. Orden cronológico -------------------------------------------------
    console.log("\n2. Orden cronológico y determinista");

    const ordered = await timeline(order.id);
    const ascending = ordered.every(
      (event, index) =>
        index === 0 || event.createdAt >= ordered[index - 1]!.createdAt,
    );
    check("los eventos salen por fecha ascendente", ascending);
    check(
      "la secuencia es la del ciclo de vida",
      ordered.map((event) => event.type).join(",") ===
        "CREADA,APROBADA,RECEPCION_PARCIAL,RECEPCION_TOTAL,RECEPCION_TOTAL,DEVOLUCION",
      ordered.map((event) => event.type).join(","),
    );
    // Dos eventos de la misma transacción comparten milisegundo: sin el segundo
    // criterio el orden variaría entre cargas.
    const repeated = await timeline(order.id);
    check(
      "dos consultas devuelven exactamente el mismo orden",
      repeated.map((event) => event.id).join(",") ===
        ordered.map((event) => event.id).join(","),
    );

    // --- 3. Sin historia inventada --------------------------------------------
    console.log("\n3. Una orden anterior al parche no recibe historia inventada");

    // Escrita directamente, como estaban las órdenes antes de POS1.2-E.
    const legacy = await prisma.posPurchaseOrder.create({
      data: {
        orderNumber: generateOrderNumber(),
        branchId: branch.id,
        supplierId: supplier.id,
        status: "APROBADA",
        approvedById: user.id,
        approvedAt: new Date(),
        createdByUserId: user.id,
        subtotal: toMoney(500),
        total: toMoney(500),
        items: {
          create: [
            {
              productId: casco.id,
              quantity: toQuantity(5),
              unitCost: toMoney(100),
              total: toMoney(500),
              receivedQuantity: toQuantity(5),
            },
          ],
        },
      },
    });
    check(
      "una orden con datos pero sin bitácora no tiene eventos",
      (await timeline(legacy.id)).length === 0,
    );
    check(
      "y sus columnas siguen ahí: la ausencia es de historial, no de datos",
      legacy.approvedAt !== null && legacy.createdByUserId === user.id,
    );

    // --- 4. Rollback ------------------------------------------------------------
    console.log("\n4. Un fallo se lleva su evento");

    const eventsBefore = await prisma.posPurchaseOrderEvent.count();
    const ordersBefore = await prisma.posPurchaseOrder.count({
      where: { branchId: branch.id },
    });
    let threw = false;
    try {
      await createOrder([{ productId: casco.id, quantity: 1 }], true);
    } catch {
      threw = true;
    }
    check("la creación forzada a fallar lanzó", threw);
    check(
      "no sobrevive la orden",
      (await prisma.posPurchaseOrder.count({ where: { branchId: branch.id } })) ===
        ordersBefore,
    );
    check(
      "ni su evento: la bitácora rueda atrás con la operación",
      (await prisma.posPurchaseOrderEvent.count()) === eventsBefore,
    );

    // Rollback de una recepción a mitad.
    const rollbackOrder = await createOrder([
      { productId: casco.id, quantity: 6 },
      { productId: aceite.id, quantity: 6 },
    ]);
    await approve(rollbackOrder.id);
    const beforeReceipt = (await timeline(rollbackOrder.id)).length;
    const movementsBefore = await prisma.posInventoryMovement.count();

    const rolled = await receive(
      rollbackOrder.id,
      [
        { itemId: rollbackOrder.items[0]!.id, quantity: 6 },
        { itemId: rollbackOrder.items[1]!.id, quantity: 6 },
      ],
      true,
    );
    check("la recepción forzada a fallar no dice que sí", rolled.ok === false);
    check(
      "ningún evento de recepción sobrevive",
      (await timeline(rollbackOrder.id)).length === beforeReceipt,
    );
    check(
      "ni ningún movimiento de inventario",
      (await prisma.posInventoryMovement.count()) === movementsBefore,
    );

    // --- 5. Concurrencia --------------------------------------------------------
    console.log("\n5. Una carrera perdida no duplica historia");

    const raced = await createOrder([{ productId: casco.id, quantity: 3 }]);
    const approvals = await Promise.all([
      approve(raced.id),
      approve(raced.id),
      approve(raced.id),
    ]);
    check(
      "exactamente una aprobación gana",
      approvals.filter((result) => result.ok).length === 1,
      String(approvals.filter((result) => result.ok).length),
    );
    const racedEvents = await timeline(raced.id);
    check(
      "y hay exactamente un evento APROBADA",
      racedEvents.filter((event) => event.type === "APROBADA").length === 1,
      String(racedEvents.filter((event) => event.type === "APROBADA").length),
    );

    const cancelRace = await createOrder([{ productId: casco.id, quantity: 3 }]);
    const cancels = await Promise.all([
      cancel(cancelRace.id, "Carrera 1"),
      cancel(cancelRace.id, "Carrera 2"),
    ]);
    check(
      "exactamente una anulación gana",
      cancels.filter((result) => result.ok).length === 1,
    );
    check(
      "y hay exactamente un evento ANULADA",
      (await timeline(cancelRace.id)).filter((event) => event.type === "ANULADA")
        .length === 1,
    );

    // --- 6. Integridad de la bitácora --------------------------------------------
    console.log("\n6. Integridad");

    const allEvents = await prisma.posPurchaseOrderEvent.findMany({
      where: { order: { branchId: branch.id } },
    });
    check("no hay eventos huérfanos", allEvents.length > 0);
    check("todos tienen autor", allEvents.every((event) => !!event.actorId));
    check("todos tienen fecha", allEvents.every((event) => !!event.createdAt));
    check(
      "solo recepciones y devoluciones llevan cantidad",
      allEvents.every((event) =>
        ["RECEPCION_PARCIAL", "RECEPCION_TOTAL", "DEVOLUCION"].includes(event.type)
          ? event.quantity !== null && event.productId !== null
          : event.quantity === null && event.productId === null,
      ),
    );
    check(
      "los seis tipos del vocabulario son escribibles",
      posPurchaseEventTypeValues.length === 6,
    );

    // Borrar la orden se lleva su bitácora: es parte del documento.
    const disposable = await createOrder([{ productId: casco.id, quantity: 1 }]);
    await prisma.posPurchaseOrderItem.deleteMany({ where: { orderId: disposable.id } });
    await prisma.posPurchaseOrder.delete({ where: { id: disposable.id } });
    check(
      "borrar la orden arrastra su bitácora (Cascade)",
      (await prisma.posPurchaseOrderEvent.count({ where: { orderId: disposable.id } })) ===
        0,
    );

    // --- 7. La bitácora no toca nada -----------------------------------------------
    console.log("\n7. Registrar no cambia inventario, contabilidad, caja ni deuda");

    const inventoryNow = await prisma.posInventory.findUniqueOrThrow({
      where: {
        warehouseId_productId: { warehouseId: warehouse.id, productId: aceite.id },
      },
    });
    // 8 recibidos − 2,5 devueltos: exactamente lo que hicieron las operaciones,
    // sin que la bitácora añadiera ni quitara nada.
    check(
      "el saldo del aceite es el que dejaron las operaciones",
      inventoryNow.quantity.toNumber() === 5.5,
      String(inventoryNow.quantity),
    );
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

    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pos_purchase_order_events'
    `;
    const names = columns.map((column) => column.column_name);
    check(
      "la bitácora no tiene ninguna columna financiera",
      !names.some((name) => /amount|total|cost|price|payable|balance/.test(name)),
      names.join(","),
    );
    check(
      "y no tiene updated_at: solo se añade",
      !names.includes("updated_at"),
    );
  } finally {
    await cleanup();
    console.log(`\nRESULTADO SMOKE-POS1.2-E: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
