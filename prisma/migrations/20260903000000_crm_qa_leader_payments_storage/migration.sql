-- Patch CRM-QA1 — lo que la QA con el cliente dejo al descubierto.
--
-- Aditiva de principio a fin: ninguna columna cambia de tipo, ninguna se borra,
-- ninguna tabla desaparece y ninguna fila existente se reescribe con datos
-- inventados. Las filas anteriores al parche se quedan con NULL donde no hubo
-- dato, que es la convencion que siguieron `warehouse_id`, `operator_id`,
-- `shift_id` y `attributed_lead_id`.
--
-- La UNICA excepcion es deliberada y esta explicada en el punto 4: las reservas
-- ACTIVA ya existentes reciben su candado de unidad, porque sin el la garantia
-- de concurrencia nace con agujeros.

-- ---------------------------------------------------------------------------
-- 1. El rol Lider de ventas.
-- ---------------------------------------------------------------------------
--
-- Un valor mas en el enumerado que ya existe, no un segundo sistema de
-- usuarios. Comparte tabla `users`, contrasena, sesion firmada y sucursal con
-- todos los demas: es un vendedor con supervision, y asi se modela.
--
-- Un solo ADD VALUE por sentencia, como hizo
-- 20260721222857_add_marketing_soporte_roles.
ALTER TYPE "UserRole" ADD VALUE 'LIDER_VENTAS';

-- ---------------------------------------------------------------------------
-- 2. La moto de interes del lead, como fila del catalogo.
-- ---------------------------------------------------------------------------
--
-- `motorcycle_interest` (texto libre) y `motorcycle_slug` (cadena sin
-- integridad) SIGUEN existiendo y no se rellenan desde aqui: el portal publico y
-- el webhook de Meta escriben ahi sin conocer el catalogo, y convertir a ciegas
-- un slug historico en una clave foranea habria inventado relaciones que nadie
-- confirmo. La columna nueva es el enlace normalizado que la ficha del lead
-- necesita; se llena hacia delante.
ALTER TABLE "leads" ADD COLUMN "catalog_model_id" TEXT;

CREATE INDEX "leads_catalog_model_id_idx" ON "leads"("catalog_model_id");

-- SET NULL: dar de baja un modelo del catalogo deja al lead sin moto asociada,
-- nunca borra el lead ni impide la baja.
ALTER TABLE "leads"
  ADD CONSTRAINT "leads_catalog_model_id_fkey"
  FOREIGN KEY ("catalog_model_id") REFERENCES "motorcycle_catalog_models"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. La cartera: que vendedor atiende a que cliente.
-- ---------------------------------------------------------------------------
--
-- Puntero vivo, no historia. Reasignar un cliente NO toca sus leads, sus
-- expedientes, sus reservas ni sus ventas, que conservan el `seller_id` del
-- momento en que ocurrieron. Esa separacion es la que permite mover la cartera
-- sin corromper la atribucion comercial ya registrada.
ALTER TABLE "customers" ADD COLUMN "assigned_seller_id" TEXT;
ALTER TABLE "customers" ADD COLUMN "assigned_by_id" TEXT;
ALTER TABLE "customers" ADD COLUMN "assigned_at" TIMESTAMP(3);

