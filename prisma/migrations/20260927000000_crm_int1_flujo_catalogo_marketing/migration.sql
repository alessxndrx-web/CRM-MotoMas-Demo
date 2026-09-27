-- Patch CRM-INT1 — flujo lead → crédito, catálogo, comprobantes del cliente y
-- marketing multisucursal.
--
-- Aditiva: ninguna tabla desaparece, ninguna columna cambia de tipo y ninguna
-- se borra. Las dos únicas columnas que se relajan (`uploaded_by_id` en
-- `stored_files` y `reservation_payment_proofs`) pasan de NOT NULL a anulables
-- **con una restricción CHECK que exige exactamente un autor**, así que lo que
-- antes era obligatorio sigue siéndolo: sólo cambia que el autor puede ser un
-- cliente del portal.
--
-- Escrituras sobre datos existentes, las tres explicadas en su sección:
--   §6 — la sucursal de cada campaña pasa a la tabla de sucursales;
--   §6 — el modelo de cada campaña, cuando su slug es idéntico a uno del catálogo;
--   §8 — los usuarios MARKETING activos conservan lo que ya podían hacer.
--
-- Lo que NO se escribe, a propósito: fechas de asignación de leads anteriores a
-- este parche (§2). Nunca se guardaron y no se pueden reconstruir.

-- ---------------------------------------------------------------------------
-- 1. Enumerados nuevos.
-- ---------------------------------------------------------------------------

CREATE TYPE "CampaignLeadReportEventKind" AS ENUM ('REPORTE_MARKETING', 'CONFIRMACION_SUCURSAL', 'REVISION_MARKETING');

CREATE TYPE "DelegatedPermission" AS ENUM ('MARKETING_GESTIONAR_CAMPANAS', 'MARKETING_REPORTAR_LEADS');

CREATE TYPE "ReservationProofSource" AS ENUM ('PANEL', 'PORTAL_CLIENTE');

-- El aviso al cliente de «recibimos tu comprobante». Nada de esta migración lo
-- usa, así que añadirlo dentro de la transacción es seguro.
ALTER TYPE "CustomerNotificationKind" ADD VALUE 'COMPROBANTE_RECIBIDO';

-- ---------------------------------------------------------------------------
-- 2. Fechas e historial de asignación de leads.
-- ---------------------------------------------------------------------------
--
-- `first_assigned_at` y `assigned_at` quedan NULL en todo lead existente. La
-- tentación sería copiar `updated_at` o `created_at`: las dos son fechas de otra
-- cosa, y una fecha de asignación inventada es peor que ninguna porque nadie la
-- pondría en duda. La pantalla dice «fecha no registrada».

ALTER TABLE "leads" ADD COLUMN     "assigned_at" TIMESTAMP(3),
ADD COLUMN     "first_assigned_at" TIMESTAMP(3);

CREATE TABLE "lead_assignments" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "previous_seller_id" TEXT,
    "assigned_by_id" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lead_assignments_lead_id_assigned_at_idx" ON "lead_assignments"("lead_id", "assigned_at");

CREATE INDEX "lead_assignments_seller_id_assigned_at_idx" ON "lead_assignments"("seller_id", "assigned_at");

ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_previous_seller_id_fkey" FOREIGN KEY ("previous_seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Versión o variante del modelo del catálogo.
-- ---------------------------------------------------------------------------

ALTER TABLE "motorcycle_catalog_models" ADD COLUMN     "version" TEXT;

-- ---------------------------------------------------------------------------
-- 4. Archivos y comprobantes subidos por el cliente.
-- ---------------------------------------------------------------------------
--
-- Un comprobante por reserva era un índice único sobre `reservation_id`. Con
-- él, un comprobante RECHAZADO bloqueaba para siempre subir el correcto: la
-- reserva volvía a PENDIENTE_PAGO y la acción respondía «ya tiene un
-- comprobante». Se sustituye por dos índices únicos PARCIALES (§7): como mucho
-- uno esperando revisión y como mucho uno aprobado; los rechazados se acumulan
-- como historia.

DROP INDEX "reservation_payment_proofs_reservation_id_key";

ALTER TABLE "reservation_payment_proofs" ADD COLUMN     "source" "ReservationProofSource" NOT NULL DEFAULT 'PANEL',
ADD COLUMN     "uploaded_by_customer_id" TEXT,
ALTER COLUMN "uploaded_by_id" DROP NOT NULL;

CREATE INDEX "reservation_payment_proofs_reservation_id_uploaded_at_idx" ON "reservation_payment_proofs"("reservation_id", "uploaded_at");

