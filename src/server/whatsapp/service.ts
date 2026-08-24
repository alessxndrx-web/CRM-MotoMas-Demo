import { Prisma } from "@prisma/client";

import { normalizePhone } from "@/server/crm/shared";
import { getPrisma } from "@/server/db/prisma";
import { logMetaInfo, logMetaWarn } from "@/server/meta/log";
import {
  checkWhatsAppCredentials,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  type WhatsAppApiResult,
} from "@/server/whatsapp/client";
import type {
  WhatsAppInboundMessage,
  WhatsAppStatusUpdate,
} from "@/server/whatsapp/payload";
import {
  WHATSAPP_WELCOME_MESSAGE_ES,
  approvedTemplateLanguage,
  isWithinServiceWindow,
  shouldAdvanceStatus,
  whatsAppSendErrorMessages,
  type WhatsAppMessageStatusValue,
  type WhatsAppSendErrorCode,
  type WhatsAppSendResult,
} from "@/server/whatsapp/shared";

/**
 * El servicio de WhatsApp: entrada de mensajes, salida de mensajes y las
 * devoluciones de estado.
 *
 * ## Qué se registra y qué no
 *
 * Sólo se guarda una fila de salida cuando el envío **llegó a intentarse contra
 * la API**. Un envío rechazado aquí —fuera de ventana, sin credenciales, con una
 * plantilla no aprobada— nunca llegó a Meta, no tiene `wa_message_id` y no hay
 * nada que correlacionar después: guardarlo llenaría el hilo de mensajes que el
 * cliente nunca pudo recibir. Un envío que sí salió y Meta rechazó sí se guarda,
 * como FALLIDO, porque eso sí ocurrió.
 *
 * Un mensaje **entrante** se guarda siempre, aunque su teléfono no corresponda a
 * ningún `Lead` ni `Customer`. Es la misma regla que `MetaUnmappedLead` fijó para
 * Lead Ads: no se pierde algo real por no saber a quién atribuírselo.
 */

/** Los códigos que significan "nunca salió", y por tanto no dejan fila. */
const NEVER_ATTEMPTED: WhatsAppSendErrorCode[] = [
  "fuera-de-ventana",
  "sin-numero-configurado",
  "sin-token-configurado",
  "plantilla-no-aprobada",
  "telefono-invalido",
  "mensaje-vacio",
];

/**
 * A quién pertenece un teléfono. Reutiliza `normalizePhone`, la misma
 * normalización con la que se guardó `Lead.phone` desde el alta pública y desde
 * Lead Ads — sin ella los dígitos no coincidirían y todo mensaje quedaría
 * huérfano.
 */
