"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { canOperateCaja } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { decimalToNumber } from "@/server/finance/money";
import { searchPosCustomers, searchPosProducts } from "@/server/pos/queries";
import {
  calculatePosLineTotal,
  calculatePosSaleTotals,
  isPosPaymentMethodValue,
  isPosProductUnitValue,
  sanitizePosMoney,
  sanitizePosMovementQuantity,
  sanitizePosQuantity,
  sanitizePosStockLevel,
  sanitizePosTaxRate,
  sanitizePosText,
  type PosProductDTO,
} from "@/server/pos/shared";

/**
 * Patch POS1.0-A — write side of the Point of Sale.
 *
 * ## What these actions deliberately do not do
 *
 * **Nothing here posts to the ledger, moves inventory or touches Caja.** That is
 * the whole reason the POS is allowed to be its own aggregate: with no second
 * posting path, a completed sale is a record of a checkout and nothing more. A
 * later patch will make completion emit a cash document, and that document —
 * not this one — will post.
 *
 * ## Authorization
 *
 * A till is operated by a cashier, so the POS reuses `canOperateCaja` (ADMIN or
 * CAJERO) from the shared access layer rather than inventing a permission that
 * would then need to be granted somewhere. It imports the role predicate, not
 * anything from `server/caja`: the contexts stay separate.
 *
 * ## Immutability
 *
 * Every mutation re-reads the sale and refuses anything past `BORRADOR`. The
 * guard lives in the `WHERE` of the write as well, so two concurrent completions
 * cannot both win.
 */

const NO_DB = "La base de datos no está configurada.";
const NO_PERMISSION = "No tienes permiso para operar el punto de venta.";
const NO_SALE = "La venta no existe.";
const ONLY_DRAFT = "Solo puedes modificar una venta en borrador.";
const NO_ITEMS = "La venta necesita al menos un artículo.";
const INVALID_MONEY = "Los montos de la venta no son válidos.";
const INVALID_QUANTITY = "La cantidad no es válida.";

const POS_ROUTES = ["/panel/caja", "/panel/pos"];

/**
 * Patch POS1.0-D. Aborta la transacción del cobro con un mensaje **destinado al
 * cajero**. Existe para que el `catch` sepa distinguir una regla de negocio de
 * un fallo de infraestructura: sin ella, el mensaje crudo de Prisma —nombres de
 * tabla, restricciones— acabaría en pantalla.
 */
class PosCheckoutError extends Error {}

export type PosActionResult = { ok: true } | { ok: false; error: string };

function revalidatePos() {
  for (const route of POS_ROUTES) revalidatePath(route);
}

async function authorizePos() {
  if (!isDatabaseConfigured()) {
    return { ok: false as const, error: NO_DB };
  }
  const session = await requireAuth();
  if (!canOperateCaja(session.roleEnum)) {
    return { ok: false as const, error: NO_PERMISSION };
  }
  return { ok: true as const, userId: session.uid };
}

function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

function toQuantity(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(3));
}

/**
 * Sale number: internal to the POS and independent from accounting document
 * numbering, exactly as the contract states. Same shape the rest of the
 * repository already uses for generated numbers.
 */
function generateSaleNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `POS-${date}-${suffix}`;
}

/**
 * Recomputes the sale's stored figures from its lines, inside the caller's
 * transaction.
 *
 * The aggregate never accumulates: it is rewritten from the lines every time
 * they change, so a stored total can never drift from what the lines say.
 */
async function recalculateSale(
  tx: Prisma.TransactionClient,
  saleId: string,
): Promise<void> {
  const items = await tx.posSaleItem.findMany({ where: { saleId } });
  const totals = calculatePosSaleTotals(
    items.map((item) => ({
      quantity: decimalToNumber(item.quantity),
      unitPrice: decimalToNumber(item.unitPrice),
      discount: decimalToNumber(item.discount),
      tax: decimalToNumber(item.tax),
    })),
  );
  await tx.posSale.update({
    where: { id: saleId },
    data: {
      subtotal: toDecimal(totals.subtotal),
      discount: toDecimal(totals.discount),
      tax: toDecimal(totals.tax),
      total: toDecimal(totals.total),
    },
  });
}

// --- Catalogue -----------------------------------------------------------

/**
 * Patch POS1.1-A — metadatos opcionales del catálogo.
 *
 * Todos los campos nuevos son opcionales y **todos son inertes**: se guardan y
 * nadie los lee. El cobro sigue tomando el impuesto que recibe línea por línea,
 * sin mirar `defaultTaxRate`; derivarlo sería un cambio de comportamiento
 * silencioso y este parche no cambia ningún flujo.
 *
 * Devuelve el error en vez de lanzarlo cuando una referencia no existe: una
 * categoría inválida es un dato del formulario, no un fallo.
 */
type PosProductMetadataInput = {
  description?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  unit?: string;
  defaultTaxRate?: number;
  minimumStock?: number;
  reorderPoint?: number;
  cost?: number;
  imageUrl?: string | null;
};

type ResolvedMetadata = {
  description?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  unit?: Prisma.PosProductCreateInput["unit"];
  defaultTaxRate?: Prisma.Decimal;
  minimumStock?: Prisma.Decimal;
  reorderPoint?: Prisma.Decimal;
  cost?: Prisma.Decimal;
  imageUrl?: string | null;
};

/**
 * Valida y traduce los metadatos. `undefined` significa "no lo mandaron" y se
 * deja intacto; `null` en una referencia significa "quítala".
 */