CREATE INDEX "customers_assigned_seller_id_idx" ON "customers"("assigned_seller_id");

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_assigned_seller_id_fkey"
  FOREIGN KEY ("assigned_seller_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_assigned_by_id_fkey"
  FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Reservas: estado sin pagar, candado de unidad y sello de confirmacion.
-- ---------------------------------------------------------------------------
--
-- `PENDIENTE_PAGO` es el estado en el que nace una reserva a partir de ahora: la
-- unidad NO queda bloqueada hasta que hay pago acreditado. Sin este valor, la
-- unica forma de expresar «pedida, sin pagar» habria sido crearla ya ACTIVA y
-- confiar en que el formulario exigiera el archivo.
ALTER TYPE "ReservationStatus" ADD VALUE 'PENDIENTE_PAGO';

-- Sin valor por omision: en que estado nace una reserva es la decision central
-- de este parche y ninguna ruta de escritura debe tomarla por descuido. Es
-- ademas lo unico que PostgreSQL permite aqui, porque no deja usar un valor
-- recien anadido al enumerado dentro de la misma transaccion que lo anade.
ALTER TABLE "reservations" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "reservations" ADD COLUMN "confirmed_at" TIMESTAMP(3);
ALTER TABLE "reservations" ADD COLUMN "active_unit_lock" TEXT;

-- **El candado, con una sola fila viva por unidad.**
--
-- `active_unit_lock` guarda el id de la unidad mientras la reserva esta viva y
-- NULL en cuanto muere. PostgreSQL trata los NULL como distintos entre si, asi
-- que el historico de reservas canceladas o completadas de la misma moto cabe
-- entero; lo que no cabe es una segunda reserva viva.
--
-- Sin esto, `createReservation` hacia `findFirst` y luego `create`: bajo READ
-- COMMITTED dos peticiones simultaneas leen «libre» y las dos insertan. Es el
-- mismo fallo que CB4-A corrigio en los turnos de caja.
CREATE UNIQUE INDEX "reservations_active_unit_lock_key"
  ON "reservations"("active_unit_lock");

-- Las reservas ACTIVA que ya existen tienen que entrar en la garantia. Si se
-- quedaran con NULL, la primera reserva nueva sobre una moto ya reservada
-- pasaria el indice y bloquearia dos veces la misma unidad.
--
-- `DISTINCT ON` porque la garantia no existia antes de este parche: si la base
-- ya arrastra dos reservas activas sobre la misma unidad —el fallo que este
-- indice cierra— se conserva el candado de la mas antigua y la otra queda sin
-- el. No se borra ni se cancela ninguna fila: corregir ese dato es una decision
-- del negocio, no de una migracion.
UPDATE "reservations" r
   SET "active_unit_lock" = r."motorcycle_unit_id"
  FROM (
    SELECT DISTINCT ON ("motorcycle_unit_id") "id"
      FROM "reservations"
     WHERE "status" = 'ACTIVA'
     ORDER BY "motorcycle_unit_id", "reserved_at" ASC, "id" ASC
  ) primera
 WHERE r."id" = primera."id";

-- Las reservas ACTIVA preexistentes se dan por confirmadas: existen desde antes
-- de que hubiera regla de comprobante y bloquean su unidad de hecho.
UPDATE "reservations"
   SET "confirmed_at" = "reserved_at"
 WHERE "status" = 'ACTIVA' AND "confirmed_at" IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Archivos subidos.
-- ---------------------------------------------------------------------------
--
-- Los bytes viven en PostgreSQL. No hay ruta de sistema de ficheros que un
-- atacante pueda atravesar porque no hay ninguna ruta: el contenido solo sale
-- por acciones de servidor que vuelven a autorizar.
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stored_files_branch_id_created_at_idx" ON "stored_files"("branch_id", "created_at");
CREATE INDEX "stored_files_checksum_sha256_idx" ON "stored_files"("checksum_sha256");

ALTER TABLE "stored_files"
  ADD CONSTRAINT "stored_files_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stored_files"
  ADD CONSTRAINT "stored_files_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 6. El comprobante de pago de una reserva pagada fuera de la pasarela.
-- ---------------------------------------------------------------------------
--
-- Una reserva pagada POR la pasarela no tiene fila aqui: su prueba es el aviso
-- firmado del proveedor, que es mas fuerte que una foto. Separar las dos
-- pruebas es lo que permite que convivan sin que ninguna finja ser la otra.
CREATE TYPE "ReservationPaymentProofStatus" AS ENUM ('PENDIENTE_REVISION', 'APROBADO', 'RECHAZADO');

CREATE TABLE "reservation_payment_proofs" (
    "id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "stored_file_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "currency" TEXT,
    "method" "CashPaymentMethod" NOT NULL DEFAULT 'TRANSFERENCIA',
    "reference" TEXT,
    "status" "ReservationPaymentProofStatus" NOT NULL DEFAULT 'PENDIENTE_REVISION',
    "notes" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" TEXT,

    CONSTRAINT "reservation_payment_proofs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reservation_payment_proofs_reservation_id_key" ON "reservation_payment_proofs"("reservation_id");
CREATE UNIQUE INDEX "reservation_payment_proofs_stored_file_id_key" ON "reservation_payment_proofs"("stored_file_id");
CREATE INDEX "reservation_payment_proofs_status_idx" ON "reservation_payment_proofs"("status");

ALTER TABLE "reservation_payment_proofs"
  ADD CONSTRAINT "reservation_payment_proofs_reservation_id_fkey"
  FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT sobre el archivo: borrar el fichero que prueba un pago no puede ser
-- un efecto colateral de nada.
ALTER TABLE "reservation_payment_proofs"
  ADD CONSTRAINT "reservation_payment_proofs_stored_file_id_fkey"
  FOREIGN KEY ("stored_file_id") REFERENCES "stored_files"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservation_payment_proofs"
  ADD CONSTRAINT "reservation_payment_proofs_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservation_payment_proofs"
  ADD CONSTRAINT "reservation_payment_proofs_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 7. El documento del expediente, ahora con archivo.
-- ---------------------------------------------------------------------------
--
-- Anulable: el renglon del checklist sigue naciendo PENDIENTE y sin archivo,
-- que es como el modulo funcionaba antes de este parche.
ALTER TABLE "expediente_documents" ADD COLUMN "stored_file_id" TEXT;
ALTER TABLE "expediente_documents" ADD COLUMN "uploaded_by_id" TEXT;
ALTER TABLE "expediente_documents" ADD COLUMN "uploaded_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "expediente_documents_stored_file_id_key" ON "expediente_documents"("stored_file_id");

ALTER TABLE "expediente_documents"
  ADD CONSTRAINT "expediente_documents_stored_file_id_fkey"
  FOREIGN KEY ("stored_file_id") REFERENCES "stored_files"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expediente_documents"
  ADD CONSTRAINT "expediente_documents_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 8. Cobro al cliente desde la web.
-- ---------------------------------------------------------------------------
CREATE TYPE "PaymentRequestPurpose" AS ENUM ('RESERVA', 'SOLICITUD');
CREATE TYPE "PaymentRequestStatus" AS ENUM ('PENDIENTE', 'PROCESANDO', 'PAGADA', 'CANCELADA', 'EXPIRADA');
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('INICIADA', 'PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA');

-- `amount` es DECIMAL, como todo el dinero del repositorio. El cliente nunca
-- envia una cifra: la accion de pago recibe el id de la solicitud y lee el
-- importe de esta fila.
CREATE TABLE "payment_requests" (
    "id" TEXT NOT NULL,
    "request_number" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "reservation_id" TEXT,
    "lead_id" TEXT,
    "purpose" "PaymentRequestPurpose" NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NIO',
    "status" "PaymentRequestStatus" NOT NULL DEFAULT 'PENDIENTE',
    "due_date" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "cancelled_by_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_requests_request_number_key" ON "payment_requests"("request_number");
CREATE INDEX "payment_requests_customer_id_status_idx" ON "payment_requests"("customer_id", "status");
CREATE INDEX "payment_requests_branch_id_status_idx" ON "payment_requests"("branch_id", "status");
CREATE INDEX "payment_requests_reservation_id_idx" ON "payment_requests"("reservation_id");

ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_reservation_id_fkey"
  FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_cancelled_by_id_fkey"
  FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- `provider` es TEXT y no un enumerado: dar de alta un proveedor no puede exigir
-- una migracion. La clave se valida contra el registro de adaptadores, que es
-- donde de verdad se sabe que proveedores existen.
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "payment_request_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_reference" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'INICIADA',
    "failure_reason" TEXT,
    "provider_metadata" JSONB,
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- La mitad de la idempotencia: una misma referencia del proveedor no puede
-- entrar dos veces por dos filas distintas.
CREATE UNIQUE INDEX "payment_transactions_provider_provider_reference_key"
  ON "payment_transactions"("provider", "provider_reference");
CREATE INDEX "payment_transactions_payment_request_id_status_idx"
  ON "payment_transactions"("payment_request_id", "status");

ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_request_id_fkey"
  FOREIGN KEY ("payment_request_id") REFERENCES "payment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La otra mitad de la idempotencia. El insert de esta fila y la aplicacion del
-- pago ocurren en la MISMA transaccion: si el insert choca con el unico, la
-- transaccion entera se deshace y el pago no se aplico dos veces.
CREATE TABLE "payment_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "payment_transaction_id" TEXT,
    "outcome" TEXT NOT NULL,
    "payload_digest" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_webhook_events_provider_event_id_key"
  ON "payment_webhook_events"("provider", "event_id");
CREATE INDEX "payment_webhook_events_received_at_idx" ON "payment_webhook_events"("received_at");

ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_transaction_id_fkey"
  FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 9. Avisos al cliente.
-- ---------------------------------------------------------------------------
CREATE TYPE "CustomerNotificationKind" AS ENUM (
  'PAGO_SOLICITADO', 'PAGO_PROCESANDO', 'PAGO_CONFIRMADO', 'PAGO_FALLIDO',
  'PAGO_CANCELADO', 'RESERVA_CONFIRMADA', 'COMPROBANTE_APROBADO', 'COMPROBANTE_RECHAZADO'
);

CREATE TABLE "customer_notifications" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "kind" "CustomerNotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payment_request_id" TEXT,
    "reservation_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_notifications_customer_id_created_at_idx"
  ON "customer_notifications"("customer_id", "created_at");

ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_payment_request_id_fkey"
  FOREIGN KEY ("payment_request_id") REFERENCES "payment_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_reservation_id_fkey"
  FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
