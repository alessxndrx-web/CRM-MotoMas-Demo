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
  sanitizePosMoney,
  sanitizePosQuantity,
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

export async function createPosProductAction(input: {
  sku: string;
  name: string;
  unitPrice: number;
  barcode?: string | null;
  notes?: string | null;
}): Promise<{ ok: true; productId: string } | { ok: false; error: string }> {
  const auth = await authorizePos();
  if (!auth.ok) return auth;

  const sku = sanitizePosText(input.sku, 60);
  const name = sanitizePosText(input.name, 200);
  if (!sku) return { ok: false, error: "El SKU es obligatorio." };
  if (!name) return { ok: false, error: "El nombre es obligatorio." };
  const unitPrice = sanitizePosMoney(input.unitPrice);
  if (unitPrice === null) return { ok: false, error: INVALID_MONEY };

  try {
    const product = await getPrisma().posProduct.create({
      data: {
        sku,
        name,
        unitPrice: toDecimal(unitPrice),
        barcode: sanitizePosText(input.barcode, 60),
        notes: sanitizePosText(input.notes),
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
export async function updatePosProductAction(input: {
  productId: string;
  sku?: string;
  name?: string;
  unitPrice?: number;
  barcode?: string | null;
  isActive?: boolean;
  notes?: string | null;
}): Promise<PosActionResult> {
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
      },
    });
    revalidatePos();
    return { ok: true };
  } catch {
    return { ok: false, error: "Ya existe un producto con ese SKU o código." };
  }
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

      return tx.posSale.create({
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