async function resolveProductMetadata(
  input: PosProductMetadataInput,
): Promise<{ ok: true; data: ResolvedMetadata } | { ok: false; error: string }> {
  const data: ResolvedMetadata = {};

  if (input.description !== undefined) {
    data.description = sanitizePosText(input.description, 2_000);
  }
  if (input.imageUrl !== undefined) {
    data.imageUrl = sanitizePosText(input.imageUrl, 500);
  }

  if (input.unit !== undefined) {
    if (!isPosProductUnitValue(input.unit)) {
      return { ok: false, error: "La unidad de medida no es válida." };
    }
    data.unit = input.unit as Prisma.PosProductCreateInput["unit"];
  }

  if (input.defaultTaxRate !== undefined) {
    const rate = sanitizePosTaxRate(input.defaultTaxRate);
    if (rate === null) {
      return { ok: false, error: "La tasa de impuesto debe estar entre 0 y 100." };
    }
    data.defaultTaxRate = new Prisma.Decimal(rate.toFixed(2));
  }

  for (const field of ["minimumStock", "reorderPoint"] as const) {
    const value = input[field];
    if (value === undefined) continue;
    const level = sanitizePosStockLevel(value);
    if (level === null) {
      return { ok: false, error: "Los umbrales de existencia no son válidos." };
    }
    data[field] = new Prisma.Decimal(level.toFixed(3));
  }

  if (input.cost !== undefined) {
    const cost = sanitizePosMoney(input.cost);
    if (cost === null) return { ok: false, error: INVALID_MONEY };
    data.cost = toDecimal(cost);
  }

  // Las referencias se comprueban aquí y no se dejan a la clave foránea: el
  // error de Postgres no le dice nada útil a quien llena el formulario.
  if (input.categoryId !== undefined) {
    if (input.categoryId === null) {
      data.categoryId = null;
    } else {
      const category = await getPrisma().posCategory.findUnique({
        where: { id: input.categoryId },
        select: { id: true, isActive: true },
      });
      if (!category) return { ok: false, error: "La categoría no existe." };
      if (!category.isActive) {
        return { ok: false, error: "La categoría está inactiva." };
      }
      data.categoryId = category.id;
    }
  }

  if (input.brandId !== undefined) {
    if (input.brandId === null) {
      data.brandId = null;
    } else {
      const brand = await getPrisma().posBrand.findUnique({
        where: { id: input.brandId },
        select: { id: true, isActive: true },
      });
      if (!brand) return { ok: false, error: "La marca no existe." };
      if (!brand.isActive) return { ok: false, error: "La marca está inactiva." };
      data.brandId = brand.id;
    }
  }

  return { ok: true, data };
}

export async function createPosProductAction(
  input: {
    sku: string;
    name: string;
    unitPrice: number;
    barcode?: string | null;
    notes?: string | null;
  } & PosProductMetadataInput,
): Promise<{ ok: true; productId: string } | { ok: false; error: string }> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  const sku = sanitizePosText(input.sku, 60);
  const name = sanitizePosText(input.name, 200);
  if (!sku) return { ok: false, error: "El SKU es obligatorio." };
  if (!name) return { ok: false, error: "El nombre es obligatorio." };
  const unitPrice = sanitizePosMoney(input.unitPrice);
  if (unitPrice === null) return { ok: false, error: INVALID_MONEY };

  const metadata = await resolveProductMetadata(input);
  if (!metadata.ok) return metadata;

  try {
    const product = await getPrisma().posProduct.create({
      data: {
        sku,
        name,
        unitPrice: toDecimal(unitPrice),
        barcode: sanitizePosText(input.barcode, 60),
        notes: sanitizePosText(input.notes),
        ...metadata.data,
      },
    });
    revalidatePos();
    return { ok: true, productId: product.id };
  } catch {
    // The unique indexes on sku and barcode are the guarantee; this is their
    // message.
    return { ok: false, error: "Ya existe un producto con ese SKU o código." };
  }
}

// --- Catálogos de apoyo (POS1.1-A) ---------------------------------------

/**
 * Categorías y marcas comparten forma exacta, así que comparten implementación.
 * Duplicar dos acciones idénticas por si algún día divergen sería inventar una
 * diferencia que hoy no existe.
 */
async function createLookup(
  table: "posCategory" | "posBrand",
  input: { name: string; notes?: string | null },
  duplicateMessage: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  const name = sanitizePosText(input.name, 120);
  if (!name) return { ok: false, error: "El nombre es obligatorio." };

  const data = { name, notes: sanitizePosText(input.notes) };
  try {
    // Ternario y no un cast del delegado: las dos tablas tienen hoy la misma
    // forma, pero afirmarlo con `as` sería mentirle al compilador sobre cuál se
    // está usando. Esto lo comprueba.
    const row =
      table === "posCategory"
        ? await getPrisma().posCategory.create({ data })
        : await getPrisma().posBrand.create({ data });
    revalidatePos();
    return { ok: true, id: row.id };
  } catch {
    return { ok: false, error: duplicateMessage };
  }
}

async function updateLookup(
  table: "posCategory" | "posBrand",
  input: { id: string; name?: string; notes?: string | null; isActive?: boolean },
  missingMessage: string,
  duplicateMessage: string,
): Promise<PosActionResult> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  let name: string | undefined;
  if (input.name !== undefined) {
    const clean = sanitizePosText(input.name, 120);
    if (!clean) return { ok: false, error: "El nombre es obligatorio." };
    name = clean;
  }

  const where = { id: input.id };
  const existing =
    table === "posCategory"
      ? await getPrisma().posCategory.findUnique({ where, select: { id: true } })
      : await getPrisma().posBrand.findUnique({ where, select: { id: true } });
  if (!existing) return { ok: false, error: missingMessage };

  const data = {
    name,
    isActive: input.isActive,
    notes: input.notes === undefined ? undefined : sanitizePosText(input.notes),
  };
  try {
    if (table === "posCategory") {
      await getPrisma().posCategory.update({ where, data });
    } else {
      await getPrisma().posBrand.update({ where, data });
    }
    revalidatePos();
    return { ok: true };
  } catch {
    return { ok: false, error: duplicateMessage };
  }
}

// `async` obligatorio, no estilístico: en un archivo "use server" **todo export
// debe ser una función async**. Devolver la promesa sin declararla async
// typechequea y falla en `next build`.
export async function createPosCategoryAction(input: {
  name: string;
  notes?: string | null;
}) {
  return createLookup("posCategory", input, "Ya existe una categoría con ese nombre.");
}

export async function updatePosCategoryAction(input: {
  id: string;
  name?: string;
  notes?: string | null;
  isActive?: boolean;
}) {
  return updateLookup(
    "posCategory",
    input,
    "La categoría no existe.",
    "Ya existe una categoría con ese nombre.",
  );
}

