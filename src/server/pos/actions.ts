"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import {
  canAccessBranch,
  canManageInventory,
  canOperateCaja,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { getCurrentPosSession } from "@/server/pos/auth";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  listPosInventory,
  searchPosCustomers,
  searchPosProducts,
} from "@/server/pos/queries";
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
  type PosCheckoutErrorCode,
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
const NO_ITEMS = "La venta necesita al menos un artículo.";
/**
 * Patch D3 — el efectivo exige turno, y **solo el efectivo**.
 *
 * Es un mensaje de dominio, no un genérico: el cajero tiene que saber que le
 * falta abrir la caja, no que «no se pudo registrar la venta». La pantalla lo
 * reconoce por su texto para ofrecer el camino a `/pos/caja`.
 */
const NO_OPEN_SHIFT =
  "Debes abrir un turno de caja antes de cobrar en efectivo.";
const INVALID_MONEY = "Los montos de la venta no son válidos.";
const INVALID_QUANTITY = "La cantidad no es válida.";
const NO_POS_SESSION =
  "Inicia sesión en el punto de venta para realizar esta operación.";

const POS_ROUTES = ["/panel/caja", "/panel/pos"];

/**
 * Patch POS1.0-D. Aborta la transacción del cobro con un mensaje **destinado al
 * cajero**. Existe para que el `catch` sepa distinguir una regla de negocio de
 * un fallo de infraestructura: sin ella, el mensaje crudo de Prisma —nombres de
 * tabla, restricciones— acabaría en pantalla.
 */
/**
 * Un fallo del cobro que el mostrador debe **poder distinguir**.
 *
 * Patch CB4-D3 — lleva `code` además del mensaje. Sin él, la pantalla tendría
 * que comparar texto en español para saber si ofrecer «Abrir turno», y un
 * mensaje reescrito rompería la interfaz en silencio. El texto es para el
 * cajero; el código, para el programa.
 *
 * `code` es opcional: los fallos que la pantalla trata igual —producto
 * inactivo, cliente inexistente— siguen sin necesitarlo.
 */
class PosCheckoutError extends Error {
  readonly code?: PosCheckoutErrorCode;

  constructor(message: string, code?: PosCheckoutErrorCode) {
    super(message);
    this.code = code;
  }
}

export type PosActionResult = { ok: true } | { ok: false; error: string };

function revalidatePos() {
  for (const route of POS_ROUTES) revalidatePath(route);
}

/**
 * Patch POS2.4 — **la operación de mostrador ya no pasa por Caja.**
 *
 * Hasta aquí, `authorizePos` exigía `canOperateCaja` sobre la sesión
 * administrativa. Eso hacía que poder operar la caja implicara poder operar el
 * punto de venta, que es exactamente la confusión que este parche deshace: son
 * dos productos con dos identidades.
 *
 * Ahora exige una **sesión de POS**, validada contra la base en cada petición
 * (`getCurrentPosSession`), de modo que desactivar un operador o cerrar su
 * sesión surte efecto de inmediato en vez de esperar a que caduque un token.
 *
 * `userId` sale del usuario interno enlazado al operador y **existe solo para
 * las claves foráneas de auditoría** que POS1.x ya escribía (`cashierId`,
 * `createdByUserId`). Ni su contraseña ni su rol participan en esta
 * autorización: un administrador sin credenciales de POS no pasa por aquí.
 *
 * `branchCode` viaja porque el alcance del operador es su sucursal, y las
 * comprobaciones de sucursal y bodega que POS1.1-E introdujo siguen intactas.
 */
async function authorizePos() {
  if (!isDatabaseConfigured()) {
    return { ok: false as const, error: NO_DB };
  }
  const session = await getCurrentPosSession();
  if (!session) {
    return { ok: false as const, error: NO_POS_SESSION };
  }
  return {
    ok: true as const,
    userId: session.userId,
    operatorId: session.operatorId,
    branchCode: session.branchCode,
  };
}

/**
 * Administración del catálogo y de las bodegas.
 *
 * **No es operación de mostrador**: se hace desde el panel administrativo, con
 * la sesión administrativa y el permiso que ya tenía. Separarla de
 * `authorizePos` es lo que permite que el mostrador deje de depender de Caja
 * sin quitarle al administrador una pantalla que siempre fue suya.
 */
async function authorizePosCatalogue() {
  if (!isDatabaseConfigured()) {
    return { ok: false as const, error: NO_DB };
  }
  const session = await requireAuth();
  if (!canOperateCaja(session.roleEnum)) {
    return { ok: false as const, error: NO_PERMISSION };
  }
  // Patch INT5 — **rol y sucursal viajan.** El catálogo de productos es global y
  // no los necesita, pero las bodegas sí: pertenecen a una sucursal, y sin este
  // dato la acción no tenía con qué comprobar nada.
  return {
    ok: true as const,
    userId: session.uid,
    role: session.roleEnum,
    branchId: session.branchId,
  };
}

/**
 * Búsqueda de artículos: la usan **las dos** superficies —el mostrador para
 * armar la venta y el panel para el catálogo—, así que admite cualquiera de las
 * dos identidades. Es de solo lectura y no escribe nada.
 */
async function authorizePosLookup() {
  const pos = await authorizePos();
  if (pos.ok) return pos;
  return authorizePosCatalogue();
}

/**
 * Patch POS5.0 — la sucursal del operador, resuelta a identificador.
 *
 * **[R] La sucursal de una operación de mostrador la decide la sesión, no la
 * petición.** Hasta POS5.0 el cobro recibía `branchCode` del navegador y lo
 * usaba tal cual: un operador de Granada podía registrar una venta en Masaya y
 * consumir su inventario. Que la interfaz dejara de ofrecer el selector en
 * POS2.4 fue una mejora de uso, **no una frontera**: la acción seguía abierta.
 *
 * Se resuelve aquí, una vez, para que ninguna acción tenga que acordarse.
 */
async function resolvePosSessionBranch(
  branchCode: string,
): Promise<{ ok: true; branchId: string } | { ok: false; error: string }> {
  const branch = await getPrisma().branch.findUnique({
    where: { code: branchCode },
    select: { id: true },
  });
  if (!branch) return { ok: false, error: "La sucursal de tu sesión no existe." };
  return { ok: true, branchId: branch.id };
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
  const auth = await authorizePosCatalogue();
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
  const auth = await authorizePosCatalogue();
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
  const auth = await authorizePosCatalogue();
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
 * Patch POS4.0 — la coincidencia exacta primero.
 *
 * **No cambia qué encuentra la consulta, solo en qué orden se lee.** El `where`
 * de `searchPosProducts` sigue siendo el mismo —SKU exacto, código exacto,
 * nombre contiene— y su `orderBy` por nombre sigue decidiendo el resto. Lo único
 * que se adelanta es el artículo cuyo SKU o código *es* lo que se tecleó: en un
 * mostrador, quien escribe un código completo no está explorando.
 *
 * Vive en la acción y no en la consulta a propósito: `searchPosProducts` también
 * sirve al catálogo paginado, y reordenar dentro de una página haría que el
 * orden dependiera del corte.
 */
function orderPosSearchHits(
  products: PosProductDTO[],
  term: string,
): PosProductDTO[] {
  const clean = term.trim().toLowerCase();
  if (!clean) return products;
  const exact = (product: PosProductDTO) =>
    product.sku.toLowerCase() === clean ||
    (product.barcode?.toLowerCase() ?? "") === clean;
  // Estable: `sort` de V8 lo es, así que los no exactos conservan el orden por
  // nombre que trajo la consulta.
  return [...products].sort((left, right) => Number(exact(right)) - Number(exact(left)));
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
  /**
   * Patch POS7.0-A — **navegar el catálogo, no solo buscarlo.**
   *
   * Un mostrador de repuestos vende muchas veces al día artículos cuyo SKU el
   * cajero no se sabe: pide «pastillas» y hay que enseñárselas. Sin esto la
   * pantalla solo respondía a una búsqueda exacta y quien no supiera qué teclear
   * se quedaba sin nada que mirar.
   *
   * **No es un filtro nuevo del dominio**: `PosProductFilters.categoryId` existe
   * desde POS1.1-A y ya lo usan el catálogo administrativo y su conteo. Lo único
   * que faltaba era que el mostrador pudiera pedirlo.
   */
  categoryId?: string;
  /**
   * Patch POS4.0 — de qué bodega se quiere conocer el saldo.
   *
   * Opcional: sin ella la búsqueda es la de siempre. **No abre una puerta a otra
   * sucursal**: el saldo se pide con la bodega *y* el `branchCode` de la sesión,
   * y `listPosInventory` ya exige que la bodega pertenezca a esa sucursal, así
   * que una bodega ajena simplemente no devuelve filas.
   */
  warehouseId?: string;
}): Promise<
  | {
      ok: true;
      products: PosProductDTO[];
      /**
       * Saldo por artículo en la bodega pedida.
       *
       * **La ausencia de clave no es cero.** «Sin saldo abierto» y «saldo cero»
       * son estados operativos distintos: el primero impide el cobro —el motor
       * de inventario exige saldo abierto— y el segundo no. Colapsarlos en un
       * `0` le escondería al cajero la única de las dos que va a fallar.
       */
      balances: Record<string, number>;
    }
  | { ok: false; error: string }
