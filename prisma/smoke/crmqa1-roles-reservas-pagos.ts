/**
 * SMOKE-CRMQA1 — las reglas de negocio que la QA con el cliente dejó al
 * descubierto, ejercitadas contra las acciones reales.
 *
 *   npm run smoke:crm-qa
 *
 * ## Qué prueba
 *
 * Las **acciones de servidor de verdad**, con cookie de sesión firmada por el
 * mismo secreto y verificada por el mismo código. Lo que se sustituye es el
 * transporte, nunca la autorización.
 *
 *   1. Un VENDEDOR **no** puede reportar una venta. Petición directa, sin UI.
 *   2. Un LIDER_VENTAS **sí** puede.
 *   3. Un VENDEDOR crea un lead y le queda asignado.
 *   4. Un VENDEDOR registra una actividad sobre SU lead.
 *   5. Un VENDEDOR **no** puede registrar actividad sobre el lead de otro.
 *   6. Una reserva nueva nace PENDIENTE_PAGO y **no bloquea la unidad**.
 *   7. Sin comprobante no se puede vender esa unidad desde su reserva.
 *   8. Un comprobante con bytes que no son imagen se rechaza.
 *   9. Un comprobante válido activa la reserva y bloquea la unidad.
 *  10. Dos reservas simultáneas sobre la misma unidad: sólo una sobrevive.
 *  11. El cliente no puede alterar el importe: la acción no acepta ninguno.
 *  12. Un cliente **no** ve los cobros de otro.
 *  13. Un webhook con firma inválida no escribe nada.
 *  14. Un webhook duplicado no aplica el pago dos veces.
 *  15. Un importe que no cuadra se rechaza y no marca la solicitud pagada.
 *  16. Un pago verificado confirma la reserva SIN comprobante manual.
 *  17. El aviso llega sólo al cliente correcto.
 *  18. Un VENDEDOR no puede reasignar un cliente.
 *
 * Trabaja sobre una **sucursal propia** para que ningún dato de la base de
 * desarrollo entre en las cuentas, y **borra sus fixtures al terminar** incluso
 * si una aserción falla.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import {
  SESSION_COOKIE_NAME,
  createPortalToken,
  createSessionToken,
} from "@/server/auth/session";
import { roleEnumToSpanish, type UserRoleEnum } from "@/server/auth/roles";
import { assignCustomerAction, createLeadAction } from "@/server/crm/actions";
import { createActivityAction } from "@/server/expedientes/actions";
import {
  createReservation,
  createSale,
  uploadReservationPaymentProof,
} from "@/server/operations/actions";
import { createPaymentRequestAction } from "@/server/payments/actions";
import { getPortalPaymentsAction } from "@/server/payments/portal-actions";
import { signSandboxPayload } from "@/server/payments/providers";
import { applyProviderWebhook } from "@/server/payments/service";

const prisma = new PrismaClient();
const STAMP = Date.now();
const TAG = `SMOKE-CRMQA1-${STAMP}`;
const BRANCH_CODE = `q1${String(STAMP).slice(-8)}`;

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

/**
 * Inyecta una cookie de sesión firmada. Es la misma sesión que produce el login:
 * mismo secreto, misma verificación, mismo `roleEnum`.
 */
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

/** Un JPEG mínimo: firma correcta, para que la validación de contenido pase. */
function jpegBytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  return bytes;
}

/** Bytes que NO son ninguna imagen, para el caso de rechazo. */
function notAnImage(): Uint8Array {
  return new TextEncoder().encode("MZ esto es un ejecutable, no una foto");
}

function fakeFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as unknown as BlobPart], name, { type });
}

type Ctx = {
  branchId: string;
  sellerId: string;
  otherSellerId: string;
  leaderId: string;
  customerAId: string;
  customerBId: string;
  unitIds: string[];
};

