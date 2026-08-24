-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'GERENTE', 'VENDEDOR', 'CAJERO', 'CONTADOR');

-- CreateEnum
CREATE TYPE "MotorcycleUnitStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'IN_TRANSFER', 'SOLD', 'DELIVERED', 'EXITED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('INGRESO', 'EGRESO', 'RESERVA', 'VENTA', 'ENTREGA', 'TRASLADO_SALIDA', 'TRASLADO_ENTRADA', 'AJUSTE');

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "branch_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motorcycle_catalog_models" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "year" INTEGER,
    "description" TEXT,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "motorcycle_catalog_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motorcycle_units" (
    "id" TEXT NOT NULL,
    "catalog_model_id" TEXT,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "chassis_number" TEXT NOT NULL,
    "engine_number" TEXT,
    "color" TEXT,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "exit_date" TIMESTAMP(3),
    "status" "MotorcycleUnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "motorcycle_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "motorcycle_unit_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_name_key" ON "branches"("name");

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_branch_id_idx" ON "users"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "motorcycle_catalog_models_slug_key" ON "motorcycle_catalog_models"("slug");

-- CreateIndex
CREATE INDEX "motorcycle_catalog_models_brand_model_idx" ON "motorcycle_catalog_models"("brand", "model");

-- CreateIndex
CREATE UNIQUE INDEX "motorcycle_units_chassis_number_key" ON "motorcycle_units"("chassis_number");

-- CreateIndex
CREATE INDEX "motorcycle_units_branch_id_status_idx" ON "motorcycle_units"("branch_id", "status");

-- CreateIndex
CREATE INDEX "motorcycle_units_status_idx" ON "motorcycle_units"("status");

-- CreateIndex
CREATE INDEX "inventory_movements_motorcycle_unit_id_date_idx" ON "inventory_movements"("motorcycle_unit_id", "date");

-- CreateIndex
CREATE INDEX "inventory_movements_branch_id_date_idx" ON "inventory_movements"("branch_id", "date");

-- CreateIndex
CREATE INDEX "user_audit_logs_actor_user_id_created_at_idx" ON "user_audit_logs"("actor_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motorcycle_units" ADD CONSTRAINT "motorcycle_units_catalog_model_id_fkey" FOREIGN KEY ("catalog_model_id") REFERENCES "motorcycle_catalog_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motorcycle_units" ADD CONSTRAINT "motorcycle_units_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_motorcycle_unit_id_fkey" FOREIGN KEY ("motorcycle_unit_id") REFERENCES "motorcycle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_audit_logs" ADD CONSTRAINT "user_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
