"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAuth } from "@/server/auth/context";
import { canAccessBranch, canReviewCaja } from "@/server/auth/access";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { getCurrentPosSession } from "@/server/pos/auth";
import { derivePosCashTotals } from "@/server/pos/cash";
import { roundPosMoney } from "@/server/pos/shared";

/**
 * Patch CB4-B — las escrituras del cajón del mostrador.
 *
 * ## Qué NO hace
 *
 * **No contabiliza.** El POS es operativo y no emite asientos ni documentos de
 * caja (contrato de POS1.0-A, comprobado por
 * `e2e/pos-sale.spec.ts` → «cobrar no crea asientos…»). Un retiro de caja aquí
 * es un hecho del mostrador con motivo y autor, no una transacción contable.
 * El día que el mostrador contabilice, estos movimientos son el primer
 * candidato — y por eso guardan todo lo que un asiento pediría.
 *
 * **No toca el cobro.** `checkoutPosSaleAction` sigue exactamente igual: no
 * exige turno, no escribe turno y no sabe que existe. Decidir si una venta
 * requiere turno abierto es **D3**, y sigue diferida.
 *
 * ## Autorización
 *
 * Abrir, mover y cerrar son actos de mostrador: exigen **sesión de POS**, y el
 * operador y la sucursal salen de ella, nunca de la petición. Revisar es
 * supervisión: exige sesión administrativa con `canReviewCaja`, que el
 * repositorio ya define como «nunca acción de cajero». No se inventa jerarquía;
 * se reutiliza la que existe con el mismo significado.
 */

const NO_DB = "La base de datos no está configurada.";
const NO_POS_SESSION = "Necesitas una sesión de mostrador.";
const NO_SHIFT = "No se encontró el turno.";
const SHIFT_CLOSED = "El turno ya está cerrado.";

const CASH_ROUTES = ["/pos/caja", "/pos/venta"];

function revalidateCash() {
  for (const route of CASH_ROUTES) revalidatePath(route);
}

/** Un importe de dinero tecleado. Estrictamente positivo. */
function sanitizeCashAmount(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0 || value > 9_999_999) return null;
  return roundPosMoney(value);
}

/** Un fondo inicial. **Cero es válido**: abrir sin cambio es una decisión real. */
function sanitizeOpeningFloat(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > 9_999_999) return null;
  return roundPosMoney(value);
}

function requiredReason(value: string | null | undefined): string | null {
  const clean = (value ?? "").trim();
  if (!clean || clean.length > 500) return null;
  return clean;
}