export async function createPosBrandAction(input: {
  name: string;
  notes?: string | null;
}) {
  return createLookup("posBrand", input, "Ya existe una marca con ese nombre.");
}

export async function updatePosBrandAction(input: {
  id: string;
  name?: string;
  notes?: string | null;
  isActive?: boolean;
}) {
  return updateLookup(
    "posBrand",
    input,
    "La marca no existe.",
    "Ya existe una marca con ese nombre.",
  );
}

/**
 * Patch POS1.0-C — catalogue lookup as an **action**, not a navigation.
 *
 * The checkout screen holds the cart in browser state, so searching by
 * navigating to `?q=` would throw the cart away on every scan. This returns the
 * products instead, leaving the page — and the cart — where they are.
 *
 * It is a thin authorized wrapper over `searchPosProducts`: the query itself
 * stays in `queries.ts`, and this file adds only the permission check.
 */
export async function searchPosProductsAction(input: {
  term: string;
}): Promise<
  { ok: true; products: PosProductDTO[] } | { ok: false; error: string }
> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;
  // Inactive articles are excluded: the till may not sell a retired product,
  // and `addPosSaleItemAction` would refuse it anyway.
  const products = await searchPosProducts(input.term, { includeInactive: false });
  return { ok: true, products };
}

/**
 * Patch POS1.0-B — corrects a catalogue article.
 *
 * A product has **no workflow state**, so there is no draft to protect: any
 * field may change at any time. What a product does have is `isActive`, and
 * deactivating is how the catalogue retires an article without deleting it —
 * a sold product must keep existing, because past sale lines reference it and
 * the foreign key is `ON DELETE RESTRICT`.
 *
 * Every field is optional: the caller sends what changed.
 */
export async function updatePosProductAction(
  input: {
    productId: string;
    sku?: string;
    name?: string;
    unitPrice?: number;
    barcode?: string | null;
    isActive?: boolean;
    notes?: string | null;
  } & PosProductMetadataInput,
): Promise<PosActionResult> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  let sku: string | undefined;
  if (input.sku !== undefined) {
    const clean = sanitizePosText(input.sku, 60);
    if (!clean) return { ok: false, error: "El SKU es obligatorio." };
    sku = clean;
  }
  let name: string | undefined;
  if (input.name !== undefined) {
    const clean = sanitizePosText(input.name, 200);
    if (!clean) return { ok: false, error: "El nombre es obligatorio." };
    name = clean;
  }
  let unitPrice: number | undefined;
  if (input.unitPrice !== undefined) {
    const parsed = sanitizePosMoney(input.unitPrice);
    if (parsed === null) return { ok: false, error: INVALID_MONEY };
    unitPrice = parsed;
  }

  const product = await getPrisma().posProduct.findUnique({
    where: { id: input.productId },
    select: { id: true },
  });
  if (!product) return { ok: false, error: "El producto no existe." };

  const metadata = await resolveProductMetadata(input);
  if (!metadata.ok) return metadata;

  try {
    await getPrisma().posProduct.update({
      where: { id: input.productId },
      data: {
        sku,
        name,
        unitPrice: unitPrice === undefined ? undefined : toDecimal(unitPrice),
        barcode:
          input.barcode === undefined
            ? undefined
            : sanitizePosText(input.barcode, 60),
        isActive: input.isActive,
        notes:
          input.notes === undefined ? undefined : sanitizePosText(input.notes),
        ...metadata.data,
      },
    });
    revalidatePos();
    return { ok: true };
  } catch {
    return { ok: false, error: "Ya existe un producto con ese SKU o código." };
  }
}

// --- Inventario (POS1.1-B) -----------------------------------------------

/**
 * Patch POS1.1-B — cimiento del inventario del mostrador.
 *
 * ## Qué hay aquí y qué **no**
 *
 * Se pueden crear y corregir bodegas, y abrir la fila de saldo de un producto en
 * una bodega. **Nada más.** No hay ninguna acción que mueva un saldo, y esa
 * ausencia es el parche: las estructuras existen para que compras, ventas y
 * ajustes tengan dónde escribir legítimamente, no para que este parche escriba.
 *
 * ## Todo saldo nace en cero
 *
 * `openPosInventoryAction` crea la fila con `quantity` implícito en 0 y **no
 * acepta cantidad inicial**. Un saldo inicial distinto de cero es un movimiento
 * de tipo `INICIAL`, y ese flujo no existe todavía: aceptarlo aquí crearía
 * existencias sin bitácora que las explique, que es exactamente la incoherencia
 * que la desnormalización del saldo obliga a evitar.
 *
 * ## Y no toca el inventario serializado
 *
 * Ninguna de estas funciones lee ni escribe `motorcycleUnit` ni
 * `inventoryMovement`. Los dos inventarios conviven sin conocerse.
 */
export async function createPosWarehouseAction(input: {
  branchCode: string;
  code: string;
  name: string;
  notes?: string | null;
}): Promise<{ ok: true; warehouseId: string } | { ok: false; error: string }> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  const code = sanitizePosText(input.code, 40);
  const name = sanitizePosText(input.name, 200);
  if (!code) return { ok: false, error: "El código de la bodega es obligatorio." };
  if (!name) return { ok: false, error: "El nombre de la bodega es obligatorio." };

  // Una bodega no puede existir sin sucursal, a diferencia del producto.
  const branch = await getPrisma().branch.findUnique({
    where: { code: input.branchCode },
    select: { id: true },
  });
  if (!branch) return { ok: false, error: "La sucursal no existe." };

  try {
    const warehouse = await getPrisma().posWarehouse.create({
      data: {
        branchId: branch.id,
        code,
        name,
        notes: sanitizePosText(input.notes),
      },
    });
    revalidatePos();
    return { ok: true, warehouseId: warehouse.id };
  } catch {
    // El índice `@@unique([branchId, code])` es la garantía; este es su mensaje.
    return {
      ok: false,
      error: "Ya existe una bodega con ese código en esa sucursal.",
    };
  }
}

/**
 * Corrige una bodega. **La sucursal no se puede cambiar**: mover una bodega de
 * sucursal movería con ella todos sus saldos, y qué significa eso —¿un traslado?,
 * ¿una corrección?— es una decisión que nadie ha tomado.
 */
