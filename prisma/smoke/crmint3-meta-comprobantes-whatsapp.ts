/**
 * SMOKE-CRMINT3 — atribución de Meta Lead Ads, verificación de comprobantes y
 * teléfono de WhatsApp, contra la base viva.
 *
 *   npm run smoke:crm-int3
 *
 * ## Qué prueba
 *
 *   1. Meta Lead Ads: el lead guarda campaña, conjunto, anuncio y formulario de
 *      Meta; sin vínculo entra sin campaña; vincular atribuye lo que ya había
 *      entrado y lo que entra después; cobertura de sucursal y vigencia; un
 *      reenvío no duplica; una campaña de Meta no se vincula a dos; desvincular
 *      deshace sólo lo que el vínculo atribuyó; el andén conserva la atribución;
 *      sin permiso para leer la atribución el lead entra igual; permisos; la
 *      restricción de la base; la conciliación cuenta los leads de Meta.
 *   2. Comprobantes: subir desde el panel no activa ni aparta; sólo verificar;
 *      las reservas que la regla anterior dejó ACTIVA se revisan igual.
 *   3. WhatsApp: el mismo número en sus dos formas; número compartido por dos
 *      clientes sin asociar; envío con código de país; ventana de 24 h; hilo
 *      completo; filas antiguas intactas.
 *
 * El Graph API y la API de WhatsApp están simulados (`globalThis.fetch`).
 * Trabaja sobre sucursales y usuarios propios y los borra al terminar.
 */
import { PrismaClient } from "@prisma/client";

import { roleEnumToSpanish, type UserRoleEnum } from "@/server/auth/roles";
import { SESSION_COOKIE_NAME, createSessionToken } from "@/server/auth/session";
import { setLeadCampaignAction } from "@/server/crm/actions";
import {
  linkMetaCampaignAction,
  unlinkMetaCampaignAction,
} from "@/server/marketing/actions";
import {
  getCampaignMetaAttribution,
  getCampaignReconciliation,
} from "@/server/marketing/queries";
import { resolveUnmappedMetaLead } from "@/server/meta/actions";
import { ingestMetaLeadgen } from "@/server/meta/ingest";
import {
  createReservation,
  reviewReservationPaymentProof,
  uploadReservationPaymentProof,
} from "@/server/operations/actions";
import { listWhatsAppConversations } from "@/server/whatsapp/queries";
import { ingestInboundMessage, sendFreeTextMessage } from "@/server/whatsapp/service";

process.env.META_PAGE_ACCESS_TOKEN = "smoke-int3-page-token";
process.env.WHATSAPP_ACCESS_TOKEN = "smoke-int3-wa-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "5550001111";

