/**
 * SMOKE-POS1.2-C — anulación de órdenes de compra.
 *
 *   npm run smoke:pos-purchase-cancellation
 *
 * **Anular solo cambia el estado del documento.** Lo que esta suite tiene que
 * demostrar es sobre todo lo que **no** ocurre: ni movimiento de inventario, ni
 * saldo tocado, ni asiento, ni caja, ni restauración de existencias.
 *
 * Y dos cosas que sí:
 *
 * 1. **La transición está guardada como la aprobación.** Dos anulaciones
 *    concurrentes: gana exactamente una.
 * 2. **Una orden que ya recibió mercancía no se anula**, comprobado además por
 *    las cantidades de las líneas y no solo por el estado.
 *
 * Limpieza guiada por TAG.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import { sanitizePosText } from "@/server/pos/shared";

const prisma = new PrismaClient();
const TAG = `SMOKE-POS12C-${Date.now()}`;

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

type CancelResult = { ok: true } | { ok: false; error: string };

/** Reproduce `cancelPosPurchaseOrderAction`. */
async function cancel(input: {
  orderId: string;
  reason: string;
  userId: string;
}): Promise<CancelResult> {
  const reason = sanitizePosText(input.reason, 500);
  if (!reason) return { ok: false, error: "Indica el motivo de la anulación." };

  return prisma.$transaction(async (tx) => {
    const order = await tx.posPurchaseOrder.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        status: true,
        items: { select: { receivedQuantity: true } },
      },
    });
    if (!order) return { ok: false as const, error: "La orden de compra no existe." };
    if (order.status !== "BORRADOR" && order.status !== "APROBADA") {
      return {
        ok: false as const,
        error: "Solo puedes anular una orden en borrador o aprobada.",
      };
    }
    if (order.items.some((item) => item.receivedQuantity.greaterThan(0))) {
      return {
        ok: false as const,
        error: "No puedes anular una orden que ya recibió mercancía.",
      };
    }

    const guarded = await tx.posPurchaseOrder.updateMany({
      where: { id: order.id, status: { in: ["BORRADOR", "APROBADA"] } },
      data: {
        status: "ANULADA",
        cancelledById: input.userId,
        cancelledAt: new Date(),
        cancelledReason: reason,
      },
    });
    if (guarded.count !== 1) {
      return {
        ok: false as const,
        error: "Solo puedes anular una orden en borrador o aprobada.",
      };
    }
    return { ok: true as const };
  });
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

