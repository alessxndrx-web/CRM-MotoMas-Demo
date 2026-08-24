import { expect, test, type Page } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, UNMAPPED_BRANCH_CODE, prisma } from "./fixtures";

/**
 * SUITE-FF2.1-B — el impuesto de documentos contables, a través de la interfaz.
 *
 * El ciclo del documento es BORRADOR → EMITIDO → REVISADO → CONTABILIZADO, y es
 * **la última transición** la que produce el asiento (FF1.4-C). Las pruebas que
 * verifican la línea de IVA recorren el ciclo entero, no solo «revisar».
 *
 * Cada prueba comprueba el resultado en la base de datos, no solo en pantalla.
 */
test.describe.configure({ mode: "serial" });

const DOCUMENTOS = "/panel/contabilidad/documentos";

function thirdPartyFor(name: string) {
  return `${TAG}-${name}-${Date.now()}`;
}

async function openForm(page: Page, branchCode: string) {
  await page.goto(DOCUMENTOS);
  await expect(page.getByRole("heading", { name: "Documentos" }).first()).toBeVisible({
    timeout: 45_000,
  });
  await page.getByLabel("Sucursal").selectOption({ value: branchCode });
}

async function fillDocument(
  page: Page,
  input: {
    thirdPartyName: string;
    subtotal: string;
    tax?: string;
    retention1?: string;
  },
) {
  await page.getByLabel("Tercero").first().fill(input.thirdPartyName);
  await page.getByLabel("Concepto").first().fill("Venta E2E");
  await page.getByLabel("Subtotal").first().fill(input.subtotal);
  await page.getByLabel("Impuesto").first().fill(input.tax ?? "0");
  await page.getByLabel("Retención 1%").first().fill(input.retention1 ?? "0");
}

async function submitDocument(page: Page) {
  await page.getByRole("button", { name: "Registrar documento" }).click();
  await expect(page.getByLabel("Tercero").first()).toHaveValue("", {
    timeout: 20_000,
  });
}

function documentRow(page: Page, thirdParty: string) {
  return page.getByTestId("document-row").filter({ hasText: thirdParty });
}

/**
 * Pulsa una acción del ciclo sobre una lista ya asentada.
 *
 * Recargar antes evita la carrera con `router.refresh()` que FF2.1-A documentó:
 * pulsar justo tras una acción puede caer sobre un nodo que React reemplaza.
 */
async function clickAction(page: Page, thirdParty: string, label: string) {
  await page.reload();
  // Tras recargar, la fila existe en el HTML del servidor antes de que React
  // enganche sus manejadores: pulsar en esa ventana no hace nada y la acción se
  // pierde en silencio. Esperar a que la red quede inactiva garantiza que los
  // chunks del cliente ya se cargaron y la hidratación corrió.
  await page.waitForLoadState("networkidle");
  const row = documentRow(page, thirdParty);
  await expect(row).toBeVisible({ timeout: 45_000 });
  await row.getByRole("button", { name: label, exact: true }).click();
}

/**
 * Espera a que la transición llegue a la base de datos.
 *
 * Si el servidor la rechazó, el aviso en pantalla lo dice: devolverlo hace que
 * la prueba falle **con el motivo** en vez de agotar el tiempo en silencio, que
 * es lo que convertía una rechazo real en un fallo indescifrable.
 */
async function expectStatus(page: Page, thirdParty: string, status: string) {
  await expect
    .poll(
      async () => {
        const notice = page.getByTestId("conta-error");
        if (await notice.count()) return `RECHAZADO: ${await notice.innerText()}`;
        const stored = await prisma.accountingDocument.findFirstOrThrow({
          where: { thirdPartyName: thirdParty },
        });
        return stored.status;
      },
      { timeout: 45_000 },
    )
    .toBe(status);
}