export async function resolveOwnerByPhone(phone: string): Promise<{
  leadId: string | null;
  customerId: string | null;
}> {
  const prisma = getPrisma();

  const [lead, customer] = await Promise.all([
    prisma.lead.findFirst({
      where: { phone },
      orderBy: { createdAt: "desc" },
      select: { id: true, customerId: true },
    }),
    prisma.customer.findFirst({
      where: { phoneNormalized: phone },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
  ]);

  return {
    leadId: lead?.id ?? null,
    // Si el lead ya se convirtió en cliente, ese vínculo manda sobre la
    // búsqueda suelta por teléfono.
    customerId: lead?.customerId ?? customer?.id ?? null,
  };
}

/** El `createdAt` del último ENTRANTE: la única fuente de la ventana de 24 h. */
export async function lastInboundAt(phone: string): Promise<Date | null> {
  const row = await getPrisma().whatsAppMessage.findFirst({
    where: { phone, direction: "ENTRANTE" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

function failure(
  code: WhatsAppSendErrorCode,
  detail?: string,
): WhatsAppSendResult {
  return {
    ok: false,
    code,
    error: detail
      ? `${whatsAppSendErrorMessages[code]} (${detail})`
      : whatsAppSendErrorMessages[code],
  };
}

async function persistOutcome(input: {
  phone: string;
  body: string | null;
  templateName: string | null;
  result: WhatsAppApiResult;
}): Promise<WhatsAppSendResult> {
  const { phone, body, templateName, result } = input;

  if (!result.ok && NEVER_ATTEMPTED.includes(result.failure.code)) {
    return failure(result.failure.code, result.failure.detail);
  }

  const owner = await resolveOwnerByPhone(phone);
  const prisma = getPrisma();

  if (!result.ok) {
    // Salió y Meta lo rechazó: eso sí pasó, y queda registrado sin `wa_message_id`
    // porque nunca lo hubo.
    await prisma.whatsAppMessage.create({
      data: {
        direction: "SALIENTE",
        phone,
        body,
        templateName,
        status: "FALLIDO",
        leadId: owner.leadId,
        customerId: owner.customerId,
      },
    });
    logMetaWarn("envío de WhatsApp rechazado por Meta", {
      phone,
      detalle: result.failure.detail,
    });
    return failure(result.failure.code, result.failure.detail);
  }

  const created = await prisma.whatsAppMessage.create({
    data: {
      direction: "SALIENTE",
      phone,
      waMessageId: result.waMessageId,
      body,
      templateName,
      status: "PENDIENTE",
      leadId: owner.leadId,
      customerId: owner.customerId,
    },
    select: { id: true },
  });

  return { ok: true, messageId: created.id, waMessageId: result.waMessageId };
}

/**
 * Texto libre. Comprueba la ventana de 24 h **en el servidor** antes de gastar
 * la llamada: la pantalla también la comprueba, pero esa comprobación es una
 * comodidad, no la barrera.
 */
export async function sendFreeTextMessage(input: {
  phone: string;
  body: string;
  now?: Date;
}): Promise<WhatsAppSendResult> {
  const phone = normalizePhone(input.phone ?? "");
  if (phone.length < 8) return failure("telefono-invalido");

  const body = (input.body ?? "").trim();
  if (!body) return failure("mensaje-vacio");

  const missing = checkWhatsAppCredentials();
  if (missing) return failure(missing.code, missing.detail);

  const inbound = await lastInboundAt(phone);
  if (!isWithinServiceWindow(inbound, input.now ?? new Date())) {
    // No se degrada a plantilla por su cuenta: cuál plantilla es una decisión de
    // negocio, y mandar otra cosa distinta de lo que se escribió sería peor que
    // no mandar nada.
    return failure("fuera-de-ventana");
  }

  const result = await sendWhatsAppText(phone, body);
  return persistOutcome({ phone, body, templateName: null, result });
}

/** Plantilla aprobada: el único envío permitido fuera de la ventana. */
export async function sendTemplateMessage(input: {
  phone: string;
  templateName: string;
}): Promise<WhatsAppSendResult> {
  const phone = normalizePhone(input.phone ?? "");
  if (phone.length < 8) return failure("telefono-invalido");

  const templateName = (input.templateName ?? "").trim();
  if (!approvedTemplateLanguage(templateName)) {
    return failure(
      "plantilla-no-aprobada",
      templateName ? `"${templateName}"` : "sin nombre",
    );
  }

  const missing = checkWhatsAppCredentials();
  if (missing) return failure(missing.code, missing.detail);

  const result = await sendWhatsAppTemplate(phone, templateName);
  return persistOutcome({ phone, body: null, templateName, result });
}

/**
 * Un mensaje entrante.
 *
 * Idempotente por `wa_message_id`: Meta reenvía la entrega ante cualquier
 * respuesta que no sea 200, y el reenvío no debe duplicar la fila ni disparar
 * una segunda bienvenida.
 */
export async function ingestInboundMessage(
  message: WhatsAppInboundMessage,
): Promise<{ messageId: string; created: boolean; autoReplied: boolean }> {
  const prisma = getPrisma();
  const phone = normalizePhone(message.from);

  const owner = await resolveOwnerByPhone(phone);

  let messageId: string;
  let created: boolean;
  try {
    const row = await prisma.whatsAppMessage.create({
      data: {
        direction: "ENTRANTE",
        phone,
        waMessageId: message.waMessageId,
        body: message.body,
        // Un entrante nace ENTREGADO: llegó. Los estados de entrega son de lo
        // que enviamos nosotros, no de lo que recibimos.
        status: "ENTREGADO",
        leadId: owner.leadId,
        customerId: owner.customerId,
      },
      select: { id: true },
    });
    messageId = row.id;
    created = true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await prisma.whatsAppMessage.findUnique({
        where: { waMessageId: message.waMessageId },
        select: { id: true },
      });
      if (!winner) throw error;
      logMetaInfo("mensaje de WhatsApp reentregado, ya estaba registrado", {
        waMessageId: message.waMessageId,
      });
      return { messageId: winner.id, created: false, autoReplied: false };
    }
    throw error;
  }

  if (!owner.leadId && !owner.customerId) {
    // No es un error: alguien puede escribir sin haber dejado nunca un lead. El
    // mensaje se guarda igual y queda sin dueño hasta que exista uno.
    logMetaInfo("mensaje de WhatsApp sin lead ni cliente asociado", { phone });
  }

  const autoReplied = await maybeAutoReply(phone);
  return { messageId, created, autoReplied };
}

/**
 * La bienvenida, **sólo en el primer contacto**.
 *
 * "Primero" se decide contando las filas de ese teléfono después de insertar la
 * entrante: si hay exactamente una, la que se acaba de crear es la primera que
 * ha existido nunca. Contar contra la bitácora en vez de llevar una marca aparte
 * hace que un reenvío, un mensaje concurrente o una respuesta anterior fallida no
 * puedan producir una segunda bienvenida.
 *
 * Nunca lanza: una cortesía que falla no puede provocar que el webhook responda
 * algo distinto de 200, porque Meta reenviaría el MISMO mensaje entrante y el
 * cliente acabaría con la conversación duplicada por un saludo.
 */
async function maybeAutoReply(phone: string): Promise<boolean> {
  try {
    const total = await getPrisma().whatsAppMessage.count({ where: { phone } });
    if (total !== 1) return false;

    const result = await sendFreeTextMessage({
      phone,
      body: WHATSAPP_WELCOME_MESSAGE_ES,
    });

    if (!result.ok) {
      logMetaWarn("no se pudo enviar la bienvenida automática", {
        phone,
        code: result.code,
      });
      return false;
    }

    logMetaInfo("bienvenida automática enviada (primer contacto)", { phone });
    return true;
  } catch (error) {
    logMetaWarn("fallo enviando la bienvenida automática", {
      phone,
      error: error instanceof Error ? error.message : "desconocido",
    });
    return false;
  }
}

/**
 * Una devolución de estado.
 *
 * Sin fila que actualizar se registra y se ignora — es lo que pasa con un
 * mensaje enviado antes de que existiera esta bitácora. Crear una fila nueva a
 * partir de un estado inventaría un mensaje del que no se conoce ni el texto ni
 * el destinatario.
 */
export async function applyStatusUpdate(
  update: WhatsAppStatusUpdate,
): Promise<"actualizado" | "sin-cambio" | "desconocido"> {
  const prisma = getPrisma();
  const existing = await prisma.whatsAppMessage.findUnique({
    where: { waMessageId: update.waMessageId },
    select: { id: true, status: true },
  });

  if (!existing) {
    logMetaInfo("estado de WhatsApp sin mensaje que actualizar", {
      waMessageId: update.waMessageId,
      estado: update.rawStatus,
    });
    return "desconocido";
  }

  const current = existing.status as WhatsAppMessageStatusValue;
  if (!shouldAdvanceStatus(current, update.status)) return "sin-cambio";

  await prisma.whatsAppMessage.update({
    where: { id: existing.id },
    data: { status: update.status },
  });
  return "actualizado";
}
