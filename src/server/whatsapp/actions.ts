"use server";

import { revalidatePath } from "next/cache";

import { canOperateCrm } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured } from "@/server/db/prisma";
import {
  sendFreeTextMessage,
  sendTemplateMessage,
} from "@/server/whatsapp/service";
import type { WhatsAppSendResult } from "@/server/whatsapp/shared";

/**
 * Envíos de WhatsApp desde el panel. Server Actions, como todo lo que no sea la
 * entrega HTTP de Meta — la ruta del webhook sigue siendo la única excepción y
 * sólo porque Meta llama desde fuera.
 *
 * El rol se vuelve a comprobar aquí con `canOperateCrm` (Admin, Gerente y
 * Vendedor), la misma puerta que ya gobierna leads y expedientes: escribirle a
 * un cliente es operar el CRM, no una capacidad nueva. Cajero y Contador no
 * pasan.
 *
 * La ventana de 24 h se comprueba **en el servidor**, dentro del servicio. La
 * pantalla también la calcula, pero eso es comodidad: la barrera está aquí.
 */

const DB_REQUIRED =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";
const NO_PERMISSION = "No tienes permiso para escribir por WhatsApp.";

export async function sendWhatsAppMessage(input: {
  phone: string;
  body: string;
}): Promise<WhatsAppSendResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, code: "rechazado-por-meta", error: DB_REQUIRED };
  }

  const session = await requireAuth();
  if (!canOperateCrm(session.roleEnum)) {
    return { ok: false, code: "rechazado-por-meta", error: NO_PERMISSION };
  }

  const result = await sendFreeTextMessage(input);
  if (result.ok) {
    revalidatePath("/panel/leads");
    revalidatePath("/panel/clientes");
  }
  return result;
}

/**
 * Envío de plantilla aprobada: el único camino permitido fuera de la ventana de
 * 24 h. `templateName` tiene que estar en `WHATSAPP_APPROVED_TEMPLATES`; un
 * nombre que no esté ahí se rechaza sin llamar a Meta, en vez de intentarlo con
 * un nombre adivinado.
 */
export async function sendWhatsAppTemplateMessage(input: {
  phone: string;
  templateName: string;
}): Promise<WhatsAppSendResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, code: "rechazado-por-meta", error: DB_REQUIRED };
  }

  const session = await requireAuth();
  if (!canOperateCrm(session.roleEnum)) {
    return { ok: false, code: "rechazado-por-meta", error: NO_PERMISSION };
  }

  const result = await sendTemplateMessage(input);
  if (result.ok) {
    revalidatePath("/panel/leads");
    revalidatePath("/panel/clientes");
  }
  return result;
}
