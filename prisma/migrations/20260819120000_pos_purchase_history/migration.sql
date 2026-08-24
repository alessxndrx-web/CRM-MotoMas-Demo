-- Patch POS1.2-E — bitácora de las órdenes de compra.
--
-- **Estrictamente aditiva.** Un tipo y una tabla. Ninguna tabla, columna,
-- restricción, índice o enum existente se modifica.
--
-- La tabla **nace vacía y no se rellena con historia inventada**: las órdenes
-- anteriores a esta migración no tienen eventos, y esa ausencia es la respuesta
-- correcta. Fabricar una creación y una aprobación para ellas produciría una
-- línea de tiempo que aparenta estar completa mientras le faltan las recepciones
-- —que nunca se registraron—, y eso es peor que una vacía.
--
-- No contiene ningún concepto financiero: ni importes, ni costos, ni deuda.
CREATE TYPE "PosPurchaseOrderEventType" AS ENUM (
    'CREADA',
    'APROBADA',
    'RECEPCION_PARCIAL',
    'RECEPCION_TOTAL',
    'DEVOLUCION',
    'ANULADA'
);

-- Sin `updated_at`: una bitácora que se puede editar no es una bitácora. Misma
-- decisión que `inventory_movements` y `pos_inventory_movements`.
CREATE TABLE "pos_purchase_order_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "type" "PosPurchaseOrderEventType" NOT NULL,
    "product_id" TEXT,
    "quantity" DECIMAL(12,3),
    "reason" TEXT,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_purchase_order_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_purchase_order_events_order_id_created_at_idx" ON "pos_purchase_order_events"("order_id", "created_at");

-- Cascade en la orden porque la bitácora es parte del documento: borrar la orden
-- se lleva su historia. Restrict en producto y autor, como el resto del módulo.
ALTER TABLE "pos_purchase_order_events"
    ADD CONSTRAINT "pos_purchase_order_events_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "pos_purchase_orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_purchase_order_events"
    ADD CONSTRAINT "pos_purchase_order_events_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "pos_products"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_purchase_order_events"
    ADD CONSTRAINT "pos_purchase_order_events_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