/** Recorre BORRADOR → EMITIDO → REVISADO → CONTABILIZADO. */
async function postDocument(page: Page, thirdParty: string) {
  await clickAction(page, thirdParty, "Emitir");
  await expectStatus(page, thirdParty, "EMITIDO");
  await clickAction(page, thirdParty, "Revisar");
  await expectStatus(page, thirdParty, "REVISADO");
  await clickAction(page, thirdParty, "Contabilizar");
}

async function entryFor(thirdParty: string) {
  const document = await prisma.accountingDocument.findFirstOrThrow({
    where: { thirdPartyName: thirdParty },
  });
  const record = await prisma.postingRecord.findFirstOrThrow({
    where: {
      sourceType: "ACCOUNTING_DOCUMENT",
      sourceId: document.id,
      status: "CONTABILIZADO",
    },
  });
  return prisma.journalEntry.findUniqueOrThrow({
    where: { id: record.journalEntryId },
    include: { lines: { include: { account: true } } },
  });
}

function onAccount(
  lines: Array<{ account: { code: string }; debit: unknown; credit: unknown }>,
  suffix: string,
) {
  const matching = lines.filter((line) => line.account.code.endsWith(suffix));
  return {
    debit: matching.reduce((sum, line) => sum + Number(line.debit), 0),
    credit: matching.reduce((sum, line) => sum + Number(line.credit), 0),
  };
}

test("el total se recalcula en vivo con el impuesto", async ({ page }) => {
  await openForm(page, MAPPED_BRANCH_CODE);

  await page.getByLabel("Subtotal").first().fill("1000");
  await expect(page.getByText("1,000.00").first()).toBeVisible();

  await page.getByLabel("Impuesto").first().fill("150");
  await expect(page.getByText("1,150.00").first()).toBeVisible();

  await page.getByLabel("Abono").first().fill("100");
  await expect(page.getByText("1,050.00").first()).toBeVisible();

  await page.getByLabel("Retención 1%").first().fill("50");
  await expect(page.getByText("1,000.00").first()).toBeVisible();

  // Quitar el impuesto lo devuelve al valor sin impuesto.
  await page.getByLabel("Impuesto").first().fill("0");
  await expect(page.getByText("850.00").first()).toBeVisible();
});

test("crea una factura sin impuesto", async ({ page }) => {
  const thirdParty = thirdPartyFor("sin");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillDocument(page, { thirdPartyName: thirdParty, subtotal: "500" });
  await submitDocument(page);

  await expect(documentRow(page, thirdParty)).toBeVisible();
  const stored = await prisma.accountingDocument.findFirstOrThrow({
    where: { thirdPartyName: thirdParty },
  });
  expect(Number(stored.tax)).toBe(0);
  expect(Number(stored.total)).toBe(500);
  expect(stored.status).toBe("BORRADOR");
});

test("crea una factura con impuesto y no altera el subtotal", async ({ page }) => {
  const thirdParty = thirdPartyFor("con");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillDocument(page, { thirdPartyName: thirdParty, subtotal: "1000", tax: "150" });
  await submitDocument(page);

  const stored = await prisma.accountingDocument.findFirstOrThrow({
    where: { thirdPartyName: thirdParty },
  });
  // Lo esencial: el impuesto se guarda aparte, sin inflar el subtotal.
  expect(Number(stored.subtotal)).toBe(1000);
  expect(Number(stored.tax)).toBe(150);
  expect(Number(stored.total)).toBe(1150);

  const breakdown = documentRow(page, thirdParty).getByTestId("document-breakdown");
  await expect(breakdown).toBeVisible();
  await expect(breakdown).toContainText("Impuesto");
  await expect(breakdown).toContainText("150.00");
});

test("un documento sin deducciones no muestra desglose", async ({ page }) => {
  const thirdParty = thirdPartyFor("simple");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillDocument(page, { thirdPartyName: thirdParty, subtotal: "700" });
  await submitDocument(page);

  await expect(
    documentRow(page, thirdParty).getByTestId("document-breakdown"),
  ).toHaveCount(0);
});

