-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVA', 'CANCELADA', 'COMPLETADA');

-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('CONTADO', 'FINANCIAMIENTO_EXTERNO');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETADA', 'ENTREGADA');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDIENTE', 'APROBADO', 'EN_TRANSITO', 'RECIBIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "reservation_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_file_id" TEXT,
    "motorcycle_unit_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVA',
    "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "sale_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "customer_file_id" TEXT,
    "reservation_id" TEXT,
    "motorcycle_unit_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "type" "SaleType" NOT NULL DEFAULT 'CONTADO',
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETADA',
    "sold_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_orders" (
    "id" TEXT NOT NULL,
    "transfer_number" TEXT NOT NULL,
    "motorcycle_unit_id" TEXT NOT NULL,
    "origin_branch_id" TEXT NOT NULL,
    "destination_branch_id" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDIENTE',
    "reason" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "dispatched_by_id" TEXT,
    "received_by_id" TEXT,
    "cancelled_by_id" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "dispatched_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfer_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reservations_reservation_number_key" ON "reservations"("reservation_number");

-- CreateIndex
CREATE INDEX "reservations_branch_id_status_idx" ON "reservations"("branch_id", "status");

-- CreateIndex
CREATE INDEX "reservations_motorcycle_unit_id_status_idx" ON "reservations"("motorcycle_unit_id", "status");

-- CreateIndex
CREATE INDEX "reservations_customer_id_idx" ON "reservations"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_sale_number_key" ON "sales"("sale_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_reservation_id_key" ON "sales"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_motorcycle_unit_id_key" ON "sales"("motorcycle_unit_id");

-- CreateIndex
CREATE INDEX "sales_branch_id_status_idx" ON "sales"("branch_id", "status");

-- CreateIndex
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_orders_transfer_number_key" ON "transfer_orders"("transfer_number");

-- CreateIndex
CREATE INDEX "transfer_orders_origin_branch_id_status_idx" ON "transfer_orders"("origin_branch_id", "status");

-- CreateIndex
CREATE INDEX "transfer_orders_destination_branch_id_status_idx" ON "transfer_orders"("destination_branch_id", "status");

-- CreateIndex
CREATE INDEX "transfer_orders_motorcycle_unit_id_status_idx" ON "transfer_orders"("motorcycle_unit_id", "status");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_file_id_fkey" FOREIGN KEY ("customer_file_id") REFERENCES "customer_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_motorcycle_unit_id_fkey" FOREIGN KEY ("motorcycle_unit_id") REFERENCES "motorcycle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_file_id_fkey" FOREIGN KEY ("customer_file_id") REFERENCES "customer_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_motorcycle_unit_id_fkey" FOREIGN KEY ("motorcycle_unit_id") REFERENCES "motorcycle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_motorcycle_unit_id_fkey" FOREIGN KEY ("motorcycle_unit_id") REFERENCES "motorcycle_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_origin_branch_id_fkey" FOREIGN KEY ("origin_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_destination_branch_id_fkey" FOREIGN KEY ("destination_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_dispatched_by_id_fkey" FOREIGN KEY ("dispatched_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