> {
  const auth = await authorizePosLookup();
  if (!auth.ok) return auth;
  // Inactive articles are excluded: the till may not sell a retired product, and
  // `checkoutPosSaleAction` revalidates it inside the transaction anyway.
  const products = orderPosSearchHits(
    await searchPosProducts(input.term, {
      includeInactive: false,
      // Cadena vacía es «sin filtro», no «categoría sin nombre»: el navegador
      // manda `""` cuando el cajero vuelve a «Todos».
      categoryId: input.categoryId?.trim() || undefined,
    }),
    input.term,
  );

  // `branchCode` solo lo trae la sesión de mostrador. La administrativa puede
  // buscar en el catálogo, pero no tiene sucursal contra la que acotar un saldo,
  // así que no recibe ninguno.
  // El estrechamiento por `in` sobre la unión de las dos autorizaciones no
  // conserva el tipo del campo, así que se comprueba y se anota.
  const branchCode: string | undefined =
    "branchCode" in auth && typeof auth.branchCode === "string"
      ? auth.branchCode
      : undefined;
  if (!input.warehouseId || !branchCode || products.length === 0) {
    return { ok: true, products, balances: {} };
  }

  const rows = await listPosInventory({
    warehouseId: input.warehouseId,
    branchCode,
    productIds: products.map((product) => product.id),
  });
  return {
    ok: true,
    products,
    balances: Object.fromEntries(rows.map((row) => [row.productId, row.quantity])),
  };
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
  const auth = await authorizePosCatalogue();
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

// --- Compras (POS1.2-A) ---------------------------------------------------

/**
 * Patch POS1.2-A — órdenes de compra.
 *
 * ## Qué es y qué no es
 *
 * **Una orden de compra es solo una intención de comprar.** No mueve
 * existencias, no contabiliza, no genera caja ni cuenta por pagar, y no registra
 * factura. Representa el acuerdo comercial; la recepción es un parche posterior.
 *
 * ## Autorización
 *
 * **[R] Reutiliza `canManageInventory` (ADMIN o GERENTE)**, el predicado que ya
 * responde "quién administra existencias" en este repositorio. Comprar es traer
 * existencias, así que es el mismo permiso. Inventar uno propio obligaría a
 * concederlo en algún sitio y a mantener dos respuestas para una pregunta.
 *
 * **[R] Un rol no global solo opera su sucursal**, comprobado con
 * `canAccessBranch`, que es como el resto del repositorio lo resuelve.
 *
 * **[D] Aprobar usa el mismo permiso que crear.** Si aprobar debe exigir un
 * supervisor distinto de quien redacta, es una decisión de control interno que
 * nadie ha tomado. Ver P-16.
 */
const PURCHASE_NO_PERMISSION =
  "No tienes permiso para administrar órdenes de compra.";
const PURCHASE_ONLY_DRAFT =
  "Solo puedes modificar una orden de compra en borrador.";
const PURCHASE_NOT_FOUND = "La orden de compra no existe.";
const PURCHASE_NO_ITEMS = "La orden de compra necesita al menos una línea.";

/**
 * Patch POS1.2-E — escribe un evento en la bitácora de la orden.
 *
 * **Siempre dentro de la transacción del llamador**, y siempre **después** de que
 * la operación haya tenido éxito. Las dos cosas importan:
 *
 * - Dentro de la transacción, para que un fallo posterior se lleve el evento: una
 *   bitácora que registra lo que no ocurrió es peor que no tener bitácora.
 * - Después de la guarda —del `updateMany` con `count === 1`, del bloqueo de la
 *   cabecera—, para que **una transición que pierde una carrera no deje rastro**.
 *   Escribir el evento antes de la guarda produciría dos «Aprobada» para una sola
 *   aprobación.
 */
async function recordPurchaseEvent(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    type: Prisma.PosPurchaseOrderEventCreateInput["type"];
    actorId: string;
    productId?: string;
    quantity?: number;
    reason?: string | null;
  },
): Promise<void> {
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

/**
 * Patch POS1.2-E — cuánto puede durar una transacción del ciclo de compra.
 *
 * **El valor por defecto de Prisma son 5 000 ms, y para estas operaciones es
 * demasiado justo.** Una recepción de diez líneas hace del orden de sesenta
 * consultas dentro de la transacción —bloqueo de la cabecera, lectura de las
 * líneas, y por cada línea: dos lecturas del motor, el bloqueo del saldo, el
 * movimiento, la actualización del saldo, la de la línea y su evento—. A 80 ms
 * por consulta, que es lo que cuesta un servidor cargado, eso ya son 4,8 s.
 *
 * **El límite estaba al borde antes de este parche**; añadir la bitácora lo hizo
 * visible: la anulación empezó a fallar con `P2028` a los 5,3 s.
 *
 * **[R] 20 s, no «mucho».** Un techo alto sobre transacciones que sostienen
 * `FOR UPDATE` significa que una atascada bloquea a las demás más tiempo. Veinte
 * segundos dan margen de sobra al caso legítimo más pesado y siguen cortando una
 * transacción que de verdad se quedó colgada.
 *
 * **`maxWait` no se toca.** Es otro problema —esperar conexión del pool, no
 * ejecutar— y subirlo solo alargaría la espera ante un pool saturado. Ver P-31.
 */
const PURCHASE_TX = { timeout: 20_000 } as const;

/** Aborta una operación de compra con un mensaje destinado a quien la hace. */
class PosPurchaseError extends Error {}

async function authorizePurchasing() {
  if (!isDatabaseConfigured()) {
    return { ok: false as const, error: NO_DB };
  }
  const session = await requireAuth();
  if (!canManageInventory(session.roleEnum)) {
    return { ok: false as const, error: PURCHASE_NO_PERMISSION };
  }
  return {
    ok: true as const,
    userId: session.uid,
    role: session.roleEnum,
    branchId: session.branchId,
  };
}

/**
 * Numeración propia del contexto, como `generateSaleNumber`.
 *
 * **[D] No usa `allocateDocumentNumber`** de Contabilidad: esa función falla
 * cerrado si no hay una `DocumentSequence` configurada para la sucursal y el
 * año, y su clave es `FinancialDocumentSeries`, cuyos siete valores son de Caja
 * y Contabilidad. Una orden de compra no tiene efecto contable. Ver P-21.
 */
function generatePurchaseOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `OC-${date}-${suffix}`;
}

type PurchaseLineInput = {
  productId: string;
  quantity: number;
  unitCost: number;
  discount?: number;
  tax?: number;
  notes?: string | null;
};

type SanitizedPurchaseLine = {
  productId: string;
  quantity: number;
  unitCost: number;
  discount: number;
  tax: number;
  notes: string | null;
};

/**
 * Sanea las líneas **fuera de la transacción**: lo que no es de fiar no debe
 * llegar a tener filas escribiéndose por él.
 *
 * **No se añadió aritmética.** `sanitizePosQuantity` y `sanitizePosMoney` ya
 * existían y significan exactamente lo que una línea de compra necesita.
 */
function sanitizePurchaseLines(
  lines: PurchaseLineInput[],
): { ok: true; lines: SanitizedPurchaseLine[] } | { ok: false; error: string } {
  const clean: SanitizedPurchaseLine[] = [];
  for (const line of lines) {
    const quantity = sanitizePosQuantity(line.quantity);
    if (quantity === null) return { ok: false, error: INVALID_QUANTITY };
    const unitCost = sanitizePosMoney(line.unitCost);
    const discount = sanitizePosMoney(line.discount ?? 0);
    const tax = sanitizePosMoney(line.tax ?? 0);
    if (unitCost === null || discount === null || tax === null) {
      return { ok: false, error: INVALID_MONEY };
    }
    clean.push({
      productId: line.productId,
      quantity,
      unitCost,
      discount,
      tax,
      notes: sanitizePosText(line.notes),
    });
  }
  return { ok: true, lines: clean };
}

/**
 * Verifica que los productos existan y estén activos, **dentro** de la
 * transacción del llamador.
 */
