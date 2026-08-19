// MotoMas database seed
//
// Run with a reachable PostgreSQL instance and DATABASE_URL configured:
//   npm run prisma:migrate
//   npm run prisma:seed
//
// This seed preserves real branch/catalog data and creates only an optional
// bootstrap Admin from environment variables. It does not create demo users or
// fake physical motorcycle inventory units.

import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const PENDING_CATALOG_INFO = "Información pendiente de completar";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  }).toString("hex");
  return `${salt}:${derived}`;
}

function branchCodeFromName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const branchNames = [
  "Bello Horizonte",
  "Bonanza",
  "Ciudad Sandino",
  "Masaya",
  "Mercedes",
  "Central",
  "Multicentro",
  "Rosita",
  "Suburbana",
  "Granada",
  "Carretera Masaya",
  "Coyotepe",
];

const branches = branchNames.map((name) => ({
  code: branchCodeFromName(name),
  name,
  isActive: true,
}));

// Patch POS1.1-B declared `PosWarehouse` unique per branch, precisely so the
// same code can exist in Granada and in Rosita. `PRINCIPAL` is the code the
// schema itself uses as that example.
const posDefaultWarehouse = { code: "PRINCIPAL", name: "Bodega principal" };

const catalogModels = [
  { slug: "bajaj-pulsar-ns200", brand: "Bajaj", model: "Pulsar NS200", year: 2026 },
  { slug: "bajaj-boxer-ct-100", brand: "Bajaj", model: "Boxer CT 100", year: 2026 },
  { slug: "bajaj-dominar-250", brand: "Bajaj", model: "Dominar 250", year: 2026 },
  { slug: "boxer-150", brand: PENDING_CATALOG_INFO, model: "Boxer 150", imageUrl: "/catalog/motorcycles/boxer-150.jpeg" },
  { slug: "ct-125", brand: PENDING_CATALOG_INFO, model: "CT 125", imageUrl: "/catalog/motorcycles/ct-125.jpeg" },
  { slug: "pulsar-150", brand: PENDING_CATALOG_INFO, model: "Pulsar 150", imageUrl: "/catalog/motorcycles/pulsar-150.jpeg" },
  { slug: "pulsar-n150", brand: PENDING_CATALOG_INFO, model: "Pulsar N150", imageUrl: "/catalog/motorcycles/pulsar-n150.jpeg" },
  { slug: "pulsar-n160", brand: PENDING_CATALOG_INFO, model: "Pulsar N160", imageUrl: "/catalog/motorcycles/pulsar-n160.jpeg" },
  { slug: "pulsar-ns125fi", brand: PENDING_CATALOG_INFO, model: "Pulsar NS125FI", imageUrl: "/catalog/motorcycles/pulsar-ns125fi.jpeg" },
  { slug: "pulsar-ns125ls", brand: PENDING_CATALOG_INFO, model: "Pulsar NS125LS", imageUrl: "/catalog/motorcycles/pulsar-ns125ls.jpeg" },
  { slug: "pulsar-ns125ug", brand: PENDING_CATALOG_INFO, model: "Pulsar NS125UG", imageUrl: "/catalog/motorcycles/pulsar-ns125ug.jpeg" },
  { slug: "pulsar-ns160", brand: PENDING_CATALOG_INFO, model: "Pulsar NS160", imageUrl: "/catalog/motorcycles/pulsar-ns160.jpeg" },
  { slug: "pulsar-ns200fi", brand: PENDING_CATALOG_INFO, model: "Pulsar NS200FI", imageUrl: "/catalog/motorcycles/pulsar-ns200fi.jpeg" },
];

const developmentUserEmails = [
  "admin@motomas.local",
  "gerente@motomas.local",
  "vendedor@motomas.local",
  "cajero@motomas.local",
  "contador@motomas.local",
];

function readBootstrapAdmin() {
  const name = process.env.MOTOMAS_ADMIN_NAME?.trim();
  const email = process.env.MOTOMAS_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.MOTOMAS_ADMIN_PASSWORD;

  if (!name || !email || !password) return null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("MOTOMAS_ADMIN_EMAIL must be a valid email address.");
  }
  if (password.length < 8) {
    throw new Error("MOTOMAS_ADMIN_PASSWORD must have at least 8 characters.");
  }

  return { name, email, password };
}

