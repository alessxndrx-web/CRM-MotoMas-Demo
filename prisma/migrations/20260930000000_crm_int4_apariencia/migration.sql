-- Patch CRM-INT4 — apariencia del panel interno (tema claro, oscuro o del sistema).
--
-- Aditiva. Todas las filas existentes quedan en 'CLARO' por el valor por
-- omisión: nadie ve otro CRM tras el despliegue sin haberlo elegido. No toca
-- ninguna otra tabla.

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('CLARO', 'OSCURO', 'SISTEMA');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "theme_preference" "ThemePreference" NOT NULL DEFAULT 'CLARO';
