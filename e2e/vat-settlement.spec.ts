import { expect, test, type Page } from "@playwright/test";

import {
  E2E_PERIOD_PREFIX,
  MAPPED_BRANCH_CODE,
  TAG,
  UNMAPPED_BRANCH_CODE,
  prisma,
} from "./fixtures";

/**
 * SUITE-FF2.1-D — liquidación de IVA, a través de la interfaz real.
 *
 * La liquidación se identifica por **sucursal + período**, no por id, así que
 * cada prueba usa un período propio dentro del año reservado a la suite. Esa es
 * también la identidad de la clave de idempotencia del motor, de modo que un
 * período por prueba garantiza aislamiento en ambos lados.
 *
 * El importe **no se calcula**: FF2.0-E documenta en §L-10 que la liquidación
 * registra una decisión humana. Ninguna prueba espera que el sistema lo derive.
 */
test.describe.configure({ mode: "serial" });

const LIQUIDACIONES = "/panel/contabilidad/liquidaciones";

let periodCounter = 0;
/** Período único por prueba, dentro del año reservado. */
function nextPeriod() {
  periodCounter += 1;
  return `${E2E_PERIOD_PREFIX}${String(periodCounter).padStart(2, "0")}`;
}

async function openPanel(page: Page) {
  await page.goto(LIQUIDACIONES);
  await expect(page.getByText("Registrar liquidación").first()).toBeVisible({
    timeout: 45_000,
  });
  // La fila existe en el HTML del servidor antes de que React enganche: pulsar
  // en esa ventana pierde la acción en silencio.
  await page.waitForLoadState("networkidle");
}

/**
 * El alta y los filtros comparten la palabra «sucursal» en sus etiquetas, así
 * que toda interacción de alta se ancla al formulario.
 */
async function createSettlement(
  page: Page,
  input: { period: string; amount: string; branchCode?: string; notes?: string },
) {
  await openPanel(page);
  const form = page.getByTestId("settlement-create-form");
  await form
    .getByLabel("Sucursal")
    .selectOption({ value: input.branchCode ?? MAPPED_BRANCH_CODE });
  await form.getByLabel("Período").fill(input.period);
  await form.getByLabel("Monto").fill(input.amount);
  if (input.notes) {
    await form.getByLabel("Notas").fill(input.notes);
  }
  await form.getByRole("button", { name: "Registrar liquidación" }).click();
}

function settlementRow(page: Page, period: string) {
  return page.getByTestId("settlement-row").filter({ hasText: period });
}

async function stored(period: string) {
  return prisma.vatSettlement.findFirstOrThrow({ where: { period } });
}

/**
 * Espera a que la base refleje el estado. Si el servidor rechazó, devuelve su
 * mensaje para que la prueba falle diciendo por qué y no por agotar el tiempo.
 */
async function expectStored(
  page: Page,
  period: string,
  read: (row: Record<string, unknown>) => unknown,
  expected: unknown,
) {
  await expect
    .poll(
      async () => {
        const notice = page.getByTestId("conta-error");
        if (await notice.count()) return `RECHAZADO: ${await notice.innerText()}`;
        const row = await prisma.vatSettlement.findFirst({ where: { period } });
        if (!row) return "SIN FILA";
        return read(row as unknown as Record<string, unknown>);
      },
      { timeout: 45_000 },
    )
    .toBe(expected);
}

/** Pulsa una acción de la fila sobre una lista ya hidratada. */
async function clickRowAction(page: Page, period: string, label: string) {
  await page.reload();
  await page.waitForLoadState("networkidle");
  const row = settlementRow(page, period);
  await expect(row).toBeVisible({ timeout: 45_000 });
  await row.getByRole("button", { name: label, exact: true }).click();
}

test("crea un borrador", async ({ page }) => {
  const period = nextPeriod();
  await createSettlement(page, { period, amount: "12500", notes: "Declaración" });

  await expectStored(page, period, (row) => row.status, "BORRADOR");
  const row = await stored(period);
  expect(Number(row.amount)).toBe(12500);
  expect(row.executedAt).toBeNull();

  await expect(settlementRow(page, period)).toBeVisible();
  // La identidad visible es sucursal + período, nunca el id.
  await expect(settlementRow(page, period)).not.toContainText(row.id);
});