async function seedBranches() {
  console.log("Seeding real branches...");
  for (const branch of branches) {
    await prisma.branch.upsert({
      where: { code: branch.code },
      update: { name: branch.name, isActive: true },
      create: branch,
    });
  }
}

/**
 * One POS warehouse per branch. Checkout consumes stock from a warehouse, so
 * `PosCartPanel` keeps the charge button disabled while the branch has none —
 * and creating a warehouse has no screen yet (P-38), which left a freshly
 * migrated database unable to register a single counter sale.
 *
 * This provisions the warehouse only. **It does not open any `PosInventory`
 * balance**: a balance is a per-product fact that `openPosInventoryAction`
 * creates from the terminal, and inventing opening quantities here would be
 * inventing stock the business never received.
 *
 * `@@unique([branchId, code])` is what makes the upsert idempotent. The update
 * branch is deliberately empty: a warehouse renamed or deactivated through
 * `updatePosWarehouseAction` is an operator decision, and re-running the seed
 * must not overwrite it.
 */
async function seedPosWarehouses() {
  console.log("Seeding default POS warehouse per branch...");
  const seededBranches = await prisma.branch.findMany({
    where: { code: { in: branches.map((branch) => branch.code) } },
    select: { id: true },
  });

  for (const branch of seededBranches) {
    await prisma.posWarehouse.upsert({
      where: {
        branchId_code: { branchId: branch.id, code: posDefaultWarehouse.code },
      },
      update: {},
      // `isActive` is left to the schema default (true), exactly as
      // `createPosWarehouseAction` and e2e/fixtures.ts do.
      create: {
        branchId: branch.id,
        code: posDefaultWarehouse.code,
        name: posDefaultWarehouse.name,
      },
    });
  }
}

async function seedBootstrapAdmin() {
  const admin = readBootstrapAdmin();
  if (!admin) {
    console.warn(
      "Bootstrap Admin not created: define MOTOMAS_ADMIN_NAME, MOTOMAS_ADMIN_EMAIL and MOTOMAS_ADMIN_PASSWORD before seeding a production database.",
    );
    return;
  }

  console.log("Seeding bootstrap Admin from MOTOMAS_ADMIN_* environment variables...");
  await prisma.user.upsert({
    where: { email: admin.email },
    update: {
      name: admin.name,
      passwordHash: hashPassword(admin.password),
      role: "ADMIN",
      branchId: null,
      isActive: true,
    },
    create: {
      name: admin.name,
      email: admin.email,
      passwordHash: hashPassword(admin.password),
      role: "ADMIN",
      branchId: null,
      isActive: true,
    },
  });
}

async function seedCatalogModels() {
  console.log("Seeding motorcycle catalog models...");
  for (const model of catalogModels) {
    await prisma.motorcycleCatalogModel.upsert({
      where: { slug: model.slug },
      update: {
        brand: model.brand,
        model: model.model,
        year: model.year ?? null,
        imageUrl: model.imageUrl ?? null,
        isActive: true,
      },
      create: model,
    });
  }
}

async function warnAboutLegacyDemoRows() {
  const demoUnits = await prisma.motorcycleUnit.findMany({
    where: {
      OR: [
        { chassisNumber: { startsWith: "CH-DEMO-" } },
        { engineNumber: { startsWith: "EN-DEMO-" } },
      ],
    },
    select: { id: true },
  });
  if (demoUnits.length) {
    console.warn(
      `Manual cleanup pending: ${demoUnits.length} existing demo motorcycle unit(s) with CH-DEMO/EN-DEMO identifiers remain in the database. Seed will not delete rows automatically.`,
    );
  }

  const demoUsers = await prisma.user.findMany({
    where: { email: { in: developmentUserEmails } },
    select: { id: true },
  });
  if (demoUsers.length) {
    console.warn(
      `Manual cleanup pending: ${demoUsers.length} existing development user(s) remain in the database. Seed will not delete rows automatically.`,
    );
  }
}

async function main() {
  await seedBranches();
  // After the branches: a warehouse cannot exist without one.
  await seedPosWarehouses();
  await seedBootstrapAdmin();
  await seedCatalogModels();
  console.log("Skipping physical motorcycle units: no real chassis, model, branch and entry date inventory was provided.");
  await warnAboutLegacyDemoRows();
  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