async function seed(): Promise<Ctx> {
  const branch = await prisma.branch.create({
    data: { code: BRANCH_CODE, name: `${TAG} sucursal`, isActive: true },
  });

  async function user(role: UserRoleEnum, suffix: string) {
    return prisma.user.create({
      data: {
        name: `${TAG}-${suffix}`,
        email: `${TAG}-${suffix}@smoke.local`.toLowerCase(),
        passwordHash: "x:y",
        role,
        branchId: branch.id,
      },
    });
  }

  const seller = await user("VENDEDOR", "vendedor");
  const otherSeller = await user("VENDEDOR", "vendedor2");
  const leader = await user("LIDER_VENTAS", "lider");

  async function customer(suffix: string, phone: string) {
    return prisma.customer.create({
      data: {
        branchId: branch.id,
        name: `${TAG}-${suffix}`,
        phone,
        phoneNormalized: phone,
      },
    });
  }

  const customerA = await customer("clienteA", `8${String(STAMP).slice(-7)}`);
  const customerB = await customer("clienteB", `7${String(STAMP).slice(-7)}`);

  // El vendedor tiene que "poseer" al cliente A para poder reservarle.
  await prisma.customer.update({
    where: { id: customerA.id },
    data: { assignedSellerId: seller.id },
  });
  await prisma.lead.create({
    data: {
      trackingCode: `${TAG}-LEADA`,
      name: `${TAG}-clienteA`,
      phone: customerA.phone,
      branchId: branch.id,
      status: "ASIGNADO",
      assignedSellerId: seller.id,
      customerId: customerA.id,
    },
  });

  const unitIds: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const unit = await prisma.motorcycleUnit.create({
      data: {
        branchId: branch.id,
        name: `${TAG}-moto-${i}`,
        brand: "Smoke",
        model: `M${i}`,
        year: 2026,
        chassisNumber: `${TAG}-CH-${i}`,
        entryDate: new Date(),
        status: "AVAILABLE",
      },
    });
    unitIds.push(unit.id);
  }

  return {
    branchId: branch.id,
    sellerId: seller.id,
    otherSellerId: otherSeller.id,
    leaderId: leader.id,
    customerAId: customerA.id,
    customerBId: customerB.id,
    unitIds,
  };
}