test("muestra quién la registró y que está pendiente", async ({ page }) => {
  const period = nextPeriod();
  await createSettlement(page, { period, amount: "500" });
  await expectStored(page, period, (row) => row.status, "BORRADOR");

  await page.reload();
  const row = settlementRow(page, period);
  await expect(row).toContainText(`${TAG} Contador`);
  await expect(row).toContainText("Pendiente de ejecutar");
});

test("edita el monto de un borrador", async ({ page }) => {
  const period = nextPeriod();
  await createSettlement(page, { period, amount: "1000" });
  await expectStored(page, period, (row) => Number(row.amount), 1000);

  await clickRowAction(page, period, "Editar");
  const editor = page.getByTestId("settlement-editor");
  await expect(editor).toBeVisible();
  await editor.getByLabel("Monto").fill("2500");
  await editor.getByRole("button", { name: "Guardar cambios" }).click();

  await expectStored(page, period, (row) => Number(row.amount), 2500);
});

test("rechaza un duplicado de sucursal y período", async ({ page }) => {
  const period = nextPeriod();
  await createSettlement(page, { period, amount: "300" });
  await expectStored(page, period, (row) => row.status, "BORRADOR");

  await createSettlement(page, { period, amount: "400" });
  await expect(page.getByTestId("conta-error")).toContainText(/sucursal y período/i, {
    timeout: 20_000,
  });
  // El monto original no cambió.
  const rows = await prisma.vatSettlement.findMany({ where: { period } });
  expect(rows).toHaveLength(1);
  expect(Number(rows[0]!.amount)).toBe(300);
});

test("rechaza un período malformado", async ({ page }) => {
  await createSettlement(page, { period: "2031-13", amount: "100" });
  await expect(page.getByTestId("conta-error")).toBeVisible({ timeout: 20_000 });
  expect(
    await prisma.vatSettlement.count({ where: { period: "2031-13" } }),
  ).toBe(0);
});

test("ejecutar produce el asiento y sella al ejecutor", async ({ page }) => {
  const period = nextPeriod();
  await createSettlement(page, { period, amount: "12500" });
  await expectStored(page, period, (row) => row.status, "BORRADOR");

  await clickRowAction(page, period, "Ejecutar");
  await expectStored(page, period, (row) => row.status, "EJECUTADA");

  const row = await stored(period);
  expect(row.executedAt).not.toBeNull();
  expect(row.executedByUserId).not.toBeNull();

  // El asiento: debita el pasivo de IVA y acredita el banco.
  const record = await prisma.postingRecord.findFirstOrThrow({
    where: {
      sourceType: "VAT_SETTLEMENT",
      sourceId: `${row.branchId}:${period}`,
      status: "CONTABILIZADO",
    },
  });
  const entry = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: record.journalEntryId },
    include: { lines: { include: { account: true } } },
  });
  expect(entry.lines).toHaveLength(2);
  const iva = entry.lines.find((line) => line.account.code.endsWith("IVA_POR_PAGAR"));
  expect(Number(iva!.debit)).toBe(12500);
  const banco = entry.lines.find((line) => line.account.code.endsWith("-BANCO"));
  expect(Number(banco!.credit)).toBe(12500);

  // La pantalla muestra ejecutor y fecha.
  await page.reload();
  const visible = settlementRow(page, period);
  await expect(visible).toContainText("Ejecutada por");
  await expect(visible).toContainText(`${TAG} Contador`);
});

test("una liquidación ejecutada no ofrece editar ni ejecutar", async ({ page }) => {
  const period = nextPeriod();
  await createSettlement(page, { period, amount: "700" });
  await expectStored(page, period, (row) => row.status, "BORRADOR");
  await clickRowAction(page, period, "Ejecutar");
  await expectStored(page, period, (row) => row.status, "EJECUTADA");

  await page.reload();
  const row = settlementRow(page, period);
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Editar", exact: true })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Ejecutar", exact: true })).toHaveCount(0);
});

