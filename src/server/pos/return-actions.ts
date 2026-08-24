"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  applyPosInventoryMovement,
  assertWarehouseBelongsToBranch,
} from "@/server/pos/actions";
import { getCurrentPosSession } from "@/server/pos/auth";
import { roundPosMoney, type PosReturnErrorCode } from "@/server/pos/shared";

/**
 * Patch DEV-A — la devolución de un cliente en el mostrador.
 *
 * ## Qué es
 *
 * **Mercancía que vuelve y efectivo que sale**, en una sola transacción. La
 * venta original no se muta: sigue diciendo lo que se cobró el día que se cobró.
 * Lo devuelto vive en `PosSaleReturn` y sus líneas, y el estado de la venta se
 * **deriva** de esa suma — no hay `PARCIALMENTE_DEVUELTA` en `PosSaleStatus`,
 * porque un estado derivado no puede desincronizarse de sus datos y un miembro
 * de enum sí.
 *
 * ## Solo efectivo, y acotado
 *
 * El reembolso sale del turno de caja abierto. **El tope es el efectivo que esa
 * venta recibió, menos lo ya reembolsado contra ella.** No el total de la venta:
 * `PosPayment` no se ata a líneas, así que una venta mixta no dice qué artículo
 * pagó cada método, y repartir por línea exigiría inventar una imputación que el
 * repositorio no tiene.
 *
 * Una devolución que pediría más efectivo del que la venta recibió **se rechaza
 * entera**. No se recorta en silencio: recortar dejaría al cliente con mercancía
 * devuelta y dinero sin devolver, sin que nada lo registre.
 *
 * ## Una venta sin efectivo no se devuelve aquí
 *
 * Tarjeta o transferencia puras se rechazan con un código propio. Registrar solo
 * la reposición de existencias bajo la etiqueta «devolución» sería exactamente lo
 * que este repositorio evitó durante siete fases: un documento con aspecto
 * financiero que no mueve dinero. Para reponer existencias ya existe
 * `adjustPosInventoryAction`, con su nombre honesto — y esta acción **no deriva
 * a ella automáticamente**, porque son operaciones distintas.
 *
 * ## Lo que esta acción NO hace
 *
 * **No contabiliza.** El POS no emite asientos ni documentos de caja, y una
 * devolución no cambia eso: no hay ingreso que revertir porque nunca se registró
 * uno. Es el contrato declarado de POS1.0-A, comprobado por
 * `e2e/pos-sale.spec.ts`.
 *
 * **No comprueba el saldo del cajón.** Si una salida puede exceder el efectivo
 * disponible es una pregunta abierta de CB4 —`registerPosCashMovementAction`
 * tampoco lo comprueba— y esta acción no la responde por su cuenta.
 */

const NO_DB = "La base de datos no está configurada.";
const NO_POS_SESSION = "Necesitas una sesión de mostrador.";
const NO_SALE = "No se encontró la venta.";

class PosReturnError extends Error {
  readonly code?: PosReturnErrorCode;

  constructor(message: string, code?: PosReturnErrorCode) {
    super(message);
    this.code = code;
  }
}

function generateReturnNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `DEV-${date}-${suffix}`;
}

/** Cantidad devuelta: tres decimales y estrictamente positiva, como en la venta. */
function sanitizeReturnQuantity(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0 || value > 999_999) return null;
  return Math.round(value * 1_000) / 1_000;
}

function requiredReason(value: string | null | undefined): string | null {
  const clean = (value ?? "").trim();
  if (!clean || clean.length > 500) return null;
  return clean;
}

async function authorizePosReturn() {
  if (!isDatabaseConfigured()) return { ok: false as const, error: NO_DB };
  const session = await getCurrentPosSession();
  if (!session) return { ok: false as const, error: NO_POS_SESSION };
  return {
    ok: true as const,
    branchId: session.branchId,
    operatorId: session.operatorId,
    userId: session.userId,
  };
}

export async function returnPosSaleAction(input: {
  saleId: string;
  /** A qué bodega vuelve la mercancía. Se comprueba que sea de la sucursal. */
  warehouseId: string;
  reason: string;
  lines: Array<{ saleItemId: string; quantity: number }>;
  /** Mismo contrato que el cobro: un reenvío no procesa dos devoluciones. */
  idempotencyKey?: string | null;
}): Promise<
  | {
      ok: true;
      returnId: string;
      returnNumber: string;
      cashRefunded: number;
    }
  | { ok: false; error: string; code?: PosReturnErrorCode }
