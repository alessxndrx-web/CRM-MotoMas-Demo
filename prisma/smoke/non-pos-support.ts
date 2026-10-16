/** Real ticket actions and DB visibility for all administrative roles. */
import assert from "node:assert/strict";
import { PrismaClient, type UserRole } from "@prisma/client";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { roleEnumToSpanish } from "@/server/auth/roles";
import { getCurrentUserSession } from "@/server/auth/context";
import { createTicketAction, addPublicCommentAction, addInternalCommentAction, assignTicketAction, updateTicketStatusAction, updateTicketPriorityAction, reopenTicketAction, cancelOwnTicketAction, markDuplicateAction, linkGlobalIncidentAction } from "@/server/tickets/actions";
import { createOperatorTicketAction } from "@/server/tickets/operator-actions";
import { getTicketDetail, listMyTickets, listScopedTickets } from "@/server/tickets/queries";
import type { TicketActionResult } from "@/server/tickets/types";

if (process.env.AUDIT_NON_POS !== "true" || !/^\/motomas_audit_\d+$/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error("Usa tools/audit-non-pos.mjs: requiere la base desechable de auditoría.");
const db = new PrismaClient();
const tag = `AUDIT-SUPPORT-${Date.now().toString(36)}`;
const roles: UserRole[] = ["ADMIN", "GERENTE", "LIDER_VENTAS", "VENDEDOR", "CALL_CENTER", "CAJERO", "CONTADOR", "MARKETING", "SOPORTE_TECNICO"];
const users = new Map<UserRole, { id: string; email: string }>();
const branchIds: string[] = [];
let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; console.log(`OK ${label}`); }
function code(result: TicketActionResult) { assert.ok(result.ok, JSON.stringify(result)); return result.code; }
async function sign(role: UserRole, branchCode: string) {
  const user = users.get(role)!;
  const token = await createSessionToken({ uid: user.id, email: user.email, name: tag, role: roleEnumToSpanish[role], roleEnum: role, branchId: branchCode as never, branchName: tag });
  (globalThis as Record<string, unknown>).__motomasSmokeCookies = { [SESSION_COOKIE_NAME]: token };
}
const input = { title: tag, description: "No puedo completar una tarea de prueba.", category: "ERROR_DEL_SISTEMA" as const, impact: "AFECTA_UNA_TAREA" as const };
try {
  const a = await db.branch.create({ data: { name: `${tag}-A`, code: `${tag}-a` } }); branchIds.push(a.id);
  const b = await db.branch.create({ data: { name: `${tag}-B`, code: `${tag}-b` } }); branchIds.push(b.id);
  const own = new Map<UserRole, string>();
  for (const role of roles) {
    users.set(role, await db.user.create({ data: { name: `${tag}-${role}`, email: `${tag}-${role}@smoke.local`.toLowerCase(), passwordHash: "fixture:not-a-login", role, branchId: ["ADMIN", "CONTADOR"].includes(role) ? null : a.id } }));
    await sign(role, a.code);
    const ticket = code(await createTicketAction({ ...input, title: `${tag}-${role}` })); own.set(role, ticket);
    check((await listMyTickets()).some(row => row.code === ticket), `${role}: crea y consulta su ticket`);
    check((await getTicketDetail(ticket))?.scope === "USER", `${role}: detalle propio y alcance personal`);
    check((await addPublicCommentAction(ticket, `${tag}-comentario-${role}`)).ok, `${role}: responde públicamente`);
    if (role !== "ADMIN" && role !== "SOPORTE_TECNICO") {
      check(!(await addInternalCommentAction(ticket, "nota no autorizada")).ok, `${role}: no agrega notas internas`);
      check(!(await updateTicketStatusAction(ticket, "RECIBIDO")).ok, `${role}: no opera estados técnicos`);
      check(!(await assignTicketAction(ticket, users.get("ADMIN")!.email)).ok, `${role}: no asigna operadores`);
      check(!(await updateTicketPriorityAction(ticket, "P1_CRITICA")).ok, `${role}: no cambia prioridad técnica`);
      check(!(await createOperatorTicketAction({ ...input, scope: "GLOBAL" })).ok, `${role}: no crea incidentes globales`);
    }
  }
  await sign("SOPORTE_TECNICO", a.code);
  const sellerCode = own.get("VENDEDOR")!;
  check((await addInternalCommentAction(sellerCode, `${tag}-secreto-interno`)).ok, "Soporte agrega nota interna");
  check((await assignTicketAction(sellerCode, users.get("SOPORTE_TECNICO")!.email)).ok, "Soporte asigna un operador activo");
  check(!(await assignTicketAction(sellerCode, users.get("VENDEDOR")!.email)).ok, "No se asigna un vendedor como operador");
  check((await updateTicketPriorityAction(sellerCode, "P2_ALTA")).ok, "Soporte clasifica prioridad");
  check(!(await updateTicketStatusAction(sellerCode, "CERRADO")).ok, "No se salta de nuevo a cerrado");
  for (const status of ["RECIBIDO", "EN_PROGRESO", "RESUELTO", "CERRADO"]) check((await updateTicketStatusAction(sellerCode, status)).ok, `Soporte avanza a ${status}`);
  check(!(await addPublicCommentAction(sellerCode, "comentario cerrado")).ok, "Ticket cerrado bloquea comentarios");
  await sign("VENDEDOR", a.code);
  const detail = await getTicketDetail(sellerCode);
  check(detail?.priority === null && !JSON.stringify(detail).includes(`${tag}-secreto-interno`), "Solicitante no recibe prioridad ni notas internas");
  check(detail?.assignedLabel === "Equipo de soporte asignado", "Solicitante recibe identidad de equipo, sin operador privado");
  check((await reopenTicketAction(sellerCode)).ok, "Solicitante reabre su ticket cerrado");
  check((await db.supportTicket.findUniqueOrThrow({ where: { code: sellerCode } })).resolvedAt === null, "Reapertura limpia fecha de resolución");
  check(!(await getTicketDetail(own.get("CAJERO")!)), "Vendedor no consulta ticket ajeno");
  check(!(await addPublicCommentAction(own.get("CAJERO")!, "ajeno")).ok, "Vendedor no comenta ticket ajeno");
  check(!(await cancelOwnTicketAction(own.get("CAJERO")!)).ok, "Vendedor no cancela ticket ajeno");
  check((await cancelOwnTicketAction(sellerCode)).ok, "Solicitante cancela su ticket reabierto");
  await sign("SOPORTE_TECNICO", a.code);
  const branchTicket = code(await createOperatorTicketAction({ ...input, title: `${tag}-sucursalA`, scope: "BRANCH", branchCode: a.code }));
  const otherBranch = code(await createOperatorTicketAction({ ...input, title: `${tag}-sucursalB`, scope: "BRANCH", branchCode: b.code }));
  const privateTicket = code(await createOperatorTicketAction({ ...input, title: `${tag}-seguridad`, category: "SEGURIDAD", scope: "BRANCH", branchCode: a.code }));
  const globalTicket = code(await createOperatorTicketAction({ ...input, title: `${tag}-global`, scope: "GLOBAL" }));
  check((await linkGlobalIncidentAction(branchTicket, globalTicket)).ok, "Soporte vincula incidente global");
  check(!(await linkGlobalIncidentAction(branchTicket, branchTicket)).ok, "No permite vinculación circular consigo mismo");
  check((await markDuplicateAction(otherBranch, branchTicket)).ok, "Soporte marca duplicado");
  check(!(await markDuplicateAction(branchTicket, otherBranch)).ok, "No permite ciclo de duplicados");
  await sign("GERENTE", a.code);
  const visible = (await listScopedTickets()).map(row => row.code);
  check(visible.includes(branchTicket), "Gerente consulta incidente operativo de su sucursal");
  check(!visible.includes(otherBranch) && !await getTicketDetail(otherBranch), "Gerente no consulta incidentes de otra sucursal");
  check(!visible.includes(privateTicket) && !await getTicketDetail(privateTicket), "Gerente no recibe incidentes privados de seguridad");
  check(!visible.includes(own.get("VENDEDOR")!), "Gerente no recibe ticket personal del vendedor");
  for (const role of ["ADMIN", "SOPORTE_TECNICO"] as const) {
    await sign(role, a.code);
    check((await listScopedTickets()).some(row => row.code === otherBranch), `${role}: bandeja operativa global`);
    check(!(await listMyTickets()).some(row => row.code === own.get("CAJERO")), `${role}: mis tickets conserva alcance personal`);
    check((await getTicketDetail(privateTicket))?.code === privateTicket, `${role}: accede al incidente de seguridad`);
  }
  await sign("ADMIN", a.code);
  await db.user.update({ where: { id: users.get("ADMIN")!.id }, data: { role: "VENDEDOR", branchId: a.id } });
  check((await getCurrentUserSession())?.roleEnum === "VENDEDOR", "Retirar privilegios surte efecto con la misma cookie");
  const runtime = globalThis as unknown as { motomasPrisma?: PrismaClient };
  const original = runtime.motomasPrisma;
  runtime.motomasPrisma = new Proxy(db, { get(target, property, receiver) {
    if (property === "user") return { findUnique: async () => { throw new Error("AUDIT_DATABASE_UNAVAILABLE"); } };
    return Reflect.get(target, property, receiver);
  } });
  try { check(await getCurrentUserSession() === null, "Un fallo de base no restaura los privilegios antiguos de la cookie"); }
  finally { runtime.motomasPrisma = original; }
  console.log(`PASS ${checks} comprobaciones de soporte y nueve roles`);
} finally {
  const userIds = [...users.values()].map(user => user.id);
  await db.supportTicket.deleteMany({ where: { title: { startsWith: tag } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.branch.deleteMany({ where: { id: { in: branchIds } } });
  await db.$disconnect();
}
