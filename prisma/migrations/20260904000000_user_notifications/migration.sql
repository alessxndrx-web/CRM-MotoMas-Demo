-- Patch CRM-AUD2 — avisos para empleados.
--
-- La auditoria CRM-AUD1 encontro que `CustomerNotification` avisa al cliente en
-- el portal y que **ningun empleado recibe nada**: ni «te asignaron un lead», ni
-- «hay un comprobante esperando tu revision», ni «se confirmo el pago de tu
-- reserva». El trabajo llegaba y nadie se enteraba hasta entrar a mirar.
--
-- Aditiva por completo: una tabla nueva y un enumerado nuevo. Ninguna tabla
-- existente cambia, ninguna columna se toca, ninguna fila se reescribe.

-- ---------------------------------------------------------------------------
-- 1. Por que se avisa.
-- ---------------------------------------------------------------------------
--
-- Cinco motivos, y los cinco corresponden a una transicion de estado que alguna
-- accion del servidor YA ejecutaba. No se invento ningun evento de negocio para
-- tener mas avisos que mostrar.
CREATE TYPE "UserNotificationKind" AS ENUM (
  'LEAD_ASIGNADO',
  'CLIENTE_ASIGNADO',
  'COMPROBANTE_POR_REVISAR',
  'COMPROBANTE_REVISADO',
  'PAGO_CONFIRMADO'
);

-- ---------------------------------------------------------------------------
-- 2. El aviso.
-- ---------------------------------------------------------------------------
--
-- **No es la fuente de la verdad.** Guarda el texto que se mostro y punteros a
-- los registros implicados; el estado real vive en la reserva, el lead o el
-- cobro. Borrar un aviso no deshace nada, y un aviso viejo no puede contradecir
-- al registro porque la pantalla relee el registro al abrirlo.
--
-- **No guarda la ruta.** Se deriva del motivo y de los punteros al leer: una URL
-- guardada envejece mal, y renombrar una ruta dejaria enlaces rotos en filas que
-- nadie volvera a tocar.
CREATE TABLE "user_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "UserNotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "lead_id" TEXT,
    "customer_id" TEXT,
    "reservation_id" TEXT,
    "payment_request_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

-- La bandeja: los avisos de un destinatario, del mas reciente al mas antiguo.
CREATE INDEX "user_notifications_user_id_created_at_idx"
  ON "user_notifications"("user_id", "created_at");

-- El contador de no leidos. **Es la consulta mas frecuente de la aplicacion**:
-- se dispara en cada vuelta del sondeo de la campana, para cada empleado con
-- una pestania abierta. Sin este indice seria un recorrido de la tabla entera
-- cada pocos segundos por usuario.
CREATE INDEX "user_notifications_user_id_read_at_idx"
  ON "user_notifications"("user_id", "read_at");

-- CASCADE sobre el destinatario: los avisos de un usuario borrado no le
-- interesan a nadie y no son historia de negocio que preservar.
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL sobre los punteros: borrar un lead no puede borrar el aviso que
-- alguien ya leyo, ni impedir el borrado. El aviso queda sin enlace, que es
-- exactamente lo que ha pasado.
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_reservation_id_fkey"
  FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_payment_request_id_fkey"
  FOREIGN KEY ("payment_request_id") REFERENCES "payment_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