async function main() {
  await cleanup();

  const before = {
    entries: await prisma.journalEntry.count(),
    postings: await prisma.postingRecord.count(),
    cash: await prisma.cashDocument.count(),
    posMovements: await prisma.posInventoryMovement.count(),
    serialized: await prisma.inventoryMovement.count(),
    units: await prisma.motorcycleUnit.count(),
  };

  try {
    // --- Fixtures ---------------------------------------------------------
    const branch = await prisma.branch.create({
      data: { code: `${TAG}-suc`.toLowerCase(), name: `${TAG} sucursal` },
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
    const warehouse = await prisma.posWarehouse.create({
      data: { branchId: branch.id, code: `${TAG}-BODEGA`, name: "Bodega" },
    });
    const casco = await prisma.posProduct.create({
      data: { sku: `${TAG}-CASCO`, name: "Casco", unitPrice: toMoney(1000) },
    });
    await prisma.posInventory.create({
      data: { warehouseId: warehouse.id, productId: casco.id },
    });

    async function makeOrder(
      status: "BORRADOR" | "APROBADA" | "RECIBIDA_PARCIAL" | "RECIBIDA" | "ANULADA",
      received = 0,
    ) {
      return prisma.posPurchaseOrder.create({
        data: {
          orderNumber: generateOrderNumber(),
          branchId: branch.id,
          supplierId: supplier.id,
          status,
          createdByUserId: user.id,
          subtotal: toMoney(1000),
          total: toMoney(1000),
          items: {
            create: [
              {
                productId: casco.id,
                quantity: toQuantity(10),
                unitCost: toMoney(100),
                total: toMoney(1000),
                receivedQuantity: toQuantity(received),
              },
            ],
          },
        },
        include: { items: true },
      });
    }

    // --- 1. Anular un borrador ---------------------------------------------
    console.log("\n1. Anular un borrador");

    const draft = await makeOrder("BORRADOR");
    const draftResult = await cancel({
      orderId: draft.id,
      reason: "El proveedor no puede surtir",
      userId: user.id,
    });
    check("un borrador se anula", draftResult.ok === true, JSON.stringify(draftResult));

    const cancelledDraft = await prisma.posPurchaseOrder.findUniqueOrThrow({
      where: { id: draft.id },
    });
    check("queda ANULADA", cancelledDraft.status === "ANULADA");
    check("registra quién", cancelledDraft.cancelledById === user.id);
    check("registra cuándo", cancelledDraft.cancelledAt !== null);
    check(
      "registra el motivo en su columna propia",
      cancelledDraft.cancelledReason === "El proveedor no puede surtir",
      String(cancelledDraft.cancelledReason),
    );
    check(
      "y no ensucia las notas del usuario",
      cancelledDraft.notes === null,
      String(cancelledDraft.notes),
    );

    // --- 2. Anular una aprobada ---------------------------------------------
    console.log("\n2. Anular una aprobada sin recibir");

    const approved = await makeOrder("APROBADA");
    const approvedResult = await cancel({
      orderId: approved.id,
      reason: "Se canceló la compra",
      userId: user.id,
    });
    check("una aprobada sin recibir se anula", approvedResult.ok === true);
    check(
      "queda ANULADA",
      (await prisma.posPurchaseOrder.findUniqueOrThrow({ where: { id: approved.id } }))
        .status === "ANULADA",
    );

    // --- 3. Motivo obligatorio ----------------------------------------------
    console.log("\n3. El motivo es obligatorio");

    const needsReason = await makeOrder("BORRADOR");
    const empty = await cancel({ orderId: needsReason.id, reason: "   ", userId: user.id });
    check(
      "sin motivo se rechaza",
      empty.ok === false && empty.error.includes("motivo"),
      JSON.stringify(empty),
    );
    check(
      "y la orden sigue en borrador",
      (await prisma.posPurchaseOrder.findUniqueOrThrow({ where: { id: needsReason.id } }))
        .status === "BORRADOR",
    );

    // --- 4. Estados que no admiten anulación --------------------------------
    console.log("\n4. Estados que no admiten anulación");

    const received = await makeOrder("RECIBIDA", 10);
    const receivedResult = await cancel({
      orderId: received.id,
      reason: "Intento sobre recibida",
      userId: user.id,
    });
    check("una orden recibida no se anula", receivedResult.ok === false);
    check(
      "y sigue RECIBIDA",
      (await prisma.posPurchaseOrder.findUniqueOrThrow({ where: { id: received.id } }))
        .status === "RECIBIDA",
    );

    // P-27: parcialmente recibida se rechaza, preservando lo que POS1.2-A hacía.
    const partial = await makeOrder("RECIBIDA_PARCIAL", 4);
    const partialResult = await cancel({
      orderId: partial.id,
      reason: "Intento sobre parcial",
      userId: user.id,
    });
    check(
      "una parcialmente recibida no se anula (P-27 sigue abierta)",
      partialResult.ok === false,
      JSON.stringify(partialResult),
    );
    check(
      "y sigue RECIBIDA_PARCIAL",
      (await prisma.posPurchaseOrder.findUniqueOrThrow({ where: { id: partial.id } }))
        .status === "RECIBIDA_PARCIAL",
    );

    const already = await makeOrder("ANULADA");
    const alreadyResult = await cancel({
      orderId: already.id,
      reason: "Doble anulación",
      userId: user.id,
    });
    check("una orden anulada no cambia de nuevo", alreadyResult.ok === false);

    const ghost = await cancel({
      orderId: "no-existe",
      reason: "x",
      userId: user.id,
    });
    check("una orden inexistente se rechaza", ghost.ok === false);

    // --- 5. Defensa en profundidad --------------------------------------------
    console.log("\n5. La regla no depende de que el estado esté bien derivado");

    // Una orden APROBADA con mercancía recibida no debería existir, pero si
    // existiera, la comprobación por cantidades la detiene igual.
    const inconsistent = await makeOrder("APROBADA", 3);
    const inconsistentResult = await cancel({
      orderId: inconsistent.id,
      reason: "Aprobada con mercancía recibida",
      userId: user.id,
    });
    check(
      "una APROBADA con recibido > 0 se rechaza por las cantidades",
      inconsistentResult.ok === false &&
        inconsistentResult.error.includes("ya recibió mercancía"),
      JSON.stringify(inconsistentResult),
    );

    // --- 6. Concurrencia -------------------------------------------------------
    console.log("\n6. Concurrencia");

    const raced = await makeOrder("APROBADA");
    const races = await Promise.all([
      cancel({ orderId: raced.id, reason: "Carrera 1", userId: user.id }),
      cancel({ orderId: raced.id, reason: "Carrera 2", userId: user.id }),
      cancel({ orderId: raced.id, reason: "Carrera 3", userId: user.id }),
    ]);
    check(
      "exactamente una anulación concurrente gana",
      races.filter((result) => result.ok).length === 1,
      String(races.filter((result) => result.ok).length),
    );
    const racedRow = await prisma.posPurchaseOrder.findUniqueOrThrow({
      where: { id: raced.id },
    });
    check("la orden quedó anulada una sola vez", racedRow.status === "ANULADA");
    check(
      "las que perdieron fallaron limpiamente, sin excepción",
      races.every((result) => result.ok || typeof result.error === "string"),
    );
    check("hay exactamente un motivo guardado", !!racedRow.cancelledReason);

    // --- 7. Rollback ------------------------------------------------------------
    console.log("\n7. Un fallo deja la orden intacta");

    const rollbackOrder = await makeOrder("APROBADA");
    let threw = false;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.posPurchaseOrder.updateMany({
          where: { id: rollbackOrder.id, status: { in: ["BORRADOR", "APROBADA"] } },
          data: {
            status: "ANULADA",
            cancelledById: user.id,
            cancelledAt: new Date(),
            cancelledReason: "Se va a deshacer",
          },
        });
        throw new Error("Fallo forzado tras la anulación.");
      });
    } catch {
      threw = true;
    }
    check("la transacción falló", threw);
    const afterRollback = await prisma.posPurchaseOrder.findUniqueOrThrow({
      where: { id: rollbackOrder.id },
    });
    check("la orden sigue APROBADA", afterRollback.status === "APROBADA");
    check("sin quién la anuló", afterRollback.cancelledById === null);
    check("sin cuándo", afterRollback.cancelledAt === null);
    check("sin motivo", afterRollback.cancelledReason === null);

    // --- 8. Anular no toca nada más ---------------------------------------------
    console.log("\n8. Anular solo cambia el estado del documento");

    check(
      "ningún movimiento de inventario del mostrador",
      (await prisma.posInventoryMovement.count()) === before.posMovements,
    );
    check(
      "el saldo de la bodega sigue en cero: no se restauró nada",
      (
        await prisma.posInventory.findUniqueOrThrow({
          where: {
            warehouseId_productId: { warehouseId: warehouse.id, productId: casco.id },
          },
        })
      ).quantity.toNumber() === 0,
    );
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

    // Las líneas de una orden anulada quedan intactas: anular no borra el
    // documento, lo cierra.
    check(
      "las líneas de la orden anulada siguen existiendo",
      (await prisma.posPurchaseOrderItem.count({ where: { orderId: draft.id } })) === 1,
    );

    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pos_purchase_orders'
    `;
    const names = columns.map((column) => column.column_name);
    check(
      "la anulación tiene sus tres columnas propias",
      names.includes("cancelled_by_id") &&
        names.includes("cancelled_at") &&
        names.includes("cancelled_reason"),
      names.join(","),
    );
  } finally {
    await cleanup();
    console.log(`\nRESULTADO SMOKE-POS1.2-C: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
