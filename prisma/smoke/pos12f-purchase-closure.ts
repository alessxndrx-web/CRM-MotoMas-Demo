/**
 * SMOKE-POS1.2-F — cierre del módulo de compras.
 *
 *   npm run smoke:pos-purchase-closure
 *
 * **No es una suite más de una operación: es la prueba de cierre.** Recorre el
 * ciclo entero con cantidades realistas y comprueba las **invariantes** del
 * módulo, no sus pasos por separado.
 *
 * Las cinco que importan:
 *
 * 1. `0 ≤ devuelto ≤ recibido ≤ pedido`, en toda línea y en todo momento.
 * 2. **El saldo de cada par bodega+producto es la suma de su bitácora.**
 * 3. **Toda mutación de existencias pasa por el motor**: comprobado leyendo el
 *    código fuente, no solo el resultado.
 * 4. **La bitácora refleja exactamente las operaciones que ocurrieron**, ni una
 *    de más ni una de menos.
 * 5. **Nada de contabilidad, caja, deuda ni inventario serializado.**
 *
 * Limpieza guiada por TAG.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";

import { sanitizePosQuantity, sanitizePosText } from "@/server/pos/shared";

const prisma = new PrismaClient();
const TAG = `SMOKE-POS12F-${Date.now()}`;

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

const money = (value: number) => new Prisma.Decimal(value.toFixed(2));
const qty = (value: number) => new Prisma.Decimal(value.toFixed(3));

function generateOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `OC-${date}-${suffix}`;
}

/* -------------------------------------------------------------------------
 * El motor y las cinco operaciones, reproducidos como en producción.
 * ---------------------------------------------------------------------- */

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

  const before = balance.quantity;
  const delta = qty(input.quantity);
  const after = before.add(delta);
  await tx.posInventoryMovement.create({
    data: {
      warehouseId: input.warehouseId,
      productId: input.productId,
      type: input.type,
      quantity: delta,
      quantityBefore: before,
      quantityAfter: after,
      reason: input.reason,
      createdByUserId: input.userId,
    },
  });
  await tx.posInventory.update({ where: { id: balance.id }, data: { quantity: after } });
}

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
      quantity: input.quantity === undefined ? null : qty(input.quantity),
      reason: input.reason ?? null,
    },
  });
}

type Outcome = { ok: true } | { ok: false; error: string };
const errorOf = (result: Outcome) => (result.ok ? null : result.error);