export async function updatePosWarehouseAction(input: {
  warehouseId: string;
  code?: string;
  name?: string;
  notes?: string | null;
  isActive?: boolean;
}): Promise<PosActionResult> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  let code: string | undefined;
  if (input.code !== undefined) {
    const clean = sanitizePosText(input.code, 40);
    if (!clean) return { ok: false, error: "El código de la bodega es obligatorio." };
    code = clean;
  }
  let name: string | undefined;
  if (input.name !== undefined) {
    const clean = sanitizePosText(input.name, 200);
    if (!clean) return { ok: false, error: "El nombre de la bodega es obligatorio." };
    name = clean;
  }

  const warehouse = await getPrisma().posWarehouse.findUnique({
    where: { id: input.warehouseId },
    select: { id: true },
  });
  if (!warehouse) return { ok: false, error: "La bodega no existe." };

  try {
    await getPrisma().posWarehouse.update({
      where: { id: input.warehouseId },
      data: {
        code,
        name,
        isActive: input.isActive,
        notes:
          input.notes === undefined ? undefined : sanitizePosText(input.notes),
      },
    });
    revalidatePos();
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Ya existe una bodega con ese código en esa sucursal.",
    };
  }
}

/**
 * Abre la fila de saldo de un producto en una bodega, **en cero**.
 *
 * Es idempotente: si la fila ya existe la devuelve en vez de fallar, porque
 * "asegúrate de que este producto está en esta bodega" es la intención, y el
 * índice único ya impide el duplicado.
 */
export async function openPosInventoryAction(input: {
  warehouseId: string;
  productId: string;
}): Promise<{ ok: true; inventoryId: string } | { ok: false; error: string }> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  const warehouse = await getPrisma().posWarehouse.findUnique({
    where: { id: input.warehouseId },
    select: { id: true, isActive: true },
  });
  if (!warehouse) return { ok: false, error: "La bodega no existe." };
  if (!warehouse.isActive) return { ok: false, error: "La bodega está inactiva." };

  const product = await getPrisma().posProduct.findUnique({
    where: { id: input.productId },
    select: { id: true, isActive: true },
  });
  if (!product) return { ok: false, error: "El producto no existe." };
  if (!product.isActive) return { ok: false, error: "El producto está inactivo." };

  const identity = {
    warehouseId_productId: { warehouseId: warehouse.id, productId: product.id },
  };

  const existing = await getPrisma().posInventory.findUnique({
    where: identity,
    select: { id: true },
  });
  if (existing) return { ok: true, inventoryId: existing.id };

  try {
    const row = await getPrisma().posInventory.create({
      data: { warehouseId: warehouse.id, productId: product.id },
    });
    revalidatePos();
    return { ok: true, inventoryId: row.id };
  } catch {
    // Entre la lectura y la escritura cabe otra llamada idéntica. El índice
    // único la detiene, y quien pierde la carrera **también quiso lo mismo**:
    // se relee y se devuelve la fila que ganó, en vez de fallar. Sin esto, la
    // segunda llamada reventaría con una excepción no controlada.
    const winner = await getPrisma().posInventory.findUnique({
      where: identity,
      select: { id: true },
    });
    if (winner) return { ok: true, inventoryId: winner.id };
    return { ok: false, error: "No se pudo abrir el saldo del producto." };
  }
}

/**
 * Patch POS1.1-C — bloquea la fila de saldo antes de leerla.
 *
 * **Copia deliberada de `lockJournalEntry`** (`contabilidad/actions.ts`), que ya
 * resuelve así el mismo problema: toda mutación de un asiento bloquea la fila
 * padre antes de mirar su estado. No se inventa un segundo patrón de
 * concurrencia para el mismo repositorio.
 *
 * ## Por qué bloqueo pesimista y no incremento atómico
 *
 * `UPDATE ... SET quantity = quantity + n` también sería inmune a la
 * actualización perdida, y sin bloqueo explícito. Se descartó por dos razones:
 *
 * 1. **`quantityBefore` quedaría derivado, no leído.** En una bitácora de
 *    auditoría, calcular el "antes" restando del "después" es una ficción que se
 *    sostiene solo mientras nadie más escriba el saldo por otra vía. Bajo
 *    bloqueo, el "antes" es el valor real que había.
 * 2. **El contrato tiene que servir a los flujos que vienen.** Una venta que
 *    consume existencias necesita **decidir** —"¿hay suficiente?"— antes de
 *    escribir, y una decisión exige bloqueo: un incremento no puede rechazarse a
 *    sí mismo. Este parche fija el contrato de mutación que heredará todo flujo
 *    de inventario, así que el contrato se construye sobre lo que sí generaliza.
 *
 * PostgreSQL trabaja en READ COMMITTED por defecto, donde leer y luego escribir
 * un valor calculado **sí** pierde actualizaciones. `FOR UPDATE` serializa a los
 * competidores sobre esa fila: el segundo espera al COMMIT del primero y lee el
 * saldo ya actualizado.
 */
