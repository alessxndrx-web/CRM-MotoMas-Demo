/**
 * SMOKE-FF1.5-A — validación de conjuntos de mapeo contable.
 *
 *   npm run smoke:mapping
 *
 * Ejercita `validateMappingSet` directamente: es una función de base de datos
 * pura, sin autorización, así que aquí NO hay reproducción de acción. La
 * activación sí se reproduce (`activateAccountMappingSet` autoriza contra la
 * cookie de sesión), copiando su guard y su llamada a la validación.
 *
 * El escenario 13 es el que impide que este parche rompa lo anterior: replica
 * los mapeos exactos de las suites FF1.4-C, FF1.4-D, FF1.4-E y FF1.4-F y exige
 * que sigan siendo válidos.
 *
 * Fixtures con prefijo propio, borrados siempre.
 */
import { PrismaClient } from "@prisma/client";

import { validateMappingSet } from "@/server/finance/account-mapping/validation";

const prisma = new PrismaClient();
const TAG = `SMOKE-FF15A-${Date.now()}`;

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

type Ids = {
  branchId: string;
  userId: string;
  accounts: Record<string, string>;
};

type RuleSpec = {
  event: string;
  component: string;
  debit: string;
  credit: string;
};

const ACCOUNT_NAMES = [
  "GASTO_SALARIO",
  "GASTO_SALARIO_CARGAS",
  "SALARIOS_POR_PAGAR",
  "RETENCIONES",
  "CXC",
  "INGRESO",
  "CXP",
  "CAJA",
] as const;

async function createFixtures(): Promise<Ids> {
  const branch = await prisma.branch.create({
    data: { code: `${TAG}-suc`.toLowerCase(), name: `${TAG} sucursal` },
  });
  const user = await prisma.user.create({
    data: {
      name: `${TAG} contador`,
      email: `${TAG.toLowerCase()}@smoke.local`,
      passwordHash: "smoke:not-a-real-hash",
      role: "CONTADOR",
    },
  });

  const accounts: Record<string, string> = {};
  for (const name of ACCOUNT_NAMES) {
    const isExpense = name.startsWith("GASTO");
    const isAsset = name === "CXC" || name === "CAJA";
    const account = await prisma.chartAccount.create({
      data: {
        code: `${TAG}-${name}`,
        name,
        type: isExpense ? "GASTO" : isAsset ? "ACTIVO" : name === "INGRESO" ? "INGRESO" : "PASIVO",
        nature: isExpense || isAsset ? "DEUDORA" : "ACREEDORA",
        origin: "EMPRESA",
        effectiveFrom: new Date("2020-01-01"),
      },
    });
    accounts[name] = account.id;
  }

  return { branchId: branch.id, userId: user.id, accounts };
}

async function cleanup(ids: Ids | null) {
  if (!ids) return;
  await prisma.financialAuditEvent.deleteMany({
    where: { actorUserId: ids.userId },
  });
  const sets = await prisma.accountMappingSet.findMany({
    where: { code: { startsWith: TAG } },
    select: { id: true },
  });
  const setIds = sets.map((set) => set.id);
  await prisma.accountMappingRule.deleteMany({ where: { setId: { in: setIds } } });
  await prisma.accountMappingSet.deleteMany({ where: { id: { in: setIds } } });
  await prisma.chartAccount.deleteMany({
    where: { id: { in: Object.values(ids.accounts) } },
  });
  await prisma.user.deleteMany({ where: { id: ids.userId } });
  await prisma.branch.deleteMany({ where: { id: ids.branchId } });
}

let setCounter = 0;

