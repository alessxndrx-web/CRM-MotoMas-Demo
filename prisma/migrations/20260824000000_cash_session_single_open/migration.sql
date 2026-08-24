-- Patch CB4-A — «un turno abierto por cajero y sucursal», impuesto por la base.
--
-- La regla es del repositorio desde `caja_core`: `openCashSessionAction` lee con
-- `findFirst` y rechaza si ya hay uno abierto. El propio esquema admitía que la
-- garantía no llegaba a la base:
--
--   «One open session per cashier/branch is enforced later in the service layer;
--    PostgreSQL partial uniqueness is not represented by a plain Prisma unique.»
--
-- Bajo READ COMMITTED eso es un `check-then-act`: dos transacciones simultáneas
-- leen «no hay ninguno» y ambas insertan. **Comprobado contra esta base**: dos
-- aperturas concurrentes del mismo cajero produjeron dos turnos abiertos.
--
-- Un índice único parcial lo cierra donde no hay carrera posible. No cambia
-- ninguna regla: hace cierta la que el código ya afirmaba.
--
-- Solo alcanza a los ABIERTO, que es exactamente el alcance de la regla: un
-- cajero puede tener muchos turnos cerrados en la misma sucursal, y debe poder.
CREATE UNIQUE INDEX "cash_sessions_one_open_per_cashier_branch"
  ON "cash_sessions" ("branch_id", "cashier_id")
  WHERE "status" = 'ABIERTO';
