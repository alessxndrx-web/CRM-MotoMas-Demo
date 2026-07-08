// Temporary smoke-test script for Patch 3.0.1C — deleted after use.
// Exercises the DB-backed inventory behaviors against the real PostgreSQL
// database. All write tests run inside interactive transactions that are
// rolled back (via a sentinel throw), so NO seed data is modified.
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const ROLLBACK = "ROLLBACK_SENTINEL";
const results = [];
function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} :: ${name}${detail ? " :: " + detail : ""}`);
}

async function rolledBack(fn) {
  try {
    await prisma.$transaction(async (tx) => {
      await fn(tx);
      throw new Error(ROLLBACK);
    });
  } catch (error) {
    if (error.message !== ROLLBACK) throw error;
  }
}

async function main() {
  // --- Connection + seeded users ---
  const roleCounts = await prisma.user.groupBy({ by: ["role"], _count: { _all: true } });
  const byRole = Object.fromEntries(roleCounts.map((r) => [r.role, r._count._all]));
  record("DB connection + users query", true, JSON.stringify(byRole));
  for (const role of ["ADMIN", "GERENTE", "VENDEDOR", "CAJERO", "CONTADOR"]) {
    record(`seeded user role present: ${role}`, (byRole[role] ?? 0) >= 1, `count=${byRole[role] ?? 0}`);
  }

  const branch = await prisma.branch.findUnique({ where: { code: "plaza-inter" } });
  const model = await prisma.motorcycleCatalogModel.findFirst();
  const admin = await prisma.user.findUnique({ where: { email: "admin@motomas.local" } });
  if (!branch || !admin) throw new Error("Missing seeded branch/admin for tests");

  // --- Ingress effect: creates MotorcycleUnit + INGRESO movement ---
  await rolledBack(async (tx) => {
    const unit = await tx.motorcycleUnit.create({
      data: {
        catalogModelId: model?.id ?? null,
        branchId: branch.id,
        name: "SMOKE Ingress Unit",
        brand: "Bajaj",
        model: "Pulsar NS200",
        year: 2026,
        chassisNumber: "SMOKE-ING-0001",
        engineNumber: "SMOKE-ENG-0001",
        color: "Negro",
        entryDate: new Date(),
        status: "AVAILABLE",
      },
    });
    const mv = await tx.inventoryMovement.create({
      data: {
        motorcycleUnitId: unit.id,
        branchId: branch.id,
        type: "INGRESO",
        reason: "Ingreso de unidad al inventario",
        createdByUserId: admin.id,
      },
    });
    record("ingress creates AVAILABLE unit", unit.status === "AVAILABLE", `unit=${unit.chassisNumber}`);
    record("ingress creates INGRESO movement", mv.type === "INGRESO", `movement=${mv.id.slice(0, 8)}`);
  });

  // --- Duplicate chassisNumber blocked (unique constraint P2002) ---
  await rolledBack(async (tx) => {
    await tx.motorcycleUnit.create({
      data: {
        branchId: branch.id, name: "dup A", brand: "Bajaj", model: "X", year: 2026,
        chassisNumber: "SMOKE-DUP-0001", entryDate: new Date(), status: "AVAILABLE",
      },
    });
    let blocked = false;
    let code = "";
    try {
      await tx.motorcycleUnit.create({
        data: {
          branchId: branch.id, name: "dup B", brand: "Bajaj", model: "X", year: 2026,
          chassisNumber: "SMOKE-DUP-0001", entryDate: new Date(), status: "AVAILABLE",
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        blocked = error.code === "P2002";
        code = error.code;
      }
    }
    record("duplicate chassisNumber blocked at DB (P2002)", blocked, `code=${code}`);
    // Throw to roll back the first insert too.
    throw new Error(ROLLBACK);
  }).catch((e) => { if (e.message !== ROLLBACK) throw e; });

  // --- Egress effect: updates status + exitDate + EGRESO movement ---
  const seededUnit = await prisma.motorcycleUnit.findFirst({ where: { status: "AVAILABLE" } });
  if (seededUnit) {
    await rolledBack(async (tx) => {
      const exitDate = new Date();
      const updated = await tx.motorcycleUnit.update({
        where: { id: seededUnit.id },
        data: { status: "SOLD", exitDate },
      });
      const mv = await tx.inventoryMovement.create({
        data: {
          motorcycleUnitId: seededUnit.id,
          branchId: seededUnit.branchId,
          type: "VENTA",
          reason: "Egreso: Venta",
          createdByUserId: admin.id,
          date: exitDate,
        },
      });
      record("egress updates status", updated.status === "SOLD", `status=${updated.status}`);
      record("egress sets exitDate", updated.exitDate !== null, `exitDate set`);
      record("egress creates movement", mv.type === "VENTA", `movement=${mv.type}`);
    });
    // Confirm rollback left the seeded unit untouched.
    const after = await prisma.motorcycleUnit.findUnique({ where: { id: seededUnit.id } });
    record("rollback left seeded unit AVAILABLE (no data mutated)", after.status === "AVAILABLE" && after.exitDate === null);
  } else {
    record("egress effect test", false, "no AVAILABLE seeded unit found");
  }

  // --- "Already exited" guard is app logic: simulate the check ---
  const guard = (status, exitDate) =>
    exitDate !== null || ["EXITED", "SOLD", "DELIVERED", "CANCELLED"].includes(status);
  record("guard blocks already-exited (SOLD)", guard("SOLD", null) === true);
  record("guard blocks already-exited (with exitDate)", guard("AVAILABLE", new Date()) === true);
  record("guard allows AVAILABLE unit", guard("AVAILABLE", null) === false);

  const failed = results.filter((r) => !r.pass);
  console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("FAILURES: " + failed.map((f) => f.name).join("; "));
    process.exitCode = 1;
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
