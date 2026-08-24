-- Patch CB4-B — turno de caja del mostrador.
--
-- Dominio propio y no `CashSession`: el arqueo de Caja agrega `CashPayment` de
-- documentos emitidos, y el mostrador cobra con `PosPayment`. Compartir el turno
-- habría calculado el efectivo del POS ignorando sus ventas.

CREATE TYPE "PosCashShiftStatus" AS ENUM ('ABIERTO', 'CERRADO');
CREATE TYPE "PosCashMovementType" AS ENUM ('ENTRADA', 'SALIDA');

CREATE TABLE "pos_cash_shifts" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "operator_id" TEXT NOT NULL,
    "opened_by_user_id" TEXT NOT NULL,
    "status" "PosCashShiftStatus" NOT NULL DEFAULT 'ABIERTO',
    "opening_float" DECIMAL(12,2) NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "notes" TEXT,
    "cash_sales_total" DECIMAL(12,2),
    "cash_in_total" DECIMAL(12,2),
    "cash_out_total" DECIMAL(12,2),
    "expected_cash" DECIMAL(12,2),
    "counted_cash" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_cash_shifts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_cash_movements" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "type" "PosCashMovementType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT,

    CONSTRAINT "pos_cash_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_cash_shifts_branch_id_status_idx" ON "pos_cash_shifts"("branch_id", "status");
CREATE INDEX "pos_cash_shifts_operator_id_status_idx" ON "pos_cash_shifts"("operator_id", "status");
CREATE INDEX "pos_cash_shifts_opened_at_idx" ON "pos_cash_shifts"("opened_at");
CREATE INDEX "pos_cash_movements_shift_id_created_at_idx" ON "pos_cash_movements"("shift_id", "created_at");
CREATE UNIQUE INDEX "pos_cash_movements_idempotency_key_key" ON "pos_cash_movements"("idempotency_key");

-- **Un turno abierto por operador y sucursal, impuesto por la base.**
--
-- Es la misma lección de CB4-A: un `findFirst` previo dentro de la transacción
-- es un `check-then-act` que bajo READ COMMITTED deja pasar dos aperturas
-- simultáneas. Aquí la garantía nace con la tabla, no se añade después.
--
-- Parcial a propósito: el historial admite todos los turnos cerrados que el
-- operador acumule en su sucursal.
CREATE UNIQUE INDEX "pos_cash_shifts_one_open_per_operator_branch"
  ON "pos_cash_shifts" ("branch_id", "operator_id")
  WHERE "status" = 'ABIERTO';

ALTER TABLE "pos_cash_shifts" ADD CONSTRAINT "pos_cash_shifts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_cash_shifts" ADD CONSTRAINT "pos_cash_shifts_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "pos_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_cash_shifts" ADD CONSTRAINT "pos_cash_shifts_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_cash_shifts" ADD CONSTRAINT "pos_cash_shifts_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pos_cash_movements" ADD CONSTRAINT "pos_cash_movements_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "pos_cash_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_cash_movements" ADD CONSTRAINT "pos_cash_movements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