const prisma = new PrismaClient();
const STAMP = Date.now();
const TAG = `SMOKE-CRMINT3-${STAMP}`;
const SUFFIX = String(STAMP).slice(-7);
const CODES = { A: `i3a${SUFFIX}`, B: `i3b${SUFFIX}` };
const PAGE_A = `91${SUFFIX}`;
const PAGE_UNMAPPED = `92${SUFFIX}`;
const META = {
  M1: `1201${SUFFIX}01`,
  M2: `1201${SUFFIX}02`,
  M5: `1201${SUFFIX}05`,
  OLD: `1201${SUFFIX}09`,
};
const DAY = 24 * 60 * 60 * 1000;

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  OK    ${name}`);
  } else {
    failed += 1;
    console.log(`  FALLO ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n  --- ${title} ---`);
}

function errorOf(result: { ok: boolean } & Record<string, unknown>): string {
  return result.ok ? "" : String(result.error ?? "");
}

async function signInAs(role: UserRoleEnum, userId: string, branchCode: string) {
  const token = await createSessionToken({
    uid: userId,
    email: `${userId}@smoke.local`,
    name: userId,
    role: roleEnumToSpanish[role],
    roleEnum: role,
    branchId: branchCode as never,
    branchName: "Smoke",
  });
  (globalThis as Record<string, unknown>).__motomasSmokeCookies = {
    [SESSION_COOKIE_NAME]: token,
  };
}

/** Número nacional de 8 dígitos, distinto por prefijo. */
function nat(prefix: string) {
  return `${prefix}${SUFFIX.slice(1)}`;
}

// --- Dobles del Graph API y de WhatsApp -----------------------------------

type LeadgenFixture = {
  phone: string;
  name: string;
  createdTime?: string;
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adId?: string;
  /** El token no puede leer la atribución: la petición completa falla. */
  denyAttribution?: boolean;
};

const leadgen = new Map<string, LeadgenFixture>();
const graphCalls: string[] = [];
const whatsAppSends: Array<{ to: unknown }> = [];

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input.toString();
  if (!url.includes("graph.facebook.com")) throw new Error(`Llamada inesperada a ${url}`);
  if (url.endsWith("/messages")) {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    whatsAppSends.push({ to: body.to });
    return new Response(
      JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: `wamid.${TAG}-OUT-${whatsAppSends.length}` }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  const parsed = new URL(url);
  const id = parsed.pathname.split("/").pop() ?? "";
  const fields = parsed.searchParams.get("fields") ?? "";
  graphCalls.push(`${id}:${fields.includes("campaign_id") ? "con-atribucion" : "basico"}`);
  const fixture = leadgen.get(id);
  if (!fixture) return new Response(JSON.stringify({ error: "not found" }), { status: 400 });
  if (fixture.denyAttribution && fields.includes("campaign_id")) {
    return new Response(JSON.stringify({ error: { code: 200, message: "permiso" } }), { status: 400 });
  }
  const withAttribution = fields.includes("campaign_id");
  return new Response(
    JSON.stringify({
      id,
      created_time: fixture.createdTime ?? new Date().toISOString(),
      form_id: `77${SUFFIX}`,
      platform: "fb",
      field_data: [
        { name: "full_name", values: [fixture.name] },
        { name: "phone_number", values: [fixture.phone] },
      ],
      ...(withAttribution && fixture.campaignId
        ? {
            campaign_id: fixture.campaignId,
            campaign_name: fixture.campaignName,
            adset_id: fixture.adsetId,
            ad_id: fixture.adId,
          }
        : {}),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}) as typeof globalThis.fetch;

let leadgenCounter = 0;
async function deliver(page: string, fixture: LeadgenFixture, leadgenId?: string) {
  const id = leadgenId ?? `${TAG}-LG-${(leadgenCounter += 1)}`;
  leadgen.set(id, fixture);
  const outcome = await ingestMetaLeadgen({ leadgen_id: id, page_id: page, form_id: `77${SUFFIX}` });
  return { id, outcome };
}

async function leadOf(leadgenId: string) {
  return prisma.lead.findUnique({ where: { metaLeadgenId: leadgenId } });
}

async function seed() {
  const A = await prisma.branch.create({ data: { code: CODES.A, name: `${TAG}-A`, isActive: true } });
  const B = await prisma.branch.create({ data: { code: CODES.B, name: `${TAG}-B`, isActive: true } });
  const user = (role: UserRoleEnum, branchId: string | null, tag: string) =>
    prisma.user.create({
      data: {
        name: `${TAG}-${tag}`,
        email: `${TAG}-${tag}@smoke.local`.toLowerCase(),
        passwordHash: "x:y",
        role,
        branchId,
      },
    });
  const admin = await user("ADMIN", null, "admin");
  const liderA = await user("LIDER_VENTAS", A.id, "liderA");
  const vendA = await user("VENDEDOR", A.id, "vendA");
  const mkt = await user("MARKETING", null, "mkt");
  await prisma.metaPageBranch.create({ data: { pageId: PAGE_A, branchId: A.id, label: TAG, isActive: true } });
  const campaign = (name: string, branchIds: string[], startsAt: Date, status: "ACTIVE" | "COMPLETED" = "ACTIVE") =>
    prisma.marketingCampaign.create({
      data: {
        name: `${TAG}-${name}`,
        channel: "FACEBOOK_ADS",
        objective: "LEADS",
        status,
        startsAt,
        createdById: admin.id,
        branches: { create: branchIds.map((branchId) => ({ branchId })) },
      },
    });
  const now = Date.now();
  return {
    A,
    B,
    admin,
    liderA,
    vendA,
    mkt,
    C1: await campaign("C1", [A.id], new Date(now - 5 * DAY)),
    C2: await campaign("C2-soloB", [B.id], new Date(now - 5 * DAY)),
    C4: await campaign("C4-manual", [A.id], new Date(now - 5 * DAY)),
    CDONE: await campaign("finalizada", [A.id], new Date(now - 30 * DAY), "COMPLETED"),
  };
}

type Ctx = Awaited<ReturnType<typeof seed>>;

async function main() {
  const ctx: Ctx = await seed();
  const as = {
    admin: () => signInAs("ADMIN", ctx.admin.id, "all"),
    liderA: () => signInAs("LIDER_VENTAS", ctx.liderA.id, CODES.A),
    vendA: () => signInAs("VENDEDOR", ctx.vendA.id, CODES.A),
    mkt: () => signInAs("MARKETING", ctx.mkt.id, "all"),
  };

  // =====================================================================
  section("1. Meta Lead Ads: atribución");
  const l1 = await deliver(PAGE_A, {
    phone: `+505 ${nat("31")}`,
    name: `${TAG} Uno`,
    campaignId: META.M1,
    campaignName: "Promo Pulsar julio",
    adsetId: `A${SUFFIX}`,
    adId: `AD${SUFFIX}`,
  });
  const l1Row = await leadOf(l1.id);
  check(
    "1. sin vínculo el lead entra sin campaña, pero con campaña, conjunto, anuncio y formulario de Meta",
    l1.outcome.status === "lead-created" &&
      l1Row?.marketingCampaignId === null &&
      l1Row.metaCampaignId === META.M1 &&
      l1Row.metaCampaignName === "Promo Pulsar julio" &&
      l1Row.metaAdsetId === `A${SUFFIX}` &&
      l1Row.metaAdId === `AD${SUFFIX}` &&
      l1Row.metaFormId === `77${SUFFIX}`,
    JSON.stringify({ status: l1.outcome.status, c: l1Row?.marketingCampaignId, m: l1Row?.metaCampaignId }),
  );
  check(
    "1. una sola llamada al Graph API, con los campos de atribución",
    graphCalls.filter((call) => call.startsWith(`${l1.id}:`)).join() === `${l1.id}:con-atribucion`,
    graphCalls.join(" "),
  );

  await as.mkt();
  const mktDenied = await linkMetaCampaignAction({ campaignId: ctx.C1.id, metaCampaignId: META.M1 });
  check("1. Marketing sin concesión no vincula", !mktDenied.ok);
  await as.admin();
  const badId = await linkMetaCampaignAction({ campaignId: ctx.C1.id, metaCampaignId: "no-es-un-id" });
  check("1. un identificador que no es de Meta se rechaza", !badId.ok);
  const doneLink = await linkMetaCampaignAction({ campaignId: ctx.CDONE.id, metaCampaignId: META.OLD });
  check("1. una campaña finalizada no admite vínculos nuevos", !doneLink.ok);

  const link1 = await linkMetaCampaignAction({ campaignId: ctx.C1.id, metaCampaignId: META.M1 });
  const l1After = await leadOf(l1.id);
  check(
    "1. vincular atribuye lo que ya había entrado, con origen META_LEAD_ADS",
    link1.ok &&
      link1.attributed === 1 &&
      l1After?.marketingCampaignId === ctx.C1.id &&
      l1After.campaignAttributionSource === "META_LEAD_ADS",
    JSON.stringify(link1),
  );
  check(
    "1. el vínculo queda auditado con el nombre de la campaña de Meta",
    (await prisma.marketingCampaignMetaLink.findUnique({ where: { metaCampaignId: META.M1 } }))?.label ===
      "Promo Pulsar julio" &&
      (await prisma.userAuditLog.count({
        where: { action: "MARKETING_META_CAMPAIGN_LINKED", targetId: ctx.C1.id },
      })) === 1,
  );

  const l2 = await deliver(PAGE_A, { phone: nat("32"), name: `${TAG} Dos`, campaignId: META.M1 });
  const l2Row = await leadOf(l2.id);
  check(
    "1. con vínculo, el lead nuevo nace atribuido",
    l2Row?.marketingCampaignId === ctx.C1.id && l2Row.campaignAttributionSource === "META_LEAD_ADS",
  );
  const again = await ingestMetaLeadgen({ leadgen_id: l2.id, page_id: PAGE_A, form_id: `77${SUFFIX}` });
  check(
    "1. un reenvío de Meta no crea otro lead",
    again.status === "lead-duplicate" &&
      (await prisma.lead.count({ where: { metaLeadgenId: l2.id } })) === 1,
  );

  const dupLink = await linkMetaCampaignAction({ campaignId: ctx.C2.id, metaCampaignId: META.M1 });
  check(
    "1. una campaña de Meta no se vincula a dos campañas de MotoMas",
    !dupLink.ok && errorOf(dupLink).includes(ctx.C1.name),
    errorOf(dupLink),
  );

  await linkMetaCampaignAction({ campaignId: ctx.C2.id, metaCampaignId: META.M2 });
  const l3 = await deliver(PAGE_A, { phone: nat("33"), name: `${TAG} Tres`, campaignId: META.M2 });
  check(
    "1. una campaña vinculada que no cubre la sucursal del lead no se lo queda",
    (await leadOf(l3.id))?.marketingCampaignId === null,
  );
  const l4 = await deliver(PAGE_A, {
    phone: nat("34"),
    name: `${TAG} Cuatro`,
    campaignId: META.M1,
    createdTime: new Date(Date.now() - 20 * DAY).toISOString(),
  });
  check(
    "1. un formulario llenado antes de que la campaña empezara no se atribuye",
    (await leadOf(l4.id))?.marketingCampaignId === null,
  );

  const stats = await getCampaignMetaAttribution(ctx.C1.id);
  const m1Stats = stats.links.find((link) => link.metaCampaignId === META.M1);
  check(
    "1. el detalle explica cada lead de la campaña de Meta: aquí, en otra, sin campaña",
    m1Stats?.leadsTotal === 3 && m1Stats.attributedHere === 2 && m1Stats.unattributed === 1,
    JSON.stringify(m1Stats),
  );
  const statsC2 = await getCampaignMetaAttribution(ctx.C2.id);
  check(
    "1. y en la otra campaña, el lead fuera de cobertura figura sin campaña",
    statsC2.links.find((link) => link.metaCampaignId === META.M2)?.unattributed === 1,
  );

  const reconciliation = await getCampaignReconciliation({ level: "global" }, ctx.C1.id, {
    reportCoverage: null,
    canConfirm: false,
    branchCode: null,
  });
  check(
    "1. la conciliación cuenta los leads de Meta como leads del CRM, una vez cada uno",
    reconciliation?.totals.crmLeads === (await prisma.lead.count({ where: { marketingCampaignId: ctx.C1.id } })) &&
      reconciliation?.totals.crmLeads === 2,
    String(reconciliation?.totals.crmLeads),
  );

  await as.liderA();
  const manual = await setLeadCampaignAction({ leadId: l1After?.id ?? "", campaignId: ctx.C4.id });
  check(
    "1. corregir a mano la campaña de un lead de Meta la marca como REGISTRO_MANUAL",
    manual.ok && (await leadOf(l1.id))?.campaignAttributionSource === "REGISTRO_MANUAL",
    errorOf(manual),
  );
  await as.admin();
  const unlink = await unlinkMetaCampaignAction({ campaignId: ctx.C1.id, metaCampaignId: META.M1 });
  check(
    "1. desvincular deshace sólo lo que el vínculo atribuyó",
    unlink.ok &&
      unlink.detached === 1 &&
      (await leadOf(l2.id))?.marketingCampaignId === null &&
      (await leadOf(l1.id))?.marketingCampaignId === ctx.C4.id &&
      (await leadOf(l2.id))?.metaCampaignId === META.M1,
    JSON.stringify(unlink),
  );

  await linkMetaCampaignAction({ campaignId: ctx.C1.id, metaCampaignId: META.M5 });
  const staged = await deliver(PAGE_UNMAPPED, { phone: nat("35"), name: `${TAG} Andén`, campaignId: META.M5, campaignName: "Andén" });
  const stagedRow = await prisma.metaUnmappedLead.findUnique({ where: { leadgenId: staged.id } });
  check(
    "1. el andén guarda la atribución de Meta",
    staged.outcome.status === "staged" && stagedRow?.metaCampaignId === META.M5,
  );
  const resolved = await resolveUnmappedMetaLead(stagedRow?.id ?? "", CODES.A);
  check(
    "1. al resolverlo, el lead conserva la campaña de Meta y se atribuye por el vínculo",
    resolved.ok &&
      (await leadOf(staged.id))?.metaCampaignId === META.M5 &&
      (await leadOf(staged.id))?.marketingCampaignId === ctx.C1.id,
    errorOf(resolved),
  );

  const denied = await deliver(PAGE_A, {
    phone: nat("36"),
    name: `${TAG} Sin permiso`,
    campaignId: META.M5,
    denyAttribution: true,
  });
  check(
    "1. si el token no puede leer la atribución, el lead entra igual sin ella",
    denied.outcome.status === "lead-created" &&
      (await leadOf(denied.id))?.metaCampaignId === null &&
      graphCalls.filter((call) => call.startsWith(`${denied.id}:`)).join() ===
        `${denied.id}:con-atribucion,${denied.id}:basico`,
    graphCalls.filter((call) => call.startsWith(`${denied.id}:`)).join(),
  );

  let constraintHeld = false;
  try {
    await prisma.$executeRaw`UPDATE leads SET campaign_attribution_source = 'META_LEAD_ADS', marketing_campaign_id = ${ctx.C1.id} WHERE id = ${(await leadOf(denied.id))?.id ?? ""}`;
  } catch (error) {
    constraintHeld = String(error instanceof Error ? error.message : error).includes(
      "leads_campaign_attribution_source_check",
    );
  }
  check("1. la base impide una atribución de Meta sin campaña de Meta", constraintHeld);

  // =====================================================================
  section("2. Comprobantes: subir no es verificar");
  const customer = await prisma.customer.create({
    data: {
      branchId: ctx.A.id,
      name: `${TAG} Cliente`,
      phone: nat("41"),
      phoneNormalized: nat("41"),
      assignedSellerId: ctx.vendA.id,
    },
  });
  const unit = (key: string, status: "AVAILABLE" | "RESERVED" = "AVAILABLE") =>
    prisma.motorcycleUnit.create({
      data: {
        branchId: ctx.A.id,
        name: `${TAG} ${key}`,
        brand: "Smoke",
        model: "Int3",
        year: 2026,
        chassisNumber: `${TAG}-${key}`,
        entryDate: new Date(),
        status,
      },
    });
  const u1 = await unit("U1");
  await as.vendA();
  const reservation = await createReservation({ customerId: customer.id, motorcycleUnitId: u1.id });
  const reservationId = reservation.ok ? reservation.reservationId : "";
  const pngBytes = new Uint8Array(64);
  crypto.getRandomValues(pngBytes);
  pngBytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const upload = await uploadReservationPaymentProof({
    reservationId,
    file: new File([pngBytes], "comprobante.png", { type: "image/png" }),
  });
  const afterUpload = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { motorcycleUnit: true },
  });
  check(
    "2. el comprobante del panel queda pendiente y la reserva sigue PENDIENTE_PAGO con la moto disponible",
    upload.ok && afterUpload?.status === "PENDIENTE_PAGO" && afterUpload.motorcycleUnit.status === "AVAILABLE",
    `${errorOf(upload)} ${afterUpload?.status}/${afterUpload?.motorcycleUnit.status}`,
  );
  check(
    "2. y no deja movimiento de inventario",
    (await prisma.inventoryMovement.count({ where: { motorcycleUnitId: u1.id } })) === 0,
  );
  check(
    "2. quien puede verificar recibe el aviso",
    (await prisma.userNotification.count({
      where: { reservationId, kind: "COMPROBANTE_POR_REVISAR", userId: ctx.liderA.id },
    })) === 1,
  );
  const sellerReview = await reviewReservationPaymentProof({ reservationId, aprobar: true });
  check("2. el vendedor no lo verifica", !sellerReview.ok);
  await as.liderA();
  const approve = await reviewReservationPaymentProof({ reservationId, aprobar: true });
  const afterApprove = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { motorcycleUnit: true },
  });
  check(
    "2. verificarlo activa la reserva, aparta la moto y deja un único movimiento RESERVA",
    approve.ok &&
      afterApprove?.status === "ACTIVA" &&
      afterApprove.motorcycleUnit.status === "RESERVED" &&
      (await prisma.inventoryMovement.count({ where: { motorcycleUnitId: u1.id, type: "RESERVA" } })) === 1,
  );

  // Lo que dejó la regla anterior: reserva ACTIVA, moto RESERVED, comprobante pendiente.
  async function legacyActive(key: string) {
    const legacyUnit = await unit(key, "RESERVED");
    const legacy = await prisma.reservation.create({
      data: {
        reservationNumber: `${TAG}-${key}`,
        customerId: customer.id,
        motorcycleUnitId: legacyUnit.id,
        branchId: ctx.A.id,
        sellerId: ctx.vendA.id,
        status: "ACTIVA",
        confirmedAt: new Date(),
        activeUnitLock: legacyUnit.id,
      },
    });
    const file = await prisma.storedFile.create({
      data: {
        branchId: ctx.A.id,
        originalName: "viejo.png",
        mimeType: "image/png",
        sizeBytes: 64,
        checksumSha256: `${TAG}-${key}`,
        data: Buffer.from(pngBytes),
        uploadedById: ctx.vendA.id,
      },
    });
    await prisma.reservationPaymentProof.create({
      data: { reservationId: legacy.id, storedFileId: file.id, uploadedById: ctx.vendA.id },
    });
    return { legacy, legacyUnit };
  }
  const oldReject = await legacyActive("H1");
  const rejectLegacy = await reviewReservationPaymentProof({
    reservationId: oldReject.legacy.id,
    aprobar: false,
    notas: "No corresponde al monto.",
  });
  const afterLegacyReject = await prisma.reservation.findUnique({
    where: { id: oldReject.legacy.id },
    include: { motorcycleUnit: true },
  });
  check(
    "2. una reserva que la regla anterior dejó ACTIVA: rechazar libera la moto",
    rejectLegacy.ok &&
      afterLegacyReject?.status === "PENDIENTE_PAGO" &&
      afterLegacyReject.motorcycleUnit.status === "AVAILABLE",
  );
  const oldApprove = await legacyActive("H2");
  const approveLegacy = await reviewReservationPaymentProof({ reservationId: oldApprove.legacy.id, aprobar: true });
  const afterLegacyApprove = await prisma.reservation.findUnique({
    where: { id: oldApprove.legacy.id },
    include: { motorcycleUnit: true },
  });
  check(
    "2. y verificarla la deja ACTIVA sin volver a apartar ni duplicar movimientos",
    approveLegacy.ok &&
      afterLegacyApprove?.status === "ACTIVA" &&
      afterLegacyApprove.motorcycleUnit.status === "RESERVED" &&
      (await prisma.inventoryMovement.count({ where: { motorcycleUnitId: oldApprove.legacyUnit.id } })) === 0,
  );

  // =====================================================================
  section("3. WhatsApp: el teléfono en todas sus formas");
  const legacyRow = await prisma.whatsAppMessage.create({
    data: { direction: "ENTRANTE", phone: nat("41"), body: "fila antigua de 8 dígitos", status: "ENTREGADO" },
  });
  const inbound = await ingestInboundMessage({
    waMessageId: `wamid.${TAG}-IN-1`,
    from: `505${nat("41")}`,
    type: "text",
    body: "Hola",
  });
  const inboundRow = await prisma.whatsAppMessage.findUnique({ where: { id: inbound.messageId } });
  check(
    "3. un mensaje de 505… llega a la ficha del cliente tecleado con 8 dígitos",
    inboundRow?.customerId === customer.id && inboundRow.phone === `505${nat("41")}`,
    JSON.stringify({ c: inboundRow?.customerId, p: inboundRow?.phone }),
  );
  const reply = await sendFreeTextMessage({ phone: nat("41"), body: "Gracias por escribir" });
  check(
    "3. responder a un número de 8 dígitos está dentro de la ventana y sale con el 505",
    reply.ok && whatsAppSends.at(-1)?.to === `505${nat("41")}`,
    JSON.stringify({ reply, to: whatsAppSends.at(-1)?.to }),
  );
  const replyRow = reply.ok ? await prisma.whatsAppMessage.findUnique({ where: { id: reply.messageId } }) : null;
  check(
    "3. la respuesta queda en el mismo hilo y con el mismo cliente",
    replyRow?.phone === `505${nat("41")}` && replyRow.customerId === customer.id,
  );
  const threads = await listWhatsAppConversations([nat("41")]);
  check(
    "3. el hilo pedido con 8 dígitos reúne la fila antigua, la entrante y la respuesta",
    threads[nat("41")]?.messages.length === 3,
    String(threads[nat("41")]?.messages.length),
  );
  check(
    "3. la fila antigua no se reescribió",
    (await prisma.whatsAppMessage.findUnique({ where: { id: legacyRow.id } }))?.phone === nat("41"),
  );

  await prisma.customer.createMany({
    data: ["Primera", "Segunda"].map((name) => ({
      branchId: ctx.A.id,
      name: `${TAG} ${name}`,
      phone: nat("42"),
      phoneNormalized: nat("42"),
    })),
  });
  const shared = await ingestInboundMessage({
    waMessageId: `wamid.${TAG}-IN-2`,
    from: `505${nat("42")}`,
    type: "text",
    body: "¿Quién soy?",
  });
  const sharedRow = await prisma.whatsAppMessage.findUnique({ where: { id: shared.messageId } });
  check(
    "3. un número que comparten dos clientes no se asocia a ninguno",
    sharedRow?.customerId === null && sharedRow.leadId === null,
  );

  await prisma.customer.create({
    data: { branchId: ctx.A.id, name: `${TAG} Con lead ajeno`, phone: nat("43"), phoneNormalized: nat("43") },
  });
  await prisma.lead.create({
    data: { trackingCode: `${TAG}-LEAD43`, name: `${TAG} Prospecto`, phone: nat("43"), branchId: ctx.A.id },
  });
  const mixed = await ingestInboundMessage({
    waMessageId: `wamid.${TAG}-IN-3`,
    from: `505${nat("43")}`,
    type: "text",
    body: "Hola",
  });
  const mixedRow = await prisma.whatsAppMessage.findUnique({ where: { id: mixed.messageId } });
  check(
    "3. con un cliente y un lead sin convertir en el mismo número, el lead no se cuelga del cliente",
    mixedRow?.customerId !== null && mixedRow?.leadId === null,
  );
}

async function cleanup() {
  const branches = await prisma.branch.findMany({
    where: { code: { in: Object.values(CODES) } },
    select: { id: true },
  });
  const branchIds = branches.map((branch) => branch.id);
  const users = await prisma.user.findMany({
    where: { email: { startsWith: TAG.toLowerCase() } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const inBranches = { branchId: { in: branchIds } };
  const phones = ["31", "32", "33", "34", "35", "36", "41", "42", "43"].flatMap((p) => [nat(p), `505${nat(p)}`]);

  await prisma.whatsAppMessage.deleteMany({ where: { phone: { in: phones } } });
  await prisma.metaUnmappedLead.deleteMany({ where: { leadgenId: { startsWith: TAG } } });
  await prisma.userNotification.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { reservation: inBranches }, { customer: inBranches }, { lead: inBranches }] },
  });
  await prisma.customerNotification.deleteMany({ where: { customer: inBranches } });
  await prisma.reservationPaymentProof.deleteMany({ where: { reservation: inBranches } });
  await prisma.storedFile.deleteMany({ where: inBranches });
  await prisma.inventoryMovement.deleteMany({ where: inBranches });
  await prisma.reservation.deleteMany({ where: inBranches });
  await prisma.lead.deleteMany({ where: inBranches });
  await prisma.marketingCampaign.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.customer.deleteMany({ where: inBranches });
  await prisma.motorcycleUnit.deleteMany({ where: inBranches });
  await prisma.metaPageBranch.deleteMany({ where: inBranches });
  await prisma.userAuditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
}

main()
  .catch((error) => {
    failed += 1;
    console.error("\n  ERROR", error);
  })
  .finally(async () => {
    globalThis.fetch = realFetch;
    try {
      await cleanup();
    } catch (error) {
      failed += 1;
      console.error("\n  ERROR en la limpieza", error);
    }
    await prisma.$disconnect();
    console.log(`\n  ${passed} OK · ${failed} fallos\n`);
    process.exit(failed === 0 ? 0 : 1);
  });
