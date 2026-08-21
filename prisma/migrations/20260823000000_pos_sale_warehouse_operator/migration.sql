-- Patch INT4 — trazabilidad histórica de la venta de mostrador.
--
-- Dos relaciones que la venta no guardaba: de qué bodega salió la mercancía
-- (P-13: hasta ahora la única traza era el texto del motivo del movimiento) y
-- qué operador de mostrador cobró (`cashier_id` apunta al usuario de auditoría,
-- no a la persona que estuvo en la caja).
--
-- Aditivas y anulables. NO se rellenan las ventas existentes: no registraron ni
-- bodega ni operador, y no se les inventa ninguno.
ALTER TABLE "pos_sales" ADD COLUMN "warehouse_id" TEXT;
ALTER TABLE "pos_sales" ADD COLUMN "operator_id" TEXT;

CREATE INDEX "pos_sales_warehouse_id_idx" ON "pos_sales"("warehouse_id");
CREATE INDEX "pos_sales_operator_id_idx" ON "pos_sales"("operator_id");

ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "pos_warehouses"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "pos_operators"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
