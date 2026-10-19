import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { postJournalEntryAction } from "@/server/contabilidad/actions";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { getPrisma } from "@/server/db/prisma";

assert.equal(new URL(process.env.DATABASE_URL ?? "").pathname, "/motomas_finance_test");
assert.equal(new URL(process.env.DATABASE_URL ?? "").hostname, "127.0.0.1");
assert.equal(new URL(process.env.DATABASE_URL ?? "").port, "55438");
const db = new PrismaClient();
const tag = `FJI-${Date.now()}`;
let checks = 0;
function check(v: unknown, label: string) { assert.ok(v, label); checks++; console.log(`OK ${label}`); }
try {
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const token = await createSessionToken({ uid: admin.id, name: admin.name, email: admin.email, role: "Administrador", roleEnum: "ADMIN", branchId: GLOBAL_BRANCH_ID, branchName: "Global" });
  (globalThis as Record<string, unknown>).__motomasSmokeCookies = { [SESSION_COOKIE_NAME]: token };
  const account = await db.chartAccount.create({ data: { code: String(Date.now()), name: tag, type: "ACTIVO", nature: "DEUDORA", effectiveFrom: new Date("2020-01-01") } });
  async function draft(suffix: string, lines: Array<{ debit: string; credit: string }>) {
    return db.journalEntry.create({ data: { entryNumber: `${tag}-${suffix}`, entryDate: new Date("2026-10-18"), createdByUserId: admin.id, lines: { create: lines.map((l, i) => ({ ...l, accountId: account.id, position: i })) } } });
  }
  const single = await draft("single", [{ debit: "0", credit: "0" }]);
  check(!(await postJournalEntryAction({ entryId: single.id })).ok, "Línea única rechazada por acción real");
  const zero = await draft("zero", [{ debit: "0", credit: "0" }, { debit: "0", credit: "0" }]);
  check(!(await postJournalEntryAction({ entryId: zero.id })).ok, "Asiento cero rechazado");
  const both = await draft("both", [{ debit: "1", credit: "1" }, { debit: "1", credit: "1" }]);
  check(!(await postJournalEntryAction({ entryId: both.id })).ok, "Debe y haber simultáneos rechazados");
  const negative = await draft("negative", [{ debit: "-1", credit: "0" }, { debit: "0", credit: "-1" }]);
  check(!(await postJournalEntryAction({ entryId: negative.id })).ok, "Importes negativos rechazados");
  const valid = await draft("valid", [{ debit: "0.30", credit: "0" }, { debit: "0", credit: "0.30" }]);
  const attempts = await Promise.all([postJournalEntryAction({ entryId: valid.id }), postJournalEntryAction({ entryId: valid.id })]);
  check(attempts.filter((r) => r.ok).length === 1, "Una contabilización ante dos solicitudes simultáneas");
  check(await db.financialAuditEvent.count({ where: { action: "JOURNAL_ENTRY_POSTED", entityId: valid.id } }) === 1, "Una sola auditoría de contabilización");
  check(await db.journalEntry.count({ where: { id: { in: [single.id, zero.id, both.id, negative.id] }, status: "BORRADOR" } }) === 4, "Rechazos conservan borradores");
  console.log(`${checks} verificaciones correctas`);
} finally { await db.$disconnect(); await getPrisma().$disconnect(); }