async function lockPosInventory(
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

/** Aborta una mutación de inventario con un mensaje destinado a quien la hace. */
class PosInventoryError extends Error {}

/**
 * Patch POS1.1-C — **el motor de mutación de inventario**. Patch POS1.1-D lo
 * extrajo para que el ajuste lo reutilizara.
 *
 * Todo flujo que cambie existencias del mostrador pasa por aquí. No hay un
 * segundo algoritmo, y no debe haberlo: dos implementaciones del mismo contrato
 * son dos sitios donde puede olvidarse el bloqueo.
 *
 * ## El contrato, en este orden
 *
 * 1. Bloquear y leer el saldo (`FOR UPDATE`).
 * 2. Crear el movimiento, con `antes`, `cantidad` y `después`.
 * 3. Actualizar el saldo al `después`.
 *
 * **Nunca un saldo sin movimiento; nunca un movimiento sin saldo actualizado.**
 * Al vivir los dos en la misma transacción del llamador, no existe estado
 * intermedio observable.
 *
 * ## Lo que el motor **no** decide
 *
 * **No sanea la cantidad ni elige el tipo.** Recibe una cantidad ya saneada, con
 * signo, y el tipo de movimiento. Esas dos cosas son propias de cada flujo —un
 * ingreso es positivo y es `COMPRA`; un ajuste lleva signo y es `AJUSTE`— y
 * meterlas aquí obligaría al motor a conocer a sus llamadores.
 *
 * **No mira el signo del saldo resultante.** No hay ninguna línea que compruebe
 * si `quantityAfter` queda bajo cero, ni para permitirlo ni para impedirlo: el
 * repositorio no contiene esa regla (**P-8**), y escribirla aquí sería
 * inventarla. La ausencia es deliberada y está verificada.
 */
async function applyPosInventoryMovement(
  tx: Prisma.TransactionClient,
  input: {
    warehouseId: string;
    productId: string;
    /** Ya saneada por el llamador. Con signo: positivo suma, negativo resta. */
    quantity: number;
    type: Prisma.PosInventoryMovementCreateInput["type"];
    reason: string;
    notes: string | null;
    userId: string;
  },
): Promise<{ movementId: string; quantityBefore: number; quantityAfter: number }> {
  // Las comprobaciones autoritativas van **dentro** de la transacción: lo leído
  // antes de abrirla puede haber cambiado, y un producto desactivado a medio
  // camino no debe entrar igualmente.
  const warehouse = await tx.posWarehouse.findUnique({
    where: { id: input.warehouseId },
    select: { id: true, isActive: true },
  });
  if (!warehouse) throw new PosInventoryError("La bodega no existe.");
  if (!warehouse.isActive) throw new PosInventoryError("La bodega está inactiva.");

  const product = await tx.posProduct.findUnique({
    where: { id: input.productId },
    select: { id: true, isActive: true },
  });
  if (!product) throw new PosInventoryError("El producto no existe.");
  if (!product.isActive) throw new PosInventoryError("El producto está inactivo.");

  // 1. Bloquear y leer.
  const balance = await lockPosInventory(tx, warehouse.id, product.id);
  if (!balance) {
    throw new PosInventoryError(
      "El producto no tiene saldo abierto en esa bodega.",
    );
  }

  // Aritmética en Decimal, no en punto flotante: un saldo que se arrastra
  // movimiento a movimiento no puede permitirse el error de coma flotante.
  const quantityBefore = balance.quantity;
  const movementQuantity = toQuantity(input.quantity);
  const quantityAfter = quantityBefore.add(movementQuantity);

  // 2. Crear el movimiento.
  const movement = await tx.posInventoryMovement.create({
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
    select: { id: true },
  });

  // 3. Actualizar el saldo. Mismo `quantityAfter` que quedó escrito en el
  //    movimiento: no se recalcula, para que no puedan divergir.
  await tx.posInventory.update({
    where: { id: balance.id },
    data: { quantity: quantityAfter },
  });

  return {
    movementId: movement.id,
    quantityBefore: quantityBefore.toNumber(),
    quantityAfter: quantityAfter.toNumber(),
  };
}

/**
 * Ejecuta una mutación de inventario en su propia transacción y traduce el
 * error. Es la envoltura que comparten todas las acciones de inventario, para
 * que ninguna repita el `$transaction` ni el `catch`.
 */
async function runPosInventoryMutation(input: {
  warehouseId: string;
  productId: string;
  quantity: number;
  type: Prisma.PosInventoryMovementCreateInput["type"];
  reason: string;
  notes: string | null;
  userId: string;
}): Promise<
  | { ok: true; movementId: string; quantityBefore: number; quantityAfter: number }
  | { ok: false; error: string }
> {
  try {
    const result = await getPrisma().$transaction((tx) =>
      applyPosInventoryMovement(tx, input),
    );
    revalidatePos();
    return { ok: true, ...result };
  } catch (error) {
    // Nada quedó escrito: movimiento y saldo comparten transacción. Solo sale un
    // mensaje escrito aquí; lo demás es infraestructura y su texto hablaría de
    // nombres de tabla en vez de del inventario.
    return {
      ok: false,
      error:
        error instanceof PosInventoryError
          ? error.message
          : "No se pudo registrar el movimiento de inventario.",
    };
  }
}

/**
 * Patch POS1.1-C — **el primer flujo del repositorio que cambia existencias del
 * mostrador**.
 *
 * Registra un ingreso manual. Nada más: ni compras, ni proveedores, ni facturas,
 * ni costeo, ni contabilidad, ni caja, ni traslados, ni consumo por venta.
 *
 * ## La cantidad es estrictamente positiva
 *
 * Se sanea con `sanitizePosQuantity`, que **ya existía desde POS1.0-A** y
 * significa exactamente eso: tres decimales, mayor que cero. Cero y negativo se
 * rechazan. No se añadió un saneador nuevo para una regla ya escrita.
 *
 * **No se pronuncia sobre el saldo negativo (P-8):** un ingreso solo suma, así
 * que la pregunta no se le plantea.
 *
 * ## El contrato transaccional no vive aquí
 *
 * Vive en `applyPosInventoryMovement`, y esta acción solo aporta lo que es suyo:
 * qué cantidad es válida y qué tipo de movimiento se escribe.
 */
export async function registerPosInventoryReceiptAction(input: {
  warehouseId: string;
  productId: string;
  quantity: number;
  reason: string;
  notes?: string | null;
}): Promise<
  | { ok: true; movementId: string; quantityBefore: number; quantityAfter: number }
  | { ok: false; error: string }
> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  // Saneado fuera de la transacción: lo que no es de fiar no debe llegar a
  // tener una fila bloqueada esperándolo.
  const quantity = sanitizePosQuantity(input.quantity);
  if (quantity === null) {
    return {
      ok: false,
      error: "La cantidad del ingreso debe ser mayor que cero.",
    };
  }
  const reason = sanitizePosText(input.reason, 500);
  if (!reason) return { ok: false, error: "El motivo del ingreso es obligatorio." };

  return runPosInventoryMutation({
    warehouseId: input.warehouseId,
    productId: input.productId,
    quantity,
    type: "COMPRA",
    reason,
    notes: sanitizePosText(input.notes),
    userId: auth.userId,
  });
}

