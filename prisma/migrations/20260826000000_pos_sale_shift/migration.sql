-- Patch CB4-D3 — a qué turno de caja pertenece el efectivo de una venta.
--
-- **Aditiva y sin relleno retroactivo.** La columna nace anulable y las ventas
-- anteriores se quedan en NULL: no tuvieron turno y no se les inventa uno. Es la
-- misma convención que `warehouse_id` y `operator_id` siguieron en INT4.
--
-- Por qué una clave foránea y no una ventana de tiempo: Caja ya atribuye el
-- efectivo con `cash_payments.cash_session_id`, y su arqueo agrupa por esa
-- columna. Deducir el turno de (operador, sucursal, instante) habría sido un
-- segundo mecanismo de atribución para el mismo hecho.
ALTER TABLE "pos_sales" ADD COLUMN "shift_id" TEXT;

CREATE INDEX "pos_sales_shift_id_idx" ON "pos_sales"("shift_id");

-- Restrict: un turno con ventas atribuidas no se borra.
ALTER TABLE "pos_sales"
  ADD CONSTRAINT "pos_sales_shift_id_fkey"
  FOREIGN KEY ("shift_id") REFERENCES "pos_cash_shifts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