> {
  const auth = await authorizePosReturn();
  if (!auth.ok) return auth;

  const reason = requiredReason(input.reason);
  if (!reason) {
    return { ok: false, error: "Indica el motivo de la devolución." };
  }
  if (!input.lines?.length) {
    return { ok: false, error: "La devolución necesita al menos un artículo." };
  }

  const requested: Array<{ saleItemId: string; quantity: number }> = [];
  for (const line of input.lines) {
    const quantity = sanitizeReturnQuantity(line.quantity);
    if (quantity === null) {
      return { ok: false, error: "La cantidad a devolver no es un número válido." };
    }
    if (requested.some((item) => item.saleItemId === line.saleItemId)) {
      return { ok: false, error: "Una línea no puede repetirse en la devolución." };
    }
    requested.push({ saleItemId: line.saleItemId, quantity });
  }

  const idempotencyKey = input.idempotencyKey?.trim() || null;

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      /*
       * **Lo primero, antes de escribir nada.** Si este intento ya produjo una
       * devolución, se devuelve aquella: ni líneas repuestas dos veces, ni un
       * segundo pago de efectivo. Mismo contrato que el cobro.
       */
      if (idempotencyKey) {
        const already = await tx.posSaleReturn.findUnique({
          where: { idempotencyKey },
          select: { id: true, returnNumber: true, cashRefunded: true },
        });
        if (already) {
          return {
            returnId: already.id,
            returnNumber: already.returnNumber,
            cashRefunded: Number(already.cashRefunded),
          };
        }
      }

      /*
       * ORDEN DE BLOQUEOS — **cabecera de la venta → turno → inventario.**
       *
       * Los tres, en este orden, y el orden es carga estructural:
       *
       *   1. `pos_sales` (esta cabecera). Serializa dos devoluciones contra la
       *      misma venta: lo que hay que proteger —cuánto queda por devolver de
       *      cada línea y cuánto efectivo queda por reembolsar— **se calcula
       *      desde aquí**, así que se lee bajo este bloqueo y nunca antes. Es el
       *      mismo patrón que la recepción de órdenes de compra usa con su
       *      cabecera.
       *   2. `pos_cash_shifts`, solo si hay efectivo que devolver. Va **antes que
       *      el inventario** para respetar el orden global que D3 estableció
       *      (turno antes que saldo); invertirlo aquí permitiría un interbloqueo
       *      entre un cobro y una devolución.
       *   3. `pos_inventory`, una fila por línea, ordenadas por `productId` como
       *      hace el cobro.
       *
       * Un parche futuro que necesite estos bloqueos tiene que pedirlos en esta
       * misma secuencia.
       */
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "pos_sales" WHERE "id" = ${input.saleId} FOR UPDATE`,
      );

      const sale = await tx.posSale.findFirst({
        // La pertenencia se comprueba en el `WHERE`: una venta de otra sucursal
        // no se distingue de una que no existe.
        where: { id: input.saleId, branchId: auth.branchId },
        include: { items: true, payments: true },
      });
      if (!sale) throw new PosReturnError(NO_SALE);
      if (sale.status !== "COMPLETADA") {
        throw new PosReturnError("Solo se devuelve una venta completada.");
      }

      // --- El efectivo que esta venta recibió, y lo que ya se reembolsó -----
      const cashTendered = roundPosMoney(
        sale.payments
          .filter((payment) => payment.method === "EFECTIVO")
          .reduce((sum, payment) => sum + Number(payment.amount), 0),
      );
      if (cashTendered <= 0) {
        throw new PosReturnError(
          "Esta venta se cobró sin efectivo, así que no hay efectivo que devolver. Para reponer las existencias usa un ajuste de inventario.",
          "CARD_ONLY_SALE",
        );
      }

      const previous = await tx.posSaleReturn.aggregate({
        where: { saleId: sale.id },
        _sum: { cashRefunded: true },
      });
      const alreadyRefunded = roundPosMoney(Number(previous._sum.cashRefunded ?? 0));
      const refundable = roundPosMoney(cashTendered - alreadyRefunded);

      // --- Lo ya devuelto de cada línea, sumando TODAS las devoluciones ------
      const returnedByItem = new Map<string, number>();
      const priorItems = await tx.posSaleReturnItem.groupBy({
        by: ["saleItemId"],
        where: { saleItem: { saleId: sale.id } },
        _sum: { quantity: true },
      });
      for (const row of priorItems) {
        returnedByItem.set(row.saleItemId, Number(row._sum.quantity ?? 0));
      }

      const byId = new Map(sale.items.map((item) => [item.id, item]));
      let refundValue = 0;
      const plan: Array<{ saleItemId: string; productId: string; quantity: number }> =
        [];

      for (const line of requested) {
        const item = byId.get(line.saleItemId);
        if (!item) {
          throw new PosReturnError("Una línea no pertenece a esta venta.");
        }
        const sold = Number(item.quantity);
        const returned = returnedByItem.get(item.id) ?? 0;
        const remaining = Math.round((sold - returned) * 1_000) / 1_000;
        if (line.quantity > remaining) {
          throw new PosReturnError(
            `De ${item.productSku ?? "ese artículo"} quedan ${remaining} por devolver.`,
            "OVER_RETURN",
          );
        }

        // El valor devuelto es proporcional al total **que esa línea registró**.
        // No es una fórmula nueva: es el importe de la venta, a prorrata.
        refundValue += (Number(item.total) * line.quantity) / sold;
        plan.push({
          saleItemId: item.id,
          productId: item.productId,
          quantity: line.quantity,
        });
      }
      refundValue = roundPosMoney(refundValue);

      /*
       * **Se rechaza entera, no se recorta.** Recortar dejaría mercancía devuelta
       * y dinero sin devolver, sin nada que lo registre. El cajero decide qué
       * hacer con esa diferencia; el sistema no la esconde.
       */
      if (refundValue > refundable) {
        throw new PosReturnError(
          `Esta venta solo admite ${refundable.toFixed(2)} de devolución en efectivo: recibió ${cashTendered.toFixed(2)} y ya se devolvieron ${alreadyRefunded.toFixed(2)}.`,
          "CASH_CAP_EXCEEDED",
        );
      }

      // --- 2. El turno, si hay efectivo que pagar --------------------------
      let shiftId: string | null = null;
      if (refundValue > 0) {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "pos_cash_shifts" WHERE "branch_id" = ${auth.branchId} AND "operator_id" = ${auth.operatorId} AND "status" = 'ABIERTO' FOR UPDATE`,
        );
        const shift = await tx.posCashShift.findFirst({
          where: {
            branchId: auth.branchId,
            operatorId: auth.operatorId,
            status: "ABIERTO",
          },
          select: { id: true },
        });
        if (!shift) {
          throw new PosReturnError(
            "Debes abrir un turno de caja antes de devolver efectivo.",
            "NO_OPEN_SHIFT",
          );
        }
        shiftId = shift.id;
      }

      // La bodega a la que vuelve la mercancía tiene que ser de esta sucursal.
      await assertWarehouseBelongsToBranch(
        tx,
        input.warehouseId,
        auth.branchId,
        "La bodega no pertenece a tu sucursal.",
        (message) => new PosReturnError(message),
      );

      const created = await tx.posSaleReturn.create({
        data: {
          returnNumber: generateReturnNumber(),
          idempotencyKey,
          saleId: sale.id,
          branchId: auth.branchId,
          warehouseId: input.warehouseId,
          operatorId: auth.operatorId,
          reason,
          cashRefunded: new Prisma.Decimal(refundValue),
          createdByUserId: auth.userId,
          items: {
            create: plan.map((line) => ({
              saleItemId: line.saleItemId,
              quantity: new Prisma.Decimal(line.quantity),
            })),
          },
        },
        select: { id: true, returnNumber: true },
      });

      // --- 3. El inventario, en orden por producto -------------------------
      const ordered = [...plan].sort((left, right) =>
        left.productId.localeCompare(right.productId),
      );
      for (const line of ordered) {
        await applyPosInventoryMovement(tx, {
          warehouseId: input.warehouseId,
          productId: line.productId,
          // Con signo: una devolución de cliente **repone**, así que suma.
          quantity: line.quantity,
          type: "DEVOLUCION_CLIENTE",
          reason: `Devolución ${created.returnNumber} de la venta ${sale.saleNumber}`,
          notes: null,
          userId: auth.userId,
          // Los dos: de qué venta salió y qué devolución la trajo.
          saleId: sale.id,
          returnId: created.id,
        });
      }

      // --- El efectivo sale del cajón, como una salida más de CB4 -----------
      if (refundValue > 0 && shiftId) {
        await tx.posCashMovement.create({
          data: {
            shiftId,
            type: "SALIDA",
            amount: new Prisma.Decimal(refundValue),
            reason: `Devolución ${created.returnNumber}`,
            createdByUserId: auth.userId,
            saleReturnId: created.id,
          },
        });
      }

      return {
        returnId: created.id,
        returnNumber: created.returnNumber,
        cashRefunded: refundValue,
      };
    });

    revalidatePath("/pos/ventas");
    revalidatePath(`/pos/ventas/${input.saleId}`);
    revalidatePath("/pos/caja");
    return { ok: true, ...result };
  } catch (error) {
    /*
     * La carrera del reenvío, resuelta como en el cobro: dos peticiones con la
     * misma clave pueden pasar las dos por la lectura de arriba; el índice único
     * deja pasar a una y aborta la otra, y esa transacción abortada no dejó nada.
     * Quien pierde quería lo mismo, así que se relee la devolución que ganó.
     */
    if (
      idempotencyKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await getPrisma().posSaleReturn.findUnique({
        where: { idempotencyKey },
        select: { id: true, returnNumber: true, cashRefunded: true },
      });
      if (winner) {
        return {
          ok: true,
          returnId: winner.id,
          returnNumber: winner.returnNumber,
          cashRefunded: Number(winner.cashRefunded),
        };
      }
    }

    if (error instanceof PosReturnError) {
      return { ok: false, error: error.message, code: error.code };
    }
    // Ningún interno llega al mostrador.
    return { ok: false, error: "No se pudo registrar la devolución." };
  }
}