test("edita el impuesto de un borrador", async ({ page }) => {
  const thirdParty = thirdPartyFor("edit");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillDocument(page, { thirdPartyName: thirdParty, subtotal: "1000", tax: "150" });
  await submitDocument(page);

  await clickAction(page, thirdParty, "Editar");
  const editor = page.getByTestId("document-editor");
  await expect(editor).toBeVisible();
  await editor.getByLabel("Impuesto").fill("300");
  await expect(editor.getByText("1,300.00")).toBeVisible();
  await editor.getByRole("button", { name: "Guardar cambios" }).click();

  await expect
    .poll(
      async () => {
        const stored = await prisma.accountingDocument.findFirstOrThrow({
          where: { thirdPartyName: thirdParty },
        });
        return Number(stored.tax);
      },
      { timeout: 30_000 },
    )
    .toBe(300);

  const stored = await prisma.accountingDocument.findFirstOrThrow({
    where: { thirdPartyName: thirdParty },
  });
  expect(Number(stored.subtotal)).toBe(1000);
  expect(Number(stored.total)).toBe(1300);
});

test("quitar el impuesto lo devuelve a cero", async ({ page }) => {
  const thirdParty = thirdPartyFor("quitar");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillDocument(page, { thirdPartyName: thirdParty, subtotal: "800", tax: "120" });
  await submitDocument(page);

  await clickAction(page, thirdParty, "Editar");
  const editor = page.getByTestId("document-editor");
  await editor.getByLabel("Impuesto").fill("0");
  await editor.getByRole("button", { name: "Guardar cambios" }).click();

  await expect
    .poll(
      async () => {
        const stored = await prisma.accountingDocument.findFirstOrThrow({
          where: { thirdPartyName: thirdParty },
        });
        return Number(stored.tax);
      },
      { timeout: 30_000 },
    )
    .toBe(0);

  const stored = await prisma.accountingDocument.findFirstOrThrow({
    where: { thirdPartyName: thirdParty },
  });
  expect(Number(stored.total)).toBe(800);
});

test("contabilizar una factura sin impuesto produce dos líneas", async ({ page }) => {
  const thirdParty = thirdPartyFor("post-sin");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillDocument(page, { thirdPartyName: thirdParty, subtotal: "600" });
  await submitDocument(page);

  await postDocument(page, thirdParty);
  await expectStatus(page, thirdParty, "CONTABILIZADO");

  const entry = await entryFor(thirdParty);
  expect(entry.lines).toHaveLength(2);
  expect(onAccount(entry.lines, "IVA_POR_PAGAR").credit).toBe(0);
});

test("contabilizar una factura con impuesto acredita el IVA aparte", async ({
  page,
}) => {
  const thirdParty = thirdPartyFor("post-con");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillDocument(page, { thirdPartyName: thirdParty, subtotal: "1000", tax: "150" });
  await submitDocument(page);

  await postDocument(page, thirdParty);
  await expectStatus(page, thirdParty, "CONTABILIZADO");

  const entry = await entryFor(thirdParty);
  expect(entry.lines).toHaveLength(4);
  // El ingreso queda en el subtotal: el impuesto no lo infla.
  expect(onAccount(entry.lines, "-INGRESO").credit).toBe(1000);
  expect(onAccount(entry.lines, "IVA_POR_PAGAR").credit).toBe(150);
  const cxc = onAccount(entry.lines, "-CXC");
  expect(cxc.debit - cxc.credit).toBe(1150);
});

test("un documento contabilizado ya no ofrece edición", async ({ page }) => {
  const thirdParty = thirdPartyFor("inmutable");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillDocument(page, { thirdPartyName: thirdParty, subtotal: "400" });
  await submitDocument(page);

  await postDocument(page, thirdParty);
  await expectStatus(page, thirdParty, "CONTABILIZADO");

  await page.reload();
  // Tras recargar, la fila existe en el HTML del servidor antes de que React
  // enganche sus manejadores: pulsar en esa ventana no hace nada y la acción se
  // pierde en silencio. Esperar a que la red quede inactiva garantiza que los
  // chunks del cliente ya se cargaron y la hidratación corrió.
  await page.waitForLoadState("networkidle");
  const row = documentRow(page, thirdParty);
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Editar", exact: true })).toHaveCount(0);
});

