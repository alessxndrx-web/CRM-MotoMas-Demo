-- Patch P-13 — qué venta produjo un movimiento de inventario del mostrador.
--
-- **Aditiva y sin relleno retroactivo.** La columna nace anulable y los
-- movimientos anteriores se quedan en NULL: no registraron su venta y no se les
-- inventa una. Misma convención que `pos_sales.shift_id` (CB4-D3) y
-- `pos_sales.warehouse_id` (INT4).
--
-- Hasta aquí la unica traza hacia la venta era el texto de `reason`
-- ("Venta POS-000123"), que no se puede unir ni indexar con garantias. `reason`
-- **no cambia**: sigue siendo el texto legible de la bitacora. Esto es la
-- relacion consultable, que es lo que una devolucion necesita para saber que
-- revertir.
--
-- Solo la escribe `checkoutPosSaleAction`. Recepciones de compra, ajustes
-- manuales y retornos a proveedor no son ventas y quedan en NULL.
ALTER TABLE "pos_inventory_movements" ADD COLUMN "sale_id" TEXT;

-- La consulta que las devoluciones haran: que movio esta venta.
CREATE INDEX "pos_inventory_movements_sale_id_idx" ON "pos_inventory_movements"("sale_id");

-- Restrict: una venta con movimientos atribuidos no se borra.
ALTER TABLE "pos_inventory_movements"
  ADD CONSTRAINT "pos_inventory_movements_sale_id_fkey"
  FOREIGN KEY ("sale_id") REFERENCES "pos_sales"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
