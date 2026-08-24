import { getPrisma } from "@/server/db/prisma";
import {
  whatsAppMessageStatusLabels,
  type WhatsAppConversationDTO,
  type WhatsAppMessageDirectionValue,
  type WhatsAppMessageStatusValue,
} from "@/server/whatsapp/shared";

/**
 * Lecturas de la conversación de WhatsApp.
 *
 * El hilo se lee por TELÉFONO, no por `leadId`: un mensaje que llegó antes de
 * que existiera el lead se guardó sin dueño, y buscar por la relación lo dejaría
 * fuera de su propia conversación. El teléfono es lo que el cliente y nosotros
 * compartimos de verdad.
 */

/** Tope por hilo. Una conversación más larga que esto se lee por la cola. */
const THREAD_LIMIT = 200;

export async function listWhatsAppConversations(
  phones: string[],
): Promise<Record<string, WhatsAppConversationDTO>> {
  const unique = [...new Set(phones.filter(Boolean))];
  if (!unique.length) return {};

  const rows = await getPrisma().whatsAppMessage.findMany({
    where: { phone: { in: unique } },
    orderBy: { createdAt: "asc" },
    take: THREAD_LIMIT * unique.length,
    select: {
      id: true,
      direction: true,
      phone: true,
      body: true,
      templateName: true,
      status: true,
      createdAt: true,
    },
  });

  const conversations: Record<string, WhatsAppConversationDTO> = {};
  for (const phone of unique) {
    conversations[phone] = { phone, messages: [], lastInboundAt: null };
  }

  for (const row of rows) {
    const conversation = conversations[row.phone];
    if (!conversation) continue;

    const direction = row.direction as WhatsAppMessageDirectionValue;
    const status = row.status as WhatsAppMessageStatusValue;

    conversation.messages.push({
      id: row.id,
      direction,
      phone: row.phone,
      body: row.body,
      templateName: row.templateName,
      status,
      statusLabel: whatsAppMessageStatusLabels[status] ?? row.status,
      createdAt: row.createdAt.toISOString(),
    });

    // Las filas vienen en orden ascendente, así que la última entrante que se
    // ve es la más reciente: la que define la ventana de 24 h.
    if (direction === "ENTRANTE") {
      conversation.lastInboundAt = row.createdAt.toISOString();
    }
  }

  return conversations;
}
