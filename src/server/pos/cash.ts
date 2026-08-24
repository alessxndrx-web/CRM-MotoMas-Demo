import type { Prisma } from "@prisma/client";

import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { decimalToNumber } from "@/server/finance/money";
import { roundPosMoney } from "@/server/pos/shared";

/**
 * Patch CB4-B — el dominio de efectivo del mostrador: lecturas y aritmética.
 *
 * ## La invariante, en un sitio
 *
 * ```
 * efectivo esperado =
 *     fondo inicial
 *   + efectivo cobrado en ventas del turno
 *   + entradas manuales
 *   − salidas manuales
 * ```
 *
 * **Solo la parte en efectivo de un cobro llega al cajón.** Una venta de C$1,000
 * pagada con C$400 en efectivo y C$600 con tarjeta mueve C$400. No es una regla
 * nueva: es la que Caja ya aplica en `collectCashClosingInputs`, que agrupa por
 * método y no por total de documento. Aquí se agrega `PosPayment` por la misma
 * razón, sobre la tabla que el mostrador sí escribe.
 *
 * ## Por qué la venta se atribuye por ventana y no por columna
 *
 * `PosSale` **no tiene `shiftId`**, y no lo tiene a propósito: escribirlo
 * obligaría a modificar `checkoutPosSaleAction`, que es núcleo protegido, y a
 * decidir antes **D3** —si se puede vender sin turno abierto—, que sigue
 * diferida.
 *
 * La atribución usa entonces lo que la venta **ya** guarda desde INT4: sucursal,
 * operador y momento de compleción. El índice único parcial garantiza que un
 * operador tiene como mucho **un** turno abierto por sucursal, así que la
 * ventana no es ambigua: una venta cae en un turno o en ninguno.
 *
 * **Lo que esto no cubre, dicho en voz alta:** una venta cobrada sin turno
 * abierto no la suma ningún turno. Es efectivo real que no aparece en ningún
 * arqueo, y es exactamente la carencia que D3 resolverá. No se disimula.
 */

/** Lo que hace falta de un turno para derivar su efectivo. */
export type PosCashShiftWindow = {
  branchId: string;
  operatorId: string;
  openedAt: Date;
  closedAt: Date | null;
};

export type PosCashTotals = {
  openingFloat: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
};

/**
 * Cliente mínimo para derivar: sirve tanto `getPrisma()` como el `tx` de una
 * transacción. El cierre **tiene que** derivar dentro de su transacción, o
 * congelaría una cifra distinta de la que comprobó.
 */
export type PosCashDb = Pick<
  Prisma.TransactionClient,
  "posPayment" | "posCashMovement"
>;

/**
 * El efectivo que las ventas del turno metieron en el cajón.
 *
 * Solo ventas **COMPLETADA**: es el único estado que el cobro escribe, y el día
 * que exista anulación una venta anulada no debe seguir contando.
 */
export async function sumPosCashSales(
  db: PosCashDb,
  shift: PosCashShiftWindow,
): Promise<number> {
  const result = await db.posPayment.aggregate({
    where: {
      method: "EFECTIVO",
      sale: {
        status: "COMPLETADA",
        branchId: shift.branchId,
        operatorId: shift.operatorId,
        completedAt: {
          gte: shift.openedAt,
          // Un turno abierto no tiene tope: cuenta hasta ahora.
          ...(shift.closedAt ? { lte: shift.closedAt } : {}),
        },
      },
    },
    _sum: { amount: true },
  });
  return roundPosMoney(decimalToNumber(result._sum.amount));
}

/** Entradas y salidas manuales, sumadas por dirección. */
export async function sumPosCashMovements(
  db: PosCashDb,
  shiftId: string,
): Promise<{ cashIn: number; cashOut: number }> {
  const groups = await db.posCashMovement.groupBy({
    by: ["type"],
    where: { shiftId },
    _sum: { amount: true },
  });
  let cashIn = 0;
  let cashOut = 0;
  for (const group of groups) {
    const amount = decimalToNumber(group._sum.amount);
    if (group.type === "ENTRADA") cashIn = amount;
    else cashOut = amount;
  }
  return { cashIn: roundPosMoney(cashIn), cashOut: roundPosMoney(cashOut) };
}

/**
 * La invariante completa, derivada de lo persistido.
 *
 * **Se usa solo mientras el turno está abierto.** Un turno cerrado devuelve sus
 * columnas congeladas: recalcularlo dejaría que un cobro posterior reescribiera
 * una diferencia que un supervisor ya miró, que es justo lo que
 * `CashClosing.expected*` documenta que no debe pasar.
 */
export async function derivePosCashTotals(
  db: PosCashDb,
  shift: PosCashShiftWindow & { id: string; openingFloat: number },
): Promise<PosCashTotals> {
  const [cashSales, movements] = await Promise.all([
    sumPosCashSales(db, shift),
    sumPosCashMovements(db, shift.id),
  ]);
  return {
    openingFloat: shift.openingFloat,
    cashSales,
    cashIn: movements.cashIn,
    cashOut: movements.cashOut,
    expectedCash: roundPosMoney(
      shift.openingFloat + cashSales + movements.cashIn - movements.cashOut,
    ),
  };
}

