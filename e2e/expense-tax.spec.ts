import { expect, test, type Page } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, UNMAPPED_BRANCH_CODE, prisma } from "./fixtures";

/**
 * SUITE-FF2.1-A — el impuesto de gastos, a través de la interfaz real.
 *
 * Cada prueba maneja el navegador contra la aplicación viva y verifica el
 * resultado **en la base de datos**, no solo en pantalla: una interfaz que
 * muestra el total correcto y guarda otro seguiría estando rota.
 *
 * Serial por diseño: comparten sucursal, mapeo y el bloqueo de período, que es
 * mensual y global.
 */
test.describe.configure({ mode: "serial" });

const GASTOS = "/panel/contabilidad/gastos";

/** Nombre único por prueba, para no depender del orden ni de la limpieza ajena. */
function supplierFor(name: string) {
  return `${TAG}-${name}-${Date.now()}`;
}

async function openForm(page: Page, branchCode: string) {
  await page.goto(GASTOS);
  // Holgura explícita: en desarrollo la ruta puede recompilarse tras un cambio.
  await expect(page.getByRole("heading", { name: "Gastos" }).first()).toBeVisible({
    timeout: 45_000,
  });
  const form = page.locator("form, div").filter({ hasText: "Registrar gasto" }).last();
  await page.getByLabel("Sucursal").selectOption({ value: branchCode });
  return form;
}

async function fillExpense(
  page: Page,
  input: {
    supplier: string;
    concept?: string;
    subtotal: string;
    tax?: string;
    retention1?: string;
  },
) {
  await page.getByLabel("Proveedor").first().fill(input.supplier);
  await page.getByLabel("Concepto").first().fill(input.concept ?? "Servicio E2E");
  await page.getByLabel("Subtotal").first().fill(input.subtotal);
  await page.getByLabel("Impuesto").first().fill(input.tax ?? "0");
  await page.getByLabel("Retención 1%").first().fill(input.retention1 ?? "0");
}

async function submitExpense(page: Page) {
  await page.getByRole("button", { name: "Registrar gasto" }).click();
  // La acción corre en una transición; el proveedor se limpia al terminar bien.
  await expect(page.getByLabel("Proveedor").first()).toHaveValue("", {
    timeout: 20_000,
  });
}

function expenseRow(page: Page, supplier: string) {
  return page.getByTestId("expense-row").filter({ hasText: supplier });
}

function expenseEditor(page: Page) {
  return page.getByTestId("expense-editor");
}

/**
 * Pulsa «Revisar» sobre una lista ya asentada.
 *
 * `submitExpense` termina cuando la acción limpia el formulario, pero el
 * `router.refresh()` que repuebla la lista sigue en vuelo: pulsar en ese
 * instante puede caer sobre un nodo que React está a punto de reemplazar.
 * Recargar primero elimina la carrera, que es del arnés de pruebas y no del
 * producto — la revisión en sí queda verificada por las pruebas que siguen.
 */
async function clickReview(page: Page, supplier: string) {
  await page.reload();
  // Tras recargar, la fila existe en el HTML del servidor antes de que React
  // enganche sus manejadores: pulsar en esa ventana no hace nada y la acción se
  // pierde en silencio. Esperar a que la red quede inactiva garantiza que los
  // chunks del cliente ya se cargaron y la hidratación corrió.
  await page.waitForLoadState("networkidle");
  const row = expenseRow(page, supplier);
  await expect(row).toBeVisible({ timeout: 45_000 });
  await row.getByRole("button", { name: "Revisar" }).click();
}

/** Abre el editor sobre una lista ya asentada, por la misma razón. */
async function clickEdit(page: Page, supplier: string) {
  await page.reload();
  // Tras recargar, la fila existe en el HTML del servidor antes de que React
  // enganche sus manejadores: pulsar en esa ventana no hace nada y la acción se
  // pierde en silencio. Esperar a que la red quede inactiva garantiza que los
  // chunks del cliente ya se cargaron y la hidratación corrió.
  await page.waitForLoadState("networkidle");
  const row = expenseRow(page, supplier);
  await expect(row).toBeVisible({ timeout: 45_000 });
  await row.getByRole("button", { name: "Editar" }).click();
  await expect(expenseEditor(page)).toBeVisible();
}

/** Espera a que la revisión llegue a la base de datos. */
async function expectReviewed(supplier: string) {
  await expect
    .poll(
      async () => {
        const stored = await prisma.expense.findFirstOrThrow({ where: { supplier } });
        return stored.status;
      },
      { timeout: 30_000 },
    )
    .toBe("REVISADO");
}

