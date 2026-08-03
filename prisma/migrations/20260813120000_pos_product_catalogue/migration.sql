-- Patch POS1.1-A — metadatos del catálogo del POS.
--
-- **Estrictamente aditiva.** Ninguna columna, restricción o índice existente se
-- modifica ni se elimina: se añaden un tipo, dos tablas y nueve columnas, todas
-- con valor por defecto o anulables. Una fila de `pos_products` anterior a esta
-- migración queda válida sin tocarla, que es el requisito de compatibilidad.
--
-- Los valores por defecto son deliberadamente inertes: 0 en costo, tasa y
-- umbrales, y UNIDAD en la unidad de medida. Ningún producto existente cambia de
-- comportamiento porque **nada lee estos campos todavía**.
--
-- Sigue sin haber existencias, movimientos de inventario, contabilización ni
-- compras.
CREATE TYPE "PosProductUnit" AS ENUM (
    'UNIDAD',
    'PAR',
    'JUEGO',
    'CAJA',
    'LITRO',
    'GALON',
    'METRO',
    'KILOGRAMO'
);

CREATE TABLE "pos_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_categories_name_key" ON "pos_categories"("name");
CREATE INDEX "pos_categories_is_active_idx" ON "pos_categories"("is_active");

CREATE TABLE "pos_brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_brands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_brands_name_key" ON "pos_brands"("name");
CREATE INDEX "pos_brands_is_active_idx" ON "pos_brands"("is_active");

-- Nueve columnas nuevas. Todas anulables o con valor por defecto, así que las
-- filas existentes migran sin intervención.
ALTER TABLE "pos_products" ADD COLUMN "description" TEXT;
ALTER TABLE "pos_products" ADD COLUMN "category_id" TEXT;
ALTER TABLE "pos_products" ADD COLUMN "brand_id" TEXT;
ALTER TABLE "pos_products" ADD COLUMN "cost" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "pos_products" ADD COLUMN "unit" "PosProductUnit" NOT NULL DEFAULT 'UNIDAD';
ALTER TABLE "pos_products" ADD COLUMN "default_tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "pos_products" ADD COLUMN "minimum_stock" DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE "pos_products" ADD COLUMN "reorder_point" DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE "pos_products" ADD COLUMN "image_url" TEXT;

CREATE INDEX "pos_products_category_id_idx" ON "pos_products"("category_id");
CREATE INDEX "pos_products_brand_id_idx" ON "pos_products"("brand_id");

-- RESTRICT y no SET NULL: borrar una categoría en uso debe fallar, no vaciar en
-- silencio el dato de los artículos que la referencian. Retirar una categoría se
-- hace con `is_active`, igual que con un producto.
ALTER TABLE "pos_products"
    ADD CONSTRAINT "pos_products_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "pos_categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_products"
    ADD CONSTRAINT "pos_products_brand_id_fkey"
    FOREIGN KEY ("brand_id") REFERENCES "pos_brands"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
