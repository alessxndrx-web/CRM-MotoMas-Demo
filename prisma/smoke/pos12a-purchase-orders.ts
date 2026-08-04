/**
 * SMOKE-POS1.2-A — órdenes de compra.
 *
 *   npm run smoke:pos-purchase-orders
 *
 * **Una orden de compra es solo una intención de comprar**, así que lo que esta
 * suite prueba no es movimiento de mercancía: es que el documento aguante lo que
 * los flujos de recepción le van a exigir.
 *
 * Lo que de verdad importa comprobar:
 *
 * 1. **Los totales se derivan, nunca se aceptan**, como en el cobro.
 * 2. **Solo un borrador es editable**, y la guarda vive en el `WHERE`, no solo
 *    en la lectura.
 * 3. **La orden no toca nada más**: ni inventario, ni contabilidad, ni caja.
 *
 * Reproduce el cuerpo transaccional de las acciones porque autorizan contra la
 * cookie de sesión.
 *
 * Limpieza guiada por TAG.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import {
  calculatePosLineTotal,
  calculatePosSaleTotals,
  isPosPurchaseOrderEditable,
  posPurchaseOrderStatusValues,
  sanitizePosMoney,
  sanitizePosQuantity,
  sanitizePosText,
} from "@/server/pos/shared";

const prisma = new PrismaClient();
const TAG = `SMOKE-POS12A-${Date.now()}`;

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

type LineInput = {
  productId: string;
  quantity: number;
  unitCost: number;
  discount?: number;
  tax?: number;
  notes?: string | null;
};

type OrderResult =
  | { ok: true; orderId: string; orderNumber: string }
  | { ok: false; error: string };

/** Reproduce el saneado y el armado de totales de la acción. */
function buildLines(lines: LineInput[]) {
  const clean = [];
  for (const line of lines) {
    const quantity = sanitizePosQuantity(line.quantity);
    if (quantity === null) return null;
    const unitCost = sanitizePosMoney(line.unitCost);
    const discount = sanitizePosMoney(line.discount ?? 0);
    const tax = sanitizePosMoney(line.tax ?? 0);
    if (unitCost === null || discount === null || tax === null) return null;
    clean.push({
      productId: line.productId,
      quantity,
      unitCost,
      discount,
      tax,
      notes: sanitizePosText(line.notes),
    });
  }
  const forArithmetic = clean.map((line) => ({
    quantity: line.quantity,
    unitPrice: line.unitCost,
    discount: line.discount,
    tax: line.tax,
  }));
  return {
    totals: calculatePosSaleTotals(forArithmetic),
    rows: clean.map((line, position) => ({
      productId: line.productId,
      quantity: toQuantity(line.quantity),
      unitCost: toMoney(line.unitCost),
      discount: toMoney(line.discount),
      tax: toMoney(line.tax),
      total: toMoney(
        calculatePosLineTotal({
          quantity: line.quantity,
          unitPrice: line.unitCost,
          discount: line.discount,
          tax: line.tax,
        }),
      ),
      notes: line.notes,
      position,
    })),
  };
}

