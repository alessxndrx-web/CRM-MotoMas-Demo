-- Patch CRM-INT2 — auditoría de CRM-INT1: permisos delegados de Marketing.
--
-- Dos cambios, ninguno de estructura destructiva:
--
-- 1. Un permiso delegado nuevo, MARKETING_GESTIONAR_INTEGRACIONES. Hasta aquí el
--    rol MARKETING, por sí solo, podía mapear páginas de Meta a sucursales,
--    conectar cuentas publicitarias y resolver leads de Meta pendientes —lo que
--    crea un lead en el CRM en la sucursal elegida—. Ahora exige concesión, como
--    campañas y reportes.
--
-- 2. Se retiran las concesiones que CRM-INT1 sembró automáticamente a cada
--    usuario MARKETING activo, con alcance global. Su intención era no quitarle
--    a nadie lo que ya hacía; el efecto era justo el que el modelo quería evitar:
--    edición universal por defecto. A partir de aquí la visibilidad sigue siendo
--    global y **toda** capacidad de edición la concede un Administrador, por
--    usuario y sucursal, en Configuración → «Permisos de Marketing».
--
--    Sólo se borran las filas sembradas por aquella migración: su id empieza por
--    'mig' (md5 determinista) y no tienen quién las concedió. Una concesión hecha
--    por un Administrador tiene un cuid y `granted_by_id`, y no se toca.
--
-- Consecuencia operativa, documentada en docs/DESPLIEGUE_CRM_INT.md: tras el
-- despliegue, los usuarios MARKETING ven todo y no editan nada hasta que un
-- Administrador les conceda permisos. Es un paso del procedimiento, no un fallo.

-- El valor nuevo no se usa dentro de esta migración, así que añadirlo en la
-- misma transacción es seguro (igual que en CRM-QA1 y CRM-INT1).
ALTER TYPE "DelegatedPermission" ADD VALUE 'MARKETING_GESTIONAR_INTEGRACIONES';

DELETE FROM "user_permission_grants"
WHERE "id" LIKE 'mig%'
  AND "granted_by_id" IS NULL;
