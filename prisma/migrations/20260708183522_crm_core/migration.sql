-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NUEVO_LEAD', 'ASIGNADO', 'CONTACTADO', 'INTERESADO', 'EXPEDIENTE', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "CustomerFileStatus" AS ENUM ('ABIERTO', 'EN_PROCESO', 'COMPLETADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTA', 'LLAMADA', 'WHATSAPP', 'VISITA', 'SEGUIMIENTO');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PENDIENTE', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ActivityPriority" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_normalized" TEXT NOT NULL,
    "cedula" TEXT,
    "cedula_normalized" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "tracking_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "cedula" TEXT,
    "email" TEXT,
    "motorcycle_interest" TEXT,
    "motorcycle_slug" TEXT,
    "branch_id" TEXT NOT NULL,
    "origin_channel" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NUEVO_LEAD',
    "assigned_seller_id" TEXT,
    "created_by_id" TEXT,
    "customer_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_files" (
    "id" TEXT NOT NULL,
    "file_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "branch_id" TEXT NOT NULL,
    "seller_id" TEXT,
    "motorcycle_interest" TEXT,
    "status" "CustomerFileStatus" NOT NULL DEFAULT 'ABIERTO',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'PENDIENTE',
    "priority" "ActivityPriority" NOT NULL DEFAULT 'MEDIA',
    "branch_id" TEXT NOT NULL,
    "user_id" TEXT,
    "lead_id" TEXT,
    "customer_id" TEXT,
    "customer_file_id" TEXT,
    "description" TEXT,
    "result" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_branch_id_idx" ON "customers"("branch_id");

-- CreateIndex
CREATE INDEX "customers_phone_normalized_idx" ON "customers"("phone_normalized");

-- CreateIndex
CREATE INDEX "customers_cedula_normalized_idx" ON "customers"("cedula_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "leads_tracking_code_key" ON "leads"("tracking_code");

-- CreateIndex
CREATE INDEX "leads_branch_id_status_idx" ON "leads"("branch_id", "status");

-- CreateIndex
CREATE INDEX "leads_assigned_seller_id_idx" ON "leads"("assigned_seller_id");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE UNIQUE INDEX "customer_files_file_number_key" ON "customer_files"("file_number");

-- CreateIndex
CREATE INDEX "customer_files_branch_id_status_idx" ON "customer_files"("branch_id", "status");

-- CreateIndex
CREATE INDEX "customer_files_customer_id_idx" ON "customer_files"("customer_id");

-- CreateIndex
CREATE INDEX "activities_branch_id_status_idx" ON "activities"("branch_id", "status");

-- CreateIndex
CREATE INDEX "activities_user_id_status_idx" ON "activities"("user_id", "status");

-- CreateIndex
CREATE INDEX "activities_scheduled_at_idx" ON "activities"("scheduled_at");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_seller_id_fkey" FOREIGN KEY ("assigned_seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_files" ADD CONSTRAINT "customer_files_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_files" ADD CONSTRAINT "customer_files_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_files" ADD CONSTRAINT "customer_files_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_files" ADD CONSTRAINT "customer_files_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_customer_file_id_fkey" FOREIGN KEY ("customer_file_id") REFERENCES "customer_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