export type PosCashMovementDTO = {
  id: string;
  type: "ENTRADA" | "SALIDA";
  amount: number;
  reason: string;
  createdAt: string;
  createdByName: string;
};

export type PosCashShiftDTO = {
  id: string;
  branchCode: string | null;
  branchName: string;
  operatorUsername: string;
  status: "ABIERTO" | "CERRADO";
  openingFloat: number;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
  /** Derivados en vivo si está abierto; congelados si está cerrado. */
  cashSales: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  /** Solo existen tras cerrar. */
  countedCash: number | null;
  difference: number | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewNotes: string | null;
  movements: PosCashMovementDTO[];
};

const shiftInclude = {
  branch: { select: { code: true, name: true } },
  operator: { select: { username: true } },
  reviewedBy: { select: { name: true } },
  movements: {
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  },
} satisfies Prisma.PosCashShiftInclude;

type ShiftRow = Prisma.PosCashShiftGetPayload<{ include: typeof shiftInclude }>;

function mapMovements(row: ShiftRow): PosCashMovementDTO[] {
  return row.movements.map((movement) => ({
    id: movement.id,
    type: movement.type,
    amount: decimalToNumber(movement.amount),
    reason: movement.reason,
    createdAt: movement.createdAt.toISOString(),
    createdByName: movement.createdBy.name,
  }));
}

async function mapShift(row: ShiftRow): Promise<PosCashShiftDTO> {
  const openingFloat = decimalToNumber(row.openingFloat);

  // **Cerrado manda lo congelado.** Abierto se deriva.
  const totals =
    row.status === "CERRADO"
      ? {
          openingFloat,
          cashSales: decimalToNumber(row.cashSalesTotal),
          cashIn: decimalToNumber(row.cashInTotal),
          cashOut: decimalToNumber(row.cashOutTotal),
          expectedCash: decimalToNumber(row.expectedCash),
        }
      : await derivePosCashTotals(getPrisma(), {
          id: row.id,
          branchId: row.branchId,
          operatorId: row.operatorId,
          openedAt: row.openedAt,
          closedAt: row.closedAt,
          openingFloat,
        });

  return {
    id: row.id,
    branchCode: row.branch.code,
    branchName: row.branch.name,
    operatorUsername: row.operator.username,
    status: row.status,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    notes: row.notes,
    movements: mapMovements(row),
    ...totals,
    countedCash: row.countedCash === null ? null : decimalToNumber(row.countedCash),
    difference: row.difference === null ? null : decimalToNumber(row.difference),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedByName: row.reviewedBy?.name ?? null,
    reviewNotes: row.reviewNotes,
  };
}

/**
 * El turno abierto de este operador en esta sucursal, o `null`.
 *
 * **El alcance lo pone quien llama desde la sesión**, nunca la petición: los dos
 * identificadores son de `requirePosSession`.
 */
export async function getOpenPosCashShift(input: {
  branchId: string;
  operatorId: string;
}): Promise<PosCashShiftDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const row = await getPrisma().posCashShift.findFirst({
    where: {
      branchId: input.branchId,
      operatorId: input.operatorId,
      status: "ABIERTO",
    },
    include: shiftInclude,
  });
  return row ? mapShift(row) : null;
}

/** Historial de turnos de la sucursal. Acotado por quien llama. */
export async function listPosCashShifts(input: {
  branchId: string;
  take?: number;
}): Promise<PosCashShiftDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await getPrisma().posCashShift.findMany({
    where: { branchId: input.branchId },
    include: shiftInclude,
    orderBy: { openedAt: "desc" },
    take: input.take ?? 20,
  });
  return Promise.all(rows.map(mapShift));
}

/**
 * Un turno por id, **solo si es de esta sucursal**.
 *
 * Devuelve `null` —no lanza— cuando no existe o es ajeno: quien pregunta no
 * distingue un caso del otro, que es lo que impide que un id ajeno confirme que
 * existe. Mismo criterio que `getPosCustomer`.
 */
export async function getPosCashShift(
  shiftId: string,
  branchId: string,
): Promise<PosCashShiftDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const row = await getPrisma().posCashShift.findFirst({
    where: { id: shiftId, branchId },
    include: shiftInclude,
  });
  return row ? mapShift(row) : null;
}

/**
 * Patch CB4-B — turnos cerrados pendientes o ya revisados, para la supervisión.
 *
 * **La pantalla no es la frontera**: filtra por las sucursales que la sesión
 * administra, y `reviewPosCashShiftAction` vuelve a comprobar `canAccessBranch`
 * por su cuenta. Una petición contra otra sucursal se rechaza aunque el listado
 * nunca la haya ofrecido.
 */
export async function listClosedPosCashShifts(input: {
  branchCodes: string[] | null;
  take?: number;
}): Promise<PosCashShiftDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await getPrisma().posCashShift.findMany({
    where: {
      status: "CERRADO",
      // `null` es alcance global; una lista vacía no alcanza nada.
      ...(input.branchCodes ? { branch: { code: { in: input.branchCodes } } } : {}),
    },
    include: shiftInclude,
    orderBy: { closedAt: "desc" },
    take: input.take ?? 30,
  });
  return Promise.all(rows.map(mapShift));
}