/** Creates a BORRADOR set with the given rules and returns its id. */
async function createSet(ids: Ids, rules: RuleSpec[]): Promise<string> {
  setCounter += 1;
  const set = await prisma.accountMappingSet.create({
    data: {
      code: `${TAG}-${setCounter}`,
      version: 1,
      name: `${TAG} conjunto ${setCounter}`,
      status: "BORRADOR",
      branchId: ids.branchId,
      branchKey: ids.branchId,
      activeBranchKey: null,
      effectiveFrom: new Date("2020-01-01"),
      createdByUserId: ids.userId,
      rules: {
        create: rules.map((rule) => ({
          event: rule.event as "PLANILLA",
          component: rule.component as "PLANILLA_NETO",
          debitAccountId: ids.accounts[rule.debit],
          creditAccountId: ids.accounts[rule.credit],
        })),
      },
    },
  });
  return set.id;
}

/**
 * Reproduce el guard de `activateAccountMappingSet`: exige BORRADOR y rechaza
 * cuando la validación no pasa. No reproduce el archivado del conjunto previo,
 * que no interviene en este parche.
 */
async function tryActivate(
  setId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.accountMappingSet.findUnique({
      where: { id: setId },
    });
    if (!existing) return { ok: false as const, error: "No existe." };
    if (existing.status !== "BORRADOR") {
      return { ok: false as const, error: "El conjunto ya está activo." };
    }
    const validation = await validateMappingSet(tx, setId);
    if (!validation.valid) {
      return {
        ok: false as const,
        error: `El conjunto no es válido: ${validation.issues[0]?.message ?? ""}`.trim(),
      };
    }
    await tx.accountMappingSet.update({
      where: { id: setId },
      data: {
        status: "ACTIVO",
        activeBranchKey: existing.branchKey,
        activatedAt: new Date(),
        activatedByUserId: existing.createdByUserId,
      },
    });
    return { ok: true as const };
  });
}

