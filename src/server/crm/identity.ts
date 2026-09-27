import type { Prisma, PrismaClient } from "@prisma/client";

import {
  isValidCedula,
  maskPersonName,
  maskPhoneNumber,
  nationalPhone,
  phoneMatchKeys,
  type IdentityCandidateDTO,
} from "@/server/crm/shared";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Patch CRM-INT2 — ¿quién es esta persona entre los clientes que ya existen?
 *
 * ## El defecto que corrige
 *
 * El alta de cliente y la conversión de lead buscaban con
 * `findFirst({ OR: [teléfono, cédula] })` y daban por hecho que el primero que
 * apareciera era la misma persona. Dos fallos:
 *
 * - **Un teléfono no identifica a nadie.** Lo comparten familias, lo hereda un
 *   número reasignado, lo usa un negocio. Tratarlo como prueba ligaba leads y
 *   expedientes a la persona equivocada, en silencio.
 * - **`findFirst` elige al azar entre varios.** Con dos clientes con el mismo
 *   teléfono, el vínculo dependía del orden físico de las filas.
 *
 * ## La regla
 *
 * - **Cédula válida y exactamente un cliente con ella** → es esa persona. Es la
 *   única coincidencia que se acepta sin preguntar (y aun así, sólo si quien
 *   pregunta puede ver a ese cliente: ver `convertLeadToCustomerAction`).
 * - **Varios clientes con la misma cédula** → ambiguo: la base ya tiene un
 *   duplicado, y elegir uno es decisión de una persona.
 * - **Sólo coincide el teléfono** → ambiguo. Salvo que las dos partes tengan
 *   cédulas válidas **distintas**: entonces son dos personas que comparten
 *   teléfono y no hay candidato.
 * - **Nada coincide** → se puede crear.
 *
 * «Válida» es la forma que el portal ya exigía (`isValidCedula`): una cédula
 * mal tecleada no identifica ni descarta a nadie.
 *
 * El teléfono se compara por sus formas equivalentes (`phoneMatchKeys`): con y
 * sin el prefijo 505. Así un cliente llegado por Meta y el mismo cliente
 * tecleado en el panel se reconocen, sin reescribir ninguna fila guardada.
 */

type CandidateRow = {
  id: string;
  name: string;
  phone: string;
  branchId: string;
  cedulaNormalized: string | null;
  branch: { name: string; code: string };
  assignedSeller: { name: string } | null;
  matchedBy: Array<"CEDULA" | "TELEFONO">;
};

export type IdentityMatch =
  | { kind: "NINGUNA" }
  | { kind: "CEDULA"; customer: CandidateRow }
  | {
      kind: "AMBIGUA";
      reason: string;
      candidates: CandidateRow[];
      /** Alguna candidata comparte la cédula: crear otro cliente la duplicaría. */
      cedulaMatch: boolean;
    };

/** Tope de candidatas que se miran. Más que esto ya es un problema de datos. */
const MAX_CANDIDATES = 20;