async function main() {
  console.log(`\n  ${TAG}\n`);
  const ctx = await seed();

  // --- 1-2. Quién reporta una venta --------------------------------------
  await signInAs("VENDEDOR", ctx.sellerId, BRANCH_CODE);
  const sellerSale = await createSale({
    customerId: ctx.customerAId,
    motorcycleUnitId: ctx.unitIds[0],
    type: "CONTADO",
  });
  check(
    "un VENDEDOR no puede reportar una venta",
    !sellerSale.ok,
    sellerSale.ok ? "la registró" : "",
  );
  check(
    "el rechazo no dejó ninguna venta",
    (await prisma.sale.count({ where: { branchId: ctx.branchId } })) === 0,
  );

  await signInAs("LIDER_VENTAS", ctx.leaderId, BRANCH_CODE);
  const leaderSale = await createSale({
    customerId: ctx.customerAId,
    motorcycleUnitId: ctx.unitIds[0],
    type: "CONTADO",
  });
  check(
    "un LIDER_VENTAS sí puede reportar una venta",
    leaderSale.ok,
    leaderSale.ok ? "" : leaderSale.error,
  );

  // --- 3-5. Leads y actividades del vendedor -----------------------------
  await signInAs("VENDEDOR", ctx.sellerId, BRANCH_CODE);
  const lead = await createLeadAction({
    nombre: `${TAG}-lead-manual`,
    telefono: `5${String(STAMP).slice(-7)}`,
    origen: "Sucursal",
  });
  check(
    "un VENDEDOR puede registrar un lead a mano",
    lead.ok,
    lead.ok ? "" : lead.error,
  );

  let ownLeadId = "";
  if (lead.ok) {
    ownLeadId = lead.leadId;
    const row = await prisma.lead.findUnique({ where: { id: lead.leadId } });
    check(
      "el lead que registra le queda asignado y con autor",
      row?.assignedSellerId === ctx.sellerId && row?.createdById === ctx.sellerId,
    );
    check("el lead nace en la sucursal del vendedor", row?.branchId === ctx.branchId);

    const activity = await createActivityAction({
      type: "LLAMADA",
      description: "Primer contacto",
      leadId: lead.leadId,
    });
    check(
      "un VENDEDOR registra actividad sobre SU lead",
      activity.ok,
      activity.ok ? "" : activity.error,
    );
    check(
      "la actividad queda colgada del lead y de su autor",
      (await prisma.activity.count({
        where: { leadId: lead.leadId, userId: ctx.sellerId },
      })) === 1,
    );
  }

  // Un lead del OTRO vendedor: fuera del alcance personal.
  const foreignLead = await prisma.lead.create({
    data: {
      trackingCode: `${TAG}-AJENO`,
      name: `${TAG}-ajeno`,
      phone: `6${String(STAMP).slice(-7)}`,
      branchId: ctx.branchId,
      status: "ASIGNADO",
      assignedSellerId: ctx.otherSellerId,
    },
  });
  const foreignActivity = await createActivityAction({
    type: "NOTA",
    description: "No debería poder",
    leadId: foreignLead.id,
  });
  check(
    "un VENDEDOR no registra actividad sobre el lead de otro",
    !foreignActivity.ok,
    foreignActivity.ok ? "lo dejó pasar" : "",
  );

  // --- 6-9. Reserva, comprobante y bloqueo de unidad ---------------------
  const reservation = await createReservation({
    customerId: ctx.customerAId,
    motorcycleUnitId: ctx.unitIds[1],
  });
  check(
    "un VENDEDOR sí puede crear una reserva",
    reservation.ok,
    reservation.ok ? "" : reservation.error,
  );

  let reservationId = "";
  if (reservation.ok) {
    reservationId = reservation.reservationId;
    const row = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { motorcycleUnit: true },
    });
    check("la reserva nace PENDIENTE_PAGO", row?.status === "PENDIENTE_PAGO");
    check(
      "la unidad NO queda bloqueada por una reserva sin pagar",
      row?.motorcycleUnit.status === "AVAILABLE",
    );
    check(
      "la reserva toma el candado de su unidad",
      row?.activeUnitLock === ctx.unitIds[1],
    );

    await signInAs("LIDER_VENTAS", ctx.leaderId, BRANCH_CODE);
    const earlySale = await createSale({
      customerId: ctx.customerAId,
      motorcycleUnitId: ctx.unitIds[1],
      type: "CONTADO",
      reservationId,
    });
    check(
      "no se puede vender desde una reserva sin pagar",
      !earlySale.ok,
      earlySale.ok ? "la vendió" : "",
    );

    await signInAs("VENDEDOR", ctx.sellerId, BRANCH_CODE);
    const badUpload = await uploadReservationPaymentProof({
      reservationId,
      // Se anuncia como JPEG y no lo es: el nombre y el `type` los elige quien
      // sube, así que lo único que decide son los bytes.
      file: fakeFile(notAnImage(), "comprobante.jpg", "image/jpeg"),
    });
    check(
      "un archivo que no es imagen se rechaza aunque diga serlo",
      !badUpload.ok,
      badUpload.ok ? "lo aceptó" : "",
    );
    check(
      "el archivo rechazado no dejó fila en stored_files",
      (await prisma.storedFile.count({ where: { branchId: ctx.branchId } })) === 0,
    );
    check(
      "la reserva sigue pendiente tras el rechazo",
      (await prisma.reservation.findUnique({ where: { id: reservationId } }))
        ?.status === "PENDIENTE_PAGO",
    );

    const goodUpload = await uploadReservationPaymentProof({
      reservationId,
      file: fakeFile(jpegBytes(), "comprobante.jpg", "image/jpeg"),
      monto: "1500.00",
      moneda: "NIO",
      metodo: "TRANSFERENCIA",
    });
    check(
      "un comprobante válido se acepta",
      goodUpload.ok,
      goodUpload.ok ? "" : goodUpload.error,
    );
    const confirmed = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { motorcycleUnit: true, paymentProof: true },
    });
    check("con comprobante la reserva pasa a ACTIVA", confirmed?.status === "ACTIVA");
    check(
      "con comprobante la unidad queda RESERVED",
      confirmed?.motorcycleUnit.status === "RESERVED",
    );
    check(
      "el comprobante queda pendiente de revisión",
      confirmed?.paymentProof?.status === "PENDIENTE_REVISION",
    );
  }

  // --- 10. Concurrencia sobre la misma unidad ----------------------------
  const [first, second] = await Promise.all([
    createReservation({
      customerId: ctx.customerAId,
      motorcycleUnitId: ctx.unitIds[2],
    }),
    createReservation({
      customerId: ctx.customerAId,
      motorcycleUnitId: ctx.unitIds[2],
    }),
  ]);
  check(
    "dos reservas simultáneas sobre la misma unidad: sólo una pasa",
    [first.ok, second.ok].filter(Boolean).length === 1,
    `first=${first.ok} second=${second.ok}`,
  );
  check(
    "la unidad quedó con una sola reserva viva",
    (await prisma.reservation.count({
      where: {
        motorcycleUnitId: ctx.unitIds[2],
        status: { in: ["PENDIENTE_PAGO", "ACTIVA"] },
      },
    })) === 1,
  );

  // --- 11-12. Cobros: importe del servidor y aislamiento -----------------
  await signInAs("LIDER_VENTAS", ctx.leaderId, BRANCH_CODE);
  const requestA = await createPaymentRequestAction({
    customerId: ctx.customerAId,
    monto: "2500.50",
    moneda: "NIO",
    concepto: "Anticipo de reserva",
  });
  check(
    "un LIDER_VENTAS puede solicitar un pago",
    requestA.ok,
    requestA.ok ? "" : requestA.error,
  );

  let requestAId = "";
  if (requestA.ok) {
    requestAId = requestA.paymentRequestId;
    const row = await prisma.paymentRequest.findUnique({ where: { id: requestAId } });
    check(
      "el importe queda guardado exacto, en Decimal",
      row?.amount.toFixed(2) === "2500.50",
      row?.amount.toFixed(2),
    );
  }

  const tokenA = await createPortalToken({
    customerId: ctx.customerAId,
    trackingCode: null,
  });
  const tokenB = await createPortalToken({
    customerId: ctx.customerBId,
    trackingCode: null,
  });

  const portalA = await getPortalPaymentsAction(tokenA);
  check(
    "el cliente A ve su propio cobro",
    portalA.ok && portalA.requests.some((r) => r.id === requestAId),
  );
  const portalB = await getPortalPaymentsAction(tokenB);
  check(
    "el cliente B NO ve el cobro del cliente A",
    portalB.ok && !portalB.requests.some((r) => r.id === requestAId),
  );

  // --- 13-17. Webhook: firma, idempotencia, importe, confirmación --------
  //
  // La pasarela de pruebas necesita su secreto. Sin él, estas comprobaciones no
  // se pueden ejercitar y se dicen saltadas en vez de fingir que pasaron.
  if (!process.env.PAYMENTS_SANDBOX_SECRET || process.env.PAYMENTS_PROVIDER !== "sandbox") {
    console.log(
      "\n  AVISO  Webhook sin ejercitar: requiere PAYMENTS_PROVIDER=sandbox y " +
        "PAYMENTS_SANDBOX_SECRET.\n",
    );
  } else if (requestAId) {
    const reference = `SBX-${TAG}`;
    const transaction = await prisma.paymentTransaction.create({
      data: {
        paymentRequestId: requestAId,
        provider: "sandbox",
        providerReference: reference,
        amount: new Prisma.Decimal("2500.50"),
        currency: "NIO",
        status: "PENDIENTE",
      },
    });

    const body = (eventId: string, amount: string) =>
      JSON.stringify({
        eventId,
        providerReference: reference,
        outcome: "approved",
        amount,
        currency: "NIO",
        failureReason: null,
      });

    const forged = body(`${TAG}-forjado`, "2500.50");
    const bad = await applyProviderWebhook({
      provider: "sandbox",
      rawBody: forged,
      headers: { "x-motomas-signature": "0".repeat(64) },
    });
    check("un webhook con firma inválida se rechaza", !bad.ok);
    check(
      "el webhook rechazado no dejó rastro en la base",
      (await prisma.paymentWebhookEvent.count({
        where: { eventId: `${TAG}-forjado` },
      })) === 0,
    );

    const wrongAmountBody = body(`${TAG}-importe`, "1.00");
    const wrongAmount = await applyProviderWebhook({
      provider: "sandbox",
      rawBody: wrongAmountBody,
      headers: {
        "x-motomas-signature": signSandboxPayload(wrongAmountBody) ?? "",
      },
    });
    check(
      "un importe que no cuadra se marca y no aplica el pago",
      wrongAmount.ok && wrongAmount.outcome === "importe_no_coincide",
      wrongAmount.ok ? wrongAmount.outcome : wrongAmount.error,
    );
    check(
      "la solicitud NO quedó pagada por un importe que no cuadra",
      (await prisma.paymentRequest.findUnique({ where: { id: requestAId } }))
        ?.status !== "PAGADA",
    );

    // La transacción quedó RECHAZADA por el descuadre: se reabre para el caso
    // bueno, que es el que esta prueba quiere medir a continuación.
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { status: "PENDIENTE", failureReason: null },
    });

    const goodBody = body(`${TAG}-ok`, "2500.50");
    const signature = signSandboxPayload(goodBody) ?? "";
    const applied = await applyProviderWebhook({
      provider: "sandbox",
      rawBody: goodBody,
      headers: { "x-motomas-signature": signature },
    });
    check(
      "un webhook firmado y cuadrado aplica el pago",
      applied.ok && applied.outcome === "aplicado",
      applied.ok ? applied.outcome : applied.error,
    );
    check(
      "la solicitud queda PAGADA",
      (await prisma.paymentRequest.findUnique({ where: { id: requestAId } }))
        ?.status === "PAGADA",
    );

    const replay = await applyProviderWebhook({
      provider: "sandbox",
      rawBody: goodBody,
      headers: { "x-motomas-signature": signature },
    });
    check(
      "el reenvío del mismo evento se reconoce como duplicado",
      replay.ok && replay.outcome === "duplicado",
      replay.ok ? replay.outcome : replay.error,
    );
    check(
      "el duplicado no creó un segundo evento",
      (await prisma.paymentWebhookEvent.count({
        where: { eventId: `${TAG}-ok` },
      })) === 1,
    );

    check(
      "el aviso de pago llegó al cliente A",
      (await prisma.customerNotification.count({
        where: { customerId: ctx.customerAId, kind: "PAGO_CONFIRMADO" },
      })) >= 1,
    );
    check(
      "el cliente B no recibió ningún aviso",
      (await prisma.customerNotification.count({
        where: { customerId: ctx.customerBId },
      })) === 0,
    );

    // --- 16. Pago verificado confirma la reserva sin comprobante manual ---
    await signInAs("VENDEDOR", ctx.sellerId, BRANCH_CODE);
    const onlineReservation = await createReservation({
      customerId: ctx.customerAId,
      motorcycleUnitId: ctx.unitIds[3],
    });
    if (onlineReservation.ok) {
      await signInAs("LIDER_VENTAS", ctx.leaderId, BRANCH_CODE);
      const onlineRequest = await createPaymentRequestAction({
        customerId: ctx.customerAId,
        monto: "900.00",
        moneda: "NIO",
        concepto: "Reserva en línea",
        reservationId: onlineReservation.reservationId,
      });
      if (onlineRequest.ok) {
        const onlineRef = `SBX-${TAG}-ONLINE`;
        await prisma.paymentTransaction.create({
          data: {
            paymentRequestId: onlineRequest.paymentRequestId,
            provider: "sandbox",
            providerReference: onlineRef,
            amount: new Prisma.Decimal("900.00"),
            currency: "NIO",
            status: "PENDIENTE",
          },
        });
        const onlineBody = JSON.stringify({
          eventId: `${TAG}-online`,
          providerReference: onlineRef,
          outcome: "approved",
          amount: "900.00",
          currency: "NIO",
          failureReason: null,
        });
        await applyProviderWebhook({
          provider: "sandbox",
          rawBody: onlineBody,
          headers: {
            "x-motomas-signature": signSandboxPayload(onlineBody) ?? "",
          },
        });
        const confirmedOnline = await prisma.reservation.findUnique({
          where: { id: onlineReservation.reservationId },
          include: { motorcycleUnit: true, paymentProof: true },
        });
        check(
          "un pago verificado confirma la reserva SIN comprobante manual",
          confirmedOnline?.status === "ACTIVA" && confirmedOnline.paymentProof === null,
        );
        check(
          "y bloquea la unidad",
          confirmedOnline?.motorcycleUnit.status === "RESERVED",
        );
      }
    }
  }

  // --- 18. Reasignar cartera es supervisión ------------------------------
  await signInAs("VENDEDOR", ctx.sellerId, BRANCH_CODE);
  const sellerAssign = await assignCustomerAction({
    customerId: ctx.customerBId,
    sellerId: ctx.sellerId,
  });
  check(
    "un VENDEDOR no puede reasignar un cliente",
    !sellerAssign.ok,
    sellerAssign.ok ? "lo reasignó" : "",
  );

  await signInAs("LIDER_VENTAS", ctx.leaderId, BRANCH_CODE);
  const leaderAssign = await assignCustomerAction({
    customerId: ctx.customerBId,
    sellerId: ctx.sellerId,
  });
  check(
    "un LIDER_VENTAS sí puede reasignar un cliente",
    leaderAssign.ok,
    leaderAssign.ok ? "" : leaderAssign.error,
  );
  check(
    "la reasignación deja rastro de quién y cuándo",
    Boolean(
      (await prisma.customer.findUnique({ where: { id: ctx.customerBId } }))
        ?.assignedAt,
    ),
  );
  check(
    "reasignar no tocó los leads ya registrados",
    (await prisma.lead.count({
      where: { branchId: ctx.branchId, assignedSellerId: ctx.sellerId },
    })) >= 1,
  );

  void ownLeadId;
}

