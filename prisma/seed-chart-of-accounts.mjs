// MotoMas — Siembra de la plantilla de catálogo de cuentas (Patch FF1.1)
//
//   npm run prisma:deploy
//   npm run prisma:seed:cuentas
//
// Es un script APARTE del seed principal a propósito. `prisma/seed.mjs`
// siembra únicamente datos reales de la empresa (sucursales, catálogo,
// administrador de arranque) y evita inventar información. Esta plantilla es
// justamente lo contrario: un catálogo de referencia, genérico, que la
// contabilidad de la empresa debe revisar antes de usar. Mezclarlos haría que
// cada `prisma:seed` inyectara cuentas que nadie pidió.
//
// Garantías del script:
//
//   1. NUNCA borra ni desactiva una cuenta. Es aditivo y re-ejecutable.
//   2. NUNCA toca una cuenta con `origin = EMPRESA`: si la empresa ya usa ese
//      código, el código es suyo y el script se aparta.
//   3. NUNCA revierte una decisión del contador: no modifica `approvedAt`,
//      `isActive` ni `archivedAt`, y omite por completo las cuentas de
//      plantilla ya archivadas.
//   4. Siembra con `origin = PLANTILLA` y sin aprobar, así que ninguna cuenta
//      recibe movimientos hasta que la contabilidad la apruebe.

import { PrismaClient } from "@prisma/client";

import {
  CHART_ACCOUNT_TEMPLATE_VERSION,
  buildTemplateAccounts,
} from "./data/chart-of-accounts-template.mjs";

const prisma = new PrismaClient();

async function main() {
  const accounts = buildTemplateAccounts();
  console.log(
    `Plantilla ${CHART_ACCOUNT_TEMPLATE_VERSION}: ${accounts.length} cuentas de referencia.`,
  );
  console.log(
    "Las cuentas se crean como PLANTILLA y sin aprobar: no admiten movimientos hasta que la contabilidad de la empresa las apruebe.",
  );

  // Código → id, para resolver la cuenta padre sin volver a consultarla. El
  // recorrido va ordenado por código, así que un padre siempre se procesa
  // antes que sus subcuentas.
  const idByCode = new Map();
  const stats = { created: 0, updated: 0, unchanged: 0, skippedCompany: 0, skippedArchived: 0 };

  for (const account of accounts) {
    const parentId = account.parentCode
      ? (idByCode.get(account.parentCode) ?? null)
      : null;
    if (account.parentCode && !parentId) {
      throw new Error(
        `No se resolvió la cuenta padre ${account.parentCode} de ${account.code}.`,
      );
    }

    const existing = await prisma.chartAccount.findUnique({
      where: { code: account.code },
      select: {
        id: true,
        name: true,
        type: true,
        nature: true,
        parentId: true,
        level: true,
        allowsPosting: true,
        requiresCostCenter: true,
        allowsBranchDetail: true,
        origin: true,
        templateVersion: true,
        archivedAt: true,
      },
    });

    if (!existing) {
      const created = await prisma.chartAccount.create({
        data: {
          code: account.code,
          name: account.name,
          type: account.type,
          nature: account.nature,
          parentId,
          level: account.level,
          allowsPosting: account.allowsPosting,
          requiresCostCenter: account.requiresCostCenter,
          allowsBranchDetail: account.allowsBranchDetail,
          origin: "PLANTILLA",
          templateVersion: CHART_ACCOUNT_TEMPLATE_VERSION,
          description:
            "Cuenta de plantilla de referencia. Pendiente de revisión y aprobación por la contabilidad de la empresa.",
        },
        select: { id: true },
      });
      idByCode.set(account.code, created.id);
      stats.created += 1;
      continue;
    }

    idByCode.set(account.code, existing.id);

    if (existing.origin !== "PLANTILLA") {
      stats.skippedCompany += 1;
      continue;
    }
    if (existing.archivedAt) {
      stats.skippedArchived += 1;
      continue;
    }

    // Actualización estructural únicamente: nombre, clasificación y posición.
    // El estado (activa, aprobada, archivada) pertenece al contador.
    const changed =
      existing.name !== account.name ||
      existing.type !== account.type ||
      existing.nature !== account.nature ||
      existing.parentId !== parentId ||
      existing.level !== account.level ||
      existing.allowsPosting !== account.allowsPosting ||
      existing.requiresCostCenter !== account.requiresCostCenter ||
      existing.allowsBranchDetail !== account.allowsBranchDetail ||
      existing.templateVersion !== CHART_ACCOUNT_TEMPLATE_VERSION;

    if (!changed) {
      stats.unchanged += 1;
      continue;
    }

    await prisma.chartAccount.update({
      where: { id: existing.id },
      data: {
        name: account.name,
        type: account.type,
        nature: account.nature,
        parentId,
        level: account.level,
        allowsPosting: account.allowsPosting,
        requiresCostCenter: account.requiresCostCenter,
        allowsBranchDetail: account.allowsBranchDetail,
        templateVersion: CHART_ACCOUNT_TEMPLATE_VERSION,
      },
    });
    stats.updated += 1;
  }

  const pending = await prisma.chartAccount.count({
    where: { origin: "PLANTILLA", approvedAt: null, archivedAt: null },
  });

  console.log(
    `Creadas: ${stats.created} · actualizadas: ${stats.updated} · sin cambios: ${stats.unchanged}`,
  );
  if (stats.skippedCompany) {
    console.warn(
      `Omitidas por pertenecer a la empresa (origin = EMPRESA): ${stats.skippedCompany}. El script no modifica cuentas propias.`,
    );
  }
  if (stats.skippedArchived) {
    console.warn(
      `Omitidas por estar archivadas: ${stats.skippedArchived}. Restáuralas manualmente si deben volver al catálogo.`,
    );
  }
  console.log(
    `Cuentas de plantilla pendientes de aprobación: ${pending}. Apruébalas desde /panel/contabilidad/catalogo-cuentas antes de contabilizar sobre ellas.`,
  );
  console.log(
    "Esta plantilla NO es el catálogo definitivo de MotoMas: el contador de la empresa debe revisarla, ajustarla y aprobarla.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