/**
 * Patch POS1.1-D — **el segundo flujo que cambia existencias**, y la prueba de
 * que el contrato de POS1.1-C se reutiliza sin modificarlo.
 *
 * ## No hay un segundo algoritmo
 *
 * Comparte `applyPosInventoryMovement` con el ingreso, byte por byte: mismo
 * bloqueo `FOR UPDATE`, mismo orden, misma transacción, misma invariante. Lo
 * único propio del ajuste son dos cosas, y las dos están aquí: **la cantidad
 * lleva signo** y **el tipo es `AJUSTE`**.
 *
 * ## La cantidad lleva signo y no puede ser cero
 *
 * Se sanea con `sanitizePosMovementQuantity`, que **ya existía desde POS1.1-B** y
 * significa exactamente eso. Positivo suma, negativo resta, cero se rechaza: un
 * ajuste que no ajusta nada no es un ajuste.
 *
 * ## Sobre el saldo negativo: **este parche no decide** (P-8)
 *
 * Un ajuste negativo mayor que el saldo lo deja bajo cero, y **no hay ninguna
 * línea que lo compruebe**. No es permisividad nueva: es que el repositorio
 * nunca ha contenido esa regla, `sanitizePosInventoryQuantity` ya lo documentaba
 * desde POS1.1-B, y escribirla aquí —en cualquiera de los dos sentidos— sería
 * inventar política de operación dentro de un parche que dice hacer ajustes.
 *
 * Rechazarlo en silencio y permitirlo por política nueva son el mismo error con
 * distinto signo. Lo que se preserva es la **ausencia** de la regla, y el smoke
 * la verifica como ausencia.
 */
export async function adjustPosInventoryAction(input: {
  warehouseId: string;
  productId: string;
  /** Con signo. Positivo aumenta las existencias, negativo las reduce. */
  quantity: number;
  reason: string;
  notes?: string | null;
}): Promise<
  | { ok: true; movementId: string; quantityBefore: number; quantityAfter: number }
  | { ok: false; error: string }
> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  const quantity = sanitizePosMovementQuantity(input.quantity);
  if (quantity === null) {
    return {
      ok: false,
      error: "La cantidad del ajuste no es válida y no puede ser cero.",
    };
  }
  const reason = sanitizePosText(input.reason, 500);
  if (!reason) return { ok: false, error: "El motivo del ajuste es obligatorio." };

  return runPosInventoryMutation({
    warehouseId: input.warehouseId,
    productId: input.productId,
    quantity,
    type: "AJUSTE",
    reason,
    notes: sanitizePosText(input.notes),
    userId: auth.userId,
  });
}

// --- Sale lifecycle ------------------------------------------------------

export async function createPosSaleAction(input: {
  branchCode: string;
  customerId?: string | null;
  notes?: string | null;
}): Promise<{ ok: true; saleId: string } | { ok: false; error: string }> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  const branch = await getPrisma().branch.findUnique({
    where: { code: input.branchCode },
    select: { id: true },
  });
  if (!branch) return { ok: false, error: "La sucursal no existe." };

  const sale = await getPrisma().posSale.create({
    data: {
      saleNumber: generateSaleNumber(),
      branchId: branch.id,
      cashierId: auth.userId,
      customerId: input.customerId ?? null,
      status: "BORRADOR",
      notes: sanitizePosText(input.notes),
    },
  });
  revalidatePos();
  return { ok: true, saleId: sale.id };
}

export async function searchPosCustomersAction(input: {
  term: string;
}): Promise<
  | { ok: true; customers: Array<{ id: string; name: string; phone: string | null }> }
  | { ok: false; error: string }
> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;
  return { ok: true, customers: await searchPosCustomers(input.term) };
}

/**
 * Patch POS1.0-D — the checkout: cart in, persisted sale out, one transaction.
 *
 * ## Why this is a new action and not the existing ones
 *
 * `createPosSaleAction` opens an **empty** draft, and items and payments are
 * added one call at a time. That shape is right for a sale assembled over time;
 * it is wrong for a till, where an abandoned checkout would leave a draft and
 * its lines behind. Here everything is written together or nothing is.
 *
 * ## The browser cart **is** the draft
 *
 * Which is why the sale is born `COMPLETADA` rather than passing through
 * `BORRADOR`: the draft phase already happened, in the browser, and persisting a
 * draft only to complete it in the same transaction would be ceremony. The
 * `BORRADOR` state stays reachable through `createPosSaleAction` for a workflow
 * that needs it.
 *
 * ## Totals are derived, never accepted
 *
 * **The input has no total field at all.** The server recomputes every figure
 * from the received lines with `calculatePosSaleTotals`, so there is nothing a
 * tampered browser could send: the attack surface does not exist rather than
 * being validated away.
 *
 * ## What it still does not do
 *
 * No posting, no inventory movement, no cash document. POS1.0-A's contract is
 * unchanged, and the smoke suite still asserts it.
 */
export async function checkoutPosSaleAction(input: {
  branchCode: string;
  /**
   * Patch POS1.1-E — **obligatorio**: de dónde salen las existencias.
   *
   * `PosSale` no guarda bodega y una sucursal puede tener varias, así que el
   * consumo no puede deducirla. Elegir por él —"la primera activa"— sería
   * inventar una regla de selección que el repositorio no contiene. Quien cobra
   * dice de qué bodega descuenta, igual que dice en qué sucursal cobra.
   */
  warehouseId: string;
  customerId?: string | null;
  notes?: string | null;
  lines: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    tax?: number;
  }>;
  payments?: Array<{ method: string; amount: number; reference?: string | null }>;
}): Promise<
  { ok: true; saleId: string; saleNumber: string } | { ok: false; error: string }
> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  if (!input.lines.length) return { ok: false, error: NO_ITEMS };

  // Sanitize before anything touches the database: a line that cannot be
  // trusted must not reach the transaction.
  const lines: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    tax: number;
  }> = [];
  for (const line of input.lines) {
    const quantity = sanitizePosQuantity(line.quantity);
    if (quantity === null) return { ok: false, error: INVALID_QUANTITY };
    const unitPrice = sanitizePosMoney(line.unitPrice);
    const discount = sanitizePosMoney(line.discount ?? 0);
    const tax = sanitizePosMoney(line.tax ?? 0);
    if (unitPrice === null || discount === null || tax === null) {
      return { ok: false, error: INVALID_MONEY };
    }
    lines.push({ productId: line.productId, quantity, unitPrice, discount, tax });
  }

  const payments: Array<{
    method: Prisma.PosPaymentCreateInput["method"];
    amount: number;
    reference: string | null;
  }> = [];
  for (const payment of input.payments ?? []) {
    if (!isPosPaymentMethodValue(payment.method)) {
      return { ok: false, error: "La forma de pago no es válida." };
    }
    const amount = sanitizePosMoney(payment.amount);
    if (amount === null || amount <= 0) return { ok: false, error: INVALID_MONEY };
    payments.push({
      method: payment.method as Prisma.PosPaymentCreateInput["method"],
      amount,
      reference: sanitizePosText(payment.reference, 120),
    });
  }

  const branch = await getPrisma().branch.findUnique({
    where: { code: input.branchCode },
    select: { id: true },
  });
  if (!branch) return { ok: false, error: "La sucursal no existe." };

  try {
    const sale = await getPrisma().$transaction(async (tx) => {
      const products = await tx.posProduct.findMany({
        where: { id: { in: lines.map((line) => line.productId) } },
        select: { id: true, isActive: true },
      });
      const byId = new Map(products.map((product) => [product.id, product]));
      for (const line of lines) {
        const product = byId.get(line.productId);
        if (!product) throw new PosCheckoutError("El producto no existe.");
        if (!product.isActive) {
          throw new PosCheckoutError("El producto está inactivo.");
        }
      }

      if (input.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: input.customerId },
          select: { id: true },
        });
        if (!customer) throw new PosCheckoutError("El cliente no existe.");
      }

      const totals = calculatePosSaleTotals(lines);

      const sale = await tx.posSale.create({
        data: {
          saleNumber: generateSaleNumber(),
          branchId: branch.id,
          cashierId: auth.userId,
          customerId: input.customerId ?? null,
          // The cart was the draft; the persisted sale is already closed.
          status: "COMPLETADA",
          completedAt: new Date(),
          subtotal: toDecimal(totals.subtotal),
          discount: toDecimal(totals.discount),
          tax: toDecimal(totals.tax),
          total: toDecimal(totals.total),
          notes: sanitizePosText(input.notes),
          items: {
            create: lines.map((line, position) => ({
              productId: line.productId,
              quantity: toQuantity(line.quantity),
              unitPrice: toDecimal(line.unitPrice),
              discount: toDecimal(line.discount),
              tax: toDecimal(line.tax),
              total: toDecimal(calculatePosLineTotal(line)),
              position,
            })),
          },
          payments: {
            create: payments.map((payment) => ({
              method: payment.method,
              amount: toDecimal(payment.amount),
              reference: payment.reference,
            })),
          },
        },
        select: { id: true, saleNumber: true },
      });

      // --- Consumo de existencias (POS1.1-E) ---------------------------
      //
      // **La bodega tiene que ser de la sucursal donde se cobra.** No es una
      // regla inventada: `PosWarehouse.branchId` es obligatorio, todo lo que
      // tiene existencias en este repositorio está atado a una sucursal, y mover
      // existencias entre sucursales exige un traslado —que POS1.1-B excluyó a
      // propósito—. Sin esta comprobación una venta en Rosita descontaría de
      // Granada en silencio y descuadraría las dos.
      //
      // **[D]** Si el negocio tiene una bodega central que surte a varias
      // sucursales, esto lo bloquea. Ver P-14.
      const warehouseBranch = await tx.posWarehouse.findUnique({
        where: { id: input.warehouseId },
        select: { branchId: true },
      });
      if (!warehouseBranch) throw new PosCheckoutError("La bodega no existe.");
      if (warehouseBranch.branchId !== branch.id) {
        throw new PosCheckoutError(
          "La bodega no pertenece a la sucursal de la venta.",
        );
      }
      //
      // **Dentro de la misma transacción que persiste la venta**, así que no
      // puede existir una venta completada sin su consumo ni un consumo sin su
      // venta. Es la misma garantía que ya tenían las líneas y los pagos.
      //
      // **Orden determinista por producto.** Dos cobros simultáneos que
      // compartan artículos bloquearían sus saldos en el orden en que llegan
      // sus líneas; si un cajero vende A,B y otro B,A, cada transacción
      // esperaría al bloqueo que tiene la otra y PostgreSQL abortaría una por
      // interbloqueo. Ordenar por `productId` hace que todos los cobros pidan
      // los bloqueos en la misma secuencia, que es la forma estándar de que un
      // interbloqueo no pueda formarse.
      const consumption = [...lines].sort((left, right) =>
        left.productId.localeCompare(right.productId),
      );
      for (const line of consumption) {
        await applyPosInventoryMovement(tx, {
          warehouseId: input.warehouseId,
          productId: line.productId,
          // Con signo: una venta consume, así que resta.
          quantity: -line.quantity,
          type: "VENTA",
          // El motivo es obligatorio y **es la única traza hacia la venta**: no
          // existe relación de movimiento a venta. Ver P-13.
          reason: `Venta ${sale.saleNumber}`,
          notes: null,
          userId: auth.userId,
        });
      }

      return sale;
    });
    revalidatePos();
    return { ok: true, saleId: sale.id, saleNumber: sale.saleNumber };
  } catch (error) {
    // Nothing was written: the whole checkout is one transaction.
    //
    // Only a message this action authored reaches the till. Anything else — a
    // Prisma constraint, a lost connection — is infrastructure, and its text
    // would tell the cashier about table names instead of about the sale.
    return {
      ok: false,
      error:
        error instanceof PosCheckoutError
          ? error.message
          : "No se pudo registrar la venta.",
    };
  }
}