async function assertPurchaseProducts(
  tx: Prisma.TransactionClient,
  lines: SanitizedPurchaseLine[],
): Promise<void> {
  const products = await tx.posProduct.findMany({
    where: { id: { in: lines.map((line) => line.productId) } },
    select: { id: true, isActive: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) throw new PosPurchaseError("El producto no existe.");
    if (!product.isActive) {
      throw new PosPurchaseError("El producto está inactivo.");
    }
  }
}

/**
 * Traduce las líneas a filas y calcula los totales.
 *
 * **[R] La aritmética se reutiliza tal cual.** `calculatePosLineTotal` y
 * `calculatePosSaleTotals` ya expresan `cantidad × precio − descuento +
 * impuesto`, que es la misma fórmula compre uno o venda: el nombre dice "sale"
 * porque nacieron en la venta, no porque la operación sea distinta. Duplicarlas
 * con otro nombre sería la duplicación que TD-01 pasó un parche entero
 * eliminando.
 */
function buildPurchaseTotals(lines: SanitizedPurchaseLine[]) {
  const forArithmetic = lines.map((line) => ({
    quantity: line.quantity,
    unitPrice: line.unitCost,
    discount: line.discount,
    tax: line.tax,
  }));
  return {
    totals: calculatePosSaleTotals(forArithmetic),
    rows: lines.map((line, position) => ({
      productId: line.productId,
      quantity: toQuantity(line.quantity),
      unitCost: toDecimal(line.unitCost),
      discount: toDecimal(line.discount),
      tax: toDecimal(line.tax),
      total: toDecimal(
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

/**
 * Crea una orden de compra con sus líneas y sus totales **en una transacción**.
 *
 * No hay líneas huérfanas ni orden huérfana: o está todo o no está nada.
 *
 * **Los totales se derivan, nunca se aceptan.** La entrada no tiene campo de
 * total, igual que el cobro: no hay cifra que un cliente manipulado pueda
 * imponer, porque no existe donde ponerla.
 */
export async function createPosPurchaseOrderAction(input: {
  branchCode: string;
  supplierId: string;
  expectedAt?: string | null;
  notes?: string | null;
  lines: PurchaseLineInput[];
}): Promise<
  { ok: true; orderId: string; orderNumber: string } | { ok: false; error: string }
> {
  const auth = await authorizePurchasing();
  if (!auth.ok) return auth;

  if (!input.lines.length) return { ok: false, error: PURCHASE_NO_ITEMS };
  const sanitized = sanitizePurchaseLines(input.lines);
  if (!sanitized.ok) return sanitized;

  if (!canAccessBranch(auth.role, auth.branchId, input.branchCode)) {
    return { ok: false, error: "No puedes comprar para esa sucursal." };
  }

  const branch = await getPrisma().branch.findUnique({
    where: { code: input.branchCode },
    select: { id: true },
  });
  if (!branch) return { ok: false, error: "La sucursal no existe." };

  const expectedAt = input.expectedAt ? new Date(input.expectedAt) : null;
  if (expectedAt && Number.isNaN(expectedAt.getTime())) {
    return { ok: false, error: "La fecha esperada no es válida." };
  }

  try {
    const order = await getPrisma().$transaction(async (tx) => {
      // El proveedor se verifica dentro: lo leído antes de abrir la transacción
      // puede haber cambiado.
      const supplier = await tx.thirdParty.findUnique({
        where: { id: input.supplierId },
        select: { id: true, type: true, isActive: true },
      });
      if (!supplier) throw new PosPurchaseError("El proveedor no existe.");
      if (supplier.type !== "PROVEEDOR") {
        throw new PosPurchaseError("El tercero seleccionado no es un proveedor.");
      }
      if (!supplier.isActive) {
        throw new PosPurchaseError("El proveedor está inactivo.");
      }

      await assertPurchaseProducts(tx, sanitized.lines);
      const { totals, rows } = buildPurchaseTotals(sanitized.lines);

      const created = await tx.posPurchaseOrder.create({
        data: {
          orderNumber: generatePurchaseOrderNumber(),
          branchId: branch.id,
          supplierId: supplier.id,
          status: "BORRADOR",
          subtotal: toDecimal(totals.subtotal),
          discount: toDecimal(totals.discount),
          tax: toDecimal(totals.tax),
          total: toDecimal(totals.total),
          expectedAt,
          notes: sanitizePosText(input.notes),
          createdByUserId: auth.userId,
          items: { create: rows },
        },
        select: { id: true, orderNumber: true },
      });

      // Patch POS1.2-E. Misma transacción: si la creación se deshace, su evento
      // también.
      await recordPurchaseEvent(tx, {
        orderId: created.id,
        type: "CREADA",
        actorId: auth.userId,
      });

      return created;
    }, PURCHASE_TX);
    revalidatePos();
    return { ok: true, orderId: order.id, orderNumber: order.orderNumber };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof PosPurchaseError
          ? error.message
          : "No se pudo registrar la orden de compra.",
    };
  }
}

/**
 * Reemplaza las líneas y los datos de una orden **en borrador**.
 *
 * **Solo un borrador es editable.** Aprobada, recibida —total o parcialmente— y
 * anulada están congeladas, incluido el proveedor y las cantidades. El estado se
 * vuelve a comprobar en el `WHERE` de la escritura, así que una aprobación
 * concurrente no puede colarse entre la lectura y la edición.
 *
 * Las líneas se **reemplazan**, no se parchean: una orden en borrador es un
 * documento en redacción, y reemplazar evita inventar una semántica de fusión
 * que nadie ha pedido.
 */
export async function updatePosPurchaseOrderAction(input: {
  orderId: string;
  supplierId?: string;
  expectedAt?: string | null;
  notes?: string | null;
  lines?: PurchaseLineInput[];
}): Promise<PosActionResult> {
  const auth = await authorizePurchasing();
  if (!auth.ok) return auth;

  let sanitizedLines: SanitizedPurchaseLine[] | undefined;
  if (input.lines !== undefined) {
    if (!input.lines.length) return { ok: false, error: PURCHASE_NO_ITEMS };
    const sanitized = sanitizePurchaseLines(input.lines);
    if (!sanitized.ok) return sanitized;
    sanitizedLines = sanitized.lines;
  }

  let expectedAt: Date | null | undefined;
  if (input.expectedAt !== undefined) {
    expectedAt = input.expectedAt ? new Date(input.expectedAt) : null;
    if (expectedAt && Number.isNaN(expectedAt.getTime())) {
      return { ok: false, error: "La fecha esperada no es válida." };
    }
  }

  try {
    await getPrisma().$transaction(async (tx) => {
      const order = await tx.posPurchaseOrder.findUnique({
        where: { id: input.orderId },
        select: {
          id: true,
          status: true,
          branch: { select: { code: true } },
          items: { select: { receivedQuantity: true, returnedQuantity: true } },
        },
      });
      if (!order) throw new PosPurchaseError(PURCHASE_NOT_FOUND);
      if (order.status !== "BORRADOR") {
        throw new PosPurchaseError(PURCHASE_ONLY_DRAFT);
      }
      if (!canAccessBranch(auth.role, auth.branchId, order.branch.code)) {
        throw new PosPurchaseError("No puedes modificar órdenes de esa sucursal.");
      }
      // Patch POS1.2-F — **defensa en profundidad, igual que la anulación.**
      //
      // El estado ya lo implica: recibir exige `APROBADA` o `RECIBIDA_PARCIAL`,
      // así que un borrador no puede tener mercancía. Pero editar **reemplaza
      // las líneas**, y si un flujo futuro dejara un borrador con recibido > 0,
      // este `deleteMany` borraría ese registro en silencio y con él la prueba de
      // que la mercancía llegó.
      //
      // La anulación ya se protegía así; que la edición no lo hiciera era una
      // incoherencia dentro del propio módulo, no una decisión.
      if (
        order.items.some(
          (item) =>
            item.receivedQuantity.greaterThan(0) ||
            item.returnedQuantity.greaterThan(0),
        )
      ) {
        throw new PosPurchaseError(
          "No puedes modificar una orden que ya movió mercancía.",
        );
      }

      let supplierId: string | undefined;
      if (input.supplierId !== undefined) {
        const supplier = await tx.thirdParty.findUnique({
          where: { id: input.supplierId },
          select: { id: true, type: true, isActive: true },
        });
        if (!supplier) throw new PosPurchaseError("El proveedor no existe.");
        if (supplier.type !== "PROVEEDOR") {
          throw new PosPurchaseError("El tercero seleccionado no es un proveedor.");
        }
        if (!supplier.isActive) {
          throw new PosPurchaseError("El proveedor está inactivo.");
        }
        supplierId = supplier.id;
      }

      let totalsData = {};
      if (sanitizedLines) {
        await assertPurchaseProducts(tx, sanitizedLines);
        const { totals, rows } = buildPurchaseTotals(sanitizedLines);
        await tx.posPurchaseOrderItem.deleteMany({
          where: { orderId: order.id },
        });
        await tx.posPurchaseOrderItem.createMany({
          data: rows.map((row) => ({ ...row, orderId: order.id })),
        });
        totalsData = {
          subtotal: toDecimal(totals.subtotal),
          discount: toDecimal(totals.discount),
          tax: toDecimal(totals.tax),
          total: toDecimal(totals.total),
        };
      }

      // El estado vuelve al `WHERE`: si otra transacción aprobó la orden entre
      // la lectura y esta escritura, `updateMany` afecta cero filas y se aborta.
      const guarded = await tx.posPurchaseOrder.updateMany({
        where: { id: order.id, status: "BORRADOR" },
        data: {
          supplierId,
          expectedAt,
          notes:
            input.notes === undefined ? undefined : sanitizePosText(input.notes),
          ...totalsData,
        },
      });
      if (guarded.count !== 1) throw new PosPurchaseError(PURCHASE_ONLY_DRAFT);
    }, PURCHASE_TX);
    revalidatePos();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof PosPurchaseError
          ? error.message
          : "No se pudo modificar la orden de compra.",
    };
  }
}

/**
 * BORRADOR → APROBADA.
 *
 * **Exige al menos una línea**, la misma regla que Caja aplica a una factura
 * antes de emitirla y el POS a una venta antes de completarla.
 *
 * Transición guardada: el estado se re-comprueba en el `WHERE`, así que dos
 * aprobaciones concurrentes no pueden ganar las dos.
 *
 * **[D] Usa el mismo permiso que crear.** Ver P-16.
 */
export async function approvePosPurchaseOrderAction(input: {
  orderId: string;
}): Promise<PosActionResult> {
  const auth = await authorizePurchasing();
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const order = await tx.posPurchaseOrder.findUnique({
      where: { id: input.orderId },
      include: {
        _count: { select: { items: true } },
        branch: { select: { code: true } },
      },
    });
    if (!order) return { ok: false as const, error: PURCHASE_NOT_FOUND };
    if (order.status !== "BORRADOR") {
      return { ok: false as const, error: PURCHASE_ONLY_DRAFT };
    }
    if (!canAccessBranch(auth.role, auth.branchId, order.branch.code)) {
      return {
        ok: false as const,
        error: "No puedes aprobar órdenes de esa sucursal.",
      };
    }
    if (!order._count.items) {
      return { ok: false as const, error: PURCHASE_NO_ITEMS };
    }

    const guarded = await tx.posPurchaseOrder.updateMany({
      where: { id: order.id, status: "BORRADOR" },
      data: {
        status: "APROBADA",
        approvedById: auth.userId,
        approvedAt: new Date(),
      },
    });
    if (guarded.count !== 1) return { ok: false as const, error: PURCHASE_ONLY_DRAFT };

    // Patch POS1.2-E. **Después de la guarda**: la aprobación que pierde la
    // carrera afecta cero filas, sale por la rama de arriba y no deja evento.
    await recordPurchaseEvent(tx, {
      orderId: order.id,
      type: "APROBADA",
      actorId: auth.userId,
    });

    revalidatePos();
    return { ok: true as const };
  }, PURCHASE_TX);
}

/** Estados desde los que una orden puede anularse. */
const CANCELLABLE_PURCHASE_STATUSES = ["BORRADOR", "APROBADA"] as const;
const PURCHASE_NOT_CANCELLABLE =
  "Solo puedes anular una orden en borrador o aprobada.";

/**
 * Patch POS1.2-A, completado en POS1.2-C — **BORRADOR o APROBADA → ANULADA**.
 *
 * ## Anular solo cambia el estado del documento
 *
 * **No mueve inventario, no contabiliza, no genera caja y no crea deuda con el
 * proveedor.** Tampoco restaura existencias: ningún flujo del repositorio
 * revierte un movimiento de inventario, y `DEVOLUCION` sigue siendo un valor del
 * enum que nada alcanza. Anular una orden de la que ya llegó mercancía dejaría
 * esa mercancía sin documento que la explique, y por eso no se permite.
 *
 * ## Qué estados admiten anulación, y por qué
 *
 * **[R] `BORRADOR`**: nada ha ocurrido.
 *
 * **[R] `APROBADA`, solo si no ha llegado nada.** La comprobación es explícita
 * aunque el estado ya lo implique —un recibo mueve la orden a
 * `RECIBIDA_PARCIAL`— porque **la regla no debe depender de que la derivación
 * del estado sea correcta**: si un flujo futuro dejara una orden en `APROBADA`
 * con líneas recibidas, esta comprobación seguiría protegiendo. Defensa en
 * profundidad, no redundancia.
 *
 * **[D] `RECIBIDA_PARCIAL` se rechaza, y eso NO es una decisión.** Es preservar
 * lo que POS1.2-A ya hacía. Si el negocio quiere poder cerrar una orden a medio
 * recibir —dando por perdido lo que falta y dejando lo recibido— es **P-27**, y
 * responderla exige decidir antes qué pasa con lo ya recibido.
 *
 * **[R] `RECIBIDA` y `ANULADA` son terminales.**
 *
 * ## El motivo es obligatorio
 *
 * **[R] Siguiendo a Caja**, cuyo `cancelCashDocumentAction` exige el motivo con
 * el mensaje "Indica el motivo de la anulación interna". No es una regla
 * inventada aquí: el repositorio ya decidió que una anulación sin motivo
 * declarado no se registra. POS1.2-A lo había dejado opcional.
 *
 * **Se guarda en `cancelledReason`, columna propia.** POS1.2-A lo anexaba a
 * `notes`, que es del usuario: mutarlo destruía lo que hubiera escrito.
 *
 * ## Concurrencia
 *
 * **Transición guardada, exactamente como la aprobación**: el estado se
 * re-comprueba en el `WHERE` del `updateMany` y se exige `count === 1`. Dos
 * anulaciones simultáneas: la primera pasa el filtro, la segunda encuentra
 * `ANULADA` y afecta cero filas.
 *
 * **[R] No hace falta `FOR UPDATE`** aquí, a diferencia de la recepción. La
 * recepción lo necesita porque decide a partir de las **cantidades de las
 * líneas**, que el `WHERE` del `updateMany` no puede filtrar; anular decide a
 * partir del **estado**, que sí está en el `WHERE`. Añadir un bloqueo que la
 * guarda ya cubre sería ceremonia.
 */
export async function cancelPosPurchaseOrderAction(input: {
  orderId: string;
  reason: string;
}): Promise<PosActionResult> {
  const auth = await authorizePurchasing();
  if (!auth.ok) return auth;

  const reason = sanitizePosText(input.reason, 500);
  if (!reason) {
    return { ok: false, error: "Indica el motivo de la anulación." };
  }

  return getPrisma().$transaction(async (tx) => {
    const order = await tx.posPurchaseOrder.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        status: true,
        branch: { select: { code: true } },
        items: { select: { receivedQuantity: true } },
      },
    });
    if (!order) return { ok: false as const, error: PURCHASE_NOT_FOUND };
    if (
      order.status !== "BORRADOR" &&
      order.status !== "APROBADA"
    ) {
      return { ok: false as const, error: PURCHASE_NOT_CANCELLABLE };
    }
    if (!canAccessBranch(auth.role, auth.branchId, order.branch.code)) {
      return {
        ok: false as const,
        error: "No puedes anular órdenes de esa sucursal.",
      };
    }
    // Defensa en profundidad: la regla no depende de que el estado esté bien
    // derivado. Ver el comentario del encabezado.
    if (order.items.some((item) => item.receivedQuantity.greaterThan(0))) {
      return {
        ok: false as const,
        error: "No puedes anular una orden que ya recibió mercancía.",
      };
    }

    const guarded = await tx.posPurchaseOrder.updateMany({
      where: { id: order.id, status: { in: [...CANCELLABLE_PURCHASE_STATUSES] } },
      data: {
        status: "ANULADA",
        cancelledById: auth.userId,
        cancelledAt: new Date(),
        cancelledReason: reason,
      },
    });
    if (guarded.count !== 1) {
      return { ok: false as const, error: PURCHASE_NOT_CANCELLABLE };
    }

    // Patch POS1.2-E. Después de la guarda, por la misma razón que la
    // aprobación. El motivo viaja al evento y a la columna: la columna la lee la
    // pantalla de la orden, el evento la línea de tiempo.
    await recordPurchaseEvent(tx, {
      orderId: order.id,
      type: "ANULADA",
      actorId: auth.userId,
      reason,
    });

    revalidatePos();
    return { ok: true as const };
  }, PURCHASE_TX);
}