test("sin mapeo de liquidación, ejecutar falla y no deja nada", async ({ page }) => {
  const period = nextPeriod();
  await createSettlement(page, {
    period,
    amount: "800",
    branchCode: UNMAPPED_BRANCH_CODE,
  });
  await expectStored(page, period, (row) => row.status, "BORRADOR");

  await clickRowAction(page, period, "Ejecutar");
  await expect(page.getByText(/mapeo contable activo/i).first()).toBeVisible({
    timeout: 20_000,
  });

  const row = await stored(period);
  expect(row.status).toBe("BORRADOR");
  const record = await prisma.postingRecord.findFirst({
    where: { sourceType: "VAT_SETTLEMENT", sourceId: `${row.branchId}:${period}` },
  });
  expect(record).toBeNull();
});

test("un conjunto de mapeo archivado bloquea la ejecución", async ({ page }) => {
  const period = nextPeriod();
  await createSettlement(page, { period, amount: "900" });
  await expectStored(page, period, (row) => row.status, "BORRADOR");

  await prisma.accountMappingSet.updateMany({
    where: { code: `${TAG}-A` },
    data: { status: "ARCHIVADO", activeBranchKey: null, archivedAt: new Date() },
  });

  try {
    await clickRowAction(page, period, "Ejecutar");
    await expect(page.getByText(/mapeo contable activo/i).first()).toBeVisible({
      timeout: 20_000,
    });
    expect((await stored(period)).status).toBe("BORRADOR");
  } finally {
    const branch = await prisma.branch.findFirstOrThrow({
      where: { code: MAPPED_BRANCH_CODE },
    });
    await prisma.accountMappingSet.updateMany({
      where: { code: `${TAG}-A` },
      data: { status: "ACTIVO", activeBranchKey: branch.id, archivedAt: null },
    });
  }
});

test("un período contable cerrado bloquea la ejecución", async ({ page }) => {
  const period = nextPeriod();
  await createSettlement(page, { period, amount: "600" });
  await expectStored(page, period, (row) => row.status, "BORRADOR");

  const branch = await prisma.branch.findFirstOrThrow({
    where: { code: MAPPED_BRANCH_CODE },
  });
  const user = await prisma.user.findFirstOrThrow({
    where: { email: { startsWith: TAG.toLowerCase() } },
  });
  await prisma.accountingClosing.create({
    data: {
      branchId: branch.id,
      period,
      status: "CERRADO",
      closedByUserId: user.id,
      closedAt: new Date(),
    },
  });

  try {
    await clickRowAction(page, period, "Ejecutar");
    await expect(page.getByTestId("conta-error")).toBeVisible({ timeout: 20_000 });
    expect((await stored(period)).status).toBe("BORRADOR");
  } finally {
    await prisma.accountingClosing.deleteMany({
      where: { branchId: branch.id, period },
    });
  }
});

test("la liquidación persiste tras recargar", async ({ page }) => {
  const period = nextPeriod();
  await createSettlement(page, { period, amount: "3400", notes: "Nota persistente" });
  await expectStored(page, period, (row) => Number(row.amount), 3400);

  await page.reload();
  const row = settlementRow(page, period);
  await expect(row).toBeVisible();
  await expect(row.getByTestId("settlement-amount")).toContainText("3,400.00");
  await expect(row).toContainText("Nota persistente");
});

test("el filtro por período acota la lista", async ({ page }) => {
  const period = nextPeriod();
  await createSettlement(page, { period, amount: "150" });
  await expectStored(page, period, (row) => row.status, "BORRADOR");

  await page.reload();
  await page.waitForLoadState("networkidle");
  const before = await page.getByTestId("settlement-row").count();
  expect(before).toBeGreaterThan(1);

  await page.getByLabel("Filtrar por período").fill(period);
  await expect(page.getByTestId("settlement-row")).toHaveCount(1);
  await expect(settlementRow(page, period)).toBeVisible();
});

test("el panel es usable en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPanel(page);

  await expect(page.getByTestId("settlement-create-form").getByLabel("Período")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("los campos están etiquetados y son alcanzables con teclado", async ({ page }) => {
  await openPanel(page);

  const form = page.getByTestId("settlement-create-form");
  const period = form.getByLabel("Período");
  await expect(period).toBeVisible();
  await period.focus();
  await page.keyboard.press("Tab");
  await expect(form.getByLabel("Monto")).toBeFocused();
  await page.keyboard.type("999");
  await expect(form.getByLabel("Monto")).toHaveValue("999");
});
