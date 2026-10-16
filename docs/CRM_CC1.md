# CRM-CC1 — Call Center, inventario y seguimiento

Implementación local del pedido reenviado el 14 de octubre de 2026. La aclaración
posterior del usuario es la regla vigente de inventario: **no hay un rol nuevo
de inventario** ni una concesión para vendedores normales.

## Accesos y rutas

| Perfil | Comportamiento |
|---|---|
| Vendedor Call Center (`CALL_CENTER`) | Clientes, Leads, Expedientes, Actividades, Reservas e Inventario de todas las sucursales. Sin altas/bajas de motos, cierre de ventas, costos, Caja, Contabilidad, compras o gestión de usuarios. |
| Líder de Ventas | Registra ingresos y egresos de motos de su propia sucursal. Esta ampliación no concede costos, compras ni operaciones de repuestos. |
| Gerente | Control de motos y gestión de clientes, leads y créditos de su sucursal. |
| Administrador | Control global de motos y gestión del CRM. Puede crear usuarios Call Center desde Configuración. |
| Vendedor normal | Consulta disponibilidad. No registra motos ni movimientos, aunque invoque directamente una acción. |
| Marketing | Consulta los seis módulos solicitados en `/panel/marketing/operacion`, con filtro por sucursal y paginación. No recibe acciones de escritura del CRM ni documentos privados, cédulas o costos. Crear y modificar campañas ya existe y mantiene las concesiones administradas en Configuración. |

`Call Center` se agrega como sucursal/tienda. No se crean cuentas de empleados,
se cambian roles de usuarios existentes ni se conceden permisos a personas reales.

La autorización de movimientos de motocicletas usa
`canManageMotorcycleInventory`; el permiso previo de compras y repuestos
`canManageInventory` mantiene sus roles anteriores. El servidor verifica
nuevamente el rol y la sucursal en cada acción.

## Seguimiento del cliente

- Seleccionar un expediente muestra nombre, teléfono, correo, motocicleta,
  sucursal y requisitos pendientes asociados al cliente, además de un enlace a
  su ficha completa.
- Call Center, Gerente y Administrador pueden registrar de una a cinco estrellas
  de atención por expediente. Se conserva el actor en auditoría. Es una
  calificación registrada por el equipo, no una encuesta respondida por el cliente.
- Las actividades de leads sin cliente convertido muestran el nombre del lead.
- Call Center, Líder de Ventas, Gerente y Administrador pueden asignar una
  actividad a un empleado comercial activo de la sucursal del registro. La
  pantalla de Actividades ofrece «Asignar atención a». El servidor rechaza
  responsables ajenos a la sucursal y delegaciones de vendedores normales.
  La asignación genera un aviso persistido y una entrada de auditoría dentro
  de la misma transacción, incluso cuando la actividad no tiene fecha.
- La campana muestra las actividades pendientes asignadas al usuario, vencidas
  o con vencimiento dentro de 24 horas. Se actualiza con el sondeo existente de
  45 segundos y al recuperar foco. No es una alarma sonora, notificación del
  teléfono ni entrega garantizada con el navegador cerrado. El recordatorio
  permanece hasta completar, cancelar o reprogramar la actividad.

## Gestión reversible del CRM

`/panel/gestion-crm` permite a Gerencia y Administración editar clientes, leads y
los datos de seguimiento del crédito. La edición de montos y condiciones de
crédito continúa disponible en el expediente.

«Eliminar del listado» exige confirmación, escribe `archivedAt` y conserva las
relaciones y la auditoría. La pestaña de eliminados permite restaurar. Se omiten
estos registros en los listados activos; los expedientes y movimientos históricos
siguen existiendo. La fecha de actualización evita sobrescribir una edición
concurrente. No hay borrado permanente de información comercial o financiera.

## Modelos de la imagen UMA/Bajaj

Referencia: imagen proporcionada por el usuario, lista Nicaragua en córdobas,
vigencia del 10 al 31 de agosto de 2026. Se transcribieron únicamente los códigos,
nombres y variantes legibles. **No se importaron precios vencidos, existencias,
especificaciones ni fotografías inventadas.**

La base tenía 17 modelos. Se conservan sus identificadores y relaciones, y se
añaden estos 11 modelos o variantes, para un total de 28:

| Código de la imagen | Entrada nueva |
|---|---|
| BOXER150X | Boxer 150X |
| DISCOVER125.5G | Discover 125.5G |
| PULSAR125NCARB | Pulsar N125 · CARB |
| PULSAR125NFI | Pulsar N125 · FI |
| PULSAR125NS | Pulsar NS125 |
| PULSAR160NSUG | Pulsar NS160 · UG |
| PULSAR200NSUG | Pulsar NS200 · UG |
| PULSAR200NSUG2 | Pulsar NS200 · UG2 |
| PULSAR200_FIABSUG2 | Pulsar NS200 · FI ABS UG2 |
| PULSAR200NSUG GRIS | Pulsar NS200 · UG GRIS |
| PULSAR250NCARB | Pulsar N250 · CARB |