/**
 * Patch POS1.2-B — **recibir una orden de compra en inventario**.
 *
 * ## Es su propio flujo
 *
 * Una recepción **no** es un ajuste, **no** es un ingreso manual y **no** es una
 * venta: pertenece al ciclo de vida de la orden. Lo que la distingue no es cómo
 * mueve existencias —eso lo hace el mismo motor que los otros tres— sino que
 * además avanza un documento: actualiza lo recibido por línea y recalcula el
 * estado de la orden. Esas dos cosas y el movimiento viven en **una sola
 * transacción**.
 *
 * **Nunca inventario sin orden, nunca orden sin inventario.**
 *
 * ## Por qué se bloquea también la orden, y no solo el saldo
 *
 * **Bloquear el inventario no basta**, y el smoke lo demuestra quitando este
 * bloqueo. Dos recepciones simultáneas de la misma línea leen ambas
 * `recibido = 0` de una orden de 100, calculan ambas que caben 60 y pasan las dos
 * la validación. Después se serializan sobre el saldo —el `FOR UPDATE` del motor
 * funciona— pero cada una escribe `0 + 60 = 60` en la línea: una **actualización
 * perdida**. El resultado es peor que recibir de más:
 *
 * - el inventario sube **120**, con su bitácora cuadrando;
 * - la orden dice **60 recibidos y 40 pendientes**.
 *
 * **La bitácora y el documento se descuadran entre sí**, y esos 40 "pendientes"
 * fantasma permitirían recibir hasta 160 unidades de una orden de 100.
 *
 * El dato que hay que proteger es **lo pendiente**, y ese vive en la orden. Por
 * eso se bloquea la cabecera con `FOR UPDATE` **antes de leer las líneas**: la
 * segunda recepción espera al COMMIT de la primera y lee 100 recibidos, no 40.
 *
 * **Orden de bloqueos: primero la orden, después los saldos** (estos ordenados
 * por producto). Una secuencia global fija es lo que impide que dos recepciones
 * concurrentes se interbloqueen.
 *
 * ## El estado se deriva, no se declara
 *
 * Tras aplicar lo recibido se releen las líneas y el estado sale de ellas: todas
 * completas → `RECIBIDA`; alguna con algo recibido → `RECIBIDA_PARCIAL`. **Es la
 * única implementación que no puede mentir**: un estado declarado por el
 * llamador podría decir "recibida" con líneas pendientes.
 *
 * **[I] Una orden recibida entera de una sola vez pasa de `APROBADA` a
 * `RECIBIDA` directamente.** El encargo dibujó `APROBADA → RECIBIDA_PARCIAL →
 * RECIBIDA`; marcar como parcial una entrega que llegó completa sería escribir
 * un hecho falso. Se leyó "sin atajos" como "no se puede saltar a `RECIBIDA`
 * mientras quede algo pendiente", que es lo que el código garantiza.
 */