ALTER TABLE "reservation_payment_proofs" ADD CONSTRAINT "reservation_payment_proofs_uploaded_by_customer_id_fkey" FOREIGN KEY ("uploaded_by_customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stored_files" ADD COLUMN     "uploaded_by_customer_id" TEXT,
ALTER COLUMN "uploaded_by_id" DROP NOT NULL;

ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploaded_by_customer_id_fkey" FOREIGN KEY ("uploaded_by_customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. Varias sucursales y varios modelos por campaña.
-- ---------------------------------------------------------------------------

CREATE TABLE "marketing_campaign_branches" (
    "campaign_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_campaign_branches_pkey" PRIMARY KEY ("campaign_id","branch_id")
);

CREATE TABLE "marketing_campaign_models" (
    "campaign_id" TEXT NOT NULL,
    "catalog_model_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_campaign_models_pkey" PRIMARY KEY ("campaign_id","catalog_model_id")
);

CREATE INDEX "marketing_campaign_branches_branch_id_idx" ON "marketing_campaign_branches"("branch_id");

CREATE INDEX "marketing_campaign_models_catalog_model_id_idx" ON "marketing_campaign_models"("catalog_model_id");

ALTER TABLE "marketing_campaign_branches" ADD CONSTRAINT "marketing_campaign_branches_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_campaign_branches" ADD CONSTRAINT "marketing_campaign_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "marketing_campaign_models" ADD CONSTRAINT "marketing_campaign_models_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_campaign_models" ADD CONSTRAINT "marketing_campaign_models_catalog_model_id_fkey" FOREIGN KEY ("catalog_model_id") REFERENCES "motorcycle_catalog_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Las campañas existentes conservan su sucursal y su modelo.
-- ---------------------------------------------------------------------------
--
-- Sucursal: copia directa de `target_branch_id`. NULL significaba «todas», y
-- «todas» sigue siendo «ninguna fila», así que esas campañas no reciben nada.
--
-- Modelo: SÓLO cuando el slug guardado es idéntico al de un modelo del
-- catálogo. CRM-QA1 se negó a convertir el texto libre de los leads en clave
-- foránea porque habría inventado relaciones; esto no es texto libre, es la
-- misma clave: el seed creó esos modelos del catálogo con los slugs exactos de
-- los que el formulario de campañas ofrecía. Un slug sin gemelo no se adivina:
-- la columna `motorcycle_slug` se conserva intacta y la pantalla lo muestra.

INSERT INTO "marketing_campaign_branches" ("campaign_id", "branch_id")
SELECT "id", "target_branch_id"
FROM "marketing_campaigns"
WHERE "target_branch_id" IS NOT NULL;

INSERT INTO "marketing_campaign_models" ("campaign_id", "catalog_model_id")
SELECT c."id", m."id"
FROM "marketing_campaigns" c
JOIN "motorcycle_catalog_models" m ON m."slug" = c."motorcycle_slug";

-- ---------------------------------------------------------------------------
-- 7. Conciliación de leads por campaña y sucursal.
-- ---------------------------------------------------------------------------

CREATE TABLE "marketing_campaign_lead_reports" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "reported_leads" INTEGER NOT NULL,
    "reported_notes" TEXT,
    "reported_by_id" TEXT NOT NULL,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_leads" INTEGER,
    "confirmation_notes" TEXT,
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_campaign_lead_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketing_campaign_lead_report_events" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "kind" "CampaignLeadReportEventKind" NOT NULL,
    "value" INTEGER,
    "previous_value" INTEGER,
    "notes" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketing_campaign_lead_report_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_campaign_lead_reports_branch_id_idx" ON "marketing_campaign_lead_reports"("branch_id");

CREATE UNIQUE INDEX "marketing_campaign_lead_reports_campaign_id_branch_id_key" ON "marketing_campaign_lead_reports"("campaign_id", "branch_id");

CREATE INDEX "marketing_campaign_lead_report_events_report_id_created_at_idx" ON "marketing_campaign_lead_report_events"("report_id", "created_at");

ALTER TABLE "marketing_campaign_lead_reports" ADD CONSTRAINT "marketing_campaign_lead_reports_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_campaign_lead_reports" ADD CONSTRAINT "marketing_campaign_lead_reports_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "marketing_campaign_lead_reports" ADD CONSTRAINT "marketing_campaign_lead_reports_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "marketing_campaign_lead_reports" ADD CONSTRAINT "marketing_campaign_lead_reports_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "marketing_campaign_lead_reports" ADD CONSTRAINT "marketing_campaign_lead_reports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "marketing_campaign_lead_report_events" ADD CONSTRAINT "marketing_campaign_lead_report_events_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "marketing_campaign_lead_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketing_campaign_lead_report_events" ADD CONSTRAINT "marketing_campaign_lead_report_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 8. Permisos delegados.
-- ---------------------------------------------------------------------------

CREATE TABLE "user_permission_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" "DelegatedPermission" NOT NULL,
    "branch_id" TEXT,
    "granted_by_id" TEXT,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_grants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_permission_grants_user_id_permission_idx" ON "user_permission_grants"("user_id", "permission");

ALTER TABLE "user_permission_grants" ADD CONSTRAINT "user_permission_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_permission_grants" ADD CONSTRAINT "user_permission_grants_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_permission_grants" ADD CONSTRAINT "user_permission_grants_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hasta este parche, el rol MARKETING bastaba para crear y editar CUALQUIER
-- campaña. A partir de aquí la edición se concede por usuario y sucursal. Para
-- no quitarle a nadie lo que ya hacía, cada usuario MARKETING activo recibe las
-- dos concesiones con alcance global; los que se creen después empiezan sólo
-- con visibilidad, hasta que un Administrador les conceda algo.
--
-- El id es determinista (md5 de usuario y permiso) para que la inserción no
-- dependa de extensiones de PostgreSQL.
INSERT INTO "user_permission_grants" ("id", "user_id", "permission", "branch_id", "granted_by_id")
SELECT 'mig' || md5(u."id" || ':' || p."permission"), u."id", p."permission"::"DelegatedPermission", NULL, NULL
FROM "users" u
CROSS JOIN (VALUES ('MARKETING_GESTIONAR_CAMPANAS'), ('MARKETING_REPORTAR_LEADS')) AS p("permission")
WHERE u."role" = 'MARKETING' AND u."is_active" = true;

-- ---------------------------------------------------------------------------
-- 9. Invariantes que Prisma no sabe declarar.
-- ---------------------------------------------------------------------------

-- Exactamente un autor: un empleado o un cliente, nunca los dos ni ninguno.
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_one_uploader_check"
  CHECK (num_nonnulls("uploaded_by_id", "uploaded_by_customer_id") = 1);

ALTER TABLE "reservation_payment_proofs" ADD CONSTRAINT "reservation_payment_proofs_one_uploader_check"
  CHECK (num_nonnulls("uploaded_by_id", "uploaded_by_customer_id") = 1);

-- El origen tiene que concordar con el autor: un comprobante PORTAL_CLIENTE sin
-- cliente, o PANEL sin empleado, sería un registro que miente sobre quién lo
-- subió.
ALTER TABLE "reservation_payment_proofs" ADD CONSTRAINT "reservation_payment_proofs_source_uploader_check"
  CHECK (
    ("source" = 'PANEL' AND "uploaded_by_id" IS NOT NULL)
    OR ("source" = 'PORTAL_CLIENTE' AND "uploaded_by_customer_id" IS NOT NULL)
  );

-- Como mucho un comprobante esperando revisión, y como mucho uno aprobado, por
-- reserva. Los rechazados no tienen límite: son historia.
CREATE UNIQUE INDEX "reservation_payment_proofs_one_pending_per_reservation"
  ON "reservation_payment_proofs" ("reservation_id")
  WHERE "status" = 'PENDIENTE_REVISION';

CREATE UNIQUE INDEX "reservation_payment_proofs_one_approved_per_reservation"
  ON "reservation_payment_proofs" ("reservation_id")
  WHERE "status" = 'APROBADO';

-- Una cifra de leads negativa no es un dato, es un error de captura.
ALTER TABLE "marketing_campaign_lead_reports" ADD CONSTRAINT "marketing_campaign_lead_reports_reported_leads_check"
  CHECK ("reported_leads" >= 0);

ALTER TABLE "marketing_campaign_lead_reports" ADD CONSTRAINT "marketing_campaign_lead_reports_confirmed_leads_check"
  CHECK ("confirmed_leads" IS NULL OR "confirmed_leads" >= 0);

-- Una concesión no se repite. Dos índices porque PostgreSQL no compara NULL con
-- NULL en un índice único: sin el primero, «todas las sucursales» podría
-- concederse dos veces al mismo usuario.
CREATE UNIQUE INDEX "user_permission_grants_global_key"
  ON "user_permission_grants" ("user_id", "permission")
  WHERE "branch_id" IS NULL;

CREATE UNIQUE INDEX "user_permission_grants_branch_key"
  ON "user_permission_grants" ("user_id", "permission", "branch_id")
  WHERE "branch_id" IS NOT NULL;
