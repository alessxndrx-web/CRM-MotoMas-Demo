import { test, expect, type Page } from "@playwright/test";
import { PrismaClient, type UserRole } from "@prisma/client";
import { hashPassword } from "../src/server/auth/password";
import { roleEnumToSpanish } from "../src/server/auth/roles";
import { navGroups } from "../src/features/operations/lib/nav-model";
import { generateTicketCodeCandidate } from "../src/server/tickets/code";
import { ADMIN_EMAIL, ADMIN_PASSWORD, MAPPED_BRANCH_CODE, TAG as FINANCE_TAG } from "./fixtures";

const db = new PrismaClient();
const tag = `AUDIT-ROLES-${Date.now().toString(36)}`;
const password = "Temporary-audit-roles-password";
const roles: UserRole[] = ["ADMIN", "GERENTE", "LIDER_VENTAS", "VENDEDOR", "CALL_CENTER", "CAJERO", "CONTADOR", "MARKETING", "SOPORTE_TECNICO"];
const users = new Map<UserRole, { id: string; email: string }>();
let branchId = "";

test.beforeAll(async () => {
  const branch = await db.branch.create({ data: { code: tag.toLowerCase(), name: tag } }); branchId = branch.id;
  for (const role of roles) users.set(role, await db.user.create({ data: { name: `${tag}-${role}`, email: `${tag}-${role}@smoke.local`.toLowerCase(), passwordHash: hashPassword(password), role, branchId: ["ADMIN", "CONTADOR"].includes(role) ? null : branch.id } }));
});
test.afterAll(async () => {
  await db.cashSession.deleteMany({ where: { cashierId: { in: [...users.values()].map(user => user.id) } } });
  await db.financialAuditEvent.deleteMany({ where: { actorUserId: { in: [...users.values()].map(user => user.id) } } });
  await db.thirdParty.deleteMany({ where: { name: { startsWith: tag } } });
  await db.supportTicket.deleteMany({ where: { createdById: { in: [...users.values()].map(user => user.id) } } });
  await db.user.deleteMany({ where: { id: { in: [...users.values()].map(user => user.id) } } });
  if (branchId) await db.branch.delete({ where: { id: branchId } });
  await db.$disconnect();
});

