// MotoMas — alta de los activos de Meta en la base de datos
//
// Ejecutar con PostgreSQL accesible y DATABASE_URL configurada:
//   npm run prisma:seed:meta
//
// ---------------------------------------------------------------------------
// QUE HACE
// ---------------------------------------------------------------------------
// Carga en la base de datos los identificadores NO SECRETOS de Meta que el CRM
// necesita para enrutar leads y leer cuentas publicitarias:
//
//   · `meta_page_branches`  — que pagina de Facebook atiende que sucursal
//   · `meta_ad_accounts`    — que cuentas publicitarias sigue MotoMas
//
// Es exactamente lo mismo que hace el panel (Panel -> Marketing), pero
// reproducible y revisable en Git. El panel sigue siendo la herramienta de
// Marketing para el dia a dia; esto es el alta inicial.
//
// ---------------------------------------------------------------------------
// POR QUE ESTOS VALORES SI PUEDEN ESTAR EN EL REPOSITORIO
// ---------------------------------------------------------------------------
// Un `page_id` y un `act_...` son IDENTIFICADORES PUBLICOS: no dan acceso a
// nada por si solos. El acceso lo da el token, y NINGUN token aparece en este
// archivo ni debe aparecer nunca. Los cinco secretos (META_APP_SECRET,
// META_WEBHOOK_VERIFY_TOKEN, META_PAGE_ACCESS_TOKEN, WHATSAPP_ACCESS_TOKEN,
// META_MARKETING_ACCESS_TOKEN) viven solo en el `.env` del servidor.
//
// ---------------------------------------------------------------------------
// ALCANCE: SOLO EL PORFOLIO "Motomas S.A Sucursales" (1398827153319161)
// ---------------------------------------------------------------------------
// Los activos de MotoMas estan repartidos en CINCO porfolios empresariales de
// Meta. El diseno del CRM asume UNO solo (docs/META_INTEGRATIONS.md §8.1: "un
// token basta para leerlas todas"), porque un Usuario del Sistema solo alcanza
// los activos de su propio porfolio.
//
// Decision tomada el 2026-09-01: se integra UNICAMENTE "Motomas S.A
// Sucursales". Los porfolios GM MOTOS (8 activos), Motomas Las Mercedes (1) y
// Motomas Multicentro (0) quedan FUERA por ahora. Ver docs/meta-ids.txt §0.
//
// Verificado en los paneles de Meta el 2026-09-01.
// ---------------------------------------------------------------------------

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Paginas de Facebook del porfolio "Motomas S.A Sucursales" y la sucursal que
 * atiende sus leads.
 *
 * `branchCode` es el codigo que genera `branchCodeFromName` en `seed.mjs`, no
 * un nombre libre: si no existe una sucursal con ese codigo, este seed FALLA en
 * vez de crear el mapeo a ciegas. Un mapeo que apunta a una sucursal
 * inexistente enruta leads a ninguna parte.
 */
const pageBranchMappings = [
  {
    pageId: "1156085857594722",
    label: "Motomás Masaya",
    branchCode: "masaya",
  },
  {
    pageId: "1232422279947412",
    label: "Motomás Carretera a Masaya km12.5",
    branchCode: "carretera-masaya",
  },
  {
    pageId: "1185742464620935",
    label: "Motomás Pista Sub-Urbana",
    branchCode: "suburbana",
  },
  {
    pageId: "1107297765810350",
    label: "Motomas Central",
    branchCode: "central",
  },
  {
    pageId: "1180061821859368",
    label: "Motomás Ciudad Sandino",
    branchCode: "ciudad-sandino",
  },
];

/**
 * La SEXTA pagina del porfolio, deliberadamente NO mapeada.
 *
 * `GM Motos: Central ventas` (1398779383323938) es otra marca —taller y
 * repuestos—, no una sucursal de MotoMas, y no existe ninguna sucursal
 * equivalente en `seed.mjs`. Asignarla a una sucursal cualquiera enviaria sus
 * leads a un equipo que no los pidio.
 *
 * Sin mapear, sus leads caen al anden («Leads pendientes de sucursal») con sus
 * respuestas ya traidas del Graph API, y Marketing los asigna a mano. Es un
 * estado normal y esperado, no un error: no se pierde ni un lead.
 *
 * Cuando el negocio decida a que sucursal pertenece, se anade a
 * `pageBranchMappings` — o se conecta desde el panel, que es lo mismo.
 */