export async function findIdentityMatch(
  db: Db,
  input: { phone: string; cedula: string | null },
): Promise<IdentityMatch> {
  const cedula = isValidCedula(input.cedula) ? input.cedula : null;
  const keys = phoneMatchKeys(input.phone);
  if (!cedula && !keys.length) return { kind: "NINGUNA" };

  const select = {
    id: true,
    name: true,
    phone: true,
    phoneNormalized: true,
    branchId: true,
    cedulaNormalized: true,
    branch: { select: { name: true, code: true } },
    assignedSeller: { select: { name: true } },
  } as const;
  // Dos consultas y no un `OR`: con el tope, un teléfono muy repetido podía
  // dejar fuera justo a la cliente que comparte la cédula, que es la prueba.
  const [byCedulaRows, byPhoneRows] = await Promise.all([
    cedula
      ? db.customer.findMany({
          where: { cedulaNormalized: cedula },
          select,
          orderBy: { createdAt: "asc" },
          take: MAX_CANDIDATES,
        })
      : [],
    keys.length
      ? db.customer.findMany({
          where: { phoneNormalized: { in: keys } },
          select,
          orderBy: { createdAt: "asc" },
          take: MAX_CANDIDATES,
        })
      : [],
  ]);
  const rows = [
    ...byCedulaRows,
    ...byPhoneRows.filter((row) => !byCedulaRows.some((other) => other.id === row.id)),
  ];

  const candidates: CandidateRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    branchId: row.branchId,
    cedulaNormalized: row.cedulaNormalized,
    branch: row.branch,
    assignedSeller: row.assignedSeller,
    matchedBy: [
      ...(cedula && row.cedulaNormalized === cedula ? (["CEDULA"] as const) : []),
      ...(keys.includes(row.phoneNormalized) ? (["TELEFONO"] as const) : []),
    ],
  }));

  const byCedula = candidates.filter((row) => row.matchedBy.includes("CEDULA"));
  if (byCedula.length === 1) return { kind: "CEDULA", customer: byCedula[0] };
  if (byCedula.length > 1) {
    return {
      kind: "AMBIGUA",
      reason:
        "Hay varios clientes registrados con esta misma cédula. Hay que decidir cuál es antes de continuar.",
      candidates: byCedula,
      cedulaMatch: true,
    };
  }

  // Sólo teléfono. Dos cédulas válidas distintas son dos personas.
  const phoneOnly = candidates.filter(
    (row) => !(cedula && isValidCedula(row.cedulaNormalized) && row.cedulaNormalized !== cedula),
  );
  if (!phoneOnly.length) return { kind: "NINGUNA" };
  return {
    kind: "AMBIGUA",
    reason:
      phoneOnly.length > 1
        ? "Varios clientes comparten este teléfono. Un teléfono no basta para saber quién es."
        : "Ya existe un cliente con este teléfono, pero no hay una cédula que confirme que es la misma persona.",
    candidates: phoneOnly,
    cedulaMatch: false,
  };
}

/**
 * Serializa las altas que comparten teléfono o cédula.
 *
 * Sin esto, dos peticiones simultáneas con el mismo cliente nuevo leen las dos
 * «no existe» y crean dos filas: `customers` no tiene —ni puede tener sin
 * limpiar antes los duplicados históricos— un índice único sobre teléfono o
 * cédula. Un candado consultivo de transacción (`pg_advisory_xact_lock`) por
 * cada clave de identidad hace que la segunda espere a que la primera termine
 * y, al releer, encuentre al cliente ya creado. Se suelta solo al acabar la
 * transacción. Las claves se toman en orden para que dos transacciones con las
 * mismas claves no se bloqueen mutuamente.
 */
export async function lockIdentity(
  tx: Prisma.TransactionClient,
  input: { phone: string; cedula: string | null },
): Promise<void> {
  const keys: string[] = [];
  const digits = input.phone.replace(/\D/g, "");
  const national = nationalPhone(digits) ?? digits;
  if (national) keys.push(`crm-identidad:tel:${national}`);
  if (isValidCedula(input.cedula)) keys.push(`crm-identidad:ced:${input.cedula}`);
  for (const key of keys.sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}

/** La candidata tal y como la ve quien pregunta. */
export function toCandidateDTO(
  row: CandidateRow,
  accessible: boolean,
): IdentityCandidateDTO {
  return {
    customerId: accessible ? row.id : null,
    displayName: accessible ? row.name : maskPersonName(row.name),
    displayPhone: accessible ? row.phone : maskPhoneNumber(row.phone),
    branchName: row.branch.name,
    assignedSellerName: accessible ? row.assignedSeller?.name ?? null : null,
    matchedBy: row.matchedBy,
    accessible,
  };
}

/**
 * ¿Hay evidencia de que este lead y este cliente son la misma persona?
 *
 * La usa el alta de expediente cuando enlaza un lead que todavía no tiene
 * cliente: sin esto, cualquier lead del alcance podía quedar colgado de
 * cualquier cliente visible.
 */
export function leadMatchesCustomer(
  lead: { phone: string; cedula: string | null },
  customer: { phoneNormalized: string; cedulaNormalized: string | null },
): boolean {
  if (
    isValidCedula(lead.cedula) &&
    isValidCedula(customer.cedulaNormalized)
  ) {
    return lead.cedula === customer.cedulaNormalized;
  }
  return phoneMatchKeys(lead.phone).includes(customer.phoneNormalized);
}