for (const role of ["ADMIN", "CONTADOR", "GERENTE"] as const) {
  test(`${role}: registra, edita y desactiva un proveedor con sucursal`, async ({ page }) => {
    await login(page, role);
    await page.goto("/panel/proveedores");
    await expect(page.getByRole("heading", { name: "Proveedores", exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Nuevo proveedor", exact: true }).first().click();
    if (role !== "GERENTE") await page.getByLabel(/^Sucursal/).selectOption(tag.toLowerCase());
    else await expect(page.getByLabel(/^Sucursal/)).toHaveCount(0);
    await page.getByLabel(/^Nombre/).fill(`${tag}-${role}-proveedor`);
    await page.getByRole("button", { name: "Guardar proveedor", exact: true }).click();
    await expect(page.getByText("Proveedor registrado.", { exact: true })).toBeVisible();
    const saved = await db.thirdParty.findFirstOrThrow({ where: { name: `${tag}-${role}-proveedor` } });
    expect(saved.branchId).toBe(branchId);
    expect(saved.type).toBe("PROVEEDOR");
    const row = page.locator("div.grid").filter({ has: page.getByText(`${tag}-${role}-proveedor`, { exact: true }) }).filter({ has: page.getByRole("button", { name: "Editar", exact: true }) }).last();
    await row.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByLabel("Teléfono", { exact: true }).fill("88881234");
    await page.getByRole("button", { name: "Guardar proveedor", exact: true }).click();
    await expect(page.getByText("Proveedor actualizado.", { exact: true })).toBeVisible();
    expect((await db.thirdParty.findUniqueOrThrow({ where: { id: saved.id } })).phone).toBe("88881234");
    await row.getByRole("button", { name: "Desactivar", exact: true }).click();
    await expect.poll(async () => (await db.thirdParty.findUniqueOrThrow({ where: { id: saved.id } })).isActive).toBe(false);
    await page.reload();
    await expect(page.getByText(`${tag}-${role}-proveedor`, { exact: true })).toHaveCount(0);
  });
}
async function login(page: Page, role: UserRole) {
  await page.goto("/login");
  await page.getByLabel(/correo/i).fill(users.get(role)!.email);
  await page.getByLabel(/contraseña/i).fill(password);
  await page.getByRole("button", { name: /ingresar|entrar|acceder/i }).click();
  await page.waitForURL(/\/panel/);
}

for (const role of roles) {
  test(`${role}: inicia sesión, abre todos sus módulos fuera de POS y reporta un problema`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", error => runtimeErrors.push(error.message));
    await login(page, role);
    const routes = navGroups.flatMap(group => group.items).filter(item => item.roles.includes(roleEnumToSpanish[role]) && !item.href.includes("/pos/")).map(item => item.href);
    if (role === "ADMIN" || role === "CONTADOR") routes.push(...["terceros", "bancos", "conciliacion", "comprobantes", "cierres", "inventario", "documentos", "gastos", "liquidaciones", "planilla", "catalogo-cuentas", "diarios", "reportes"].map(section => `/panel/contabilidad/${section}`));
    if (role === "ADMIN" || role === "CAJERO") routes.push(...["facturacion", "recibos", "notas", "cierres"].map(section => `/panel/caja/${section}`));
    if (role === "ADMIN" || role === "SOPORTE_TECNICO") routes.push("/panel/soporte/tickets/nuevo");
    for (const route of routes) await test.step(route, async () => {
      const response = await page.goto(route);
      expect(response?.status(), route).toBeLessThan(400);
      await expect(page).toHaveURL(new RegExp(`${route.replaceAll("/", "\\/")}(?:\\?|$)`));
      await expect(page.locator("main").first()).toBeVisible();
      await expect(page.getByText(/Acceso (?:.*)?restringido|Acceso fuera del área|No tienes permiso|Application error|Internal Server Error|Esta página no existe/i).first()).toHaveCount(0);
    });
    await page.goto("/panel/ayuda/nuevo-ticket");
    await page.getByLabel(/^Título/).fill(`${tag}-${role}-problema`);
    await page.getByLabel(/Qué ocurrió/).fill("Durante la auditoría se prueba el flujo de ayuda y su persistencia.");
    await page.getByRole("button", { name: "Enviar ticket", exact: true }).click();
    await expect(page).toHaveURL(/\/panel\/ayuda\/tickets\/TKT-\d{4}-\d{5}/);
    await expect(page.getByText(`${tag}-${role}-problema`, { exact: true }).first()).toBeVisible();
    await page.getByLabel("Nueva respuesta", { exact: true }).fill(`${tag}-${role}-respuesta`);
    await page.getByRole("button", { name: "Agregar respuesta", exact: true }).click();
    await expect(page.getByText(`${tag}-${role}-respuesta`, { exact: true }).first()).toBeVisible();
    await page.reload();
    const saved = await db.supportTicket.findFirst({ where: { title: `${tag}-${role}-problema` } });
    expect(saved?.createdById).toBe(users.get(role)!.id);
    expect(saved?.scope).toBe("USER");
    expect(saved?.branchId).toBe(["ADMIN", "CONTADOR"].includes(role) ? null : branchId);
    await page.goto("/panel/ayuda/mis-tickets");
    await expect(page.getByText(`${tag}-${role}-problema`, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    expect(runtimeErrors).toEqual([]);
  });
}

test("roles comerciales y operativos no reciben el centro de soporte por URL directa", async ({ page }) => {
  for (const role of roles.filter(role => role !== "ADMIN" && role !== "SOPORTE_TECNICO")) {
    await page.context().clearCookies();
    await login(page, role);
    await page.goto("/panel/soporte/tickets");
    if (role === "CALL_CENTER") await expect(page).toHaveURL(/\/panel\/leads/);
    else await expect(page.getByRole("heading", { name: /^Acceso (restringido|comercial restringido|operativo restringido|fuera del área de Marketing)$/ }).first()).toBeVisible();
  }
});

for (const role of ["ADMIN", "CONTADOR"] as const) {
  test(`${role}: las diez áreas contables incluyen sucursales nuevas`, async ({ page }) => {
    await login(page, role);
    for (const section of ["terceros", "bancos", "conciliacion", "comprobantes", "cierres", "inventario", "documentos", "gastos", "liquidaciones", "planilla"]) {
      await test.step(section, async () => {
        await page.goto(`/panel/contabilidad/${section}`);
        await expect(page.locator(`select option[value="${tag.toLowerCase()}"]`).first()).toBeAttached();
      });
    }
  });
}

test("Soporte asigna, responde y cierra; el vendedor ve la respuesta y puede reabrir sin recibir notas internas", async ({ page }) => {
  const ticket = await db.supportTicket.create({ data: {
    code: generateTicketCodeCandidate(), title: `${tag}-ciclo-soporte`, description: "Prueba del seguimiento de un incidente.",
    category: "ERROR_DEL_SISTEMA", impact: "AFECTA_UNA_TAREA", priority: "P3_MEDIA", scope: "USER",
    createdById: users.get("VENDEDOR")!.id, createdByRole: "VENDEDOR", branchId,
    participants: { create: { userId: users.get("VENDEDOR")!.id, type: "CREATOR", addedById: users.get("VENDEDOR")!.id } },
  } });
  await login(page, "SOPORTE_TECNICO");
  await page.goto(`/panel/soporte/tickets/${ticket.code}`);
  const card = (heading: string) => page.getByRole("heading", { name: heading, exact: true }).locator("..");
  await card("Asignación").getByRole("combobox").selectOption(users.get("SOPORTE_TECNICO")!.email);
  await page.getByRole("button", { name: "Guardar asignación", exact: true }).click();
  await expect.poll(async () => (await db.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).assignedToId).toBe(users.get("SOPORTE_TECNICO")!.id);
  await card("Prioridad").getByRole("combobox").selectOption("P2_ALTA");
  await page.getByRole("button", { name: "Guardar prioridad", exact: true }).click();
  await expect.poll(async () => (await db.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).priority).toBe("P2_ALTA");
  await card("Nota interna").getByRole("textbox").fill(`${tag}-solo-operadores`);
  await page.getByRole("button", { name: "Registrar nota interna", exact: true }).click();
  await expect(card("Nota interna").getByRole("textbox")).toHaveValue("");
  await card("Respuesta al usuario").getByRole("textbox").fill(`${tag}-solucion-publica`);
  await page.getByRole("button", { name: "Enviar respuesta pública", exact: true }).click();
  await expect(card("Respuesta al usuario").getByRole("textbox")).toHaveValue("");
  for (const status of ["RECIBIDO", "EN_PROGRESO", "RESUELTO", "CERRADO"]) {
    await card("Estado").getByRole("combobox").selectOption(status);
    await page.getByRole("button", { name: "Aplicar transición", exact: true }).click();
    await expect.poll(async () => (await db.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe(status);
    await page.reload();
  }
  await page.context().clearCookies();
  await login(page, "VENDEDOR");
  const response = await page.goto(`/panel/ayuda/tickets/${ticket.code}`);
  expect(await response!.text()).not.toContain(`${tag}-solo-operadores`);
  await expect(page.getByText(`${tag}-solucion-publica`, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Agregar respuesta", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Reabrir ticket", exact: true }).click();
  await expect.poll(async () => (await db.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe("REABIERTO");
  await page.reload();
  await expect(page.getByRole("button", { name: "Agregar respuesta", exact: true })).toBeVisible();
});

test("Cajero emite una factura desde su turno y genera el asiento contable", async ({ page }) => {
  const cashier = await db.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  const branch = await db.branch.findUniqueOrThrow({ where: { code: MAPPED_BRANCH_CODE } });
  await db.user.update({ where: { id: cashier.id }, data: { role: "CAJERO", branchId: branch.id } });
  try {
    await page.goto("/login");
    await page.getByLabel(/correo/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/contraseña/i).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /ingresar|entrar|acceder/i }).click();
    await page.waitForURL(/\/panel/);
    await page.goto("/panel/caja/facturacion");
    await page.waitForLoadState("networkidle");
    const client = `${FINANCE_TAG}-audit-cajero-${tag}`;
    await page.getByLabel("Cliente o tercero").first().fill(client);
    await page.getByLabel("Concepto").first().fill("Factura del cajero en auditoría");
    await page.getByRole("button", { name: "Nueva factura", exact: true }).click();
    await expect(page.getByLabel("Cliente o tercero").first()).toHaveValue("");
    const draft = await db.cashDocument.findFirstOrThrow({ where: { thirdPartyName: client } });
    expect(draft.branchId).toBe(branch.id);
    await page.goto(`/panel/caja/facturacion?documento=${draft.id}`);
    await page.waitForLoadState("networkidle");
    const form = page.getByTestId("cash-item-form");
    await form.getByLabel("Descripción").fill("Motocicleta de prueba");
    await form.getByLabel("Cantidad").fill("1");
    await form.getByLabel("Precio").fill("500");
    await form.getByRole("button", { name: "Agregar ítem", exact: true }).click();
    await expect(form.getByLabel("Descripción")).toHaveValue("");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Emitir", exact: true }).click();
    await expect.poll(async () => (await db.cashDocument.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("EMITIDO");
    expect(await db.postingRecord.findFirst({ where: { sourceType: "CASH_DOCUMENT", sourceId: draft.id } })).not.toBeNull();
    await page.reload();
    await expect(page.getByRole("button", { name: "Emitir", exact: true })).toHaveCount(0);
  } finally {
    await db.user.update({ where: { id: cashier.id }, data: { role: cashier.role, branchId: cashier.branchId } });
  }
});

test("Administrador puede abrir turno en una sucursal creada desde el sistema", async ({ page }) => {
  await login(page, "ADMIN");
  await page.goto("/panel/caja");
  await expect(page.getByLabel(/^Sucursal/).locator(`option[value="${tag.toLowerCase()}"]`)).toHaveCount(1);
  await page.getByLabel(/^Sucursal/).selectOption(tag.toLowerCase());
  await page.getByRole("button", { name: "Abrir turno", exact: true }).click();
  await expect.poll(async () => db.cashSession.count({ where: { cashierId: users.get("ADMIN")!.id, branchId, status: "ABIERTO" } })).toBe(1);
});
