// MotoMas — database seed (Patch 3.0)
//
// Run with a reachable PostgreSQL instance and DATABASE_URL configured:
//   npm run prisma:migrate     (creates the tables)
//   npm run prisma:seed        (this script)
//
// Development credentials seeded below are for local/dev only. Change them
// before any production deployment. The password hashing scheme here is kept
// identical to src/server/auth/password.ts.

import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const prisma = new PrismaClient();

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  }).toString("hex");
  return `${salt}:${derived}`;
}

// Documented development password for every seeded account.
const DEV_PASSWORD = "Motomas.2026";

const branches = [
  { code: "plaza-inter", name: "Plaza Inter", address: "Managua", phone: "" },
  { code: "rubenia", name: "Rubenia", address: "Managua", phone: "" },
  { code: "masaya", name: "Masaya", address: "Masaya", phone: "" },
];

const catalogModels = [
  { slug: "bajaj-pulsar-ns200", brand: "Bajaj", model: "Pulsar NS200", year: 2026 },
  { slug: "bajaj-boxer-ct-100", brand: "Bajaj", model: "Boxer CT 100", year: 2026 },
  { slug: "bajaj-dominar-250", brand: "Bajaj", model: "Dominar 250", year: 2026 },
];

async function main() {
  console.log("Seeding branches...");
  const branchByCode = {};
  for (const branch of branches) {
    const record = await prisma.branch.upsert({
      where: { code: branch.code },
      update: { name: branch.name, address: branch.address, phone: branch.phone },
      create: branch,
    });
    branchByCode[branch.code] = record;
  }

  console.log("Seeding users...");
  const passwordHash = hashPassword(DEV_PASSWORD);
  const users = [
    { name: "Administrador General", email: "admin@motomas.local", role: "ADMIN", branchCode: null },
    { name: "Gerente Plaza Inter", email: "gerente@motomas.local", role: "GERENTE", branchCode: "plaza-inter" },
    { name: "Vendedor Plaza Inter", email: "vendedor@motomas.local", role: "VENDEDOR", branchCode: "plaza-inter" },
    { name: "Cajero Plaza Inter", email: "cajero@motomas.local", role: "CAJERO", branchCode: "plaza-inter" },
    { name: "Contador General", email: "contador@motomas.local", role: "CONTADOR", branchCode: null },
  ];
  const userByEmail = {};
  for (const user of users) {
    const branchId = user.branchCode ? branchByCode[user.branchCode].id : null;
    const record = await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, branchId, isActive: true },
      create: {
        name: user.name,
        email: user.email,
        role: user.role,
        branchId,
        passwordHash,
        isActive: true,
      },
    });
    userByEmail[user.email] = record;
  }
  const adminUser = userByEmail["admin@motomas.local"];

  console.log("Seeding catalog models...");
  const modelBySlug = {};
  for (const model of catalogModels) {
    const record = await prisma.motorcycleCatalogModel.upsert({
      where: { slug: model.slug },
      update: { brand: model.brand, model: model.model, year: model.year },
      create: model,
    });
    modelBySlug[model.slug] = record;
  }

  console.log("Seeding motorcycle units + ingress movements...");
  const units = [
    { chassisNumber: "CH-DEMO-0001", engineNumber: "EN-DEMO-0001", color: "Negro", branchCode: "plaza-inter", slug: "bajaj-pulsar-ns200" },
    { chassisNumber: "CH-DEMO-0002", engineNumber: "EN-DEMO-0002", color: "Rojo", branchCode: "rubenia", slug: "bajaj-boxer-ct-100" },
    { chassisNumber: "CH-DEMO-0003", engineNumber: "EN-DEMO-0003", color: "Azul", branchCode: "masaya", slug: "bajaj-dominar-250" },
  ];
  for (const unit of units) {
    const model = modelBySlug[unit.slug];
    const branch = branchByCode[unit.branchCode];
    const existing = await prisma.motorcycleUnit.findUnique({
      where: { chassisNumber: unit.chassisNumber },
    });
    if (existing) continue;
    const created = await prisma.motorcycleUnit.create({
      data: {
        catalogModelId: model.id,
        branchId: branch.id,
        name: `${model.brand} ${model.model}`,
        brand: model.brand,
        model: model.model,
        year: model.year ?? 2026,
        chassisNumber: unit.chassisNumber,
        engineNumber: unit.engineNumber,
        color: unit.color,
        entryDate: new Date(),
        status: "AVAILABLE",
      },
    });
    await prisma.inventoryMovement.create({
      data: {
        motorcycleUnitId: created.id,
        branchId: branch.id,
        type: "INGRESO",
        reason: "Alta inicial de inventario (seed)",
        notes: "Unidad demo creada por el seed de Patch 3.0.",
        createdByUserId: adminUser.id,
      },
    });
  }

  // Sanity check: verify the seeded password validates against the scheme.
  const [salt, derived] = passwordHash.split(":");
  const check = scryptSync(DEV_PASSWORD, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  if (!timingSafeEqual(check, Buffer.from(derived, "hex"))) {
    throw new Error("Password hashing self-check failed.");
  }

  console.log("Seed complete.");
  console.log(`Development password for all seeded accounts: ${DEV_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
