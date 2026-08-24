import { expect, test, type Page } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, UNMAPPED_BRANCH_CODE, prisma } from "./fixtures";

/**
 * SUITE-FF2.1-C — el impuesto de documentos de caja, a través de la interfaz.
 *
 * Corre con la sesión de **administrador**: `canOperateCaja` no admite a
 * Contador, así que esta suite es la primera que ejercita un segundo rol contra
 * la capa de autorización real.
 *
 * Una factura de caja toma su subtotal de los ítems, no de un campo escrito, así
 * que el recorrido es: crear borrador → agregar ítem → editar impuesto →
 * (pago) → emitir. La emisión es la transición que contabiliza (FF1.4-D).
 */
test.describe.configure({ mode: "serial" });

const FACTURACION = "/panel/caja/facturacion";
const RECIBOS = "/panel/caja/recibos";

function clientFor(name: string) {
  return `${TAG}-${name}-${Date.now()}`;
}

/**
 * El panel de caja no expone encabezados: `FormSection` usa `<legend>`. El
 * título del formulario de alta es el anclaje, y confirma de paso que hay un
 * turno abierto en el alcance.
 */
async function openSection(page: Page, path: string, formTitle: string) {
  await page.goto(path);
  await expect(page.getByText(formTitle).first()).toBeVisible({ timeout: 45_000 });
  // El formulario existe en el HTML del servidor antes de que React enganche:
  // escribir en esa ventana no actualiza el estado y el botón queda
  // deshabilitado para siempre. Esperar a la red inactiva cierra la carrera.
  await page.waitForLoadState("networkidle");
}

/** Turno abierto de una sucursal, por código. */
async function sessionIdFor(branchCode: string) {
  const branch = await prisma.branch.findFirstOrThrow({ where: { code: branchCode } });
  const session = await prisma.cashSession.findFirstOrThrow({
    where: { branchId: branch.id, status: "ABIERTO" },
  });
  return session.id;
}

/**
 * Crea el borrador y navega a su detalle.
 *
 * El turno se elige explícitamente: el formulario propone el más reciente, y
 * cuál sea eso depende del orden de creación de los fixtures. Fijarlo es lo que
 * garantiza que la factura nazca en la sucursal que sí tiene mapeo de impuesto.
 */
