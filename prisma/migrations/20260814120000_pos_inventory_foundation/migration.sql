-- Patch POS1.1-B — cimiento del inventario del mostrador.
--
-- **Estrictamente aditiva.** Un tipo y tres tablas nuevas. Ninguna tabla,
-- columna, restricción, índice o enum existente se modifica ni se elimina.
--
-- En particular **no se toca el inventario serializado**: `motorcycle_units`,
-- `inventory_movements` y su enum `InventoryMovementType` quedan exactamente
-- como estaban. Los dos inventarios conviven sin conocerse, que es justamente lo
-- que permite que este parche exista sin rediseñar el flujo de motocicletas.
--
-- **Nada de esto mueve un saldo.** Las tres tablas nacen vacías y ningún flujo
-- del repositorio escribe en ellas todavía.
CREATE TYPE "PosInventoryMovementType" AS ENUM (
    'INICIAL',
    'COMPRA',
    'VENTA',
    'AJUSTE',
    'TRASLADO_ENTRADA',
    'TRASLADO_SALIDA',
    'DEVOLUCION'
);

CREATE TABLE "pos_warehouses" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_warehouses_pkey" PRIMARY KEY ("id")
);

-- Único por sucursal y no global: "PRINCIPAL" debe poder existir en Granada y en
-- Rosita a la vez.
CREATE UNIQUE INDEX "pos_warehouses_branch_id_code_key" ON "pos_warehouses"("branch_id", "code");
CREATE INDEX "pos_warehouses_branch_id_is_active_idx" ON "pos_warehouses"("branch_id", "is_active");

CREATE TABLE "pos_inventory" (
    "id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_inventory_pkey" PRIMARY KEY ("id")
);

-- La identidad del saldo es el par bodega+producto: sin esto, dos filas
-- competirían por ser la verdad.
CREATE UNIQUE INDEX "pos_inventory_warehouse_id_product_id_key" ON "pos_inventory"("warehouse_id", "product_id");
CREATE INDEX "pos_inventory_product_id_idx" ON "pos_inventory"("product_id");

-- Sin `updated_at`: la bitácora solo se añade, igual que `inventory_movements`.
CREATE TABLE "pos_inventory_movements" (
    "id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "type" "PosInventoryMovementType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "quantity_before" DECIMAL(12,3) NOT NULL,
    "quantity_after" DECIMAL(12,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_inventory_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_inventory_movements_warehouse_id_created_at_idx" ON "pos_inventory_movements"("warehouse_id", "created_at");
CREATE INDEX "pos_inventory_movements_product_id_created_at_idx" ON "pos_inventory_movements"("product_id", "created_at");

-- RESTRICT en todas: borrar una bodega con saldo o un producto con historial debe
-- fallar, no arrastrar filas ni vaciar datos en silencio. Retirar una bodega se
-- hace con `is_active`, igual que un producto.
ALTER TABLE "pos_warehouses"
    ADD CONSTRAINT "pos_warehouses_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_inventory"
    ADD CONSTRAINT "pos_inventory_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "pos_warehouses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_inventory"
    ADD CONSTRAINT "pos_inventory_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "pos_products"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_movements"
    ADD CONSTRAINT "pos_inventory_movements_warehouse_id_fkey"
    FOREIGN KEY ("warehouse_id") REFERENCES "pos_warehouses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_movements"
    ADD CONSTRAINT "pos_inventory_movements_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "pos_products"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_movements"
    ADD CONSTRAINT "pos_inventory_movements_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