/** Reproduce `createPosPurchaseOrderAction`. */
async function createOrder(
  input: {
    branchId: string;
    supplierId: string;
    userId: string;
    lines: LineInput[];
    notes?: string | null;
  },
  failAfterHeader = false,
): Promise<OrderResult> {
  if (!input.lines.length) {
    return { ok: false, error: "La orden de compra necesita al menos una línea." };
  }
  const built = buildLines(input.lines);
  if (!built) return { ok: false, error: "Los montos de la venta no son válidos." };

  try {
    return await prisma.$transaction(async (tx) => {
      const supplier = await tx.thirdParty.findUnique({
        where: { id: input.supplierId },
        select: { id: true, type: true, isActive: true },
      });
      if (!supplier) throw new Error("El proveedor no existe.");
      if (supplier.type !== "PROVEEDOR") {
        throw new Error("El tercero seleccionado no es un proveedor.");
      }
      if (!supplier.isActive) throw new Error("El proveedor está inactivo.");

      const products = await tx.posProduct.findMany({
        where: { id: { in: built.rows.map((row) => row.productId) } },
        select: { id: true, isActive: true },
      });
      const byId = new Map(products.map((product) => [product.id, product]));
      for (const row of built.rows) {
        const product = byId.get(row.productId);
        if (!product) throw new Error("El producto no existe.");
        if (!product.isActive) throw new Error("El producto está inactivo.");
      }

      const order = await tx.posPurchaseOrder.create({
        data: {
          orderNumber: generateOrderNumber(),
          branchId: input.branchId,
          supplierId: supplier.id,
          status: "BORRADOR",
          subtotal: toMoney(built.totals.subtotal),
          discount: toMoney(built.totals.discount),
          tax: toMoney(built.totals.tax),
          total: toMoney(built.totals.total),
          notes: sanitizePosText(input.notes),
          createdByUserId: input.userId,
          items: { create: built.rows },
        },
        select: { id: true, orderNumber: true },
      });

      if (failAfterHeader) throw new Error("Fallo forzado tras la cabecera.");

      return { ok: true as const, orderId: order.id, orderNumber: order.orderNumber };
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "fallo desconocido",
    };
  }
}

/** Reproduce la guarda de `updatePosPurchaseOrderAction`. */
async function updateOrder(input: {
  orderId: string;
  lines?: LineInput[];
  notes?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.posPurchaseOrder.findUnique({
        where: { id: input.orderId },
        select: { id: true, status: true },
      });
      if (!order) throw new Error("La orden de compra no existe.");
      if (order.status !== "BORRADOR") {
        throw new Error("Solo puedes modificar una orden de compra en borrador.");
      }

      let totalsData = {};
      if (input.lines) {
        const built = buildLines(input.lines);
        if (!built) throw new Error("Los montos no son válidos.");
        await tx.posPurchaseOrderItem.deleteMany({ where: { orderId: order.id } });
        await tx.posPurchaseOrderItem.createMany({
          data: built.rows.map((row) => ({ ...row, orderId: order.id })),
        });
        totalsData = {
          subtotal: toMoney(built.totals.subtotal),
          discount: toMoney(built.totals.discount),
          tax: toMoney(built.totals.tax),
          total: toMoney(built.totals.total),
        };
      }

      const guarded = await tx.posPurchaseOrder.updateMany({
        where: { id: order.id, status: "BORRADOR" },
        data: {
          notes:
            input.notes === undefined ? undefined : sanitizePosText(input.notes),
          ...totalsData,
        },
      });
      if (guarded.count !== 1) {
        throw new Error("Solo puedes modificar una orden de compra en borrador.");
      }
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "fallo desconocido",
    };
  }
}

