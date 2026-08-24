-- Patch Meta-2 — bitacora de mensajes de WhatsApp.
--
-- **Aditiva.** Una tabla nueva y dos enumerados nuevos. Ninguna tabla existente
-- cambia de forma y ninguna fila existente se toca: `leads` y `customers` solo
-- ganan el lado inverso de una relacion, que no es una columna.
--
-- Esta tabla es tambien la fuente de la ventana de servicio de 24 h de Meta. El
-- momento del ultimo mensaje ENTRANTE se deriva de estas filas y no de un campo
-- "visto por ultima vez": un campo aparte se desviaria del log en cuanto una
-- escritura fallara a medias, y la ventana dejaria de corresponder a lo que
-- realmente paso en la conversacion.
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('ENTRANTE', 'SALIENTE');
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('PENDIENTE', 'ENVIADO', 'ENTREGADO', 'LEIDO', 'FALLIDO');

CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "phone" TEXT NOT NULL,
    "wa_message_id" TEXT,
    "body" TEXT,
    "template_name" TEXT,
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'PENDIENTE',
    "lead_id" TEXT,
    "customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- Unico y anulable, misma convencion que `leads.meta_leadgen_id` (Meta-1) y
-- `pos_sales.idempotency_key` (POS5.0). En un entrante evita que el reenvio del
-- webhook duplique la fila; en un saliente rechazado por Meta no hay id que
-- guardar, y `NULL` no compite en un indice unico de PostgreSQL, asi que varios
-- rechazos conviven sin bloquearse entre si.
CREATE UNIQUE INDEX "whatsapp_messages_wa_message_id_key" ON "whatsapp_messages"("wa_message_id");

-- La consulta que sostiene la ventana de 24 h y el hilo de la conversacion:
-- "dame los mensajes de este telefono por fecha".
CREATE INDEX "whatsapp_messages_phone_created_at_idx" ON "whatsapp_messages"("phone", "created_at");
CREATE INDEX "whatsapp_messages_lead_id_idx" ON "whatsapp_messages"("lead_id");
CREATE INDEX "whatsapp_messages_customer_id_idx" ON "whatsapp_messages"("customer_id");

-- `SET NULL` a proposito: borrar un lead no puede borrar la prueba de que la
-- conversacion existio. El mensaje sobrevive sin dueno, igual que uno que nunca
-- lo tuvo.
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