test("sin regla de impuesto, contabilizar falla y no deja nada", async ({ page }) => {
  const thirdParty = thirdPartyFor("nomap");
  await openForm(page, UNMAPPED_BRANCH_CODE);
  await fillDocument(page, { thirdPartyName: thirdParty, subtotal: "500", tax: "75" });
  await submitDocument(page);

  await clickAction(page, thirdParty, "Emitir");
  await expectStatus(page, thirdParty, "EMITIDO");
  await clickAction(page, thirdParty, "Revisar");
  await expectStatus(page, thirdParty, "REVISADO");
  await clickAction(page, thirdParty, "Contabilizar");

  await expect(page.getByText(/mapeo contable activo/i).first()).toBeVisible({
    timeout: 20_000,
  });

  const stored = await prisma.accountingDocument.findFirstOrThrow({
    where: { thirdPartyName: thirdParty },
  });
  expect(stored.status).toBe("REVISADO");
  const record = await prisma.postingRecord.findFirst({
    where: { sourceType: "ACCOUNTING_DOCUMENT", sourceId: stored.id },
  });
  expect(record).toBeNull();
});

test("un conjunto de mapeo archivado bloquea la contabilización", async ({ page }) => {
  const thirdParty = thirdPartyFor("archivado");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillDocument(page, { thirdPartyName: thirdParty, subtotal: "300" });
  await submitDocument(page);

  await clickAction(page, thirdParty, "Emitir");
  await expectStatus(page, thirdParty, "EMITIDO");
  await clickAction(page, thirdParty, "Revisar");
  await expectStatus(page, thirdParty, "REVISADO");

  await prisma.accountMappingSet.updateMany({
    where: { code: `${TAG}-A` },
    data: { status: "ARCHIVADO", activeBranchKey: null, archivedAt: new Date() },
  });

  try {
    await clickAction(page, thirdParty, "Contabilizar");
    await expect(page.getByText(/mapeo contable activo/i).first()).toBeVisible({
      timeout: 20_000,
    });
    const stored = await prisma.accountingDocument.findFirstOrThrow({
      where: { thirdPartyName: thirdParty },
    });
    expect(stored.status).toBe("REVISADO");
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

test("el documento y su desglose persisten tras recargar", async ({ page }) => {
  const thirdParty = thirdPartyFor("persist");
  await openForm(page, MAPPED_BRANCH_CODE);
  await fillDocument(page, { thirdPartyName: thirdParty, subtotal: "2000", tax: "300" });
  await submitDocument(page);

  await page.reload();
  // Tras recargar, la fila existe en el HTML del servidor antes de que React
  // enganche sus manejadores: pulsar en esa ventana no hace nada y la acción se
  // pierde en silencio. Esperar a que la red quede inactiva garantiza que los
  // chunks del cliente ya se cargaron y la hidratación corrió.
  await page.waitForLoadState("networkidle");
  const row = documentRow(page, thirdParty);
  await expect(row).toBeVisible();
  await expect(row).toContainText("2,300.00");
  await expect(row.getByTestId("document-breakdown")).toContainText("300.00");
});

test("el formulario sigue siendo usable en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openForm(page, MAPPED_BRANCH_CODE);

  const tax = page.getByLabel("Impuesto").first();
  await expect(tax).toBeVisible();
  await tax.fill("150");
  await page.getByLabel("Subtotal").first().fill("1000");
  await expect(page.getByText("1,150.00").first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("el campo de impuesto está etiquetado y es alcanzable con teclado", async ({
  page,
}) => {
  await openForm(page, MAPPED_BRANCH_CODE);

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