const unmappedPages = [
  {
    pageId: "1398779383323938",
    label: "GM Motos: Central ventas",
    reason: "Otra marca (GM Motos). Sin sucursal equivalente en el CRM.",
  },
];

/**
 * Cuentas publicitarias que MotoMas sigue.
 *
 * El `act_` va CON prefijo: es literalmente lo que el Graph API espera como
 * ruta del nodo (`isValidAdAccountId` en `src/server/meta-ads/shared.ts` lo
 * exige).
 *
 * Los metadatos (`accountName`, `currency`, `accountStatus`) se dejan en NULL a
 * proposito. Este seed NO llama al Graph API: no tiene token y no deberia
 * tenerlo. Los rellena el boton «Actualizar» del panel, que ademas es la unica
 * comprobacion de verdad de que el token del Usuario del Sistema alcanza la
 * cuenta. Hasta entonces la fila muestra «Sin resincronizar», que es honesto.
 */
const adAccounts = [
  {
    adAccountId: "act_1094612733171477",
    label: "MOTOMAS",
  },
];

async function seedPageBranchMappings() {
  console.log("Mapeos página → sucursal (Meta Lead Ads)...");

  const codes = pageBranchMappings.map((mapping) => mapping.branchCode);
  const branches = await prisma.branch.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const branchIdByCode = new Map(
    branches.map((branch) => [branch.code, branch.id]),
  );

  const missing = codes.filter((code) => !branchIdByCode.has(code));
  if (missing.length) {
    throw new Error(
      `No existen estas sucursales: ${missing.join(", ")}. ` +
        "Ejecuta `npm run prisma:seed` primero para crear las sucursales.",
    );
  }

  for (const mapping of pageBranchMappings) {
    const branchId = branchIdByCode.get(mapping.branchCode);

    /*
     * `pageId` es @unique, que es lo que hace idempotente este upsert.
     *
     * La rama `update` NO toca `isActive`: si Marketing desactivo una pagina
     * desde el panel, volver a correr el seed no debe reactivarla a sus
     * espaldas. Reactivarla es una decision de Marketing, no de un script.
     */
    await prisma.metaPageBranch.upsert({
      where: { pageId: mapping.pageId },
      update: { branchId, label: mapping.label },
      create: {
        pageId: mapping.pageId,
        branchId,
        label: mapping.label,
        isActive: true,
      },
    });

    console.log(`  ✓ ${mapping.label} → ${mapping.branchCode}`);
  }

  for (const page of unmappedPages) {
    console.log(`  – ${page.label} (${page.pageId}) sin mapear: ${page.reason}`);
  }
}

async function seedAdAccounts() {
  console.log("Cuentas publicitarias de Meta...");

  for (const account of adAccounts) {
    /*
     * `adAccountId` es @unique. La rama `update` solo toca la etiqueta interna:
     * los metadatos cacheados y `lastSyncedAt` son de la resincronizacion
     * manual, e `isActive` es el interruptor de seguimiento de MotoMas.
     * Pisarlos aqui borraria lo que el panel sabe.
     */
    await prisma.metaAdAccount.upsert({
      where: { adAccountId: account.adAccountId },
      update: { label: account.label },
      create: {
        adAccountId: account.adAccountId,
        label: account.label,
        isActive: true,
      },
    });

    console.log(`  ✓ ${account.adAccountId} (${account.label})`);
  }

  console.log(
    "  Metadatos vacíos a propósito: pulsa «Actualizar» en Panel → Marketing " +
      "para traerlos del Graph API y confirmar que el token llega a la cuenta.",
  );
}

async function reportPendingWork() {
  const staged = await prisma.metaUnmappedLead.count({
    where: { resolvedAt: null },
  });
  if (staged) {
    console.warn(
      `\nAviso: hay ${staged} lead(s) esperando en el andén. Conectar una ` +
        "página NO los reprocesa: hay que resolverlos uno por uno desde " +
        "Panel → Marketing → «Leads pendientes de sucursal».",
    );
  }
}

async function main() {
  await seedPageBranchMappings();
  await seedAdAccounts();
  await reportPendingWork();
  console.log("\nAlta de activos de Meta completada.");
  console.log(
    "Recuerda: esto NO configura el webhook en Meta ni escribe ningún token. " +
      "Ver docs/meta-ids.txt §8 y §10.",
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
