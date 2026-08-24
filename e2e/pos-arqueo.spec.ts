import { expect, test, type Page } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, prisma } from "./fixtures";

/**
 * SUITE-CB4-B — la revisión del arqueo del mostrador.
 *
 * **Corre con la sesión administrativa a propósito.** `canReviewCaja` excluye al
 * cajero: contar el dinero y aprobar la cuenta son actos distintos, y esa
 * separación es del repositorio, no de este parche. Que esta suite necesite otro
 * arranque de sesión que `pos-caja.spec.ts` es la prueba más simple de que la
 * frontera existe.
 *
 * Siembra sus turnos cerrados por Prisma: lo que se mide aquí es la revisión, no
 * el cierre —que ya prueba SUITE-CB4-B en el terminal—.
 */
test.describe.configure({ mode: "serial" });

const ARQUEOS = "/panel/pos/caja";
const MARCA = `${TAG}-ARQ`;

let shiftId = "";

async function cleanup() {
  await prisma.posCashMovement.deleteMany({
    where: { shift: { notes: { startsWith: MARCA } } },
  });
  await prisma.posCashShift.deleteMany({ where: { notes: { startsWith: MARCA } } });
  await prisma.posOperator.deleteMany({
    where: { username: { startsWith: MARCA.toLowerCase() } },
  });
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await cleanup();

  const branch = await prisma.branch.findFirstOrThrow({
    where: { code: MAPPED_BRANCH_CODE },
  });
  const user = await prisma.user.findFirstOrThrow({
    where: { email: { startsWith: TAG.toLowerCase() } },
  });
  const operator = await prisma.posOperator.create({
    data: {
      username: `${MARCA.toLowerCase()}-op`,
      passwordHash: "x",
      userId: user.id,
      branchId: branch.id,
    },
  });

  // Un turno **cerrado con faltante**: es el caso que un supervisor mira.
  const closed = await prisma.posCashShift.create({
    data: {
      branchId: branch.id,
      operatorId: operator.id,
      openedByUserId: user.id,
      status: "CERRADO",
      openingFloat: 2000,
      openedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      closedAt: new Date(Date.now() - 60 * 60 * 1000),
      cashSalesTotal: 8500,
      cashInTotal: 500,
      cashOutTotal: 1200,
      expectedCash: 9800,
      countedCash: 9650,
      difference: -150,
      notes: MARCA,
    },
  });
  shiftId = closed.id;
});

test.afterAll(async () => {
  await cleanup();
});

async function openArqueos(page: Page) {
  await page.goto(ARQUEOS);
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Arqueos de caja" }),
  ).toBeVisible({ timeout: 45_000 });
}

test("el supervisor ve el turno cerrado con sus cifras congeladas", async ({
  page,
}) => {
  await openArqueos(page);
  const card = page.getByTestId("pos-arqueo").filter({ hasText: MARCA.toLowerCase() });
  await expect(card).toBeVisible({ timeout: 20_000 });

  // Las cifras son las guardadas, no una derivación nueva.
  await expect(card).toContainText("9,800.00");
  await expect(card).toContainText("9,650.00");
  await expect(card.getByTestId("pos-arqueo-diferencia")).toContainText("-150.00");
});

test("un turno sin revisar se marca como tal", async ({ page }) => {
  await openArqueos(page);
  const card = page.getByTestId("pos-arqueo").filter({ hasText: MARCA.toLowerCase() });
  await expect(card).toContainText("Sin revisar");
  await expect(card.getByTestId("pos-arqueo-revisar")).toBeVisible();
});

test("revisar el arqueo lo persiste con su autor", async ({ page }) => {
  await openArqueos(page);
  const card = page.getByTestId("pos-arqueo").filter({ hasText: MARCA.toLowerCase() });
  await card.getByTestId("pos-arqueo-revisar").click();
  await page.getByTestId("pos-arqueo-notas").fill("Faltante justificado");
  await page.getByTestId("pos-arqueo-confirmar").click();

  await expect(card).toContainText("Revisado", { timeout: 30_000 });

  // **Contra la base.**
  const shift = await prisma.posCashShift.findUniqueOrThrow({
    where: { id: shiftId },
  });
  expect(shift.reviewedAt).not.toBeNull();
  expect(shift.reviewedByUserId).not.toBeNull();
  expect(shift.reviewNotes).toBe("Faltante justificado");
  // El estado del turno **no cambia**: la revisión anota, no reabre ni recierra.
  expect(shift.status).toBe("CERRADO");
});

test("la revisión no toca las cifras del arqueo", async ({ page }) => {
  await openArqueos(page);
  const shift = await prisma.posCashShift.findUniqueOrThrow({
    where: { id: shiftId },
  });
  expect(Number(shift.expectedCash)).toBe(9800);
  expect(Number(shift.countedCash)).toBe(9650);
  expect(Number(shift.difference)).toBe(-150);
});

test("un turno ya revisado no ofrece revisarse otra vez", async ({ page }) => {
  await openArqueos(page);
  const card = page.getByTestId("pos-arqueo").filter({ hasText: MARCA.toLowerCase() });
  await expect(card.getByTestId("pos-arqueo-revisar")).toHaveCount(0);
});