Los otros diez códigos reutilizan Boxer 150, CT 125, Pulsar NS125UG, Pulsar 150,
Pulsar N150, Pulsar N160, Pulsar 180, Pulsar N250, Pulsar NS400Z y Dominar 250.
La marca Bajaj se completa únicamente donde antes estaba pendiente. Los años,
variantes históricas y bajas del catálogo no se sobrescriben. Las versiones UG,
UG2, FI ABS y CARB se mantienen separadas de los modelos genéricos.

`prisma/catalog-bajaj-uma-202608.json` conserva el mapa de los 21 códigos. La
migración y el seed usan los mismos slugs para evitar duplicados al reiniciar.

## Migraciones y verificación

- `20261014000000_crm_cc1_call_center_inventario`: rol Call Center, sucursal,
  modelos, campos de archivo y calificación con restricción de 1–5.
- `20261014000100_crm_cc1_inventory_role_option`: retira la opción delegada de
  inventario descartada tras la aclaración del usuario. Conserva todos los
  permisos de Marketing. La migración anterior ya aplicada permanece intacta.
- `20261014000200_crm_cc1_activity_assignment`: aviso persistido de asignación
  de actividad al responsable de atención.
- Respaldo previo local: `motomas-before-call-center-20261014.dump` en la carpeta
  temporal del usuario. No se guarda en Git.
- `smoke:crm-cc1`: acciones reales y sesiones firmadas, con datos aislados y
  limpieza automática.
- `e2e:crm-cc1`: inicio de sesión real, fichas, estrellas, registro de inventario,
  consulta de Marketing y edición/eliminación/restauración de Gerencia.
  Se ejecuta sobre la compilación de producción local tras `npm run verify`.
- `npm run verify`: tipos, lint, build y código alcanzable.

El despliegue remoto no forma parte de este cambio. Las migraciones se aplicaron
a la instancia local de `motomas-postgres`.

### Resultado comprobado

| Comprobación | Resultado |
|---|---|
| `npm run verify` | Correcto: tipos, ESLint sin errores, build y Knip. Hay 20 advertencias heredadas del proyecto. |
| `npm run smoke:crm-cc1` | 44 comprobaciones correctas con acciones y sesiones reales. |
| Regresión `crmint2-auditoria-integral.ts` | 107 correctas, 0 fallos. |
| `npm run e2e:crm-cc1` | 5 pruebas en navegador correctas sobre la compilación de producción local. |
| Estado de Prisma | 55 migraciones aplicadas; esquema actualizado. |
| Datos temporales CRM-CC1 | 0 usuarios y 0 sucursales restantes tras las pruebas. |
| Catálogo y sucursales | 28 modelos y 15 sucursales, conservando las anteriores. |

Las pruebas en navegador incluyen inicio de sesión real, persistencia tras
recargar, solicitud de atención a otra sucursal, aviso al responsable,
restricciones del vendedor y restauración de un cliente retirado del listado.

### Corrección de identificación en Actividades · 15 de octubre de 2026

- Cada actividad muestra una línea destacada `Cliente:` o `Lead:`, separada del responsable.
- Los registros antiguos vinculados solo a un expediente recuperan el cliente desde ese expediente, sin modificar los datos guardados.
- El formulario permite buscar y seleccionar un cliente o lead sin expediente; la sucursal se resuelve en el servidor.
- Una actividad sin relación muestra `Actividad general · Sin cliente vinculado`. Si está pendiente, se puede vincular manualmente a un contacto de la misma sucursal y dentro del alcance autorizado. La operación deja auditoría, no reemplaza vínculos existentes ni modifica actividades cerradas.
- No se deduce la identidad a partir de la descripción. No requiere migraciones.
- Validación local de esta corrección: `npm run verify` correcto (sin errores y con las 20 advertencias heredadas), 53 comprobaciones de acciones correctas y 7 pruebas en navegador correctas. Las pruebas incluyen identificación por cliente, lead o expediente antiguo, búsqueda por cliente, vínculo manual y persistencia tras recargar, creación sin expediente y restricciones de sucursal.

### Creación de usuarios Call Center · 16 de octubre de 2026

El formulario confundía el alcance comercial global de Call Center con una cuenta sin sucursal: ocultaba el selector y enviaba `null`, mientras la acción exigía una sucursal. El formulario y la acción ahora comparten `isGlobalRole`, que reserva las cuentas sin sucursal para Administrador y Contador. Call Center permite seleccionar una sucursal activa, incluida Call Center, y conserva su alcance comercial global. Se mantienen las restricciones de creación de usuarios de Gerente y de los demás roles. No requiere migraciones ni modifica cuentas existentes.

Validación local: el caso en navegador reproduce la ausencia del selector contra la compilación anterior. Con la corrección, `npm run verify` pasa (0 errores y 20 advertencias heredadas), `npm run smoke:crm-cc1` pasa 64 comprobaciones y `npm run e2e:crm-cc1` pasa 8 pruebas. La nueva prueba crea una cuenta Call Center desde Configuración, comprueba rol y sucursal persistidos, inicia sesión con ella y verifica lectura de leads de otra sucursal sin acceso a Caja. Los datos de prueba se eliminan al finalizar.
