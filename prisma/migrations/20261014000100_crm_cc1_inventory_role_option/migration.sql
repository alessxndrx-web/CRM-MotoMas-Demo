-- CRM-CC1.1: inventory is a capability of existing supervisory roles.
-- The previous migration is immutable. Remove its unused delegated option
-- without changing any Marketing grant or user role.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "user_permission_grants" WHERE "permission"::text = 'INVENTARIO_REGISTRAR_INGRESOS') THEN
    RAISE EXCEPTION 'Inventory grants must be reviewed before removing the unused option';
  END IF;
END $$;
ALTER TYPE "DelegatedPermission" RENAME TO "DelegatedPermission_crmcc1_legacy";
CREATE TYPE "DelegatedPermission" AS ENUM ('MARKETING_GESTIONAR_CAMPANAS', 'MARKETING_REPORTAR_LEADS', 'MARKETING_GESTIONAR_INTEGRACIONES');
ALTER TABLE "user_permission_grants" ALTER COLUMN "permission" TYPE "DelegatedPermission" USING ("permission"::text::"DelegatedPermission");
DROP TYPE "DelegatedPermission_crmcc1_legacy";
COMMIT;
