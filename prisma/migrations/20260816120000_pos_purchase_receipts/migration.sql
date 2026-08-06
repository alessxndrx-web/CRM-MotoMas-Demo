-- Patch POS1.2-B — recepción de órdenes de compra.
--
-- **Estrictamente aditiva.** Una sola columna, con valor por defecto, así que
-- toda línea de orden anterior a esta migración queda válida sin tocarla y con
-- cero recibido, que es su estado correcto.
--
-- `received_quantity` era el único campo que faltaba para expresar la recepción
-- parcial: el enum `PosPurchaseOrderStatus` ya tenía `RECIBIDA_PARCIAL` desde
-- POS1.2-A, pero sin esta columna "40 de 100 deja 60 pendientes" no se podía
-- escribir en ninguna parte.
--
-- **Lo pendiente no se guarda**: es `quantity - received_quantity`. Dos cifras
-- que deben sumar siempre lo mismo son dos sitios donde pueden divergir.
ALTER TABLE "pos_purchase_order_items"
    ADD COLUMN "received_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0;