export async function receivePosPurchaseOrderAction(input: {
  orderId: string;
  warehouseId: string;
  lines: Array<{ itemId: string; quantity: number }>;
  notes?: string | null;
}): Promise<
  | {
      ok: true;
      status: string;
      received: Array<{ itemId: string; receivedQuantity: number; pending: number }>;
    }
  | { ok: false; error: string }
> {
  const auth = await authorizePurchasing();
  if (!auth.ok) return auth;

  if (!input.lines.length) {
    return { ok: false, error: "La recepción necesita al menos una línea." };
  }

  // Saneado fuera de la transacción. `sanitizePosQuantity` ya significa
  // "estrictamente positiva, tres decimales": cero y negativo se rechazan sin
  // añadir un saneador nuevo.
  const requested: Array<{ itemId: string; quantity: number }> = [];
  for (const line of input.lines) {
    const quantity = sanitizePosQuantity(line.quantity);
    if (quantity === null) {
      return {
        ok: false,
        error: "La cantidad recibida debe ser mayor que cero.",
      };
    }
    requested.push({ itemId: line.itemId, quantity });
  }
  if (new Set(requested.map((line) => line.itemId)).size !== requested.length) {
    return { ok: false, error: "Una línea no puede recibirse dos veces a la vez." };
  }
  const notes = sanitizePosText(input.notes);

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      // 1. Bloquear la cabecera. Antes de leer nada: lo que protege es lo
      //    pendiente, y lo pendiente se calcula desde estas líneas.
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "pos_purchase_orders" WHERE "id" = ${input.orderId} FOR UPDATE`,
      );
      const order = await tx.posPurchaseOrder.findUnique({
        where: { id: input.orderId },
        include: {
          items: true,
          branch: { select: { id: true, code: true } },
          supplier: { select: { isActive: true } },
        },
      });
      if (!order) throw new PosPurchaseError(PURCHASE_NOT_FOUND);

      if (order.status === "ANULADA") {
        throw new PosPurchaseError("Una orden anulada no puede recibirse.");
      }
      if (order.status === "BORRADOR") {
        throw new PosPurchaseError("Una orden en borrador todavía no puede recibirse.");
      }
      if (order.status === "RECIBIDA") {
        throw new PosPurchaseError("Esta orden ya se recibió por completo.");
      }
      if (!canAccessBranch(auth.role, auth.branchId, order.branch.code)) {
        throw new PosPurchaseError("No puedes recibir órdenes de esa sucursal.");
      }
      if (!order.supplier.isActive) {
        throw new PosPurchaseError("El proveedor está inactivo.");
      }

      await assertWarehouseBelongsToBranch(
        tx,
        input.warehouseId,
        order.branch.id,
        "La bodega no pertenece a la sucursal de la orden.",
        (message) => new PosPurchaseError(message),
      );

      // 2. Validar contra lo que **de verdad** queda pendiente, ya bajo bloqueo.
      const itemsById = new Map(order.items.map((item) => [item.id, item]));
      const plan: Array<{
        item: (typeof order.items)[number];
        quantity: number;
      }> = [];
      for (const line of requested) {
        const item = itemsById.get(line.itemId);
        if (!item) {
          throw new PosPurchaseError("La línea no pertenece a esta orden.");
        }
        const pending = item.quantity.sub(item.receivedQuantity);
        if (pending.lessThanOrEqualTo(0)) {
          throw new PosPurchaseError("Esa línea ya se recibió por completo.");
        }
        if (new Prisma.Decimal(line.quantity.toFixed(3)).greaterThan(pending)) {
          throw new PosPurchaseError(
            `No puedes recibir más de lo pendiente: quedan ${pending.toString()}.`,
          );
        }
        plan.push({ item, quantity: line.quantity });
      }

      // 3. Mover existencias por el **mismo motor** que ingresos, ajustes y
      //    ventas. La recepción solo aporta tipo, cantidad y motivo.
      //
      //    Ordenado por producto: secuencia fija de bloqueos entre recepciones
      //    concurrentes, igual que en el cobro.
      const ordered = [...plan].sort((left, right) =>
        left.item.productId.localeCompare(right.item.productId),
      );
      for (const line of ordered) {
        await applyPosInventoryMovement(tx, {
          warehouseId: input.warehouseId,
          productId: line.item.productId,
          quantity: line.quantity,
          type: "COMPRA",
          reason: `Recepción de orden ${order.orderNumber}`,
          notes,
          userId: auth.userId,
        });
        await tx.posPurchaseOrderItem.update({
          where: { id: line.item.id },
          data: {
            receivedQuantity: line.item.receivedQuantity.add(
              new Prisma.Decimal(line.quantity.toFixed(3)),
            ),
          },
        });
      }

      // 4. El estado sale de las líneas, no de quien llama.
      const after = await tx.posPurchaseOrderItem.findMany({
        where: { orderId: order.id },
        select: { id: true, quantity: true, receivedQuantity: true },
      });
      const complete = after.every((item) =>
        item.receivedQuantity.greaterThanOrEqualTo(item.quantity),
      );
      const started = after.some((item) => item.receivedQuantity.greaterThan(0));
      const nextStatus = complete
        ? "RECIBIDA"
        : started
          ? "RECIBIDA_PARCIAL"
          : order.status;

      const guarded = await tx.posPurchaseOrder.updateMany({
        where: { id: order.id, status: { in: ["APROBADA", "RECIBIDA_PARCIAL"] } },
        data: { status: nextStatus },
      });
      if (guarded.count !== 1) {
        throw new PosPurchaseError("La orden cambió de estado durante la recepción.");
      }

      // Patch POS1.2-E. **Un evento por línea**, porque una recepción de 10
      // cascos y 2,5 litros no tiene un total con sentido. Todos comparten el
      // tipo de la operación: si **esta** recepción cerró la orden es un hecho
      // del momento que una devolución posterior volvería irrecuperable.
      const receiptType = complete ? "RECEPCION_TOTAL" : "RECEPCION_PARCIAL";
      for (const line of ordered) {
        await recordPurchaseEvent(tx, {
          orderId: order.id,
          type: receiptType,
          actorId: auth.userId,
          productId: line.item.productId,
          quantity: line.quantity,
          reason: notes,
        });
      }

      return {
        status: nextStatus,
        received: after.map((item) => ({
          itemId: item.id,
          receivedQuantity: item.receivedQuantity.toNumber(),
          pending: item.quantity.sub(item.receivedQuantity).toNumber(),
        })),
      };
    }, PURCHASE_TX);

    revalidatePos();
    return { ok: true, ...result };
  } catch (error) {
    // Nada quedó escrito: movimiento, saldo, línea y estado comparten
    // transacción.
    return {
      ok: false,
      error:
        error instanceof PosPurchaseError || error instanceof PosInventoryError
          ? error.message
          : "No se pudo registrar la recepción.",
    };
  }
}

/**
 * Patch POS1.2-D — **devolver mercancía al proveedor**.
 *
 * **El primer flujo del repositorio que revierte existencias después de
 * recibirlas.** Hasta aquí nada deshacía un movimiento de inventario, y
 * `DEVOLUCION` llevaba cuatro parches declarada en el enum sin que nada la
 * alcanzara.
 *
 * ## Qué hace y qué no
 *
 * Consume inventario y avanza el documento. **No crea nota de crédito, no
 * contabiliza, no ajusta cuentas por pagar, no genera pago, no costea y no
 * emite documento financiero.** Una devolución dice "esto salió de la bodega y
 * la orden lo registra"; qué se hace con el dinero es otro parche.
 *
 * ## Es el quinto llamador del mismo motor
 *
 * `applyPosInventoryMovement` no cambió ni una línea. La devolución aporta lo
 * suyo: **cantidad negada** —devolver consume— y **tipo `DEVOLUCION`**. La
 * cantidad se sanea con `sanitizePosQuantity`, que ya significa "estrictamente
 * positiva, tres decimales", y el signo lo pone el llamador.
 *
 * ## Por qué también se bloquea la orden
 *
 * **Igual que la recepción, y por la misma razón exacta.** Lo que hay que
 * proteger es cuánto queda devolvible, y ese dato vive en la orden, no en el
 * saldo. Dos devoluciones simultáneas de la misma línea leerían ambas
 * `devuelto = 0`, ambas creerían que cabe todo lo recibido, y ambas escribirían
 * el mismo valor: el inventario bajaría el doble mientras el documento registra
 * una sola devolución. El `FOR UPDATE` del motor serializa el **saldo**, no la
 * **línea**.
 *
 * Orden de bloqueos: primero la orden, después los saldos ordenados por
 * producto. La misma secuencia global que el cobro y la recepción, que es lo que
 * impide que se formen interbloqueos entre los tres.
 *
 * ## Lo que este parche no decide
 *
 * - **Lo pendiente no cambia.** `quantity - receivedQuantity` sigue siendo la
 *   fórmula de POS1.2-B. Si devolver reabre la línea es **P-28**.
 * - **El estado de la orden no cambia.** Devolver todo lo recibido de una orden
 *   `RECIBIDA` la deja `RECIBIDA`. Introducir una transición que nadie
 *   especificó —¿vuelve a `APROBADA`?, ¿a `RECIBIDA_PARCIAL`?— sería inventar la
 *   máquina de estados. **P-29**.
 * - **El saldo puede quedar negativo** si se devuelve algo ya vendido. Es la
 *   misma ausencia de **P-8**, no permisividad nueva.
 */
export async function returnPosPurchaseOrderAction(input: {
  orderId: string;
  warehouseId: string;
  lines: Array<{ itemId: string; quantity: number }>;
  reason: string;
  notes?: string | null;
}): Promise<
  | {
      ok: true;
      returned: Array<{ itemId: string; returnedQuantity: number; returnable: number }>;
    }
  | { ok: false; error: string }
> {
  const auth = await authorizePurchasing();
  if (!auth.ok) return auth;

  if (!input.lines.length) {
    return { ok: false, error: "La devolución necesita al menos una línea." };
  }

  // El motivo es obligatorio, como en la anulación (POS1.2-C) y en el
  // movimiento de inventario: mercancía que sale sin motivo declarado no se
  // registra.
  const reason = sanitizePosText(input.reason, 500);
  if (!reason) {
    return { ok: false, error: "Indica el motivo de la devolución." };
  }
  const notes = sanitizePosText(input.notes);

  const requested: Array<{ itemId: string; quantity: number }> = [];
  for (const line of input.lines) {
    const quantity = sanitizePosQuantity(line.quantity);
    if (quantity === null) {
      return {
        ok: false,
        error: "La cantidad devuelta debe ser mayor que cero.",
      };
    }
    requested.push({ itemId: line.itemId, quantity });
  }
  if (new Set(requested.map((line) => line.itemId)).size !== requested.length) {
    return { ok: false, error: "Una línea no puede devolverse dos veces a la vez." };
  }

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      // 1. Bloquear la cabecera antes de leer las líneas: lo que se protege es
      //    cuánto queda devolvible, y eso se calcula desde ellas.
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "pos_purchase_orders" WHERE "id" = ${input.orderId} FOR UPDATE`,
      );
      const order = await tx.posPurchaseOrder.findUnique({
        where: { id: input.orderId },
        include: {
          items: true,
          branch: { select: { id: true, code: true } },
          supplier: { select: { isActive: true } },
        },
      });
      if (!order) throw new PosPurchaseError(PURCHASE_NOT_FOUND);

      // Una orden anulada no tiene mercancía que devolver: la anulación solo es
      // posible mientras nada se recibió (POS1.2-C).
      if (order.status === "ANULADA") {
        throw new PosPurchaseError("Una orden anulada no tiene nada que devolver.");
      }
      if (order.status === "BORRADOR" || order.status === "APROBADA") {
        throw new PosPurchaseError("Esta orden todavía no ha recibido mercancía.");
      }
      if (!canAccessBranch(auth.role, auth.branchId, order.branch.code)) {
        throw new PosPurchaseError("No puedes devolver órdenes de esa sucursal.");
      }
      if (!order.supplier.isActive) {
        throw new PosPurchaseError("El proveedor está inactivo.");
      }

      await assertWarehouseBelongsToBranch(
        tx,
        input.warehouseId,
        order.branch.id,
        "La bodega no pertenece a la sucursal de la orden.",
        (message) => new PosPurchaseError(message),
      );

      // 2. Validar contra lo que **de verdad** queda devolvible, bajo bloqueo.
      const itemsById = new Map(order.items.map((item) => [item.id, item]));
      const plan: Array<{ item: (typeof order.items)[number]; quantity: number }> = [];
      for (const line of requested) {
        const item = itemsById.get(line.itemId);
        if (!item) {
          throw new PosPurchaseError("La línea no pertenece a esta orden.");
        }
        const returnable = item.receivedQuantity.sub(item.returnedQuantity);
        if (returnable.lessThanOrEqualTo(0)) {
          throw new PosPurchaseError("Esa línea ya se devolvió por completo.");
        }
        if (new Prisma.Decimal(line.quantity.toFixed(3)).greaterThan(returnable)) {
          throw new PosPurchaseError(
            `No puedes devolver más de lo recibido: quedan ${returnable.toString()}.`,
          );
        }
        plan.push({ item, quantity: line.quantity });
      }

      // 3. Mover existencias por el mismo motor. Ordenado por producto: la misma
      //    secuencia de bloqueos que el cobro y la recepción.
      const ordered = [...plan].sort((left, right) =>
        left.item.productId.localeCompare(right.item.productId),
      );
      for (const line of ordered) {
        await applyPosInventoryMovement(tx, {
          warehouseId: input.warehouseId,
          productId: line.item.productId,
          // Con signo: devolver saca mercancía de la bodega.
          quantity: -line.quantity,
          type: "DEVOLUCION",
          reason: `Devolución de orden ${order.orderNumber}: ${reason}`,
          notes,
          userId: auth.userId,
        });
        await tx.posPurchaseOrderItem.update({
          where: { id: line.item.id },
          data: {
            returnedQuantity: line.item.returnedQuantity.add(
              new Prisma.Decimal(line.quantity.toFixed(3)),
            ),
          },
        });
      }

      // Patch POS1.2-E. Un evento por línea, con el motivo de la devolución.
      for (const line of ordered) {
        await recordPurchaseEvent(tx, {
          orderId: order.id,
          type: "DEVOLUCION",
          actorId: auth.userId,
          productId: line.item.productId,
          quantity: line.quantity,
          reason,
        });
      }

      // 4. **El estado de la orden no se toca.** Ver P-29.
      const after = await tx.posPurchaseOrderItem.findMany({
        where: { orderId: order.id },
        select: { id: true, receivedQuantity: true, returnedQuantity: true },
      });

      return {
        returned: after.map((item) => ({
          itemId: item.id,
          returnedQuantity: item.returnedQuantity.toNumber(),
          returnable: item.receivedQuantity.sub(item.returnedQuantity).toNumber(),
        })),
      };
    }, PURCHASE_TX);

    revalidatePos();
    return { ok: true, ...result };
  } catch (error) {
    // Nada quedó escrito: movimiento, saldo y línea comparten transacción.
    return {
      ok: false,
      error:
        error instanceof PosPurchaseError || error instanceof PosInventoryError
          ? error.message
          : "No se pudo registrar la devolución.",
    };
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
  const auth = await authorizePosCatalogue();
  if (!auth.ok) return auth;

  // Patch INT5 — **la sucursal llegaba del navegador y nadie la autorizaba.**
  // `authorizePosCatalogue` solo comprobaba el permiso de mostrador, así que un
  // gerente de Granada podía crear una bodega en Masaya. Se aplica el mismo
  // `canAccessBranch` que ya usan compras, CRM y operaciones: un rol global pasa,
  // uno de sucursal solo sobre la suya.
  if (!canAccessBranch(auth.role, auth.branchId, input.branchCode)) {
    return { ok: false, error: WAREHOUSE_BRANCH_DENIED };
  }

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
  const auth = await authorizePosCatalogue();
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
    select: { id: true, branch: { select: { code: true } } },
  });
  if (!warehouse) return { ok: false, error: "La bodega no existe." };
  // Patch INT5 — editar y desactivar también son administrar. Sin esto, un id
  // ajeno bastaba para renombrar o apagar la bodega de otra sucursal.
  if (!canAccessBranch(auth.role, auth.branchId, warehouse.branch.code)) {
    return { ok: false, error: WAREHOUSE_BRANCH_DENIED };
  }

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

  const scope = await resolvePosSessionBranch(auth.branchCode);
  if (!scope.ok) return scope;

  const warehouse = await getPrisma().posWarehouse.findUnique({
    where: { id: input.warehouseId },
    select: { id: true, isActive: true, branchId: true },
  });
  if (!warehouse) return { ok: false, error: "La bodega no existe." };
  if (!warehouse.isActive) return { ok: false, error: "La bodega está inactiva." };
  // Patch POS5.0 — misma regla que ya aplicaban compras y cobro: una bodega de
  // otra sucursal no es alcanzable desde este mostrador.
  if (warehouse.branchId !== scope.branchId) {
    return { ok: false, error: WAREHOUSE_NOT_IN_BRANCH };
  }

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

