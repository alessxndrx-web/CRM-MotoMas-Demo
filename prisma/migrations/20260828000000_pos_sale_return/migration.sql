-- Patch DEV-A — devolucion de venta del mostrador.
--
-- **Aditiva y sin relleno retroactivo.** Todo lo nuevo nace anulable o en tablas
-- nuevas; ninguna fila existente se toca. Misma convencion que `pos_sales.shift_id`
-- (CB4-D3) y `pos_inventory_movements.sale_id` (P-13).

-- `DEVOLUCION_CLIENTE` es miembro propio y no reutiliza `DEVOLUCION`: esa ya la
-- escribe el retorno a proveedor con cantidad negada. Son direcciones opuestas, y
-- compartir el tipo dejaria la bitacora sin poder distinguir una entrada de
-- cliente de una salida a proveedor mirando el tipo.
--
-- El valor se anade aqui y **no se usa en esta migracion**: PostgreSQL no permite
-- usar un valor de enum recien creado dentro de la misma transaccion.
ALTER TYPE "PosInventoryMovementType" ADD VALUE 'DEVOLUCION_CLIENTE';

CREATE TABLE "pos_sale_returns" (
    "id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "operator_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "cash_refunded" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT,

    CONSTRAINT "pos_sale_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_sale_return_items" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "sale_item_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "pos_sale_return_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_sale_returns_return_number_key" ON "pos_sale_returns"("return_number");
CREATE UNIQUE INDEX "pos_sale_returns_idempotency_key_key" ON "pos_sale_returns"("idempotency_key");
CREATE INDEX "pos_sale_returns_sale_id_idx" ON "pos_sale_returns"("sale_id");
CREATE INDEX "pos_sale_returns_branch_id_created_at_idx" ON "pos_sale_returns"("branch_id", "created_at");

-- Una devolucion no puede repetir la misma linea de la venta. El tope acumulado
-- contra devoluciones anteriores lo comprueba la accion bajo el bloqueo de la
-- cabecera: es una suma, y una suma no la expresa un indice.
CREATE UNIQUE INDEX "pos_sale_return_items_return_id_sale_item_id_key" ON "pos_sale_return_items"("return_id", "sale_item_id");
CREATE INDEX "pos_sale_return_items_sale_item_id_idx" ON "pos_sale_return_items"("sale_item_id");

-- El movimiento de inventario de una devolucion: convive con `sale_id`, no lo
-- sustituye. Son dos filas distintas — la salida del cobro y la entrada de la
-- devolucion — y ninguna se muta.
ALTER TABLE "pos_inventory_movements" ADD COLUMN "return_id" TEXT;
CREATE INDEX "pos_inventory_movements_return_id_idx" ON "pos_inventory_movements"("return_id");

-- El reembolso en efectivo reutiliza `pos_cash_movements` (CB4): salida de un
-- turno abierto, con motivo y autor. Esta columna lo ata a la devolucion que lo
-- justifica. Nulo en un movimiento manual.
ALTER TABLE "pos_cash_movements" ADD COLUMN "sale_return_id" TEXT;
CREATE INDEX "pos_cash_movements_sale_return_id_idx" ON "pos_cash_movements"("sale_return_id");

ALTER TABLE "pos_sale_returns" ADD CONSTRAINT "pos_sale_returns_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "pos_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sale_returns" ADD CONSTRAINT "pos_sale_returns_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sale_returns" ADD CONSTRAINT "pos_sale_returns_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "pos_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sale_returns" ADD CONSTRAINT "pos_sale_returns_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "pos_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sale_returns" ADD CONSTRAINT "pos_sale_returns_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_sale_return_items" ADD CONSTRAINT "pos_sale_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "pos_sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_sale_return_items" ADD CONSTRAINT "pos_sale_return_items_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "pos_sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_movements" ADD CONSTRAINT "pos_inventory_movements_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "pos_sale_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_cash_movements" ADD CONSTRAINT "pos_cash_movements_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "pos_sale_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