test("el total se recalcula en vivo al escribir el impuesto", async ({ page }) => {
  await openForm(page, MAPPED_BRANCH_CODE);

  await page.getByLabel("Subtotal").first().fill("1000");
  await expect(page.getByText("1,000.00").first()).toBeVisible();

  await page.getByLabel("Impuesto").first().fill("150");
  await expect(page.getByText("1,150.00").first()).toBeVisible();

  await page.getByLabel("Retención 1%").first().fill("50");
  await expect(page.getByText("1,100.00").first()).toBeVisible();

  // Quitar el impuesto devuelve el total a su valor sin impuesto.
  await page.getByLabel("Impuesto").first().fill("0");
  await expect(page.getByText("950.00").first()).toBeVisible();
});

test("crea un gasto sin impuesto", async ({ page }) => {
  const supplier = supplierFor("sin");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillExpense(page, { supplier, subtotal: "500" });
  await submitExpense(page);

  await expect(expenseRow(page, supplier)).toBeVisible();

  const row = await prisma.expense.findFirstOrThrow({ where: { supplier } });
  expect(Number(row.tax)).toBe(0);
  expect(Number(row.total)).toBe(500);
  expect(row.status).toBe("REGISTRADO");
});

test("crea un gasto con impuesto y lo guarda por separado", async ({ page }) => {
  const supplier = supplierFor("con");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillExpense(page, { supplier, subtotal: "1000", tax: "150" });
  await submitExpense(page);

  const row = await prisma.expense.findFirstOrThrow({ where: { supplier } });
  expect(Number(row.subtotal)).toBe(1000);
  expect(Number(row.tax)).toBe(150);
  expect(Number(row.total)).toBe(1150);

  // El desglose aparece en la lista solo cuando hay algo que desglosar.
  await expect(expenseRow(page, supplier)).toContainText("imp.");
});

test("edita el impuesto de un gasto registrado", async ({ page }) => {
  const supplier = supplierFor("edit");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillExpense(page, { supplier, subtotal: "1000", tax: "150" });
  await submitExpense(page);

  await clickEdit(page, supplier);
  const editor = expenseEditor(page);
  await editor.getByLabel("Impuesto").fill("300");
  await expect(editor.getByText("1,300.00")).toBeVisible();
  await editor.getByRole("button", { name: "Guardar cambios" }).click();

  await expect
    .poll(async () => {
      const stored = await prisma.expense.findFirstOrThrow({ where: { supplier } });
      return Number(stored.tax);
    }, { timeout: 20_000 })
    .toBe(300);

  const stored = await prisma.expense.findFirstOrThrow({ where: { supplier } });
  expect(Number(stored.total)).toBe(1300);
});

test("quitar el impuesto lo devuelve a cero", async ({ page }) => {
  const supplier = supplierFor("quitar");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillExpense(page, { supplier, subtotal: "800", tax: "120" });
  await submitExpense(page);

  await clickEdit(page, supplier);
  const editor = expenseEditor(page);
  await editor.getByLabel("Impuesto").fill("0");
  await editor.getByRole("button", { name: "Guardar cambios" }).click();

  await expect
    .poll(async () => {
      const stored = await prisma.expense.findFirstOrThrow({ where: { supplier } });
      return Number(stored.tax);
    }, { timeout: 20_000 })
    .toBe(0);

  const stored = await prisma.expense.findFirstOrThrow({ where: { supplier } });
  expect(Number(stored.total)).toBe(800);
});

test("revisar un gasto sin impuesto lo contabiliza", async ({ page }) => {
  const supplier = supplierFor("rev-sin");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillExpense(page, { supplier, subtotal: "600" });
  await submitExpense(page);

  await clickReview(page, supplier);
  await expectReviewed(supplier);

  const stored = await prisma.expense.findFirstOrThrow({ where: { supplier } });
  const record = await prisma.postingRecord.findFirst({
    where: { sourceType: "EXPENSE", sourceId: stored.id, status: "CONTABILIZADO" },
  });
  expect(record).not.toBeNull();
  const entry = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: record!.journalEntryId },
    include: { lines: true },
  });
  expect(entry.lines).toHaveLength(2);
});

test("revisar un gasto con impuesto produce la línea de IVA", async ({ page }) => {
  const supplier = supplierFor("rev-con");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillExpense(page, { supplier, subtotal: "1000", tax: "150" });
  await submitExpense(page);

  await clickReview(page, supplier);
  await expectReviewed(supplier);

  const stored = await prisma.expense.findFirstOrThrow({ where: { supplier } });
  const record = await prisma.postingRecord.findFirstOrThrow({
    where: { sourceType: "EXPENSE", sourceId: stored.id, status: "CONTABILIZADO" },
  });
  const entry = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: record.journalEntryId },
    include: { lines: { include: { account: true } } },
  });
  expect(entry.lines).toHaveLength(4);

  const iva = entry.lines.find((line) => line.account.code.endsWith("IVA_ACREDITABLE"));
  expect(iva).toBeDefined();
  expect(Number(iva!.debit)).toBe(150);

  const gasto = entry.lines.find((line) => line.account.code.endsWith("-GASTO"));
  expect(Number(gasto!.debit)).toBe(1000);
});