async function main() {
  let ids: Ids | null = null;
  try {
    ids = await createFixtures();

    console.log("\n=== 1. Mapeo válido de documento ===");
    const validDoc = await createSet(ids, [
      { event: "DOCUMENTO_FACTURA", component: "SUBTOTAL", debit: "CXC", credit: "INGRESO" },
      { event: "DOCUMENTO_FACTURA", component: "RETENCION_1", debit: "RETENCIONES", credit: "CXC" },
    ]);
    const validDocResult = await validateMappingSet(prisma, validDoc);
    check("válido", validDocResult.valid, JSON.stringify(validDocResult.issues));
    check("sin incidencias", validDocResult.issues.length === 0);
    check("cuenta las reglas", validDocResult.ruleCount === 2);

    console.log("\n=== 2. Componente duplicado -> lo impide la base de datos ===");
    let duplicateRejected = false;
    try {
      await createSet(ids, [
        { event: "GASTO", component: "SUBTOTAL", debit: "GASTO_SALARIO", credit: "CXP" },
        { event: "GASTO", component: "SUBTOTAL", debit: "GASTO_SALARIO", credit: "CAJA" },
      ]);
    } catch {
      duplicateRejected = true;
    }
    check("unique (conjunto, evento, componente) rechaza", duplicateRejected);

    console.log("\n=== 3. Falta el componente base -> incompleto ===");
    const missingBase = await createSet(ids, [
      { event: "DOCUMENTO_FACTURA", component: "RETENCION_1", debit: "RETENCIONES", credit: "CXC" },
    ]);
    const missingBaseResult = await validateMappingSet(prisma, missingBase);
    check("inválido", !missingBaseResult.valid);
    check(
      "el mensaje nombra el componente que falta",
      missingBaseResult.issues.some((issue) => issue.message.includes("Subtotal")),
      JSON.stringify(missingBaseResult.issues),
    );

    console.log("\n=== 4. Componente ajeno al evento -> ya lo rechazaba FF1.0 ===");
    const forbidden = await createSet(ids, [
      { event: "GASTO", component: "SUBTOTAL", debit: "GASTO_SALARIO", credit: "CXP" },
      { event: "GASTO", component: "PAGO_EFECTIVO", debit: "CAJA", credit: "CXP" },
    ]);
    const forbiddenResult = await validateMappingSet(prisma, forbidden);
    check("inválido", !forbiddenResult.valid);
    check(
      "el mensaje explica que nunca se aplicaría",
      forbiddenResult.issues.some((issue) =>
        issue.message.includes("nunca se aplicaría"),
      ),
      JSON.stringify(forbiddenResult.issues),
    );

    console.log("\n=== 5. Conjunto vacío ===");
    const empty = await createSet(ids, []);
    const emptyResult = await validateMappingSet(prisma, empty);
    check("inválido", !emptyResult.valid);
    check("ruleCount cero", emptyResult.ruleCount === 0);

    console.log("\n=== 6. Mapeo muerto -> sigue siendo VÁLIDO (contractual) ===");
    // TOTAL es mapeable para GASTO y ninguna estrategia lo emite. Este parche
    // NO lo rechaza: hacerlo invalidaría configuraciones previsoras legítimas.
    const dead = await createSet(ids, [
      { event: "GASTO", component: "SUBTOTAL", debit: "GASTO_SALARIO", credit: "CXP" },
      { event: "GASTO", component: "TOTAL", debit: "GASTO_SALARIO", credit: "CXP" },
    ]);
    const deadResult = await validateMappingSet(prisma, dead);
    check(
      "la regla muerta no invalida el conjunto",
      deadResult.valid,
      JSON.stringify(deadResult.issues),
    );

    console.log("\n=== 7. Evento sin estrategia -> sigue siendo VÁLIDO ===");
    const noStrategy = await createSet(ids, [
      { event: "COMPROBANTE_INGRESO", component: "TOTAL", debit: "CAJA", credit: "INGRESO" },
    ]);
    const noStrategyResult = await validateMappingSet(prisma, noStrategy);
    check(
      "configurar por adelantado sigue permitido",
      noStrategyResult.valid,
      JSON.stringify(noStrategyResult.issues),
    );

    console.log("\n=== 8. PLANILLA correcta ===");
    const payrollOk = await createSet(ids, [
      { event: "PLANILLA", component: "PLANILLA_NETO", debit: "GASTO_SALARIO", credit: "SALARIOS_POR_PAGAR" },
      { event: "PLANILLA", component: "PLANILLA_DEDUCCIONES", debit: "GASTO_SALARIO", credit: "RETENCIONES" },
    ]);
    const payrollOkResult = await validateMappingSet(prisma, payrollOk);
    check("válido", payrollOkResult.valid, JSON.stringify(payrollOkResult.issues));

    console.log("\n=== 9. PLANILLA con gasto repartido en dos cuentas -> VÁLIDO ===");
    // No se exige cuenta de débito común: repartir el gasto de salarios entre
    // dos cuentas de gasto es presentación legítima y el repositorio no prueba
    // nada en contra.
    const payrollSplit = await createSet(ids, [
      { event: "PLANILLA", component: "PLANILLA_NETO", debit: "GASTO_SALARIO", credit: "SALARIOS_POR_PAGAR" },
      { event: "PLANILLA", component: "PLANILLA_DEDUCCIONES", debit: "GASTO_SALARIO_CARGAS", credit: "RETENCIONES" },
    ]);
    const payrollSplitResult = await validateMappingSet(prisma, payrollSplit);
    check(
      "el reparto en dos cuentas de gasto no se rechaza",
      payrollSplitResult.valid,
      JSON.stringify(payrollSplitResult.issues),
    );

    console.log("\n=== 10. PLANILLA que se cancela a sí misma -> INVÁLIDO ===");
    const payrollNetting = await createSet(ids, [
      { event: "PLANILLA", component: "PLANILLA_NETO", debit: "GASTO_SALARIO", credit: "SALARIOS_POR_PAGAR" },
      { event: "PLANILLA", component: "PLANILLA_DEDUCCIONES", debit: "SALARIOS_POR_PAGAR", credit: "RETENCIONES" },
    ]);
    const nettingResult = await validateMappingSet(prisma, payrollNetting);
    check("inválido", !nettingResult.valid);
    check(
      "el mensaje explica que el devengado no llegaría al mayor",
      nettingResult.issues.some((issue) => issue.message.includes("devengado")),
      JSON.stringify(nettingResult.issues),
    );

    console.log("\n=== 11. PLANILLA con la cancelación simétrica -> INVÁLIDO ===");
    const payrollNettingSym = await createSet(ids, [
      { event: "PLANILLA", component: "PLANILLA_NETO", debit: "RETENCIONES", credit: "SALARIOS_POR_PAGAR" },
      { event: "PLANILLA", component: "PLANILLA_DEDUCCIONES", debit: "GASTO_SALARIO", credit: "RETENCIONES" },
    ]);
    const symResult = await validateMappingSet(prisma, payrollNettingSym);
    check("inválido", !symResult.valid);
    check(
      "el mensaje habla de cancelación entre componentes",
      symResult.issues.some((issue) => issue.message.includes("cancelarían")),
      JSON.stringify(symResult.issues),
    );

    console.log("\n=== 12. PLANILLA sin el neto -> incompleto ===");
    const payrollNoNet = await createSet(ids, [
      { event: "PLANILLA", component: "PLANILLA_DEDUCCIONES", debit: "GASTO_SALARIO", credit: "RETENCIONES" },
    ]);
    const noNetResult = await validateMappingSet(prisma, payrollNoNet);
    check("inválido", !noNetResult.valid);
    check(
      "el mensaje nombra el neto",
      noNetResult.issues.some((issue) => issue.message.includes("neto")),
      JSON.stringify(noNetResult.issues),
    );

    console.log("\n=== 13. Sin regresión: los mapeos de FF1.4-C/D/E/F siguen válidos ===");
    const ff14c = await createSet(ids, [
      { event: "DOCUMENTO_FACTURA", component: "SUBTOTAL", debit: "CXC", credit: "INGRESO" },
      { event: "DOCUMENTO_FACTURA", component: "RETENCION_1", debit: "RETENCIONES", credit: "CXC" },
      { event: "DOCUMENTO_FACTURA", component: "RETENCION_2", debit: "RETENCIONES", credit: "CXC" },
      { event: "DOCUMENTO_FACTURA", component: "ABONO_APLICADO", debit: "CXP", credit: "CXC" },
      { event: "DOCUMENTO_RECIBO_OFICIAL_CAJA", component: "TOTAL", debit: "CAJA", credit: "CXC" },
    ]);
    check("FF1.4-C válido", (await validateMappingSet(prisma, ff14c)).valid);

    const ff14d = await createSet(ids, [
      { event: "CAJA_FACTURA", component: "SUBTOTAL", debit: "CXC", credit: "INGRESO" },
      { event: "CAJA_FACTURA", component: "RETENCION_1", debit: "RETENCIONES", credit: "CXC" },
      { event: "CAJA_FACTURA", component: "PAGO_EFECTIVO", debit: "CAJA", credit: "CXC" },
      { event: "CAJA_FACTURA", component: "PAGO_TRANSFERENCIA", debit: "CAJA", credit: "CXC" },
      // Recibo mapeado SOLO con PAGO_*: no se le exige TOTAL, que ninguna
      // estrategia emite.
      { event: "CAJA_RECIBO", component: "PAGO_EFECTIVO", debit: "CAJA", credit: "CXC" },
    ]);
    const ff14dResult = await validateMappingSet(prisma, ff14d);
    check("FF1.4-D válido", ff14dResult.valid, JSON.stringify(ff14dResult.issues));

    const ff14e = await createSet(ids, [
      { event: "GASTO", component: "SUBTOTAL", debit: "GASTO_SALARIO", credit: "CXP" },
      { event: "GASTO", component: "RETENCION_1", debit: "CXP", credit: "RETENCIONES" },
      { event: "GASTO", component: "RETENCION_2", debit: "CXP", credit: "RETENCIONES" },
    ]);
    check("FF1.4-E válido", (await validateMappingSet(prisma, ff14e)).valid);

    const ff14f = await createSet(ids, [
      { event: "PLANILLA", component: "PLANILLA_NETO", debit: "GASTO_SALARIO", credit: "SALARIOS_POR_PAGAR" },
      { event: "PLANILLA", component: "PLANILLA_DEDUCCIONES", debit: "GASTO_SALARIO", credit: "RETENCIONES" },
    ]);
    check("FF1.4-F válido", (await validateMappingSet(prisma, ff14f)).valid);

    console.log("\n=== 14. Aislamiento entre eventos ===");
    // Una coincidencia de cuentas ENTRE eventos distintos no debe disparar la
    // regla de planilla.
    const crossEvent = await createSet(ids, [
      { event: "PLANILLA", component: "PLANILLA_NETO", debit: "GASTO_SALARIO", credit: "SALARIOS_POR_PAGAR" },
      { event: "PLANILLA", component: "PLANILLA_DEDUCCIONES", debit: "GASTO_SALARIO", credit: "RETENCIONES" },
      { event: "GASTO", component: "SUBTOTAL", debit: "SALARIOS_POR_PAGAR", credit: "CXP" },
    ]);
    check(
      "un evento no contamina a otro",
      (await validateMappingSet(prisma, crossEvent)).valid,
    );

    console.log("\n=== 15. Activación ===");
    const activatable = await createSet(ids, [
      { event: "GASTO", component: "SUBTOTAL", debit: "GASTO_SALARIO", credit: "CXP" },
    ]);
    const activated = await tryActivate(activatable);
    check("activa un conjunto válido", activated.ok, activated.ok ? "" : activated.error);
    check(
      "queda ACTIVO",
      (await prisma.accountMappingSet.findUniqueOrThrow({ where: { id: activatable } }))
        .status === "ACTIVO",
    );

    console.log("\n=== 16. Activación rechazada y rollback ===");
    const notActivatable = await createSet(ids, [
      { event: "PLANILLA", component: "PLANILLA_NETO", debit: "GASTO_SALARIO", credit: "SALARIOS_POR_PAGAR" },
      { event: "PLANILLA", component: "PLANILLA_DEDUCCIONES", debit: "SALARIOS_POR_PAGAR", credit: "RETENCIONES" },
    ]);
    const rejected = await tryActivate(notActivatable);
    check("rechaza la activación", !rejected.ok, rejected.ok ? "aceptó" : "");
    const after = await prisma.accountMappingSet.findUniqueOrThrow({
      where: { id: notActivatable },
    });
    check("sigue en BORRADOR", after.status === "BORRADOR", after.status);
    check("sin activeBranchKey", after.activeBranchKey === null);
    check("sin activatedAt", after.activatedAt === null);

    console.log("\n=== 17. Activar dos veces ===");
    const twice = await tryActivate(activatable);
    check("segunda activación rechazada", !twice.ok, twice.ok ? "aceptó" : "");

    console.log("\n=== 18. Consistencia final ===");
    const activeSets = await prisma.accountMappingSet.count({
      where: { code: { startsWith: TAG }, status: "ACTIVO" },
    });
    check("un solo conjunto activo", activeSets === 1, String(activeSets));
    check(
      "ningún conjunto inválido quedó activo",
      (
        await Promise.all(
          (
            await prisma.accountMappingSet.findMany({
              where: { code: { startsWith: TAG }, status: "ACTIVO" },
              select: { id: true },
            })
          ).map((set) => validateMappingSet(prisma, set.id)),
        )
      ).every((result) => result.valid),
    );
  } finally {
    await cleanup(ids);
    console.log(`\nRESULTADO SMOKE-FF1.5-A: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
