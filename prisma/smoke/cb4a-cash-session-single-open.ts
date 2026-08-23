/**
 * SMOKE-CB4-A — «un turno abierto por cajero y sucursal», contra PostgreSQL real.
 *
 *   npm run smoke:cash-session
 *
 * ## Por qué este smoke y no un E2E
 *
 * Lo que se prueba aquí es una **carrera**, y una carrera no se reproduce por la
 * interfaz: hay que lanzar dos transacciones a la vez contra la misma base. El
 * arnés de Playwright puede repetir una acción de servidor, pero no puede
 * garantizar que las dos ventanas de `check-then-act` se solapen.
 *
 * ## Qué se prueba
 *
 * Antes de CB4-A la regla vivía solo en `openCashSessionAction`: un `findFirst`
 * dentro de la transacción y un rechazo si encontraba algo. Bajo READ COMMITTED
 * eso es `check-then-act`, y **se comprobó que fallaba**: dos aperturas
 * simultáneas del mismo cajero dejaban dos turnos abiertos.
 *
 * CB4-A añade un índice único parcial sobre `("branch_id","cashier_id")` limitado
 * a `status = 'ABIERTO'`. Este smoke afirma las dos mitades del contrato:
 *
 * 1. Dos aperturas concurrentes dejan **exactamente uno** abierto.
 * 2. Cerrar y volver a abrir **sigue permitido** — el índice es parcial a
 *    propósito: un cajero acumula muchos turnos cerrados en su sucursal.
 *
 * Lo que NO cubre: la autorización. `openCashSessionAction` resuelve la sesión
 * desde la cookie firmada, que un script fuera de Next no puede construir. Este
 * smoke ataca la garantía de la base, que es justamente la que la capa de
 * servicio no podía dar.
 *
 * Crea sus propios fixtures con prefijo reconocible y **los borra al terminar**,
 * incluso si una aserción falla.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const TAG = `SMOKE-CB4A-${Date.now()}`;

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

/** ¿Es el rechazo del índice único, y no otro fallo cualquiera? */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

async function main() {
  console.log(`\nSMOKE-CB4-A — turno único abierto (${TAG})\n`);

  const branch = await prisma.branch.findFirstOrThrow({ select: { id: true } });
  const cashier = await prisma.user.findFirstOrThrow({ select: { id: true } });

  /**
   * Repite lo que hace `openCashSessionAction`: lee, y si no encuentra, inserta.
   * La espera **no es un adorno**: ensancha a propósito la ventana entre leer y
   * escribir para que las dos transacciones se solapen de verdad. Sin ella la
   * carrera existe igual, pero se gana o se pierde por azar del planificador y
   * la prueba dejaría de afirmar nada.
   */
  async function openLikeTheAction() {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.cashSession.findFirst({
        where: { branchId: branch.id, cashierId: cashier.id, status: "ABIERTO" },
        select: { id: true },
      });
      if (existing) return "rechazado-por-lectura" as const;
      await new Promise((resolve) => setTimeout(resolve, 60));
      await tx.cashSession.create({
        data: { branchId: branch.id, cashierId: cashier.id, notes: TAG },
      });
      return "creado" as const;
    });
  }

  // --- 1. Dos aperturas concurrentes -------------------------------------
  const results = await Promise.allSettled([
    openLikeTheAction(),
    openLikeTheAction(),
  ]);

  const created = results.filter(
    (r) => r.status === "fulfilled" && r.value === "creado",
  ).length;
  const rejectedByIndex = results.filter(
    (r) => r.status === "rejected" && isUniqueViolation(r.reason),
  ).length;

  check("una sola apertura prospera", created === 1, `creadas=${created}`);
  check(
    "la otra la rechaza la base, no la interfaz",
    rejectedByIndex === 1,
    `rechazadas por índice=${rejectedByIndex}`,
  );

  const openNow = await prisma.cashSession.count({
    where: { branchId: branch.id, cashierId: cashier.id, status: "ABIERTO" },
  });
  check(
    "queda exactamente un turno abierto",
    openNow === 1,
    `abiertos=${openNow}`,
  );

  // --- 2. El índice es parcial: cerrar y reabrir sigue siendo legal -------
  await prisma.cashSession.updateMany({
    where: { notes: TAG, status: "ABIERTO" },
    data: { status: "CERRADO", closedAt: new Date() },
  });

  let reopened = false;
  try {
    await prisma.cashSession.create({
      data: { branchId: branch.id, cashierId: cashier.id, notes: TAG },
    });
    reopened = true;
  } catch {
    reopened = false;
  }
  check("tras cerrar, el mismo cajero puede reabrir", reopened);

  // Y dos cerrados conviven: la unicidad no alcanza al historial.
  await prisma.cashSession.updateMany({
    where: { notes: TAG, status: "ABIERTO" },
    data: { status: "CERRADO", closedAt: new Date() },
  });
  const closedCount = await prisma.cashSession.count({
    where: { notes: TAG, status: "CERRADO" },
  });
  check(
    "el historial admite varios turnos cerrados del mismo cajero",
    closedCount >= 2,
    `cerrados=${closedCount}`,
  );
}

main()
  .catch((error) => {
    failed += 1;
    console.error("  ERROR", error);
  })
  .finally(async () => {
    // Limpieza incondicional: el smoke no deja rastro aunque falle.
    await prisma.cashSession.deleteMany({ where: { notes: TAG } });
    await prisma.$disconnect();
    console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
    process.exit(failed === 0 ? 0 : 1);
  });