/**
 * Patch D3 — bloquea el turno abierto de este operador en esta sucursal.
 *
 * **Mismo mecanismo que `lockPosInventory`, y por la misma razón.** Sin el
 * bloqueo, un cierre concurrente y un cobro en efectivo se pisan: el cierre
 * deriva sus totales, el cobro se registra un instante después, y ese efectivo
 * queda fuera del arqueo que ya se congeló.
 *
 * Con el bloqueo hay dos desenlaces y los dos son correctos:
 *
 * - **El cobro llega primero**: el cierre espera, y cuando pasa, deriva viendo
 *   la venta. El efectivo entra en el arqueo.
 * - **El cierre llega primero**: el cobro espera, y al pasar encuentra el turno
 *   `CERRADO`, así que se rechaza. No se puede meter efectivo en un cajón que
 *   acaba de cerrarse.
 *
 * No devuelve el turno: quien llama lo lee después con Prisma, igual que hace
 * `lockPosInventory`.
 */
async function lockPosCashShift(
  tx: Prisma.TransactionClient,
  branchId: string,
  operatorId: string,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "pos_cash_shifts" WHERE "branch_id" = ${branchId} AND "operator_id" = ${operatorId} AND "status" = 'ABIERTO' FOR UPDATE`,
  );
}

/**
 * Patch POS1.1-E, extraído en POS1.2-B — **la bodega debe ser de la sucursal de
 * la operación**.
 *
 * No es una regla inventada: `PosWarehouse.branchId` es obligatorio, todo lo que
 * tiene existencias en este repositorio está atado a una sucursal, y mover
 * existencias entre sucursales exige un traslado —que POS1.1-B excluyó a
 * propósito—. Sin la comprobación, una venta en Rosita descontaría de Granada en
 * silencio y descuadraría las dos.
 *
 * **Vive fuera del motor a propósito.** Un ingreso manual y un ajuste no tienen
 * sucursal propia contra la que comparar; una venta y una recepción sí, porque
 * su documento la lleva. Meterla en `applyPosInventoryMovement` obligaría al
 * motor a conocer documentos que no le incumben.
 *
 * **Vive aquí y no duplicada** porque el cobro y la recepción la necesitan
 * igual, y dos copias de la misma regla son dos sitios donde una puede
 * relajarse.
 *
 * **[D]** Si el negocio tiene una bodega central que surte a varias sucursales,
 * esto lo bloquea. Ver P-14.
 */
async function assertWarehouseBelongsToBranch(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  branchId: string,
  mismatchMessage: string,
  wrap: (message: string) => Error,
): Promise<void> {
  const warehouse = await tx.posWarehouse.findUnique({
    where: { id: warehouseId },
    select: { branchId: true },
  });
  if (!warehouse) throw wrap("La bodega no existe.");
  if (warehouse.branchId !== branchId) throw wrap(mismatchMessage);
}

/** Aborta una mutación de inventario con un mensaje destinado a quien la hace. */
class PosInventoryError extends Error {}

/**
 * Patch POS5.0 — el mismo rechazo para las tres operaciones de existencias.
 *
 * No dice de quién es la bodega: a este mostrador, una bodega ajena no le consta.
 */
const WAREHOUSE_NOT_IN_BRANCH = "La bodega no pertenece a tu sucursal.";

/** Patch INT5 — administrar una bodega de otra sucursal. Mismo criterio. */
const WAREHOUSE_BRANCH_DENIED = "No puedes administrar bodegas de esa sucursal.";

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
  /** Patch POS5.0 — la sucursal de la sesión, contra la que se acota la bodega. */
  branchId: string;
}): Promise<
  | { ok: true; movementId: string; quantityBefore: number; quantityAfter: number }
  | { ok: false; error: string }
> {
  try {
    const result = await getPrisma().$transaction(async (tx) => {
      // Patch POS5.0 — **dentro de la transacción**, como en el cobro: la bodega
      // pudo cambiar de manos entre la lectura y la escritura. El ingreso y el
      // ajuste comparten este embudo, así que la regla se aplica una sola vez.
      await assertWarehouseBelongsToBranch(
        tx,
        input.warehouseId,
        input.branchId,
        WAREHOUSE_NOT_IN_BRANCH,
        (message) => new PosInventoryError(message),
      );
      return applyPosInventoryMovement(tx, input);
    });
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

  const scope = await resolvePosSessionBranch(auth.branchCode);
  if (!scope.ok) return scope;

  return runPosInventoryMutation({
    warehouseId: input.warehouseId,
    productId: input.productId,
    quantity,
    type: "COMPRA",
    reason,
    notes: sanitizePosText(input.notes),
    userId: auth.userId,
    branchId: scope.branchId,
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

  const scope = await resolvePosSessionBranch(auth.branchCode);
  if (!scope.ok) return scope;

  return runPosInventoryMutation({
    warehouseId: input.warehouseId,
    productId: input.productId,
    quantity,
    type: "AJUSTE",
    reason,
    notes: sanitizePosText(input.notes),
    userId: auth.userId,
    branchId: scope.branchId,
  });
}

// --- Sale lifecycle ------------------------------------------------------
//
// Patch INT5 — **el ciclo de venta en borrador se retira.**
//
// Existían siete acciones —`createPosSaleAction`, `addPosSaleItemAction`,
// `removePosSaleItemAction`, `addPosPaymentAction`, `removePosPaymentAction`,
// `completePosSaleAction` y `cancelPosSaleAction`— sin **ningún** consumidor:
// una búsqueda sobre `src/` y `e2e/` solo las encontraba en su propia
// definición. No eran una función a medias: eran una puerta cerrada con la
// llave puesta.
//
// **Lo que las hacía peligrosas.** `completePosSaleAction` marcaba una venta
// COMPLETADA **sin consumir existencias**: no recibía bodega, y `PosSale` no la
// guardaba, así que no había de dónde deducirla. El día que alguien construyera
// la pantalla del borrador, el mostrador habría tenido dos formas de cerrar una
// venta y solo una movería mercancía.
//
// **[R] No se arreglan: se quitan.** Arreglarlas exigía duplicar el contrato de
// `checkoutPosSaleAction` —transacción única, `FOR UPDATE`, orden determinista,
// idempotencia— en un segundo sitio, y dos implementaciones del mismo contrato
// son dos sitios donde puede olvidarse el bloqueo. El cobro tiene una sola
// puerta, y es la que está probada.
//
// `PosSaleStatus.BORRADOR` permanece en el esquema: retirarlo sería una
// migración destructiva sobre un enum que las ventas históricas podrían usar.
// Ninguna acción lo escribe ya.

export async function searchPosCustomersAction(input: {
  term: string;
}): Promise<
  | { ok: true; customers: Array<{ id: string; name: string; phone: string | null }> }
  | { ok: false; error: string }
> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;
  // Patch INT3 — acotado a la sucursal de la sesión, como el resto del mostrador.
  return {
    ok: true,
    customers: await searchPosCustomers(input.term, auth.branchCode),
  };
}

/**
 * Patch POS1.0-D — the checkout: cart in, persisted sale out, one transaction.
 *
 * ## Why the whole sale is written at once
 *
 * The alternative —opening an empty draft and adding items and payments one call
 * at a time— is right for a sale assembled over time and wrong for a till, where
 * an abandoned checkout would leave a draft and its lines behind. Here everything
 * is written together or nothing is. Patch INT5 retired that draft lifecycle
 * outright: it had no consumer, and its completion path did not consume stock.
 *
 * ## The browser cart **is** the draft
 *
 * Which is why the sale is born `COMPLETADA` rather than passing through
 * `BORRADOR`: the draft phase already happened, in the browser, and persisting a
 * draft only to complete it in the same transaction would be ceremony. Since
 * INT5 **no action writes `BORRADOR`**; the enum member stays in the schema
 * because removing it would be a destructive migration over historical rows.
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
  /**
   * Patch POS5.0 — la identidad del **intento de cobro**.
   *
   * La trae el navegador y es estable mientras el carrito lo sea, de modo que un
   * reintento —de la red, del cajero o de una segunda pestaña— es reconocible
   * como el mismo cobro. **El índice único de `pos_sales` es la autoridad**;
   * esto solo lo nombra.
   */
  idempotencyKey?: string;
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
  | { ok: true; saleId: string; saleNumber: string }
  | {
      ok: false;
      error: string;
      /**
       * Patch CB4-D3 — presente solo cuando el mostrador debe hacer algo
       * distinto. El texto sigue siendo la explicación; esto es la decisión.
       */
      code?: PosCheckoutErrorCode;
    }
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

  // Patch POS5.0 — **la sucursal la pone la sesión.** Antes llegaba en la
  // petición y se usaba tal cual: un operador podía registrar la venta en otra
  // sucursal y consumir su inventario. El campo desapareció de la entrada, así
  // que la superficie no se valida — no existe.
  const scope = await resolvePosSessionBranch(auth.branchCode);
  if (!scope.ok) return scope;
  const branch = { id: scope.branchId };

  const idempotencyKey = sanitizePosText(input.idempotencyKey, 100);

  try {
    const sale = await getPrisma().$transaction(async (tx) => {
      // **Lo primero, y antes de escribir nada.** Si este intento ya produjo una
      // venta, se devuelve aquella: ni líneas, ni pagos, ni un segundo consumo
      // de mercancía. Es el reintento el que no debe costar dinero.
      if (idempotencyKey) {
        const already = await tx.posSale.findUnique({
          where: { idempotencyKey },
          select: { id: true, saleNumber: true },
        });
        if (already) return already;
      }

      /*
       * Patch D3 — **el efectivo exige turno de caja abierto.**
       *
       * ## Dónde va, y por qué exactamente aquí
       *
       * Después de la idempotencia y **antes de la primera escritura**. Las dos
       * posiciones importan:
       *
       * - *Después*, porque un reintento de un cobro que ya se registró tiene
       *   que devolver aquella venta sin volver a exigir nada. La venta existe;
       *   el turno de entonces ya cumplió.
       * - *Antes*, porque un rechazo no puede dejar rastro: ni venta, ni pagos,
       *   ni movimiento de inventario. Al no haber escrito nada todavía, no hay
       *   nada que deshacer.
       *
       * El caso que el reintento sí debe volver a comprobar es el contrario: un
       * intento **rechazado** no creó venta, así que la clave de idempotencia no
       * encuentra nada y la regla se evalúa de nuevo. Si el cajero abrió el turno
       * entre medias, el reintento pasa. Es el comportamiento correcto y no
       * necesita estado adicional: lo da la ausencia de la fila.
       *
       * ## Solo el efectivo
       *
       * Tarjeta y transferencia no tocan el cajón, así que no exigen turno. Es la
       * misma distinción por método que Caja aplica al derivar lo esperado y que
       * CB4 heredó: el cajón espera los pagos `EFECTIVO`, no el total de la venta.
       *
       * ## El turno no viaja en la petición
       *
       * Se busca por la sucursal y el operador de la sesión. **No hay `shiftId`
       * en la entrada**, así que no existe superficie que validar: un cliente
       * modificado no puede señalar el turno de otro.
       */
      let shiftId: string | null = null;
      if (payments.some((payment) => payment.method === "EFECTIVO")) {
        // El bloqueo **antes** de leer el estado: lo leído sin bloqueo puede
        // quedar viejo mientras se espera, que es el fallo que D3 evita.
        await lockPosCashShift(tx, branch.id, auth.operatorId);
        const shift = await tx.posCashShift.findFirst({
          where: {
            branchId: branch.id,
            operatorId: auth.operatorId,
            status: "ABIERTO",
          },
          select: { id: true },
        });
        if (!shift) throw new PosCheckoutError(NO_OPEN_SHIFT, "NO_OPEN_SHIFT");
        shiftId = shift.id;
      }

      // Nombre y SKU se leen aquí **dentro de la transacción** porque aquí se
      // congelan: lo leído fuera podría haber cambiado antes del `create`.
      const products = await tx.posProduct.findMany({
        where: { id: { in: lines.map((line) => line.productId) } },
        select: { id: true, isActive: true, name: true, sku: true },
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
          idempotencyKey,
          branchId: branch.id,
          cashierId: auth.userId,
          // Patch INT4 — la bodega de la que se consume y el operador que cobra,
          // **derivados de la petición saneada y de la sesión**, en la misma
          // transacción que la venta. Cierran P-13 y la identidad de mostrador.
          warehouseId: input.warehouseId,
          operatorId: auth.operatorId,
          // Patch CB4-D3 — el turno cuyo cajón recibió este efectivo. `null`
          // cuando la venta no llevó efectivo: no pertenece a ningún cajón.
          shiftId,
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
              // La identidad que se cobró, congelada. Editar el catálogo después
              // ya no reescribe esta venta.
              productName: byId.get(line.productId)?.name ?? null,
              productSku: byId.get(line.productId)?.sku ?? null,
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
      // La bodega tiene que ser de la sucursal donde se cobra. Ver
      // `assertWarehouseBelongsToBranch`.
      await assertWarehouseBelongsToBranch(
        tx,
        input.warehouseId,
        branch.id,
        "La bodega no pertenece a la sucursal de la venta.",
        (message) => new PosCheckoutError(message),
      );
      //
      // **Dentro de la misma transacción que persiste la venta**, así que no
      // puede existir una venta completada sin su consumo ni un consumo sin su
      // venta. Es la misma garantía que ya tenían las líneas y los pagos.
      //
      /*
       * ORDEN DE BLOQUEOS — **el turno primero, el inventario después.**
       *
       * Este cobro es el único camino que toma las dos clases de bloqueo:
       *
       *   1. `pos_cash_shifts` — solo si la venta lleva efectivo (CB4-D3, arriba).
       *   2. `pos_inventory`   — siempre, una fila por línea, ordenadas por
       *                          `productId`.
       *
       * `closePosCashShiftAction` toma solo la primera. Ningún camino toma la
       * segunda antes que la primera, y **no debe hacerlo**: invertir el orden
       * en un parche futuro permitiría que un cobro con el saldo bloqueado
       * esperase un turno que otro cobro tiene, con el saldo del primero en la
       * mano. Si algún día un tercer camino necesita las dos, tiene que pedirlas
       * en esta misma secuencia.
       */

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
    // Patch POS5.0 — **la carrera del intento repetido se resuelve aquí.** Dos
    // peticiones con la misma clave pueden pasar las dos por la lectura de
    // arriba y llegar las dos al `create`; el índice único deja pasar a una y
    // aborta la otra, y esa transacción abortada no dejó nada — tampoco el
    // consumo de mercancía, porque comparte transacción.
    //
    // Quien pierde **quería exactamente lo mismo**, así que se relee la venta
    // que ganó y se devuelve como el éxito que es. Convertirla en un error
    // genérico invitaría al cajero a cobrar por tercera vez, que es el fallo que
    // este parche existe para impedir. Mismo criterio que ya usaba
    // `openPosInventoryAction` con su propio índice único.
    if (
      idempotencyKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await getPrisma().posSale.findUnique({
        where: { idempotencyKey },
        select: { id: true, saleNumber: true },
      });
      if (winner) {
        return { ok: true, saleId: winner.id, saleNumber: winner.saleNumber };
      }
    }

    // Only a message this action authored reaches the till. Anything else — a
    // Prisma constraint, a lost connection — is infrastructure, and its text
    // would tell the cashier about table names instead of about the sale.
    return {
      ok: false,
      error:
        error instanceof PosCheckoutError
          ? error.message
          : "No se pudo registrar la venta.",
      // El código viaja solo si esta acción lo puso. Un fallo de infraestructura
      // no lo tiene, y la pantalla lo trata como lo que es: un error genérico.
      code: error instanceof PosCheckoutError ? error.code : undefined,
    };
  }
}