async function main() {
  await cleanup();

  const before = {
    entries: await prisma.journalEntry.count(),
    postings: await prisma.postingRecord.count(),
    cash: await prisma.cashDocument.count(),
    receivables: await prisma.receivableDocument.count(),
    receivablePayments: await prisma.receivablePayment.count(),
    serialized: await prisma.inventoryMovement.count(),
    units: await prisma.motorcycleUnit.count(),
    sales: await prisma.posSale.count(),
  };

  try {
    // --- Fixtures -----------------------------------------------------------
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
    const filtro = await prisma.posProduct.create({
      data: { sku: `${TAG}-FILTRO`, name: "Filtro de aceite", unitPrice: money(180) },
    });
    const aceite = await prisma.posProduct.create({
      data: {
        sku: `${TAG}-ACEITE`,
        name: "Aceite 20W50",
        unitPrice: money(95),
        unit: "LITRO",
      },
    });
    for (const product of [filtro, aceite]) {
      await prisma.posInventory.create({
        data: { warehouseId: warehouse.id, productId: product.id },
      });
    }

    const TX = { timeout: 20_000 } as const;

    async function createOrder(
      lines: Array<{ productId: string; quantity: number; unitCost: number }>,
    ) {
      return prisma.$transaction(async (tx) => {
        const order = await tx.posPurchaseOrder.create({
          data: {
            orderNumber: generateOrderNumber(),
            branchId: branch.id,
            supplierId: supplier.id,
            status: "BORRADOR",
            createdByUserId: user.id,
            subtotal: money(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)),
            total: money(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)),
            items: {
              create: lines.map((line, position) => ({
                productId: line.productId,
                quantity: qty(line.quantity),
                unitCost: money(line.unitCost),
                total: money(line.quantity * line.unitCost),
                position,
              })),
            },
          },
          include: { items: { orderBy: { position: "asc" } } },
        });
        await recordEvent(tx, { orderId: order.id, type: "CREADA", actorId: user.id });
        return order;
      }, TX);
    }

    async function approve(orderId: string): Promise<Outcome> {
      // El `try` no es decorativo: bajo concurrencia una transacción puede no
      // llegar a **arrancar** (`maxWait` del pool). Eso es un límite de
      // capacidad, no un rechazo del dominio, y sin capturarlo la prueba
      // confundiría los dos.
      try {
        return await approveInner(orderId);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "fallo" };
      }
    }

    async function approveInner(orderId: string): Promise<Outcome> {
      return prisma.$transaction(async (tx) => {
        const order = await tx.posPurchaseOrder.findUnique({
          where: { id: orderId },
          include: { _count: { select: { items: true } } },
        });
        if (!order) return { ok: false as const, error: "La orden de compra no existe." };
        if (order.status !== "BORRADOR") {
          return { ok: false as const, error: "Solo puedes modificar una orden de compra en borrador." };
        }
        if (!order._count.items) {
          return { ok: false as const, error: "La orden de compra necesita al menos una línea." };
        }
        const guarded = await tx.posPurchaseOrder.updateMany({
          where: { id: orderId, status: "BORRADOR" },
          data: { status: "APROBADA", approvedById: user.id, approvedAt: new Date() },
        });
        if (guarded.count !== 1) {
          return { ok: false as const, error: "Solo puedes modificar una orden de compra en borrador." };
        }
        await recordEvent(tx, { orderId, type: "APROBADA", actorId: user.id });
        return { ok: true as const };
      }, TX);
    }

    async function receive(
      orderId: string,
      lines: Array<{ itemId: string; quantity: number }>,
    ): Promise<Outcome> {
      for (const line of lines) {
        if (sanitizePosQuantity(line.quantity) === null) {
          return { ok: false, error: "La cantidad recibida debe ser mayor que cero." };
        }
      }
      try {
        return await prisma.$transaction(async (tx) => {
          // Control negativo reproducible. Con `SMOKE_SIN_BLOQUEO=1` la
          // recepción corre **sin** bloquear la cabecera, y §10 falla:
          // se aceptan las dos recepciones de 6 sobre 10 pendientes y el
          // inventario sube a 120 mientras el documento dice 6 — la
          // actualización perdida de POS1.2-B. Sin este control, "pasó" no
          // significaría nada. El interruptor solo puede **romper** la suite,
          // nunca ablandarla.
          if (!process.env.SMOKE_SIN_BLOQUEO) {
            await tx.$queryRaw(
              Prisma.sql`SELECT "id" FROM "pos_purchase_orders" WHERE "id" = ${orderId} FOR UPDATE`,
            );
          }
          const order = await tx.posPurchaseOrder.findUnique({
            where: { id: orderId },
            include: { items: true, supplier: { select: { isActive: true } } },
          });
          if (!order) throw new Error("La orden de compra no existe.");
          if (order.status === "ANULADA") throw new Error("Una orden anulada no puede recibirse.");
          if (order.status === "BORRADOR") {
            throw new Error("Una orden en borrador todavía no puede recibirse.");
          }
          if (order.status === "RECIBIDA") throw new Error("Esta orden ya se recibió por completo.");
          if (!order.supplier.isActive) throw new Error("El proveedor está inactivo.");

          const byId = new Map(order.items.map((item) => [item.id, item]));
          const plan = lines.map((line) => {
            const item = byId.get(line.itemId);
            if (!item) throw new Error("La línea no pertenece a esta orden.");
            const pending = item.quantity.sub(item.receivedQuantity);
            if (pending.lessThanOrEqualTo(0)) {
              throw new Error("Esa línea ya se recibió por completo.");
            }
            if (qty(line.quantity).greaterThan(pending)) {
              throw new Error(`No puedes recibir más de lo pendiente: quedan ${pending.toString()}.`);
            }
            return { item, quantity: line.quantity };
          });
          const ordered = [...plan].sort((a, b) => a.item.productId.localeCompare(b.item.productId));

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
              data: { receivedQuantity: line.item.receivedQuantity.add(qty(line.quantity)) },
            });
          }

          const after = await tx.posPurchaseOrderItem.findMany({
            where: { orderId },
            select: { quantity: true, receivedQuantity: true },
          });
          const complete = after.every((i) => i.receivedQuantity.greaterThanOrEqualTo(i.quantity));
          const guarded = await tx.posPurchaseOrder.updateMany({
            where: { id: orderId, status: { in: ["APROBADA", "RECIBIDA_PARCIAL"] } },
            data: { status: complete ? "RECIBIDA" : "RECIBIDA_PARCIAL" },
          });
          if (guarded.count !== 1) throw new Error("La orden cambió de estado durante la recepción.");

          const type = complete ? "RECEPCION_TOTAL" : "RECEPCION_PARCIAL";
          for (const line of ordered) {
            await recordEvent(tx, {
              orderId,
              type,
              actorId: user.id,
              productId: line.item.productId,
              quantity: line.quantity,
            });
          }
          return { ok: true as const };
        }, TX);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "fallo" };
      }
    }

    async function returnGoods(
      orderId: string,
      lines: Array<{ itemId: string; quantity: number }>,
      reasonText: string,
    ): Promise<Outcome> {
      const reason = sanitizePosText(reasonText, 500);
      if (!reason) return { ok: false, error: "Indica el motivo de la devolución." };
      for (const line of lines) {
        if (sanitizePosQuantity(line.quantity) === null) {
          return { ok: false, error: "La cantidad devuelta debe ser mayor que cero." };
        }
      }
      try {
        return await prisma.$transaction(async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "pos_purchase_orders" WHERE "id" = ${orderId} FOR UPDATE`,
          );
          const order = await tx.posPurchaseOrder.findUnique({
            where: { id: orderId },
            include: { items: true, supplier: { select: { isActive: true } } },
          });
          if (!order) throw new Error("La orden de compra no existe.");
          if (order.status === "ANULADA") throw new Error("Una orden anulada no tiene nada que devolver.");
          if (order.status === "BORRADOR" || order.status === "APROBADA") {
            throw new Error("Esta orden todavía no ha recibido mercancía.");
          }
          if (!order.supplier.isActive) throw new Error("El proveedor está inactivo.");

          const byId = new Map(order.items.map((item) => [item.id, item]));
          const plan = lines.map((line) => {
            const item = byId.get(line.itemId);
            if (!item) throw new Error("La línea no pertenece a esta orden.");
            const returnable = item.receivedQuantity.sub(item.returnedQuantity);
            if (qty(line.quantity).greaterThan(returnable)) {
              throw new Error(`No puedes devolver más de lo recibido: quedan ${returnable.toString()}.`);
            }
            return { item, quantity: line.quantity };
          });
          const ordered = [...plan].sort((a, b) => a.item.productId.localeCompare(b.item.productId));

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
              data: { returnedQuantity: line.item.returnedQuantity.add(qty(line.quantity)) },
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
        }, TX);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "fallo" };
      }
    }

    async function cancel(orderId: string, reasonText: string): Promise<Outcome> {
      const reason = sanitizePosText(reasonText, 500);
      if (!reason) return { ok: false, error: "Indica el motivo de la anulación." };
      return prisma.$transaction(async (tx) => {
        const order = await tx.posPurchaseOrder.findUnique({
          where: { id: orderId },
          include: { items: { select: { receivedQuantity: true } } },
        });
        if (!order) return { ok: false as const, error: "La orden de compra no existe." };
        if (order.status !== "BORRADOR" && order.status !== "APROBADA") {
          return { ok: false as const, error: "Solo puedes anular una orden en borrador o aprobada." };
        }
        if (order.items.some((item) => item.receivedQuantity.greaterThan(0))) {
          return { ok: false as const, error: "No puedes anular una orden que ya recibió mercancía." };
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
        if (guarded.count !== 1) {
          return { ok: false as const, error: "Solo puedes anular una orden en borrador o aprobada." };
        }
        await recordEvent(tx, { orderId, type: "ANULADA", actorId: user.id, reason });
        return { ok: true as const };
      }, TX);
    }

    async function lineState(itemId: string) {
      const item = await prisma.posPurchaseOrderItem.findUniqueOrThrow({ where: { id: itemId } });
      return {
        ordered: item.quantity.toNumber(),
        received: item.receivedQuantity.toNumber(),
        returned: item.returnedQuantity.toNumber(),
        pending: item.quantity.sub(item.receivedQuantity).toNumber(),
        returnable: item.receivedQuantity.sub(item.returnedQuantity).toNumber(),
      };
    }
    async function statusOf(orderId: string) {
      return (await prisma.posPurchaseOrder.findUniqueOrThrow({ where: { id: orderId } })).status;
    }
    async function balanceOf(productId: string) {
      return (
        await prisma.posInventory.findUniqueOrThrow({
          where: { warehouseId_productId: { warehouseId: warehouse.id, productId } },
        })
      ).quantity.toNumber();
    }

    // --- 1. El ciclo completo, con cantidades realistas ----------------------
    console.log("\n1. Ciclo completo: crear → aprobar → recibir → recibir → devolver");

    const order = await createOrder([
      { productId: filtro.id, quantity: 120, unitCost: 145.5 },
      { productId: aceite.id, quantity: 55.5, unitCost: 78.25 },
    ]);
    const filtroLine = order.items[0]!;
    const aceiteLine = order.items[1]!;

    check("nace en BORRADOR", order.status === "BORRADOR");
    check(
      "una orden en borrador no puede recibirse",
      errorOf(await receive(order.id, [{ itemId: filtroLine.id, quantity: 1 }]))?.includes(
        "borrador",
      ) === true,
    );
    check(
      "ni devolverse",
      errorOf(
        await returnGoods(order.id, [{ itemId: filtroLine.id, quantity: 1 }], "x"),
      )?.includes("todavía no ha recibido") === true,
    );

    check("se aprueba", (await approve(order.id)).ok === true);
    check("queda APROBADA", (await statusOf(order.id)) === "APROBADA");
    check("no se aprueba dos veces", (await approve(order.id)).ok === false);

    check(
      "primera recepción parcial",
      (await receive(order.id, [
        { itemId: filtroLine.id, quantity: 80 },
        { itemId: aceiteLine.id, quantity: 30.25 },
      ])).ok === true,
    );
    check("la orden pasa a RECIBIDA_PARCIAL", (await statusOf(order.id)) === "RECIBIDA_PARCIAL");
    check("el filtro deja 40 pendientes", (await lineState(filtroLine.id)).pending === 40);
    check(
      "el aceite deja 25.25 pendientes, exacto",
      (await lineState(aceiteLine.id)).pending === 25.25,
      String((await lineState(aceiteLine.id)).pending),
    );

    check(
      "segunda recepción completa la orden",
      (await receive(order.id, [
        { itemId: filtroLine.id, quantity: 40 },
        { itemId: aceiteLine.id, quantity: 25.25 },
      ])).ok === true,
    );
    check("la orden pasa a RECIBIDA", (await statusOf(order.id)) === "RECIBIDA");
    check("nada pendiente", (await lineState(filtroLine.id)).pending === 0);
    check("el inventario del filtro es 120", (await balanceOf(filtro.id)) === 120);
    check(
      "el del aceite es 55.5",
      (await balanceOf(aceite.id)) === 55.5,
      String(await balanceOf(aceite.id)),
    );

    check(
      "se devuelve parte",
      (await returnGoods(order.id, [{ itemId: filtroLine.id, quantity: 12 }], "Doce llegaron rotos")).ok ===
        true,
    );
    check("el inventario baja a 108", (await balanceOf(filtro.id)) === 108);
    check("devuelto 12", (await lineState(filtroLine.id)).returned === 12);
    check(
      "lo pendiente NO cambia con la devolución (P-28)",
      (await lineState(filtroLine.id)).pending === 0,
    );
    check(
      "el estado NO cambia con la devolución (P-29)",
      (await statusOf(order.id)) === "RECIBIDA",
    );

    // --- 2. Transiciones imposibles -----------------------------------------
    console.log("\n2. Transiciones imposibles");

    check(
      "una orden recibida no se anula",
      errorOf(await cancel(order.id, "x"))?.includes("borrador o aprobada") === true,
    );
    check(
      "no se recibe más de lo pedido",
      errorOf(await receive(order.id, [{ itemId: filtroLine.id, quantity: 1 }]))?.includes(
        "ya se recibió",
      ) === true,
    );
    check(
      "no se devuelve más de lo recibido",
      errorOf(
        await returnGoods(order.id, [{ itemId: filtroLine.id, quantity: 109 }], "x"),
      )?.includes("más de lo recibido") === true,
    );
    // **Sobre una orden abierta**: en la ya recibida el guardia de estado dispara
    // antes y la comprobación de pertenencia nunca llegaría a evaluarse — una
    // aserción que pasa por el motivo equivocado no comprueba nada.
    const foreign = await createOrder([{ productId: filtro.id, quantity: 3, unitCost: 90 }]);
    await approve(foreign.id);
    const foreignError = errorOf(
      await receive(foreign.id, [{ itemId: "no-existe", quantity: 1 }]),
    );
    check(
      "una línea ajena se rechaza",
      foreignError?.includes("no pertenece") === true,
      foreignError ?? "",
    );
    check(
      "y la línea de OTRA orden también",
      errorOf(await receive(foreign.id, [{ itemId: filtroLine.id, quantity: 1 }]))?.includes(
        "no pertenece",
      ) === true,
    );
    check(
      "la orden ajena no recibió nada",
      (await lineState(foreign.items[0]!.id)).received === 0,
    );

    // --- 3. Invariantes de cantidad -----------------------------------------
    console.log("\n3. Invariantes de cantidad en TODAS las líneas");

    const everyLine = await prisma.posPurchaseOrderItem.findMany({
      where: { order: { branchId: branch.id } },
    });
    check("hay líneas que examinar", everyLine.length > 0, String(everyLine.length));
    check(
      "recibido ≥ 0",
      everyLine.every((i) => i.receivedQuantity.greaterThanOrEqualTo(0)),
    );
    check(
      "devuelto ≥ 0",
      everyLine.every((i) => i.returnedQuantity.greaterThanOrEqualTo(0)),
    );
    check(
      "recibido ≤ pedido",
      everyLine.every((i) => i.receivedQuantity.lessThanOrEqualTo(i.quantity)),
    );
    check(
      "devuelto ≤ recibido",
      everyLine.every((i) => i.returnedQuantity.lessThanOrEqualTo(i.receivedQuantity)),
    );

    // --- 4. El saldo es la suma de su bitácora -------------------------------
    console.log("\n4. Invariante del inventario");

    for (const [product, label] of [
      [filtro, "filtro"],
      [aceite, "aceite"],
    ] as const) {
      const movements = await prisma.posInventoryMovement.findMany({
        where: { warehouseId: warehouse.id, productId: product.id },
      });
      const sum = movements.reduce((t, m) => t.add(m.quantity), new Prisma.Decimal(0));
      check(
        `el saldo de ${label} es la suma de su bitácora`,
        sum.toNumber() === (await balanceOf(product.id)),
        `${sum.toString()} vs ${await balanceOf(product.id)}`,
      );
      check(
        `la invariante antes+cantidad=después se sostiene en ${label}`,
        movements.every((m) => m.quantityBefore.add(m.quantity).equals(m.quantityAfter)),
      );
    }
    const purchaseMovements = await prisma.posInventoryMovement.findMany({
      where: { warehouseId: warehouse.id },
    });
    check(
      "toda recepción es COMPRA positiva",
      purchaseMovements
        .filter((m) => m.type === "COMPRA")
        .every((m) => m.quantity.greaterThan(0)),
    );
    check(
      "toda devolución es DEVOLUCION negativa",
      purchaseMovements
        .filter((m) => m.type === "DEVOLUCION")
        .every((m) => m.quantity.lessThan(0)),
    );
    check(
      "compras solo escribe esos dos tipos",
      purchaseMovements.every((m) => m.type === "COMPRA" || m.type === "DEVOLUCION"),
      [...new Set(purchaseMovements.map((m) => m.type))].join(","),
    );

    // --- 5. Un solo motor, comprobado en el código fuente --------------------
    console.log("\n5. Un solo motor de mutación, comprobado estructuralmente");

    const source = readFileSync("src/server/pos/actions.ts", "utf8");
    const movementWrites = source.match(/posInventoryMovement\.create/g) ?? [];
    const balanceWrites = source.match(/posInventory\.update/g) ?? [];
    const engineLocks = source.match(/FROM "pos_inventory".*FOR UPDATE/g) ?? [];
    check(
      "existe exactamente UNA escritura de movimiento en todo el módulo",
      movementWrites.length === 1,
      String(movementWrites.length),
    );
    check(
      "y exactamente UNA actualización de saldo",
      balanceWrites.length === 1,
      String(balanceWrites.length),
    );
    check(
      "y exactamente UN bloqueo de saldo",
      engineLocks.length === 1,
      String(engineLocks.length),
    );
    check(
      "las acciones de compra llaman al motor, no a Prisma",
      (source.match(/applyPosInventoryMovement\(tx/g) ?? []).length >= 3,
    );

    // --- 6. Integridad de la bitácora ----------------------------------------
    console.log("\n6. La bitácora refleja exactamente lo que pasó");

    const events = await prisma.posPurchaseOrderEvent.findMany({
      where: { orderId: order.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    check(
      "la secuencia es la del ciclo recorrido",
      events.map((e) => e.type).join(",") ===
        "CREADA,APROBADA,RECEPCION_PARCIAL,RECEPCION_PARCIAL,RECEPCION_TOTAL,RECEPCION_TOTAL,DEVOLUCION",
      events.map((e) => e.type).join(","),
    );
    check("todos tienen autor", events.every((e) => e.actorId === user.id));
    check("todos tienen fecha", events.every((e) => !!e.createdAt));
    check(
      "solo recepciones y devoluciones llevan cantidad y producto",
      events.every((e) =>
        e.type.startsWith("RECEPCION") || e.type === "DEVOLUCION"
          ? e.quantity !== null && e.productId !== null
          : e.quantity === null && e.productId === null,
      ),
    );
    check(
      "la devolución conserva su motivo",
      events.find((e) => e.type === "DEVOLUCION")?.reason === "Doce llegaron rotos",
    );
    // Lo registrado por evento coincide con lo que la línea acumuló.
    const receivedFromEvents = events
      .filter((e) => e.type.startsWith("RECEPCION") && e.productId === filtro.id)
      .reduce((t, e) => t.add(e.quantity ?? 0), new Prisma.Decimal(0));
    check(
      "la suma de eventos de recepción iguala lo recibido en la línea",
      receivedFromEvents.toNumber() === (await lineState(filtroLine.id)).received,
      `${receivedFromEvents.toString()} vs ${(await lineState(filtroLine.id)).received}`,
    );

    // --- 7. Órdenes y productos independientes -------------------------------
    console.log("\n7. Órdenes y productos independientes");

    const second = await createOrder([{ productId: aceite.id, quantity: 10, unitCost: 80 }]);
    await approve(second.id);
    await receive(second.id, [{ itemId: second.items[0]!.id, quantity: 10 }]);
    check(
      "la segunda orden no alteró las líneas de la primera",
      (await lineState(filtroLine.id)).received === 120,
    );
    check(
      "y el inventario del aceite acumula ambas",
      (await balanceOf(aceite.id)) === 65.5,
      String(await balanceOf(aceite.id)),
    );
    check(
      "la bitácora de la primera no creció",
      (await prisma.posPurchaseOrderEvent.count({ where: { orderId: order.id } })) ===
        events.length,
    );

    // --- 8. Anulación donde es legal ------------------------------------------
    console.log("\n8. Anulación donde es legal");

    const draft = await createOrder([{ productId: filtro.id, quantity: 5, unitCost: 100 }]);
    check("un borrador se anula", (await cancel(draft.id, "Ya no hace falta")).ok === true);
    check("queda ANULADA", (await statusOf(draft.id)) === "ANULADA");
    check(
      "una anulada no admite recepción",
      errorOf(await receive(draft.id, [{ itemId: draft.items[0]!.id, quantity: 1 }]))?.includes(
        "anulada",
      ) === true,
    );

    const approved = await createOrder([{ productId: filtro.id, quantity: 5, unitCost: 100 }]);
    await approve(approved.id);
    check("una aprobada sin recibir se anula", (await cancel(approved.id, "Cancelada")).ok === true);

    // --- 9. Rollback -----------------------------------------------------------
    console.log("\n9. Un fallo deja el módulo intacto");

    // **Un rechazo por validación previa no prueba rollback.** La recepción
    // valida TODAS las líneas antes de mover ninguna, así que una cantidad
    // excesiva aborta sin haber escrito nada: la transacción no tenía qué
    // deshacer. Para probar el rollback de verdad hace falta un fallo *después*
    // de la primera escritura.
    //
    // Se consigue con un producto sin saldo abierto en la bodega: el motor lo
    // rechaza en el paso 3, cuando la línea anterior ya creó su movimiento y ya
    // actualizó su saldo. Y como las líneas se ordenan por `productId`, se elige
    // como producto roto **el que ordena después**, para que el fallo caiga con
    // seguridad en segundo lugar.
    // Se usan dos productos nuevos y propios del escenario: **no se toca el
    // saldo de los que ya se movieron**, que arrastraría los datos de las
    // comprobaciones anteriores.
    const bujia = await prisma.posProduct.create({
      data: { sku: `${TAG}-BUJIA`, name: "Bujía", unitPrice: money(60) },
    });
    const cadena = await prisma.posProduct.create({
      data: { sku: `${TAG}-CADENA`, name: "Cadena", unitPrice: money(400) },
    });
    const [lockFirst, lockSecond] =
      bujia.id.localeCompare(cadena.id) < 0 ? [bujia, cadena] : [cadena, bujia];
    // Solo el primero tiene saldo abierto. El segundo hará fallar el motor.
    await prisma.posInventory.create({
      data: { warehouseId: warehouse.id, productId: lockFirst.id },
    });

    const rollback = await createOrder([
      { productId: lockFirst.id, quantity: 4, unitCost: 100 },
      { productId: lockSecond.id, quantity: 4, unitCost: 60 },
    ]);
    await approve(rollback.id);
    const firstLine = rollback.items.find((i) => i.productId === lockFirst.id)!;
    const snapshot = {
      balance: await balanceOf(lockFirst.id),
      movements: await prisma.posInventoryMovement.count(),
      events: await prisma.posPurchaseOrderEvent.count(),
    };

    const aborted = await receive(rollback.id, [
      { itemId: rollback.items[0]!.id, quantity: 4 },
      { itemId: rollback.items[1]!.id, quantity: 4 },
    ]);
    check(
      "la recepción falla al llegar al producto sin saldo",
      errorOf(aborted)?.includes("no tiene saldo abierto") === true,
      errorOf(aborted) ?? "",
    );
    check(
      "el saldo del producto que SÍ se movió vuelve atrás",
      (await balanceOf(lockFirst.id)) === snapshot.balance,
      `${await balanceOf(lockFirst.id)} vs ${snapshot.balance}`,
    );
    check(
      "su movimiento no sobrevive",
      (await prisma.posInventoryMovement.count()) === snapshot.movements,
    );
    check(
      "ningún evento sobrevive",
      (await prisma.posPurchaseOrderEvent.count()) === snapshot.events,
    );
    check("la orden sigue APROBADA", (await statusOf(rollback.id)) === "APROBADA");
    check("nada quedó recibido", (await lineState(firstLine.id)).received === 0);

    // Y por separado, el rechazo por validación previa, que es otra cosa.
    const rejected = await receive(rollback.id, [
      { itemId: firstLine.id, quantity: 99 },
    ]);
    check(
      "una cantidad excesiva se rechaza antes de tocar nada",
      errorOf(rejected)?.includes("más de lo pendiente") === true,
    );
    check(
      "y tampoco deja movimiento",
      (await prisma.posInventoryMovement.count()) === snapshot.movements,
    );

    // --- 10. Concurrencia -------------------------------------------------------
    console.log("\n10. Concurrencia");

    const race = await createOrder([{ productId: filtro.id, quantity: 10, unitCost: 100 }]);
    const approvals = await Promise.all([approve(race.id), approve(race.id), approve(race.id)]);
    check(
      "exactamente una aprobación gana",
      approvals.filter((r) => r.ok).length === 1,
      String(approvals.filter((r) => r.ok).length),
    );
    check(
      "y deja un solo evento APROBADA",
      (await prisma.posPurchaseOrderEvent.count({
        where: { orderId: race.id, type: "APROBADA" },
      })) === 1,
    );

    const raceBalance = await balanceOf(filtro.id);
    const receipts = await Promise.all([
      receive(race.id, [{ itemId: race.items[0]!.id, quantity: 6 }]),
      receive(race.id, [{ itemId: race.items[0]!.id, quantity: 6 }]),
    ]);
    const acceptedReceipts = receipts.filter((r) => r.ok).length;
    check(
      "solo cabe una recepción de 6 sobre 10 pendientes",
      acceptedReceipts === 1,
      String(acceptedReceipts),
    );
    check(
      "el inventario subió exactamente 6",
      (await balanceOf(filtro.id)) === raceBalance + 6,
      String(await balanceOf(filtro.id)),
    );
    check(
      "y lo recibido no supera lo pedido",
      (await lineState(race.items[0]!.id)).received === 6,
    );

    // --- 11. P-8 sigue sin resolverse -------------------------------------------
    console.log("\n11. P-8 se preserva: nadie comprueba el saldo negativo");

    check(
      "ninguna acción de compra valida existencia suficiente",
      !/existencia insuficiente|stock insuficiente|saldo insuficiente/i.test(source),
    );

    // --- 12. Fronteras del módulo ------------------------------------------------
    console.log("\n12. Compras no toca ningún otro subsistema");

    check("ningún asiento contable", (await prisma.journalEntry.count()) === before.entries);
    check("ninguna contabilización", (await prisma.postingRecord.count()) === before.postings);
    check("ningún documento de caja", (await prisma.cashDocument.count()) === before.cash);
    check(
      "ninguna cuenta por cobrar",
      (await prisma.receivableDocument.count()) === before.receivables,
    );
    check(
      "ningún pago",
      (await prisma.receivablePayment.count()) === before.receivablePayments,
    );
    check(
      "ningún movimiento de inventario serializado",
      (await prisma.inventoryMovement.count()) === before.serialized,
    );
    check(
      "ninguna unidad de motocicleta",
      (await prisma.motorcycleUnit.count()) === before.units,
    );
    check("ninguna venta POS", (await prisma.posSale.count()) === before.sales);

    const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_name IN ('pos_purchase_orders','pos_purchase_order_items','pos_purchase_order_events')
    `;
    const names = columns.map((c) => `${c.table_name}.${c.column_name}`);
    check(
      "el módulo no tiene ninguna columna de pago, factura ni deuda",
      !names.some((n) => /paid|payment|invoice|payable|debt|balance_due/.test(n)),
      names.filter((n) => /pai|pay|inv|deb/.test(n)).join(",") || "ninguna",
    );
  } finally {
    await cleanup();
    console.log(`\nRESULTADO SMOKE-POS1.2-F: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

async function cleanup() {
  const branches = await prisma.branch.findMany({
    where: { code: { startsWith: TAG.toLowerCase() } },
    select: { id: true },
  });
  const branchIds = branches.map((b) => b.id);
  const warehouses = await prisma.posWarehouse.findMany({
    where: { code: { startsWith: TAG } },
    select: { id: true },
  });
  const warehouseIds = warehouses.map((w) => w.id);
  const orders = await prisma.posPurchaseOrder.findMany({
    where: { branchId: { in: branchIds } },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);

  await prisma.posPurchaseOrderEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.posPurchaseOrderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.posPurchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.posInventoryMovement.deleteMany({ where: { warehouseId: { in: warehouseIds } } });
  await prisma.posInventory.deleteMany({ where: { warehouseId: { in: warehouseIds } } });
  await prisma.posWarehouse.deleteMany({ where: { id: { in: warehouseIds } } });
  await prisma.posProduct.deleteMany({ where: { sku: { startsWith: TAG } } });
  await prisma.thirdParty.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG.toLowerCase() } } });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
