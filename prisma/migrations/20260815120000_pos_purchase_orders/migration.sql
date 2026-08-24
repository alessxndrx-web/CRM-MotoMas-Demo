-- Patch POS1.2-A — órdenes de compra.
--
-- **Estrictamente aditiva.** Un tipo y dos tablas nuevas. Ninguna tabla,
-- columna, restricción, índice o enum existente se modifica ni se elimina.
--
-- Una orden de compra es **solo una intención de comprar**: no mueve
-- existencias, no contabiliza, no genera caja ni cuenta por pagar. Las tablas
-- nacen vacías y ningún flujo de inventario las lee.
--
-- El proveedor es `third_parties` con `type = 'PROVEEDOR'`, que ya era el
-- agregado de proveedor del repositorio: no se creó una tabla de proveedores.
CREATE TYPE "PosPurchaseOrderStatus" AS ENUM (
    'BORRADOR',
    'APROBADA',
    'RECIBIDA_PARCIAL',
    'RECIBIDA',
    'ANULADA'
);

CREATE TABLE "pos_purchase_orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "status" "PosPurchaseOrderStatus" NOT NULL DEFAULT 'BORRADOR',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expected_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_purchase_orders_order_number_key" ON "pos_purchase_orders"("order_number");
CREATE INDEX "pos_purchase_orders_branch_id_status_idx" ON "pos_purchase_orders"("branch_id", "status");
CREATE INDEX "pos_purchase_orders_supplier_id_status_idx" ON "pos_purchase_orders"("supplier_id", "status");

CREATE TABLE "pos_purchase_order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_purchase_order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_purchase_order_items_order_id_position_idx" ON "pos_purchase_order_items"("order_id", "position");
CREATE INDEX "pos_purchase_order_items_product_id_idx" ON "pos_purchase_order_items"("product_id");

-- RESTRICT en sucursal, proveedor y autores: una orden con historial protege lo
-- que referencia. Retirar un proveedor se hace con `is_active`.
ALTER TABLE "pos_purchase_orders"
    ADD CONSTRAINT "pos_purchase_orders_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_purchase_orders"
    ADD CONSTRAINT "pos_purchase_orders_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "third_parties"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_purchase_orders"
    ADD CONSTRAINT "pos_purchase_orders_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_purchase_orders"
    ADD CONSTRAINT "pos_purchase_orders_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_purchase_orders"
    ADD CONSTRAINT "pos_purchase_orders_cancelled_by_id_fkey"
    FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cascade en la orden porque la línea es su composición: borrar la orden borra
-- sus líneas y no puede quedar ninguna huérfana. Restrict en el producto porque
-- un artículo con historial de compra no se borra.
ALTER TABLE "pos_purchase_order_items"
    ADD CONSTRAINT "pos_purchase_order_items_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "pos_purchase_orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_purchase_order_items"
    ADD CONSTRAINT "pos_purchase_order_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "pos_products"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
