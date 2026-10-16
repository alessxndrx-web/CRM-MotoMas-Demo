import assert from "node:assert/strict";
import { PrismaClient, type UserRole } from "@prisma/client";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { roleEnumToSpanish } from "@/server/auth/roles";
import { saveSupplierAction, setSupplierActiveAction } from "@/server/suppliers/actions";

if (process.env.AUDIT_NON_POS !== "true" || !/^\/motomas_audit_\d+$/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error("Usa la base desechable de tools/audit-non-pos.mjs.");
const db = new PrismaClient();
const tag = `AUDIT-SUPPLIERS-${Date.now().toString(36)}`;
const branchIds: string[] = [], userIds: string[] = [];
const users = new Map<UserRole, { id: string; email: string }>();
let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; console.log(`OK ${label}`); }
async function sign(role: UserRole, branchCode: string) {
  const user = users.get(role)!;
  const token = await createSessionToken({ uid: user.id, email: user.email, name: tag, role: roleEnumToSpanish[role], roleEnum: role, branchId: branchCode as never, branchName: tag });
  (globalThis as Record<string, unknown>).__motomasSmokeCookies = { [SESSION_COOKIE_NAME]: token };
}
try {
  const a = await db.branch.create({ data: { code: `${tag}-a`, name: `${tag}-A` } }); branchIds.push(a.id);
  const b = await db.branch.create({ data: { code: `${tag}-b`, name: `${tag}-B` } }); branchIds.push(b.id);
  const inactive = await db.branch.create({ data: { code: `${tag}-inactive`, name: `${tag}-Inactiva`, isActive: false } }); branchIds.push(inactive.id);
  for (const role of ["ADMIN", "CONTADOR", "GERENTE", "LIDER_VENTAS", "VENDEDOR", "CALL_CENTER", "CAJERO", "MARKETING", "SOPORTE_TECNICO"] as const) {
    const user = await db.user.create({ data: { name: `${tag}-${role}`, email: `${tag}-${role}@smoke.local`.toLowerCase(), passwordHash: "fixture:not-a-login", role, branchId: ["ADMIN", "CONTADOR"].includes(role) ? null : a.id } }); users.set(role, user); userIds.push(user.id);
    await sign(role, a.code);
    const result = await saveSupplierAction({ nombre: `${tag}-${role}`, branchCode: b.code });
    const allowed = ["ADMIN", "CONTADOR", "GERENTE"].includes(role);
    check(result.ok === allowed, `${role}: alta de proveedores según permiso real`);
    if (allowed) {
      const saved = await db.thirdParty.findFirstOrThrow({ where: { name: `${tag}-${role}` } });
      check(saved.branchId === (role === "GERENTE" ? a.id : b.id), `${role}: sucursal global seleccionada o sucursal propia obligatoria`);
      check((await saveSupplierAction({ supplierId: saved.id, nombre: saved.name, telefono: "88881234" })).ok, `${role}: edita proveedor autorizado`);
      check((await setSupplierActiveAction({ supplierId: saved.id, activo: false })).ok, `${role}: desactiva sin eliminar historial`);
      const persisted = await db.thirdParty.findUniqueOrThrow({ where: { id: saved.id } });
      check(!persisted.isActive && persisted.phone === "88881234", `${role}: cambios persistidos`);
    }
  }
  for (const role of ["ADMIN", "CONTADOR"] as const) {
    await sign(role, a.code);
    check(!(await saveSupplierAction({ nombre: `${tag}-missing-${role}` })).ok, `${role}: no crea sin seleccionar sucursal`);
    check(!(await saveSupplierAction({ nombre: `${tag}-inactive-${role}`, branchCode: inactive.code })).ok, `${role}: no crea en sucursal inactiva`);
  }
  const supplierB = await db.thirdParty.findFirstOrThrow({ where: { name: `${tag}-ADMIN` } });
  await sign("GERENTE", a.code);
  check(!(await saveSupplierAction({ supplierId: supplierB.id, nombre: `${tag}-ajeno` })).ok, "Gerente no edita proveedor de otra sucursal");
  check(!(await setSupplierActiveAction({ supplierId: supplierB.id, activo: true })).ok, "Gerente no reactiva proveedor de otra sucursal");
  const customer = await db.thirdParty.create({ data: { type: "CLIENTE", name: `${tag}-tercero-cliente`, branchId: a.id } });
  check(!(await saveSupplierAction({ supplierId: customer.id, nombre: `${tag}-tipo-invalido` })).ok, "El módulo de proveedores no modifica terceros cliente");
  console.log(`PASS ${checks} comprobaciones de proveedores`);
} finally {
  await db.thirdParty.deleteMany({ where: { name: { startsWith: tag } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.branch.deleteMany({ where: { id: { in: branchIds } } });
  await db.$disconnect();
}