/** La identidad del mostrador, resuelta de la sesión firmada. */
async function authorizePosCash() {
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

/**
 * Patch CB4-B — abrir el turno con su fondo declarado.
 *
 * **La unicidad la garantiza la base**, no esta lectura: el índice único parcial
 * `pos_cash_shifts_one_open_per_operator_branch` rechaza el segundo turno
 * abierto aunque dos pestañas lleguen a la vez. La comprobación previa existe
 * para dar el mensaje legible en el caso normal; el `P2002` cubre la carrera.
 * Es la lección de CB4-A, aplicada desde el principio en vez de después.
 */
export async function openPosCashShiftAction(input: {
  openingFloat: number;
  notes?: string | null;
}): Promise<
  { ok: true; shiftId: string } | { ok: false; error: string }
> {
  const auth = await authorizePosCash();
  if (!auth.ok) return auth;

  const openingFloat = sanitizeOpeningFloat(input.openingFloat);
  if (openingFloat === null) {
    return { ok: false, error: "El fondo inicial debe ser un monto válido." };
  }

  try {
    const existing = await getPrisma().posCashShift.findFirst({
      where: {
        branchId: auth.branchId,
        operatorId: auth.operatorId,
        status: "ABIERTO",
      },
      select: { id: true },
    });
    if (existing) {
      return { ok: false, error: "Ya tienes un turno abierto en esta sucursal." };
    }

    const created = await getPrisma().posCashShift.create({
      data: {
        branchId: auth.branchId,
        operatorId: auth.operatorId,
        openedByUserId: auth.userId,
        openingFloat: new Prisma.Decimal(openingFloat),
        notes: input.notes?.trim() || null,
      },
      select: { id: true },
    });
    revalidateCash();
    return { ok: true, shiftId: created.id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Perdió la carrera contra otra apertura. No es una avería.
      return { ok: false, error: "Ya tienes un turno abierto en esta sucursal." };
    }
    return { ok: false, error: "No se pudo abrir el turno." };
  }
}

/**
 * Patch CB4-B — entrada o salida manual de efectivo.
 *
 * **El importe siempre es positivo y la dirección la dice el tipo.** Aceptar
 * negativos convertiría una salida en una entrada indistinguible dentro de una
 * suma, que es exactamente el error que el enum evita.
 *
 * La pertenencia del turno se comprueba **en el servidor**: el navegador manda
 * un id, y ese id solo vale si el turno es de la sucursal *y* del operador de la
 * sesión. Un id ajeno no se distingue de uno inexistente.
 */
export async function registerPosCashMovementAction(input: {
  shiftId: string;
  type: "ENTRADA" | "SALIDA";
  amount: number;
  reason: string;
  /** Opcional; si viaja, un reenvío no duplica el movimiento. */
  idempotencyKey?: string | null;
}): Promise<{ ok: true; movementId: string } | { ok: false; error: string }> {
  const auth = await authorizePosCash();
  if (!auth.ok) return auth;

  if (input.type !== "ENTRADA" && input.type !== "SALIDA") {
    return { ok: false, error: "El tipo de movimiento no es válido." };
  }
  const amount = sanitizeCashAmount(input.amount);
  if (amount === null) {
    return { ok: false, error: "El monto debe ser mayor que cero." };
  }
  const reason = requiredReason(input.reason);
  if (!reason) {
    return { ok: false, error: "Indica el motivo del movimiento." };
  }

  try {
    const movementId = await getPrisma().$transaction(async (tx) => {
      // Dentro de la transacción: el turno pudo cerrarse entre la lectura de la
      // pantalla y esta escritura.
      const shift = await tx.posCashShift.findFirst({
        where: {
          id: input.shiftId,
          branchId: auth.branchId,
          operatorId: auth.operatorId,
        },
        select: { id: true, status: true },
      });
      if (!shift) throw new PosCashError(NO_SHIFT);
      if (shift.status !== "ABIERTO") throw new PosCashError(SHIFT_CLOSED);

      const created = await tx.posCashMovement.create({
        data: {
          shiftId: shift.id,
          type: input.type,
          amount: new Prisma.Decimal(amount),
          reason,
          createdByUserId: auth.userId,
          idempotencyKey: input.idempotencyKey?.trim() || null,
        },
        select: { id: true },
      });
      return created.id;
    });
    revalidateCash();
    return { ok: true, movementId };
  } catch (error) {
    if (error instanceof PosCashError) {
      return { ok: false, error: error.message };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Reenvío con la misma clave: el movimiento ya existe y no se duplica.
      const existing = await getPrisma().posCashMovement.findUnique({
        where: { idempotencyKey: input.idempotencyKey?.trim() || "" },
        select: { id: true },
      });
      if (existing) return { ok: true, movementId: existing.id };
    }
    return { ok: false, error: "No se pudo registrar el movimiento." };
  }
}

class PosCashError extends Error {}

/**
 * Patch CB4-B — cerrar el turno y **congelar** su arqueo.
 *
 * ## Por qué se deriva dentro de la transacción
 *
 * Lo esperado se calcula con el mismo `tx` que escribe. Derivarlo fuera dejaría
 * una ventana en la que un cobro se registra entre el cálculo y la escritura, y
 * el turno cerraría con una cifra que ya no era cierta cuando se guardó.
 *
 * ## Por qué se guarda en vez de recalcularse
 *
 * Es la regla que `CashClosing.expected*` documenta en Caja: **un pago corregido
 * después no puede reescribir la diferencia que un supervisor ya revisó.** Desde
 * el cierre, las cifras del turno son historia y no una consulta.
 *
 * ## La diferencia no bloquea
 *
 * Decisión D5, y coincide con Caja: el turno cierra con faltante, con sobrante o
 * cuadrado. Lo que no puede es cerrar sin que alguien haya contado.
 */
export async function closePosCashShiftAction(input: {
  shiftId: string;
  countedCash: number;
}): Promise<
  | { ok: true; expectedCash: number; countedCash: number; difference: number }
  | { ok: false; error: string }
> {
  const auth = await authorizePosCash();
  if (!auth.ok) return auth;

  // Contar cero es contar. `null` o ilegible, no.
  const counted =
    Number.isFinite(input.countedCash) &&
    input.countedCash >= 0 &&
    input.countedCash <= 9_999_999
      ? roundPosMoney(input.countedCash)
      : null;
  if (counted === null) {
    return { ok: false, error: "Indica el efectivo contado." };
  }

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      const shift = await tx.posCashShift.findFirst({
        where: {
          id: input.shiftId,
          branchId: auth.branchId,
          operatorId: auth.operatorId,
        },
      });
      if (!shift) throw new PosCashError(NO_SHIFT);

      /*
       * Patch D3 — **bloquear la fila antes de derivar**, no después.
       *
       * Desde D3 un cobro en efectivo toma este mismo bloqueo. Sin él aquí, un
       * cobro que se registre entre el cálculo de los totales y el `updateMany`
       * quedaría fuera de un arqueo ya congelado: efectivo real en el cajón que
       * ningún turno declara.
       *
       * Con el bloqueo el orden se serializa: o el cobro entra antes y esta
       * derivación lo ve, o entra después y encuentra el turno cerrado y se
       * rechaza. No hay tercera posibilidad.
       *
       * El estado se relee **después** de tener el bloqueo: lo leído antes pudo
       * quedar viejo esperándolo.
       */
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "pos_cash_shifts" WHERE "id" = ${shift.id} FOR UPDATE`,
      );
      const locked = await tx.posCashShift.findUniqueOrThrow({
        where: { id: shift.id },
        select: { status: true },
      });
      if (locked.status !== "ABIERTO") throw new PosCashError(SHIFT_CLOSED);

      const closedAt = new Date();
      const totals = await derivePosCashTotals(tx, {
        id: shift.id,
        branchId: shift.branchId,
        operatorId: shift.operatorId,
        openedAt: shift.openedAt,
        // Se deriva hasta **ahora**: el turno se cierra en este instante.
        closedAt,
        openingFloat: Number(shift.openingFloat),
      });
      const difference = roundPosMoney(counted - totals.expectedCash);

      // Bloqueo optimista, como el cierre de Caja: si otro cierre ganó, esta
      // escritura afecta cero filas y la transacción se deshace entera.
      const written = await tx.posCashShift.updateMany({
        where: { id: shift.id, status: "ABIERTO" },
        data: {
          status: "CERRADO",
          closedAt,
          cashSalesTotal: new Prisma.Decimal(totals.cashSales),
          cashInTotal: new Prisma.Decimal(totals.cashIn),
          cashOutTotal: new Prisma.Decimal(totals.cashOut),
          expectedCash: new Prisma.Decimal(totals.expectedCash),
          countedCash: new Prisma.Decimal(counted),
          difference: new Prisma.Decimal(difference),
        },
      });
      if (written.count !== 1) throw new PosCashError(SHIFT_CLOSED);

      return {
        expectedCash: totals.expectedCash,
        countedCash: counted,
        difference,
      };
    });
    revalidateCash();
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof PosCashError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "No se pudo cerrar el turno." };
  }
}

/**
 * Patch CB4-B — la revisión del supervisor.
 *
 * **Reutiliza `canReviewCaja` sin cambiar su significado**: el repositorio ya
 * decidió que revisar un arqueo es supervisión y «nunca acción de cajero»
 * (ADMIN o GERENTE). Contar el dinero y aprobar la cuenta son actos distintos, y
 * por eso esta acción exige la sesión administrativa y no la de mostrador.
 *
 * La sucursal se comprueba con `canAccessBranch`, el mismo predicado que usa
 * Caja: un gerente de Granada no revisa el arqueo de Masaya.
 *
 * **Anota, no cambia el estado del turno.** Un turno revisado sigue `CERRADO`;
 * la revisión es una capa encima, igual que en Caja el arqueo y su revisión son
 * cosas separadas.
 */
export async function reviewPosCashShiftAction(input: {
  shiftId: string;
  notes?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDatabaseConfigured()) return { ok: false, error: NO_DB };

  const session = await requireAuth();
  if (!canReviewCaja(session.roleEnum)) {
    return { ok: false, error: "No tienes permiso para revisar arqueos." };
  }

  try {
    const prisma = getPrisma();
    const shift = await prisma.posCashShift.findUnique({
      where: { id: input.shiftId },
      select: { id: true, status: true, branch: { select: { code: true } } },
    });
    if (!shift) return { ok: false, error: NO_SHIFT };
    if (shift.status !== "CERRADO") {
      return { ok: false, error: "Solo se revisa un turno cerrado." };
    }

    const actorBranch = session.branchId
      ? (
          await prisma.branch.findUnique({
            where: { id: session.branchId },
            select: { code: true },
          })
        )?.code ?? null
      : null;
    if (!canAccessBranch(session.roleEnum, actorBranch, shift.branch.code)) {
      return { ok: false, error: "No puedes revisar arqueos de esa sucursal." };
    }

    // Guardia en el `WHERE`: dos revisiones simultáneas no se pisan.
    const written = await prisma.posCashShift.updateMany({
      where: { id: shift.id, status: "CERRADO", reviewedAt: null },
      data: {
        reviewedByUserId: session.uid,
        reviewedAt: new Date(),
        reviewNotes: input.notes?.trim() || null,
      },
    });
    if (written.count !== 1) {
      return { ok: false, error: "El turno ya fue revisado." };
    }

    revalidateCash();
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo registrar la revisión." };
  }
}