test("un gasto ya revisado deja de ser editable", async ({ page }) => {
  const supplier = supplierFor("inmutable");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillExpense(page, { supplier, subtotal: "400" });
  await submitExpense(page);

  await clickReview(page, supplier);
  await expectReviewed(supplier);

  await page.reload();
  // Tras recargar, la fila existe en el HTML del servidor antes de que React
  // enganche sus manejadores: pulsar en esa ventana no hace nada y la acción se
  // pierde en silencio. Esperar a que la red quede inactiva garantiza que los
  // chunks del cliente ya se cargaron y la hidratación corrió.
  await page.waitForLoadState("networkidle");
  const row = expenseRow(page, supplier);
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Editar" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Revisar" })).toHaveCount(0);
});

test("sin regla de impuesto, revisar falla y no deja nada a medias", async ({ page }) => {
  const supplier = supplierFor("nomap");
  await openForm(page, UNMAPPED_BRANCH_CODE);
  await fillExpense(page, { supplier, subtotal: "500", tax: "75" });
  await submitExpense(page);

  await expenseRow(page, supplier).getByRole("button", { name: "Revisar" }).click();

  // El error del servidor llega a la pantalla, sin lógica propia de la UI.
  await expect(page.getByText(/mapeo contable activo/i).first()).toBeVisible({
    timeout: 20_000,
  });

  const stored = await prisma.expense.findFirstOrThrow({ where: { supplier } });
  expect(stored.status).toBe("REGISTRADO");
  const record = await prisma.postingRecord.findFirst({
    where: { sourceType: "EXPENSE", sourceId: stored.id },
  });
  expect(record).toBeNull();
});

test("un conjunto de mapeo archivado bloquea la revisión", async ({ page }) => {
  const supplier = supplierFor("archivado");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillExpense(page, { supplier, subtotal: "300" });
  await submitExpense(page);

  await prisma.accountMappingSet.updateMany({
    where: { code: `${TAG}-A` },
    data: { status: "ARCHIVADO", activeBranchKey: null, archivedAt: new Date() },
  });

  try {
    await page.reload();
    await expenseRow(page, supplier).getByRole("button", { name: "Revisar" }).click();
    await expect(page.getByText(/mapeo contable activo/i).first()).toBeVisible({
      timeout: 20_000,
    });
    const stored = await prisma.expense.findFirstOrThrow({ where: { supplier } });
    expect(stored.status).toBe("REGISTRADO");
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

test("el gasto persiste tras recargar", async ({ page }) => {
  const supplier = supplierFor("persist");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillExpense(page, { supplier, subtotal: "2000", tax: "300" });
  await submitExpense(page);

  await page.reload();
  // Tras recargar, la fila existe en el HTML del servidor antes de que React
  // enganche sus manejadores: pulsar en esa ventana no hace nada y la acción se
  // pierde en silencio. Esperar a que la red quede inactiva garantiza que los
  // chunks del cliente ya se cargaron y la hidratación corrió.
  await page.waitForLoadState("networkidle");
  const row = expenseRow(page, supplier);
  await expect(row).toBeVisible();
  await expect(row).toContainText("2,300.00");
});

test("el formulario sigue siendo usable en pantalla de móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openForm(page, MAPPED_BRANCH_CODE);

  const taxField = page.getByLabel("Impuesto").first();
  await expect(taxField).toBeVisible();
  await taxField.fill("150");
  await page.getByLabel("Subtotal").first().fill("1000");
  await expect(page.getByText("1,150.00").first()).toBeVisible();

  // Nada debe desbordar horizontalmente el viewport.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("el campo de impuesto es alcanzable con teclado y está etiquetado", async ({
  page,
}) => {
  await openForm(page, MAPPED_BRANCH_CODE);

  // Etiqueta accesible: `getByLabel` solo resuelve si la asociación existe.
  const tax = page.getByLabel("Impuesto").first();
  await expect(tax).toBeVisible();
  await expect(tax).toHaveAttribute("inputmode", "decimal");

  // Desde Subtotal, tabular llega a Impuesto: el orden del DOM es el visual.
  await page.getByLabel("Subtotal").first().focus();
  await page.keyboard.press("Tab");
  await expect(tax).toBeFocused();

  await page.keyboard.type("250");
  await expect(tax).toHaveValue("250");
});