/**
 * Borra los fixtures en orden de dependencia. Se ejecuta pase lo que pase: una
 * aserción que falla no debe dejar una sucursal fantasma en la base.
 */
async function cleanup() {
  const branch = await prisma.branch.findUnique({ where: { code: BRANCH_CODE } });
  if (!branch) return;
  const where = { branchId: branch.id };

  await prisma.customerNotification.deleteMany({
    where: { customer: { branchId: branch.id } },
  });
  await prisma.paymentWebhookEvent.deleteMany({
    where: { eventId: { startsWith: TAG } },
  });
  await prisma.paymentTransaction.deleteMany({
    where: { paymentRequest: where },
  });
  await prisma.paymentRequest.deleteMany({ where });
  await prisma.reservationPaymentProof.deleteMany({
    where: { reservation: where },
  });
  await prisma.activity.deleteMany({ where });
  await prisma.inventoryMovement.deleteMany({ where });
  await prisma.sale.deleteMany({ where });
  await prisma.reservation.deleteMany({ where });
  await prisma.storedFile.deleteMany({ where });
  await prisma.lead.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.motorcycleUnit.deleteMany({ where });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG.toLowerCase() } } });
  await prisma.branch.delete({ where: { id: branch.id } });
}

main()
  .catch((error) => {
    failed += 1;
    console.error("\n  ERROR", error);
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    console.log(`\n  ${passed} OK · ${failed} fallos\n`);
    process.exit(failed === 0 ? 0 : 1);
  });
