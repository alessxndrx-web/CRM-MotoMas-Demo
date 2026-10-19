import { Prisma, type CrmFinanceDocument, type CrmFinanceKind } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { authorizeFinancialFoundation } from "@/server/finance/context";
import { runFinancialTransaction, type FinancialTransactionContext } from "@/server/finance/transaction";
import { describeChartAccountPostingBlock } from "@/server/finance/chart-of-accounts/shared";
import { assertAccountingDateIsOpen } from "@/server/finance/periods";
import { crmFinanceKinds, type CrmFinanceDraft } from "@/server/finance/crm/shared";

const routes = ["/panel/contabilidad", "/panel/contabilidad/gestion", "/panel/contabilidad/reportes"];
export function crmMoney(value: string, positive = true) {
  if (typeof value !== "string" || !/^\d{1,10}(\.\d{1,2})?$/.test(value)) throw new Error("Importe inválido; usa hasta dos decimales.");
  const v = new Prisma.Decimal(value);
  if (v.gt("9999999999.99") || (positive && v.lte(0))) throw new Error("Importe fuera de rango.");
  return v;
}
export function crmDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Fecha inválida.");
  const date = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Fecha inválida.");
  return date;
}
function clean(value: string | undefined, max = 500) { return (value ?? "").trim().replace(/[\u0000-\u001f]/g, " ").slice(0, max); }
export async function crmWrite<T>(run: (ctx: FinancialTransactionContext) => Promise<T>) {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return auth;
  return runFinancialTransaction({ actor: auth.actor, timeoutMs: 30000, revalidate: routes,
    errorMessage: "No se guardaron cambios. Revisa los datos, permisos y el estado del documento.",
    run: async (ctx) => {
      await ctx.tx.$executeRaw`SELECT pg_advisory_xact_lock(21919001)`;
      await ctx.tx.$executeRaw`LOCK TABLE accounting_closings IN SHARE MODE`;
      return run(ctx);
    } });
}
export async function crmAudit(ctx: FinancialTransactionContext, id: string, action: "CRM_FINANCE_CREATED" | "CRM_FINANCE_CHANGED" | "CRM_FINANCE_CONFIGURED" | "CRM_BANK_MATCHED", data: Record<string, unknown>, reason?: string, before?: Record<string, unknown>) {
  await ctx.audit({ domain: "CONTABILIDAD", entityType: action === "CRM_FINANCE_CONFIGURED" ? "CRM_FINANCE_CONFIG" : action === "CRM_BANK_MATCHED" ? "CRM_BANK_STATEMENT" : "CRM_FINANCE_DOCUMENT", entityId: id, action,
    reason: reason ?? null, before, after: data, metadata: { component: "HEADER", operation: action === "CRM_FINANCE_CREATED" ? "CREATE" : "UPDATE" } });
}
async function usable(ctx: FinancialTransactionContext, id: string, date: Date) {
  await ctx.tx.$queryRaw`SELECT id FROM chart_accounts WHERE id=${id} FOR SHARE`;
  const a = await ctx.tx.chartAccount.findUnique({ where: { id } });
  if (!a) return ctx.fail("La cuenta no existe.");
  const error = describeChartAccountPostingBlock(a, date);
  if (error) return ctx.fail(error);
  return a;
}
export async function createCrmDraft(input: CrmFinanceDraft, existingId?: string) {
  return crmWrite(async (ctx) => {
    ctx.ensure(Object.hasOwn(crmFinanceKinds, input.kind) && typeof input.requestKey === "string" && input.requestKey.length >= 16 && input.requestKey.length <= 80, "Tipo o identificador de solicitud inválido.");
    const prior = await ctx.tx.crmFinanceDocument.findUnique({ where: { requestKey: input.requestKey } });
    if (prior) {
      ctx.ensure(prior.createdById === ctx.actor.userId, "La solicitud ya fue utilizada.");
      if (!existingId) return { id: prior.id };
      ctx.ensure(prior.id === existingId && ["DRAFT", "REJECTED"].includes(prior.status), "Solo el creador puede corregir un borrador o documento rechazado.");
    } else ctx.ensure(!existingId, "El documento a corregir no existe.");
    const policy = await ctx.tx.crmFinancePolicy.findUnique({ where: { id: "main" } });
    ctx.ensure(Boolean(policy), "Configura primero entidad y moneda funcional.");
    ctx.ensure(["NIO", "USD"].includes(input.currency), "Moneda inválida.");
    ctx.ensure(/^\d{1,8}(\.\d{1,6})?$/.test(input.exchangeRate), "Tipo de cambio inválido.");
    const rate = new Prisma.Decimal(input.exchangeRate);
    ctx.ensure(rate.gt(0) && (input.currency !== policy!.functionalCurrency || rate.equals(1)), "La moneda funcional requiere tipo de cambio 1.");
    const amount = crmMoney(input.amount); const baseAmount = amount.times(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    ctx.ensure(baseAmount.gt(0) && baseAmount.lte("9999999999.99"), "Conversión fuera de rango.");
    const date = crmDate(input.date); const dueDate = input.dueDate ? crmDate(input.dueDate) : null;
    ctx.ensure(!dueDate || dueDate >= date, "El vencimiento no puede preceder a la emisión.");
    ctx.ensure(input.debitAccountId !== input.creditAccountId, "Selecciona cuentas diferentes para debe y haber.");
    const [debit, credit, branch] = await Promise.all([usable(ctx, input.debitAccountId, date), usable(ctx, input.creditAccountId, date), ctx.tx.branch.findUnique({ where: { id: input.branchId } })]);
    ctx.ensure(Boolean(branch?.isActive), "Selecciona una sucursal activa.");
    const reference = clean(input.reference, 120).toUpperCase(); const description = clean(input.description);
    ctx.ensure(Boolean(reference && description), "Referencia y concepto son obligatorios.");
    ctx.ensure(!input.parentId || ["PAYABLE_PAYMENT", "DEPRECIATION", "ASSET_DISPOSAL"].includes(input.kind), "El documento de origen solo se utiliza en pagos, depreciaciones y bajas.");
    const parent = input.parentId ? await ctx.tx.crmFinanceDocument.findUnique({ where: { id: input.parentId } }) : null;
    if (input.thirdPartyId) {
      const party = await ctx.tx.thirdParty.findUnique({ where: { id: input.thirdPartyId } });
      ctx.ensure(Boolean(party?.isActive && party.branchId === input.branchId), "El tercero debe estar activo en la sucursal.");
      if (input.kind === "PAYABLE_INVOICE") ctx.ensure(party?.type === "PROVEEDOR", "La factura requiere un proveedor.");
    }
    if (input.kind === "PAYABLE_INVOICE") ctx.ensure(Boolean(input.thirdPartyId && dueDate) && credit.type === "PASIVO", "Factura: proveedor, vencimiento y cuenta por pagar de pasivo obligatorios.");
    if (input.kind === "ASSET_ACQUISITION") ctx.ensure(debit.type === "ACTIVO" && Number.isInteger(input.usefulLifeMonths) && input.usefulLifeMonths! > 0 && input.usefulLifeMonths! <= 1200, "Activo: cuenta de activo y vida útil entre 1 y 1200 meses obligatorias.");
    const residual = input.residualAmount ? crmMoney(input.residualAmount, false) : null;
    ctx.ensure(!residual || residual.lte(amount), "El residual supera el costo del activo.");
    if (input.attachmentUrl) { const u = new URL(input.attachmentUrl); ctx.ensure(u.protocol === "https:", "El respaldo debe ser un enlace HTTPS."); }
    const taxBase = input.taxBase ? crmMoney(input.taxBase) : null;
    const taxRate = input.taxRate ? new Prisma.Decimal(input.taxRate) : null;
    if (input.kind === "TAX") {
      ctx.ensure(Boolean(taxBase && taxRate && input.certificate) && taxRate!.gt(0) && taxRate!.lte(100), "Impuesto: base, tasa y constancia requeridas.");
      ctx.ensure(taxBase!.times(taxRate!).div(100).toDecimalPlaces(2).equals(amount), "El importe no corresponde a base por tasa.");
    }
    if (input.fxAccountId) await usable(ctx, input.fxAccountId, date);
    ctx.ensure(!input.cashFlowClass || ["OPERATING", "INVESTING", "FINANCING", "INTERNAL"].includes(input.cashFlowClass), "Clasificación de flujo inválida.");
    const sequence = prior ? null : await ctx.tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('crm_finance_voucher_seq') AS n`;
    const data = {
      number: prior?.number ?? `CRM-${date.getUTCFullYear()}-${String(sequence![0].n).padStart(7, "0")}`, requestKey: input.requestKey, kind: input.kind as CrmFinanceKind,
      fxAccountId: input.fxAccountId || null, cashFlowClass: input.cashFlowClass || null,
      branchId: input.branchId, thirdPartyId: input.thirdPartyId || (input.kind === "PAYABLE_PAYMENT" ? parent?.thirdPartyId : null) || null, parentId: input.parentId || null,
      receivableId: input.receivableId || null, bankAccountId: input.bankAccountId || null, cashSessionId: input.cashSessionId || null,
      debitAccountId: debit.id, creditAccountId: credit.id, createdById: ctx.actor.userId,
      date, dueDate, currency: input.currency, exchangeRate: rate, amount, baseAmount, reference, description,
      usefulLifeMonths: input.usefulLifeMonths || null, residualAmount: residual,
      period: input.kind === "DEPRECIATION" ? input.date.slice(0, 7) : null,
      taxBase, taxRate, certificate: clean(input.certificate, 120) || null, attachmentUrl: input.attachmentUrl || null,
    };
    const row = existingId ? await ctx.tx.crmFinanceDocument.update({ where: { id: existingId }, data: { ...data, status: "DRAFT", reviewedById: null, rejectionReason: null } }) : await ctx.tx.crmFinanceDocument.create({ data });
    await crmAudit(ctx, row.id, existingId ? "CRM_FINANCE_CHANGED" : "CRM_FINANCE_CREATED", { status: row.status, amount, currency: row.currency, description, reference, type: row.kind });
    return { id: row.id };
  });
}

async function validatePosting(ctx: FinancialTransactionContext, doc: CrmFinanceDocument) {
  const period = await assertAccountingDateIsOpen(ctx.tx, doc.date, doc.branchId);
  if (!period.ok) return ctx.fail(period.error);
  await usable(ctx, doc.debitAccountId, doc.date); await usable(ctx, doc.creditAccountId, doc.date);
  if (doc.parentId) {
    const p = await ctx.tx.crmFinanceDocument.findUnique({ where: { id: doc.parentId }, include: { children: { where: { status: "POSTED" } } } });
    ctx.ensure(Boolean(p && p.status === "POSTED" && p.branchId === doc.branchId && p.currency === doc.currency && p.date <= doc.date), "El documento de origen debe estar contabilizado en la misma sucursal y moneda y no ser posterior al movimiento.");
    if (doc.kind === "PAYABLE_PAYMENT") {
      ctx.ensure(p!.kind === "PAYABLE_INVOICE" && doc.debitAccountId === p!.creditAccountId && doc.thirdPartyId === p!.thirdPartyId, "El pago debe liquidar la cuenta de control y proveedor de la factura.");
      const paid = p!.children.filter((c) => c.kind === "PAYABLE_PAYMENT").reduce((s, c) => s.plus(c.amount), new Prisma.Decimal(0));
      ctx.ensure(paid.plus(doc.amount).lte(p!.amount), "El pago supera el saldo de la factura.");
      // Until a dedicated FX adjustment is specified, refuse a settlement that
      // would leave an unexplained functional-currency balance.
      if (!doc.exchangeRate.equals(p!.exchangeRate)) {
        ctx.ensure(Boolean(doc.fxAccountId), "Selecciona la cuenta de diferencia cambiaria.");
        const fx = await usable(ctx, doc.fxAccountId!, doc.date);
        const loss = doc.exchangeRate.gt(p!.exchangeRate);
        ctx.ensure(loss ? fx.type === "GASTO" : fx.type === "INGRESO", "La diferencia cambiaria requiere gasto para pérdida o ingreso para ganancia.");
      }
    }
    if (doc.kind === "DEPRECIATION") {
      ctx.ensure(!p!.children.some((c) => c.kind === "ASSET_DISPOSAL"), "El activo ya está dado de baja.");
      ctx.ensure(p!.kind === "ASSET_ACQUISITION" && Boolean(p!.usefulLifeMonths), "Selecciona un activo con política de depreciación.");
      const depreciable = p!.amount.minus(p!.residualAmount ?? 0);
      const previous = p!.children.filter((c) => c.kind === "DEPRECIATION").reduce((s, c) => s.plus(c.amount), new Prisma.Decimal(0));
      const elapsed = (doc.date.getUTCFullYear() - p!.date.getUTCFullYear()) * 12 + doc.date.getUTCMonth() - p!.date.getUTCMonth() + 1;
      const monthly = elapsed >= p!.usefulLifeMonths! ? depreciable.minus(previous) : Prisma.Decimal.min(depreciable.div(p!.usefulLifeMonths!).toDecimalPlaces(2), depreciable.minus(previous));
      ctx.ensure(monthly.gt(0) && monthly.equals(doc.amount), `Depreciación mensual esperada: ${monthly.toFixed(2)}.`);
      ctx.ensure(doc.exchangeRate.equals(p!.exchangeRate), "La depreciación conserva el tipo de cambio de adquisición.");
      const debit = await ctx.tx.chartAccount.findUniqueOrThrow({ where: { id: doc.debitAccountId } });
      const credit = await ctx.tx.chartAccount.findUniqueOrThrow({ where: { id: doc.creditAccountId } });
      ctx.ensure(debit.type === "GASTO" && credit.type === "ACTIVO" && credit.nature === "ACREEDORA", "Depreciación: gasto contra depreciación acumulada de activo acreedor.");
    }
    if (doc.kind === "ASSET_DISPOSAL") {
      ctx.ensure(p!.kind === "ASSET_ACQUISITION" && !p!.children.some((c) => c.kind === "ASSET_DISPOSAL"), "Selecciona un activo vigente.");
      ctx.ensure(doc.amount.equals(p!.amount) && doc.exchangeRate.equals(p!.exchangeRate) && doc.creditAccountId === p!.debitAccountId, "La baja conserva costo bruto, cuenta y cambio histórico del activo.");
      const loss = await usable(ctx, doc.debitAccountId, doc.date);
      ctx.ensure(loss.type === "GASTO", "Selecciona la cuenta de pérdida por baja.");
    }
  } else ctx.ensure(!["PAYABLE_PAYMENT", "DEPRECIATION", "ASSET_DISPOSAL"].includes(doc.kind), "Selecciona el documento de origen.");
  if (doc.bankAccountId) {
    const bank = await ctx.tx.bankAccount.findUnique({ where: { id: doc.bankAccountId } });
    ctx.ensure(Boolean(bank?.isActive && bank.branchId === doc.branchId && bank.currency === doc.currency && bank.ledgerAccountId), "Configura una cuenta bancaria activa de la misma sucursal y moneda.");
    const expected = ["BANK_IN", "RECEIVABLE_COLLECTION"].includes(doc.kind) ? doc.debitAccountId : doc.creditAccountId;
    ctx.ensure(bank!.ledgerAccountId === expected, "El movimiento debe usar la cuenta contable vinculada al banco.");
  }
  if (["BANK_IN", "BANK_OUT"].includes(doc.kind)) ctx.ensure(Boolean(doc.bankAccountId), "Selecciona el banco.");
  if (["PAYABLE_PAYMENT", "RECEIVABLE_COLLECTION"].includes(doc.kind)) ctx.ensure(Boolean(doc.bankAccountId) !== Boolean(doc.cashSessionId), "Selecciona banco o turno administrativo, exclusivamente, para la liquidación.");
  if (doc.cashSessionId || ["CASH_IN", "CASH_OUT"].includes(doc.kind)) {
    const shift = doc.cashSessionId ? await ctx.tx.cashSession.findUnique({ where: { id: doc.cashSessionId }, include: { crmRegister: true } }) : null;
    ctx.ensure(Boolean(shift?.status === "ABIERTO" && shift.branchId === doc.branchId && shift.crmRegister?.isActive && shift.crmRegister.currency === doc.currency), "Selecciona un turno abierto de caja administrativa de la misma sucursal y moneda.");
    ctx.ensure((["CASH_IN", "RECEIVABLE_COLLECTION"].includes(doc.kind) ? doc.debitAccountId : doc.creditAccountId) === shift!.crmRegister!.accountId, "El movimiento debe usar la cuenta de la caja seleccionada.");
    ctx.ensure(!doc.bankAccountId, "El movimiento no puede afectar banco y caja simultáneamente; registra el traspaso con su contrapartida contable.");
    if (!["CASH_IN", "RECEIVABLE_COLLECTION"].includes(doc.kind)) {
      const balance = await ctx.tx.journalEntryLine.aggregate({ where: { accountId: shift!.crmRegister!.accountId, entry: { branchId: doc.branchId, status: { in: ["CONTABILIZADO", "CONCILIADO"] } } }, _sum: { debit: true, credit: true } });
      ctx.ensure((balance._sum.debit ?? new Prisma.Decimal(0)).minus(balance._sum.credit ?? 0).gte(doc.baseAmount), "La salida supera el efectivo disponible en el libro de la caja.");
    }
  }
}

export async function transitionCrmDocument(id: string, action: string, reason?: string, reversalDate?: string) {
  return crmWrite(async (ctx) => {
    const doc = await ctx.tx.crmFinanceDocument.findUnique({ where: { id } });
    if (!doc) return ctx.fail("El documento no existe.");
    const policy = await ctx.tx.crmFinancePolicy.findUniqueOrThrow({ where: { id: "main" } });
    const before = doc.status;
    if (action === "submit") {
      ctx.ensure(["DRAFT", "REJECTED"].includes(doc.status), "Solo se envían borradores o documentos rechazados.");
      await ctx.tx.crmFinanceDocument.update({ where: { id }, data: { status: "IN_REVIEW", rejectionReason: null } });
    } else if (action === "cancel") {
      ctx.ensure(["DRAFT", "IN_REVIEW", "APPROVED"].includes(doc.status) && Boolean(clean(reason)), "Solo se retiran documentos sin contabilizar, con justificación.");
      await ctx.tx.crmFinanceDocument.update({ where: { id }, data: { status: "REJECTED", rejectionReason: clean(reason) } });
    } else if (action === "approve" || action === "reject") {
      ctx.ensure(doc.status === "IN_REVIEW", "El documento no está en revisión.");
      ctx.ensure(!policy.requireSeparation || doc.createdById !== ctx.actor.userId, "La revisión requiere otra persona autorizada.");
      ctx.ensure(action !== "reject" || Boolean(clean(reason)), "Indica el motivo del rechazo.");
      await ctx.tx.crmFinanceDocument.update({ where: { id }, data: { status: action === "approve" ? "APPROVED" : "REJECTED", reviewedById: ctx.actor.userId, rejectionReason: action === "reject" ? clean(reason) : null } });
    } else if (action === "post") {
      if (doc.status === "POSTED") return { id, entryId: doc.journalEntryId };
      ctx.ensure(doc.status === "APPROVED", "Primero debe aprobarse el documento.");
      await validatePosting(ctx, doc);
      if (doc.kind === "RECEIVABLE_COLLECTION") await collectReceivable(ctx, doc);
      const postingLines = [{ accountId: doc.debitAccountId, debit: doc.baseAmount, credit: new Prisma.Decimal(0), position: 0, concept: doc.description }, { accountId: doc.creditAccountId, debit: new Prisma.Decimal(0), credit: doc.baseAmount, position: 1, concept: doc.description }];
      if (doc.kind === "PAYABLE_PAYMENT") {
        const origin = await ctx.tx.crmFinanceDocument.findUniqueOrThrow({ where: { id: doc.parentId! }, include: { children: { where: { status: "POSTED", kind: "PAYABLE_PAYMENT" } } } });
        const paid = origin.children.reduce((v, c) => v.plus(c.amount), new Prisma.Decimal(0));
        const already = origin.children.reduce((v, c) => v.plus(c.amount.times(origin.exchangeRate).toDecimalPlaces(2)), new Prisma.Decimal(0));
        const principal = paid.plus(doc.amount).equals(origin.amount) ? origin.baseAmount.minus(already) : doc.amount.times(origin.exchangeRate).toDecimalPlaces(2);
        postingLines[0].debit = principal;
        const difference = doc.baseAmount.minus(principal);
        if (!difference.isZero()) {
          ctx.ensure(Boolean(doc.fxAccountId), "La liquidación requiere una cuenta de diferencia de cambio o redondeo.");
          const fx = await usable(ctx, doc.fxAccountId!, doc.date);
          ctx.ensure(difference.gt(0) ? fx.type === "GASTO" : fx.type === "INGRESO", "Selecciona gasto para pérdida o ingreso para ganancia de cambio.");
          postingLines.push({ accountId: doc.fxAccountId!, debit: difference.gt(0) ? difference : new Prisma.Decimal(0), credit: difference.lt(0) ? difference.negated() : new Prisma.Decimal(0), position: 2, concept: "Diferencia cambiaria realizada" });
        }
      }
      if (doc.kind === "ASSET_DISPOSAL") {
        const asset = await ctx.tx.crmFinanceDocument.findUniqueOrThrow({ where: { id: doc.parentId! }, include: { children: { where: { kind: "DEPRECIATION", status: "POSTED" } } } });
        const depreciation = asset.children.reduce((v, d) => v.plus(d.baseAmount), new Prisma.Decimal(0));
        postingLines[0].debit = asset.baseAmount.minus(depreciation); postingLines[1].credit = asset.baseAmount;
        for (const d of asset.children) postingLines.push({ accountId: d.creditAccountId, debit: d.baseAmount, credit: new Prisma.Decimal(0), position: postingLines.length, concept: "Baja de depreciación acumulada" });
      }
      const validLines = postingLines.filter((l) => l.debit.gt(0) || l.credit.gt(0));
      for (const accountId of new Set(validLines.map((l) => l.accountId))) await usable(ctx, accountId, doc.date);
      ctx.ensure(validLines.length >= 2 && validLines.reduce((v, l) => v.plus(l.debit).minus(l.credit), new Prisma.Decimal(0)).isZero(), "El asiento generado no cumple la partida doble.");
      const entry = await ctx.tx.journalEntry.create({ data: {
        entryNumber: doc.number, entryDate: doc.date, branchId: doc.branchId, source: "MANUAL", status: "CONTABILIZADO",
        createdByUserId: doc.createdById, postedByUserId: ctx.actor.userId, postedAt: new Date(), notes: `${doc.description} · ${doc.reference}`,
        lines: { create: validLines },
      } });
      await ctx.tx.crmFinanceDocument.update({ where: { id }, data: { status: "POSTED", journalEntryId: entry.id } });
    } else if (action === "reverse") {
      ctx.ensure(doc.status === "POSTED" && Boolean(clean(reason) && reversalDate), "Indica fecha de reversión y motivo para un documento contabilizado.");
      ctx.ensure(await ctx.tx.crmFinanceDocument.count({ where: { parentId: id, status: "POSTED" } }) === 0, "Revierte primero los documentos dependientes.");
      if (doc.kind === "DEPRECIATION") ctx.ensure(!await ctx.tx.crmFinanceDocument.findFirst({ where: { parentId: doc.parentId, kind: "ASSET_DISPOSAL", status: "POSTED" } }), "Revierte primero la baja del activo.");
      if (doc.cashSessionId) {
        const shift = await ctx.tx.cashSession.findUnique({ where: { id: doc.cashSessionId } });
        ctx.ensure(shift?.status === "ABIERTO", "Un movimiento de caja cerrada requiere un ajuste posterior, no reescribir su arqueo.");
      }
      const date = crmDate(reversalDate!);
      ctx.ensure(date >= doc.date, "La reversión no puede preceder al original.");
      const open = await assertAccountingDateIsOpen(ctx.tx, date, doc.branchId); if (!open.ok) return ctx.fail(open.error);
      const original = await ctx.tx.journalEntry.findUniqueOrThrow({ where: { id: doc.journalEntryId! }, include: { lines: true } });
      ctx.ensure(!await ctx.tx.crmBankStatementLine.findFirst({ where: { matchedLineId: { in: original.lines.map((l) => l.id) } } }), "Desvincula la conciliación bancaria antes de revertir.");
      await ctx.tx.journalEntry.create({ data: { entryNumber: `REV-${randomUUID()}`, entryDate: date, branchId: doc.branchId, status: "CONTABILIZADO", source: "MANUAL", reversalOfId: original.id, createdByUserId: ctx.actor.userId, postedByUserId: ctx.actor.userId, postedAt: new Date(), notes: clean(reason), lines: { create: original.lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit, position: l.position, concept: l.concept })) } } });
      if (doc.kind === "RECEIVABLE_COLLECTION") {
        const payment = await ctx.tx.receivablePayment.findUniqueOrThrow({ where: { paymentNumber: doc.number } });
        await ctx.tx.receivableAllocation.updateMany({ where: { paymentId: payment.id, status: "APLICADA" }, data: { status: "REVERTIDA", reversedAt: new Date(), reversedByUserId: ctx.actor.userId, reversalReason: clean(reason) } });
        await ctx.tx.receivablePayment.update({ where: { id: payment.id }, data: { status: "REVERTIDO", reversedAt: new Date(), reversedByUserId: ctx.actor.userId, reversalReason: clean(reason) } });
        await ctx.tx.receivableDocument.update({ where: { id: doc.receivableId! }, data: { settledAt: null } });
      }
      await ctx.tx.crmFinanceDocument.update({ where: { id }, data: { status: "REVERSED", rejectionReason: clean(reason) } });
    } else return ctx.fail("Acción inválida.");
    const updated = await ctx.tx.crmFinanceDocument.findUniqueOrThrow({ where: { id } });
    await crmAudit(ctx, id, "CRM_FINANCE_CHANGED", { status: updated.status, amount: doc.amount, reference: doc.reference, description: `${before} → ${updated.status}` }, clean(reason), { status: before, amount: doc.amount, reference: doc.reference });
    return { id, entryId: updated.journalEntryId };
  });
}

async function collectReceivable(ctx: FinancialTransactionContext, doc: CrmFinanceDocument) {
  if (!doc.receivableId) return ctx.fail("Selecciona la cuenta por cobrar existente.");
  await ctx.tx.$queryRaw`SELECT id FROM receivable_documents WHERE id=${doc.receivableId} FOR UPDATE`;
  const debt = await ctx.tx.receivableDocument.findUniqueOrThrow({ where: { id: doc.receivableId }, include: { allocations: { where: { status: "APLICADA" } } } });
  ctx.ensure(!debt.cancelledAt && debt.branchId === doc.branchId && (debt.currency ?? "") === doc.currency, "La obligación debe estar vigente en la misma sucursal y moneda explícita.");
  ctx.ensure(debt.issuedAt <= doc.date, "El cobro no puede preceder al documento.");
  const allocated = debt.allocations.reduce((s, a) => s.plus(a.amount), new Prisma.Decimal(0));
  const policy = await ctx.tx.crmFinancePolicy.findUniqueOrThrow({ where: { id: "main" } });
  ctx.ensure(doc.currency === policy.functionalCurrency && doc.exchangeRate.equals(1), "El documento histórico requiere moneda funcional confirmada antes de convertir su cartera.");
  ctx.ensure(allocated.plus(doc.amount).lte(debt.originalAmount), "El cobro supera el saldo pendiente.");
  // Reject source obligations without an identifiable posted receivable control.
  const source = debt.accountingDocumentId ? await ctx.tx.journalEntry.findFirst({ where: { accountingDocumentId: debt.accountingDocumentId, status: { in: ["CONTABILIZADO", "CONCILIADO"] }, reversal: null }, include: { lines: { include: { account: true } } } }) : null;
  ctx.ensure(Boolean(source?.lines.some((l) => l.accountId === doc.creditAccountId && l.account.type === "ACTIVO" && l.debit.gt(0))), "Contabiliza primero el documento de origen y usa su cuenta por cobrar de control.");
  const payment = await ctx.tx.receivablePayment.create({ data: { branchId: doc.branchId, customerId: debt.customerId, thirdPartyId: debt.thirdPartyId, partyName: debt.partyName, paymentNumber: doc.number, method: "TRANSFERENCIA", amount: doc.amount, currency: doc.currency, reference: doc.reference, receivedAt: doc.date, recordedByUserId: ctx.actor.userId } });
  await ctx.tx.receivableAllocation.create({ data: { paymentId: payment.id, receivableDocumentId: debt.id, amount: doc.amount, allocatedByUserId: ctx.actor.userId } });
  if (allocated.plus(doc.amount).equals(debt.originalAmount)) await ctx.tx.receivableDocument.update({ where: { id: debt.id }, data: { settledAt: new Date() } });
}
