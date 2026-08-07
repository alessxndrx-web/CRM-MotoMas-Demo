-- Patch POS1.2-D — devoluciones a proveedor.
--
-- **Estrictamente aditiva.** Una sola columna con valor por defecto: toda línea
-- de orden anterior a esta migración queda válida sin tocarla y con cero
-- devuelto, que es su estado correcto.
--
-- `returned_quantity` no se puede derivar. La única fuente sería sumar los
-- movimientos de tipo DEVOLUCION de la orden, pero `pos_inventory_movements` no
-- referencia la orden (P-13): su única traza es el texto del motivo.
--
-- **Lo pendiente no cambia de significado.** Sigue siendo
-- `quantity - received_quantity`; lo devuelto se registra aparte. Ver P-28.
ALTER TABLE "pos_purchase_order_items"
    ADD COLUMN "returned_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0;
