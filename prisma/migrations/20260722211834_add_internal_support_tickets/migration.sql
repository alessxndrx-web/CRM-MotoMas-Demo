-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NUEVO', 'RECIBIDO', 'EN_CLASIFICACION', 'EN_PROGRESO', 'PENDIENTE_USUARIO', 'PENDIENTE_APROBACION', 'ESCALADO_DESARROLLO', 'ESCALADO_PROVEEDOR', 'SOLUCION_PROPUESTA', 'RESUELTO', 'CERRADO', 'REABIERTO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('P1_CRITICA', 'P2_ALTA', 'P3_MEDIA', 'P4_BAJA');

-- CreateEnum
CREATE TYPE "TicketImpact" AS ENUM ('CONSULTA', 'AFECTA_UNA_TAREA', 'IMPIDE_TRABAJAR', 'AFECTA_VARIOS_USUARIOS', 'SISTEMA_INDISPONIBLE', 'RIESGO_SEGURIDAD');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('ACCESO_Y_CUENTA', 'ERROR_DEL_SISTEMA', 'RENDIMIENTO', 'DATOS_INCORRECTOS', 'INVENTARIO', 'TRASLADOS', 'RESERVAS', 'VENTAS', 'EXPEDIENTES', 'CREDITOS', 'LEADS', 'MARKETING', 'REPORTES', 'NOTIFICACIONES', 'INTEGRACIONES', 'SOLICITUD_DE_AYUDA', 'SOLICITUD_DE_MEJORA', 'SEGURIDAD', 'OTRO');

-- CreateEnum
CREATE TYPE "TicketScope" AS ENUM ('USER', 'BRANCH', 'MODULE', 'GLOBAL');

-- CreateEnum
CREATE TYPE "TicketCommentVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateEnum
CREATE TYPE "TicketParticipantType" AS ENUM ('CREATOR', 'REQUESTER', 'WATCHER', 'ASSIGNEE', 'APPROVER', 'COLLABORATOR');

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "subcategory" TEXT,
    "impact" "TicketImpact" NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'NUEVO',
    "scope" "TicketScope" NOT NULL DEFAULT 'USER',
    "created_by_id" TEXT,
    "created_by_role" "UserRole",
    "branch_id" TEXT,
    "assigned_to_id" TEXT,
    "related_entity_type" TEXT,
    "related_entity_id" TEXT,
    "source_route" TEXT,
    "error_code" TEXT,
    "app_version" TEXT,
    "browser" TEXT,
    "operating_system" TEXT,
    "device_type" TEXT,
    "duplicate_of_id" TEXT,
    "global_incident_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_comments" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "author_id" TEXT,
    "content" TEXT NOT NULL,
    "visibility" "TicketCommentVisibility" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_participants" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "TicketParticipantType" NOT NULL,
    "added_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_events" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_code_key" ON "support_tickets"("code");

-- CreateIndex
CREATE INDEX "support_tickets_code_idx" ON "support_tickets"("code");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "support_tickets_branch_id_idx" ON "support_tickets"("branch_id");

-- CreateIndex
CREATE INDEX "support_tickets_assigned_to_id_idx" ON "support_tickets"("assigned_to_id");

-- CreateIndex
CREATE INDEX "support_tickets_created_by_id_idx" ON "support_tickets"("created_by_id");

-- CreateIndex
CREATE INDEX "support_tickets_global_incident_id_idx" ON "support_tickets"("global_incident_id");

-- CreateIndex
CREATE INDEX "support_tickets_duplicate_of_id_idx" ON "support_tickets"("duplicate_of_id");

-- CreateIndex
CREATE INDEX "support_tickets_category_idx" ON "support_tickets"("category");

-- CreateIndex
CREATE INDEX "support_tickets_created_at_idx" ON "support_tickets"("created_at");

-- CreateIndex
CREATE INDEX "ticket_comments_ticket_id_idx" ON "ticket_comments"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_participants_ticket_id_idx" ON "ticket_participants"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_participants_user_id_idx" ON "ticket_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_participants_ticket_id_user_id_type_key" ON "ticket_participants"("ticket_id", "user_id", "type");

-- CreateIndex
CREATE INDEX "ticket_events_ticket_id_idx" ON "ticket_events"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_events_created_at_idx" ON "ticket_events"("created_at");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_global_incident_id_fkey" FOREIGN KEY ("global_incident_id") REFERENCES "support_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_participants" ADD CONSTRAINT "ticket_participants_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_participants" ADD CONSTRAINT "ticket_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_participants" ADD CONSTRAINT "ticket_participants_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