async function createInvoice(page: Page, client: string) {
  await openSection(page, FACTURACION, "Nueva factura");
  await page.getByLabel("Turno").selectOption({
    value: await sessionIdFor(MAPPED_BRANCH_CODE),
  });
  await page.getByLabel("Cliente o tercero").first().fill(client);
  await page.getByLabel("Concepto").first().fill("Venta E2E");
  await page.getByRole("button", { name: "Nueva factura" }).click();

  await expect(page.getByLabel("Cliente o tercero").first()).toHaveValue("", {
    timeout: 20_000,
  });

  const draft = await stored(client);
  await page.goto(`${FACTURACION}?documento=${draft.id}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("cash-breakdown")).toBeVisible({ timeout: 45_000 });
  return draft.id;
}

/**
 * `Field` añade un asterisco al nombre accesible cuando el campo es requerido
 * («Descripción *»), así que no se puede localizar por nombre exacto. El
 * formulario de ítems lleva su propio anclaje y dentro de él los nombres son
 * inequívocos.
 */
async function addItem(page: Page, description: string, unitPrice: string) {
  const form = page.getByTestId("cash-item-form");
  await expect(form).toBeVisible({ timeout: 45_000 });
  await form.getByLabel("Descripción").fill(description);
  await form.getByLabel("Cantidad").fill("1");
  await form.getByLabel("Precio").fill(unitPrice);
  await form.getByRole("button", { name: "Agregar ítem" }).click();
  // El formulario se limpia al terminar bien: es la señal de que el ítem ya
  // está guardado y de que el subtotal del documento se recalculó. Sin esperarla,
  // una recarga posterior leería el subtotal anterior.
  await expect(form.getByLabel("Descripción")).toHaveValue("", {
    timeout: 20_000,
  });
}

/** Guarda el borrador desde el formulario de edición. */
/**
 * El alta y la edición conviven en la misma pantalla y comparten los nombres de
 * campo, así que toda interacción de edición se ancla al formulario de edición.
 *
 * Guardar se **verifica y se reintenta**: en el servidor de desarrollo un clic
 * puede perderse si React aún no enganchó tras una recarga, y el síntoma es un
 * guardado que simplemente no ocurre. Reintentar es seguro aquí y solo aquí:
 * guardar el mismo borrador con los mismos valores es idempotente, a diferencia
 * de emitir o anular. La lógica del servidor está cubierta por SMOKE-FF2.0-C.
 */
async function saveDraft(
  page: Page,
  fill: (form: ReturnType<Page["getByTestId"]>) => Promise<void>,
  verify?: () => Promise<boolean>,
) {
  await page.waitForLoadState("networkidle");
  const deadline = Date.now() + 45_000;
  let attempt = 0;

  while (Date.now() < deadline) {
    const form = page.getByTestId("cash-edit-form");
    await expect(form).toBeVisible({ timeout: 45_000 });
    await fill(form);
    await form.getByRole("button", { name: "Guardar cambios" }).click();
    attempt += 1;

    if (!verify) return;

    const notice = page.getByTestId("caja-error");
    const check = Date.now() + 8_000;
    while (Date.now() < check) {
      if (await notice.count()) {
        throw new Error(`El servidor rechazó el guardado: ${await notice.innerText()}`);
      }
      if (await verify()) return;
      await page.waitForTimeout(500);
    }
    await page.reload();
    await page.waitForLoadState("networkidle");
  }
  throw new Error(`El guardado no surtió efecto tras ${attempt} intentos.`);
}

/** El documento de la prueba, leído por su cliente etiquetado. */
async function stored(client: string) {
  return prisma.cashDocument.findFirstOrThrow({ where: { thirdPartyName: client } });
}

async function expectStored(
  page: Page,
  client: string,
  read: (row: Record<string, unknown>) => unknown,
  expected: unknown,
) {
  await expect
    .poll(
      async () => {
        const notice = page.getByTestId("caja-error");
        if (await notice.count()) return `RECHAZADO: ${await notice.innerText()}`;
        const stored = await prisma.cashDocument.findFirstOrThrow({
          where: { thirdPartyName: client },
        });
        return read(stored as unknown as Record<string, unknown>);
      },
      { timeout: 45_000 },
    )
    .toBe(expected);
}

async function entryFor(documentId: string) {
  const record = await prisma.postingRecord.findFirstOrThrow({
    where: {
      sourceType: "CASH_DOCUMENT",
      sourceId: documentId,
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

test("el recibo no ofrece campo de impuesto", async ({ page }) => {
  // `CAJA_RECIBO` no admite `IMPUESTO` en la matriz FF1.0: la pantalla no debe
  // dejar escribir un importe que la estrategia luego rechazaría.
  await openSection(page, RECIBOS, "Nuevo recibo");
  await expect(page.getByLabel("Monto")).toBeVisible();
  await expect(page.getByLabel("Impuesto")).toHaveCount(0);
});

test("la factura sí ofrece campo de impuesto", async ({ page }) => {
  await openSection(page, FACTURACION, "Nueva factura");
  const tax = page.getByLabel("Impuesto").first();
  await expect(tax).toBeVisible();
  await expect(tax).toHaveAttribute("inputmode", "decimal");
});

test("crea una factura sin impuesto", async ({ page }) => {
  const client = clientFor("sin");
  await createInvoice(page, client);
  await addItem(page, "Artículo", "500");

  await expectStored(page, client, (row) => Number(row.subtotal), 500);
  await expectStored(page, client, (row) => Number(row.tax), 0);
  await expectStored(page, client, (row) => Number(row.total), 500);
});

test("agrega impuesto a un borrador y el total lo suma", async ({ page }) => {
  const client = clientFor("con");
  await createInvoice(page, client);
  await addItem(page, "Artículo", "1000");
  await expectStored(page, client, (row) => Number(row.subtotal), 1000);

  await page.reload();
  await saveDraft(
    page,
    async (form) => {
      await form.getByLabel("Impuesto").fill("150");
      // El total en vivo usa el helper del servidor, no aritmética del navegador.
      await expect(page.getByTestId("cash-live-total")).toContainText("1,150.00");
    },
    async () => Number((await stored(client)).tax) === 150,
  );

  await expectStored(page, client, (row) => Number(row.tax), 150);
  await expectStored(page, client, (row) => Number(row.total), 1150);
  // El subtotal no se altera al agregar impuesto.
  await expectStored(page, client, (row) => Number(row.subtotal), 1000);
});

test("quitar el impuesto lo devuelve a cero", async ({ page }) => {
  const client = clientFor("quitar");
  await createInvoice(page, client);
  await addItem(page, "Artículo", "800");
  await page.reload();
  await saveDraft(
    page,
    async (form) => form.getByLabel("Impuesto").fill("120"),
    async () => Number((await stored(client)).tax) === 120,
  );
  await expectStored(page, client, (row) => Number(row.tax), 120);

  await page.reload();
  await saveDraft(
    page,
    async (form) => form.getByLabel("Impuesto").fill("0"),
    async () => Number((await stored(client)).tax) === 0,
  );
  await expectStored(page, client, (row) => Number(row.tax), 0);
  await expectStored(page, client, (row) => Number(row.total), 800);
});

test("impuesto, abono y retención se combinan con la fórmula compartida", async ({
  page,
}) => {
  const client = clientFor("mix");
  await createInvoice(page, client);
  await addItem(page, "Artículo", "10000");
  await page.reload();
  await saveDraft(
    page,
    async (form) => {
      await form.getByLabel("Impuesto").fill("1500");
      await form.getByLabel("Abono").fill("500");
      await form.getByLabel("Retención 1").fill("200");
      // 10000 + 1500 - 500 - 200 = 10800
      await expect(page.getByTestId("cash-live-total")).toContainText("10,800.00");
    },
    async () => Number((await stored(client)).total) === 10800,
  );

  await expectStored(page, client, (row) => Number(row.total), 10800);
});

test("emitir una factura con impuesto acredita el IVA aparte", async ({ page }) => {
  const client = clientFor("emitir");
  const documentId = await createInvoice(page, client);
  await addItem(page, "Artículo", "1000");
  await page.reload();
  await saveDraft(page, async (form) => {
    await form.getByLabel("Impuesto").fill("150");
  });
  await expectStored(page, client, (row) => Number(row.total), 1150);

  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Emitir" }).click();
  await expectStored(page, client, (row) => row.status, "EMITIDO");

  const entry = await entryFor(documentId);
  expect(entry.lines).toHaveLength(4);
  // El ingreso queda en el subtotal: el impuesto no lo infla.
  expect(onAccount(entry.lines, "-INGRESO").credit).toBe(1000);
  expect(onAccount(entry.lines, "IVA_POR_PAGAR").credit).toBe(150);
  const cxc = onAccount(entry.lines, "-CXC");
  expect(cxc.debit - cxc.credit).toBe(1150);
});

test("emitir una factura sin impuesto produce dos líneas", async ({ page }) => {
  const client = clientFor("emitir-sin");
  const documentId = await createInvoice(page, client);
  await addItem(page, "Artículo", "600");
  await expectStored(page, client, (row) => Number(row.subtotal), 600);

  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Emitir" }).click();
  await expectStored(page, client, (row) => row.status, "EMITIDO");

  const entry = await entryFor(documentId);
  expect(entry.lines).toHaveLength(2);
  expect(onAccount(entry.lines, "IVA_POR_PAGAR").credit).toBe(0);
});

test("una factura emitida ya no ofrece edición", async ({ page }) => {
  const client = clientFor("inmutable");
  await createInvoice(page, client);
  await addItem(page, "Artículo", "400");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Emitir" }).click();
  await expectStored(page, client, (row) => row.status, "EMITIDO");

  await page.reload();
  await expect(page.getByText("Editar borrador")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Emitir" })).toHaveCount(0);
  // El desglose sigue visible aunque el documento ya no se edite.
  await expect(page.getByTestId("cash-tax-tile")).toBeVisible();
});

test("sin regla de impuesto, emitir falla y no deja nada", async ({ page }) => {
  const client = clientFor("nomap");
  await openSection(page, FACTURACION, "Nueva factura");
  // La sucursal sin mapeo de impuesto tiene su propio turno abierto.
  await page.getByLabel("Turno").selectOption({
    value: await sessionIdFor(UNMAPPED_BRANCH_CODE),
  });
  await page.getByLabel("Cliente o tercero").first().fill(client);
  await page.getByLabel("Concepto").first().fill("Venta sin mapeo");
  await page.getByRole("button", { name: "Nueva factura" }).click();
  await expect(page.getByLabel("Cliente o tercero").first()).toHaveValue("", {
    timeout: 20_000,
  });

  const draft = await stored(client);
  await page.goto(`${FACTURACION}?documento=${draft.id}`);
  await page.waitForLoadState("networkidle");
  await addItem(page, "Artículo", "500");
  await page.reload();
  await saveDraft(
    page,
    async (form) => form.getByLabel("Impuesto").fill("75"),
    async () => Number((await stored(client)).tax) === 75,
  );
  await expectStored(page, client, (row) => Number(row.tax), 75);

  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Emitir" }).click();

  await expect(page.getByText(/mapeo contable activo/i).first()).toBeVisible({
    timeout: 20_000,
  });
  const after = await prisma.cashDocument.findFirstOrThrow({
    where: { thirdPartyName: client },
  });
  expect(after.status).toBe("BORRADOR");
  const record = await prisma.postingRecord.findFirst({
    where: { sourceType: "CASH_DOCUMENT", sourceId: after.id },
  });
  expect(record).toBeNull();
});

test("un conjunto de mapeo archivado bloquea la emisión", async ({ page }) => {
  const client = clientFor("archivado");
  await createInvoice(page, client);
  await addItem(page, "Artículo", "300");
  await expectStored(page, client, (row) => Number(row.subtotal), 300);

  await prisma.accountMappingSet.updateMany({
    where: { code: `${TAG}-A` },
    data: { status: "ARCHIVADO", activeBranchKey: null, archivedAt: new Date() },
  });

  try {
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Emitir" }).click();
    await expect(page.getByText(/mapeo contable activo/i).first()).toBeVisible({
      timeout: 20_000,
    });
    const after = await prisma.cashDocument.findFirstOrThrow({
      where: { thirdPartyName: client },
    });
    expect(after.status).toBe("BORRADOR");
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

test("el impuesto persiste tras recargar", async ({ page }) => {
  const client = clientFor("persist");
  await createInvoice(page, client);
  await addItem(page, "Artículo", "2000");
  await page.reload();
  await saveDraft(
    page,
    async (form) => form.getByLabel("Impuesto").fill("300"),
    async () => Number((await stored(client)).tax) === 300,
  );
  await expectStored(page, client, (row) => Number(row.total), 2300);

  await page.reload();
  await expect(page.getByTestId("cash-tax-tile")).toContainText("300.00");
  await expect(page.getByTestId("cash-breakdown")).toContainText("2,300.00");
});

test("el formulario de caja es usable en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSection(page, FACTURACION, "Nueva factura");

  const tax = page.getByLabel("Impuesto").first();
  await expect(tax).toBeVisible();
  await tax.fill("150");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("el campo de impuesto es alcanzable con teclado", async ({ page }) => {
  await openSection(page, FACTURACION, "Nueva factura");

  const tax = page.getByLabel("Impuesto").first();
  await tax.focus();
  await expect(tax).toBeFocused();
  await page.keyboard.type("250");
  await expect(tax).toHaveValue("250");
});