async function approveOrder(orderId: string, userId: string) {
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
      where: { id: order.id, status: "BORRADOR" },
      data: { status: "APROBADA", approvedById: userId, approvedAt: new Date() },
    });
    if (guarded.count !== 1) {
      return { ok: false as const, error: "Solo puedes modificar una orden de compra en borrador." };
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
  const orders = await prisma.posPurchaseOrder.findMany({
    where: { branchId: { in: branchIds } },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  await prisma.posPurchaseOrderItem.deleteMany({
    where: { orderId: { in: orderIds } },
  });
  await prisma.posPurchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.posProduct.deleteMany({ where: { sku: { startsWith: TAG } } });
  await prisma.thirdParty.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.user.deleteMany({
    where: { email: { startsWith: TAG.toLowerCase() } },
  });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
}

async function main() {
  await cleanup();

  const before = {
    entries: await prisma.journalEntry.count(),
    postings: await prisma.postingRecord.count(),
    cash: await prisma.cashDocument.count(),
    inventory: await prisma.posInventoryMovement.count(),
    balances: await prisma.posInventory.count(),
    serialized: await prisma.inventoryMovement.count(),
    sales: await prisma.posSale.count(),
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
      data: {
        branchId: branch.id,
        type: "PROVEEDOR",
        name: `${TAG} Proveedor`,
        taxId: "J0310000000000",
      },
    });
    const supplierInactivo = await prisma.thirdParty.create({
      data: {
        branchId: branch.id,
        type: "PROVEEDOR",
        name: `${TAG} Proveedor retirado`,
        isActive: false,
      },
    });
    const cliente = await prisma.thirdParty.create({
      data: { branchId: branch.id, type: "CLIENTE", name: `${TAG} Un cliente` },
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
      data: {
        sku: `${TAG}-RETIRADO`,
        name: "Retirado",
        unitPrice: toMoney(10),
        isActive: false,
      },
    });

    // --- 1. Creación --------------------------------------------------------
    console.log("\n1. Creación de la orden");

    const created = await createOrder({
      branchId: branch.id,
      supplierId: supplier.id,
      userId: user.id,
      lines: [{ productId: casco.id, quantity: 10, unitCost: 800 }],
    });
    check("la orden se crea", created.ok === true, JSON.stringify(created));
    check(
      "el número lo genera el servidor con el formato del contexto",
      created.ok === true && /^OC-\d{8}-[A-Z0-9]{8}$/.test(created.orderNumber),
      created.ok ? created.orderNumber : "",
    );

    const order = await prisma.posPurchaseOrder.findUniqueOrThrow({
      where: { id: created.ok ? created.orderId : "" },
      include: { items: true },
    });
    check("nace en BORRADOR", order.status === "BORRADOR");
    check("no nace aprobada", order.approvedAt === null && order.approvedById === null);
    check("guarda el autor", order.createdByUserId === user.id);
    check("guarda el proveedor", order.supplierId === supplier.id);
    check("creó su línea", order.items.length === 1);
    check(
      "la línea guarda el costo negociado, no el de catálogo",
      Number(order.items[0]?.unitCost) === 800,
      String(order.items[0]?.unitCost),
    );

    // --- 2. Totales derivados -----------------------------------------------
    console.log("\n2. Los totales se derivan, nunca se aceptan");

    const multi = await createOrder({
      branchId: branch.id,
      supplierId: supplier.id,
      userId: user.id,
      lines: [
        { productId: casco.id, quantity: 10, unitCost: 800, discount: 500, tax: 1125 },
        { productId: aceite.id, quantity: 2.5, unitCost: 60, tax: 22.5 },
      ],
    });
    check("la orden de dos líneas se crea", multi.ok === true);
    const multiRow = await prisma.posPurchaseOrder.findUniqueOrThrow({
      where: { id: multi.ok ? multi.orderId : "" },
      include: { items: { orderBy: { position: "asc" } } },
    });
    // 8000 + 150 = 8150 · descuento 500 · impuesto 1147.5 · total 8797.5
    check("subtotal derivado", Number(multiRow.subtotal) === 8150, String(multiRow.subtotal));
    check("descuento derivado", Number(multiRow.discount) === 500);
    check("impuesto derivado", Number(multiRow.tax) === 1147.5, String(multiRow.tax));
    check("total derivado", Number(multiRow.total) === 8797.5, String(multiRow.total));
    check(
      "la suma de los totales de línea coincide con el total",
      multiRow.items.reduce((sum, item) => sum.add(item.total), new Prisma.Decimal(0)).toNumber() ===
        Number(multiRow.total),
    );
    check(
      "las cantidades decimales se guardan exactas",
      Number(multiRow.items[1]?.quantity) === 2.5,
      String(multiRow.items[1]?.quantity),
    );
    check(
      "las líneas conservan su posición",
      multiRow.items[0]?.position === 0 && multiRow.items[1]?.position === 1,
    );

    // --- 3. Validaciones ----------------------------------------------------
    console.log("\n3. Validaciones");

    const noSupplier = await createOrder({
      branchId: branch.id,
      supplierId: "no-existe",
      userId: user.id,
      lines: [{ productId: casco.id, quantity: 1, unitCost: 10 }],
    });
    check("proveedor inexistente rechazado", noSupplier.ok === false);

    const inactiveSupplier = await createOrder({
      branchId: branch.id,
      supplierId: supplierInactivo.id,
      userId: user.id,
      lines: [{ productId: casco.id, quantity: 1, unitCost: 10 }],
    });
    check(
      "proveedor inactivo rechazado",
      inactiveSupplier.ok === false && inactiveSupplier.error.includes("inactivo"),
    );

    // Un CLIENTE no es un proveedor, aunque sea un ThirdParty válido.
    const notASupplier = await createOrder({
      branchId: branch.id,
      supplierId: cliente.id,
      userId: user.id,
      lines: [{ productId: casco.id, quantity: 1, unitCost: 10 }],
    });
    check(
      "un tercero que no es PROVEEDOR se rechaza",
      notASupplier.ok === false && notASupplier.error.includes("no es un proveedor"),
    );

    const inactiveProduct = await createOrder({
      branchId: branch.id,
      supplierId: supplier.id,
      userId: user.id,
      lines: [{ productId: retirado.id, quantity: 1, unitCost: 10 }],
    });
    check(
      "producto inactivo rechazado",
      inactiveProduct.ok === false && inactiveProduct.error.includes("inactivo"),
    );

    const noLines = await createOrder({
      branchId: branch.id,
      supplierId: supplier.id,
      userId: user.id,
      lines: [],
    });
    check("orden sin líneas rechazada", noLines.ok === false);

    const badQuantity = await createOrder({
      branchId: branch.id,
      supplierId: supplier.id,
      userId: user.id,
      lines: [{ productId: casco.id, quantity: 0, unitCost: 10 }],
    });
    check("cantidad cero rechazada", badQuantity.ok === false);

    // --- 4. Persistencia atómica --------------------------------------------
    console.log("\n4. Persistencia atómica");

    const ordersBefore = await prisma.posPurchaseOrder.count({
      where: { branchId: branch.id },
    });
    const itemsBefore = await prisma.posPurchaseOrderItem.count();
    const rolled = await createOrder(
      {
        branchId: branch.id,
        supplierId: supplier.id,
        userId: user.id,
        lines: [{ productId: casco.id, quantity: 1, unitCost: 10 }],
      },
      true,
    );
    check("la creación forzada a fallar no dice que sí", rolled.ok === false);
    check(
      "no sobrevive ninguna orden huérfana",
      (await prisma.posPurchaseOrder.count({ where: { branchId: branch.id } })) ===
        ordersBefore,
    );
    check(
      "no sobrevive ninguna línea huérfana",
      (await prisma.posPurchaseOrderItem.count()) === itemsBefore,
    );

    // --- 5. Edición e inmutabilidad ------------------------------------------
    console.log("\n5. Solo un borrador es editable");

    const draftId = created.ok ? created.orderId : "";
    const edited = await updateOrder({
      orderId: draftId,
      lines: [{ productId: casco.id, quantity: 20, unitCost: 750 }],
    });
    check("un borrador se puede editar", edited.ok === true, edited.error ?? "");
    const editedRow = await prisma.posPurchaseOrder.findUniqueOrThrow({
      where: { id: draftId },
      include: { items: true },
    });
    check("la línea se reemplazó", editedRow.items.length === 1);
    check("la cantidad cambió a 20", Number(editedRow.items[0]?.quantity) === 20);
    check(
      "los totales se recalcularon",
      Number(editedRow.total) === 15000,
      String(editedRow.total),
    );

    const approved = await approveOrder(draftId, user.id);
    check("el borrador se aprueba", approved.ok === true);
    const approvedRow = await prisma.posPurchaseOrder.findUniqueOrThrow({
      where: { id: draftId },
    });
    check("queda APROBADA", approvedRow.status === "APROBADA");
    check("sella quién y cuándo", approvedRow.approvedById === user.id && !!approvedRow.approvedAt);

    const editAfterApproval = await updateOrder({
      orderId: draftId,
      lines: [{ productId: casco.id, quantity: 999, unitCost: 1 }],
    });
    check(
      "una orden aprobada ya no se edita",
      editAfterApproval.ok === false && editAfterApproval.error!.includes("borrador"),
    );
    const untouched = await prisma.posPurchaseOrder.findUniqueOrThrow({
      where: { id: draftId },
      include: { items: true },
    });
    check(
      "el intento no cambió las cantidades",
      Number(untouched.items[0]?.quantity) === 20,
    );
    check("ni el proveedor", untouched.supplierId === supplier.id);
    check("ni los totales", Number(untouched.total) === 15000);

    const secondApproval = await approveOrder(draftId, user.id);
    check("no se puede aprobar dos veces", secondApproval.ok === false);

    // --- 6. Aprobación concurrente -------------------------------------------
    console.log("\n6. Aprobación concurrente");

    const raceOrder = await createOrder({
      branchId: branch.id,
      supplierId: supplier.id,
      userId: user.id,
      lines: [{ productId: casco.id, quantity: 1, unitCost: 100 }],
    });
    const raceId = raceOrder.ok ? raceOrder.orderId : "";
    const races = await Promise.all([
      approveOrder(raceId, user.id),
      approveOrder(raceId, user.id),
      approveOrder(raceId, user.id),
    ]);
    check(
      "exactamente una aprobación concurrente gana",
      races.filter((result) => result.ok).length === 1,
      String(races.filter((result) => result.ok).length),
    );
    check(
      "la orden quedó aprobada una sola vez",
      (await prisma.posPurchaseOrder.findUniqueOrThrow({ where: { id: raceId } })).status ===
        "APROBADA",
    );

    // --- 7. Numeración concurrente -------------------------------------------
    console.log("\n7. Numeración concurrente");

    const concurrent = await Promise.all(
      Array.from({ length: 8 }, () =>
        createOrder({
          branchId: branch.id,
          supplierId: supplier.id,
          userId: user.id,
          lines: [{ productId: casco.id, quantity: 1, unitCost: 10 }],
        }),
      ),
    );
    const numbers = concurrent
      .filter((result): result is Extract<OrderResult, { ok: true }> => result.ok)
      .map((result) => result.orderNumber);
    check("las ocho órdenes concurrentes se crean", numbers.length === 8, String(numbers.length));
    check("ningún número se repite", new Set(numbers).size === numbers.length);

    let duplicateNumber = false;
    try {
      await prisma.posPurchaseOrder.create({
        data: {
          orderNumber: numbers[0]!,
          branchId: branch.id,
          supplierId: supplier.id,
          createdByUserId: user.id,
        },
      });
    } catch {
      duplicateNumber = true;
    }
    check("el índice único impide un número repetido", duplicateNumber);

    // --- 8. Restricciones de borrado -----------------------------------------
    console.log("\n8. Restricciones de borrado");

    let supplierProtected = false;
    try {
      await prisma.thirdParty.delete({ where: { id: supplier.id } });
    } catch {
      supplierProtected = true;
    }
    check("no se puede borrar un proveedor con órdenes", supplierProtected);

    let productProtected = false;
    try {
      await prisma.posProduct.delete({ where: { id: casco.id } });
    } catch {
      productProtected = true;
    }
    check("no se puede borrar un producto con líneas de compra", productProtected);

    let branchProtected = false;
    try {
      await prisma.branch.delete({ where: { id: branch.id } });
    } catch {
      branchProtected = true;
    }
    check("no se puede borrar una sucursal con órdenes", branchProtected);

    let authorProtected = false;
    try {
      await prisma.user.delete({ where: { id: user.id } });
    } catch {
      authorProtected = true;
    }
    check("no se puede borrar al autor de una orden", authorProtected);

    // Borrar la orden sí arrastra sus líneas: son su composición.
    const disposable = await createOrder({
      branchId: branch.id,
      supplierId: supplier.id,
      userId: user.id,
      lines: [{ productId: aceite.id, quantity: 1, unitCost: 50 }],
    });
    const disposableId = disposable.ok ? disposable.orderId : "";
    await prisma.posPurchaseOrder.delete({ where: { id: disposableId } });
    check(
      "borrar la orden arrastra sus líneas (Cascade)",
      (await prisma.posPurchaseOrderItem.count({ where: { orderId: disposableId } })) === 0,
    );

    // --- 9. Vocabulario ------------------------------------------------------
    console.log("\n9. Vocabulario de estados");

    check("hay cinco estados", posPurchaseOrderStatusValues.length === 5);
    check("solo BORRADOR es editable", isPosPurchaseOrderEditable("BORRADOR"));
    check(
      "ningún otro estado es editable",
      posPurchaseOrderStatusValues
        .filter((status) => status !== "BORRADOR")
        .every((status) => !isPosPurchaseOrderEditable(status)),
    );

    let allStatesWritable = true;
    const vocabularyOrder = await createOrder({
      branchId: branch.id,
      supplierId: supplier.id,
      userId: user.id,
      lines: [{ productId: aceite.id, quantity: 1, unitCost: 1 }],
    });
    for (const status of posPurchaseOrderStatusValues) {
      try {
        await prisma.posPurchaseOrder.update({
          where: { id: vocabularyOrder.ok ? vocabularyOrder.orderId : "" },
          data: { status },
        });
      } catch {
        allStatesWritable = false;
      }
    }
    check(
      "los cinco estados son escribibles en el enum de PostgreSQL",
      allStatesWritable,
    );

    // --- 10. Nada más se tocó ------------------------------------------------
    console.log("\n10. Una orden es solo una intención");

    check(
      "ningún movimiento de inventario del mostrador",
      (await prisma.posInventoryMovement.count()) === before.inventory,
    );
    check(
      "ningún saldo de inventario creado",
      (await prisma.posInventory.count()) === before.balances,
    );
    check("ningún asiento contable", (await prisma.journalEntry.count()) === before.entries);
    check("ninguna contabilización", (await prisma.postingRecord.count()) === before.postings);
    check("ningún documento de caja", (await prisma.cashDocument.count()) === before.cash);
    check(
      "ningún movimiento de inventario serializado",
      (await prisma.inventoryMovement.count()) === before.serialized,
    );
    check("ninguna venta POS", (await prisma.posSale.count()) === before.sales);

    // No hay cuenta por pagar: el modelo ni siquiera se referencia.
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pos_purchase_orders'
    `;
    const names = columns.map((column) => column.column_name);
    check(
      "la orden no tiene columnas de pago ni de factura",
      !names.some((name) => /paid|payment|invoice|payable/.test(name)),
      names.join(","),
    );
  } finally {
    await cleanup();
    console.log(`\nRESULTADO SMOKE-POS1.2-A: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