export async function addPosSaleItemAction(input: {
  saleId: string;
  productId: string;
  quantity: number;
  /** Overrides the catalogue price when the till agreed another one. */
  unitPrice?: number;
  discount?: number;
  tax?: number;
}): Promise<PosActionResult> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  const quantity = sanitizePosQuantity(input.quantity);
  if (quantity === null) return { ok: false, error: INVALID_QUANTITY };
  const discount = sanitizePosMoney(input.discount ?? 0);
  const tax = sanitizePosMoney(input.tax ?? 0);
  if (discount === null || tax === null) {
    return { ok: false, error: INVALID_MONEY };
  }

  return getPrisma().$transaction(async (tx) => {
    const sale = await tx.posSale.findUnique({ where: { id: input.saleId } });
    if (!sale) return { ok: false as const, error: NO_SALE };
    if (sale.status !== "BORRADOR") {
      return { ok: false as const, error: ONLY_DRAFT };
    }
    const product = await tx.posProduct.findUnique({
      where: { id: input.productId },
    });
    if (!product) return { ok: false as const, error: "El producto no existe." };
    if (!product.isActive) {
      return { ok: false as const, error: "El producto está inactivo." };
    }

    const unitPrice =
      input.unitPrice === undefined
        ? decimalToNumber(product.unitPrice)
        : sanitizePosMoney(input.unitPrice);
    if (unitPrice === null) return { ok: false as const, error: INVALID_MONEY };

    const position = await tx.posSaleItem.count({
      where: { saleId: input.saleId },
    });
    await tx.posSaleItem.create({
      data: {
        saleId: input.saleId,
        productId: product.id,
        quantity: toQuantity(quantity),
        unitPrice: toDecimal(unitPrice),
        discount: toDecimal(discount),
        tax: toDecimal(tax),
        total: toDecimal(
          calculatePosLineTotal({ quantity, unitPrice, discount, tax }),
        ),
        position,
      },
    });
    await recalculateSale(tx, input.saleId);
    revalidatePos();
    return { ok: true as const };
  });
}

export async function removePosSaleItemAction(input: {
  itemId: string;
}): Promise<PosActionResult> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const item = await tx.posSaleItem.findUnique({
      where: { id: input.itemId },
      include: { sale: { select: { id: true, status: true } } },
    });
    if (!item) return { ok: false as const, error: "El artículo no existe." };
    if (item.sale.status !== "BORRADOR") {
      return { ok: false as const, error: ONLY_DRAFT };
    }
    await tx.posSaleItem.delete({ where: { id: item.id } });
    await recalculateSale(tx, item.sale.id);
    revalidatePos();
    return { ok: true as const };
  });
}

export async function addPosPaymentAction(input: {
  saleId: string;
  method: string;
  amount: number;
  reference?: string | null;
}): Promise<PosActionResult> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  if (!isPosPaymentMethodValue(input.method)) {
    return { ok: false, error: "La forma de pago no es válida." };
  }
  const amount = sanitizePosMoney(input.amount);
  if (amount === null || amount <= 0) {
    return { ok: false, error: INVALID_MONEY };
  }

  return getPrisma().$transaction(async (tx) => {
    const sale = await tx.posSale.findUnique({ where: { id: input.saleId } });
    if (!sale) return { ok: false as const, error: NO_SALE };
    if (sale.status !== "BORRADOR") {
      return { ok: false as const, error: ONLY_DRAFT };
    }
    await tx.posPayment.create({
      data: {
        saleId: sale.id,
        // `isPosPaymentMethodValue` ya lo estrechó al vocabulario compartido.
        method: input.method as Prisma.PosPaymentCreateInput["method"],
        amount: toDecimal(amount),
        reference: sanitizePosText(input.reference, 120),
      },
    });
    revalidatePos();
    return { ok: true as const };
  });
}

export async function removePosPaymentAction(input: {
  paymentId: string;
}): Promise<PosActionResult> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const payment = await tx.posPayment.findUnique({
      where: { id: input.paymentId },
      include: { sale: { select: { status: true } } },
    });
    if (!payment) return { ok: false as const, error: "El pago no existe." };
    if (payment.sale.status !== "BORRADOR") {
      return { ok: false as const, error: ONLY_DRAFT };
    }
    await tx.posPayment.delete({ where: { id: payment.id } });
    revalidatePos();
    return { ok: true as const };
  });
}

/**
 * BORRADOR → COMPLETADA.
 *
 * Requires at least one item: a sale of nothing is not a sale, the same rule
 * Caja applies to an invoice before issuing.
 *
 * **It does not require the payments to cover the total.** Whether a till may
 * close a sale short, and what change above the total means, is a business rule
 * nobody has stated; inventing one here would be policy. See `docs/POS.md`.
 */
export async function completePosSaleAction(input: {
  saleId: string;
}): Promise<PosActionResult> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const sale = await tx.posSale.findUnique({
      where: { id: input.saleId },
      include: { _count: { select: { items: true } } },
    });
    if (!sale) return { ok: false as const, error: NO_SALE };
    if (sale.status !== "BORRADOR") {
      return { ok: false as const, error: ONLY_DRAFT };
    }
    if (!sale._count.items) return { ok: false as const, error: NO_ITEMS };

    // Guarded transition: the status is re-checked in the WHERE, so two
    // concurrent completions cannot both win.
    const guarded = await tx.posSale.updateMany({
      where: { id: sale.id, status: "BORRADOR" },
      data: { status: "COMPLETADA", completedAt: new Date() },
    });
    if (guarded.count !== 1) return { ok: false as const, error: ONLY_DRAFT };
    revalidatePos();
    return { ok: true as const };
  });
}

/** BORRADOR → ANULADA. A completed sale is immutable and cannot be cancelled. */
export async function cancelPosSaleAction(input: {
  saleId: string;
}): Promise<PosActionResult> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const sale = await tx.posSale.findUnique({ where: { id: input.saleId } });
    if (!sale) return { ok: false as const, error: NO_SALE };
    if (sale.status !== "BORRADOR") {
      return { ok: false as const, error: ONLY_DRAFT };
    }
    const guarded = await tx.posSale.updateMany({
      where: { id: sale.id, status: "BORRADOR" },
      data: { status: "ANULADA", cancelledAt: new Date() },
    });
    if (guarded.count !== 1) return { ok: false as const, error: ONLY_DRAFT };
    revalidatePos();
    return { ok: true as const };
  });
}
