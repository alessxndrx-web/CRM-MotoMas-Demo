-- Patch POS1.0-A — the Point of Sale bounded context.
--
-- Separate from Caja on purpose. `CashDocument` models an accounting document;
-- the POS models a retail checkout. **Nothing here posts to the ledger**, so the
-- repository keeps exactly one posting path per economic event. A later patch
-- will make a completed sale emit a cash document, and that document posts.
--
-- `pos_products` exists because `pos_sale_items.product_id` has nothing else to
-- reference: the only catalogue in the repository is of motorcycles, and those
-- are sold through `sales`, not through the till.
--
-- Purely additive: one enum and four tables. No existing type, table, column or
-- constraint is touched.
CREATE TYPE "PosSaleStatus" AS ENUM ('BORRADOR', 'COMPLETADA', 'ANULADA');

CREATE TABLE "pos_products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_products_sku_key" ON "pos_products"("sku");
CREATE UNIQUE INDEX "pos_products_barcode_key" ON "pos_products"("barcode");
CREATE INDEX "pos_products_is_active_idx" ON "pos_products"("is_active");

CREATE TABLE "pos_sales" (
    "id" TEXT NOT NULL,
    "sale_number" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "cashier_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "status" "PosSaleStatus" NOT NULL DEFAULT 'BORRADOR',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_sales_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_sales_sale_number_key" ON "pos_sales"("sale_number");
CREATE INDEX "pos_sales_branch_id_status_idx" ON "pos_sales"("branch_id", "status");
CREATE INDEX "pos_sales_cashier_id_status_idx" ON "pos_sales"("cashier_id", "status");

CREATE TABLE "pos_sale_items" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_sale_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_sale_items_sale_id_position_idx"
    ON "pos_sale_items"("sale_id", "position");

CREATE TABLE "pos_payments" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "method" "CashPaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_payments_sale_id_idx" ON "pos_payments"("sale_id");

ALTER TABLE "pos_sales"
    ADD CONSTRAINT "pos_sales_branch_id_fkey" FOREIGN KEY ("branch_id")
    REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sales"
    ADD CONSTRAINT "pos_sales_cashier_id_fkey" FOREIGN KEY ("cashier_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sales"
    ADD CONSTRAINT "pos_sales_customer_id_fkey" FOREIGN KEY ("customer_id")
    REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lines and payments belong to the sale and die with it; the sale itself is
-- never deleted once completed, only cancelled.
ALTER TABLE "pos_sale_items"
    ADD CONSTRAINT "pos_sale_items_sale_id_fkey" FOREIGN KEY ("sale_id")
    REFERENCES "pos_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_sale_items"
    ADD CONSTRAINT "pos_sale_items_product_id_fkey" FOREIGN KEY ("product_id")
    REFERENCES "pos_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_payments"
    ADD CONSTRAINT "pos_payments_sale_id_fkey" FOREIGN KEY ("sale_id")
    REFERENCES "pos_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
