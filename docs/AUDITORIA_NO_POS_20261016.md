# Auditoría funcional de MotoMas — 16 de octubre de 2026

## Alcance y entorno

Revisión local de Administrador, Gerente, Líder de Ventas, Vendedor, Vendedor Call Center, Cajero, Contador, Marketing y Soporte Técnico. POS queda excluido de los recorridos y operaciones funcionales.

Las operaciones de prueba usan una base PostgreSQL desechable (`motomas_audit_*`), con las migraciones y el catálogo del proyecto. El servidor de pruebas usa el puerto 5174. La base habitual de trabajo y el VPS no son los destinos de estas pruebas.

## Errores y mejoras corregidos

| Hallazgo | Comportamiento corregido |
| --- | --- |
| Si fallaba la consulta de sesión, se recuperaba el rol antiguo de la cookie, aun después de retirarle permisos al usuario. | La petición necesita revalidación en la base. Un error de conexión no recupera permisos retirados; la cookie se conserva para volver cuando se recupere el servicio. |
| Administrador y Contador no podían crear proveedores porque el servidor exigía una sucursal y el formulario no permitía seleccionarla. | Selector de sucursales activas para ambos roles, validación antes de guardar y persistencia de la sucursal seleccionada. Gerencia sigue usando su propia sucursal. |
| El menú ofrecía Proveedores al Contador, pero la pantalla general lo bloqueaba. | Proveedores queda accesible para el Contador, con la autorización del servidor vigente. |
| El Administrador no podía abrir otro turno desde Caja mientras existiera algún turno abierto en su alcance global. | Puede abrir su turno en otra sucursal desde el mismo panel. La restricción de un turno abierto por cajero y sucursal sigue aplicada en la base. |
| Caja, Traslados y diez pantallas contables seguían usando una lista fija de sucursales. | Sus opciones proceden de las sucursales activas registradas: terceros, bancos, conciliación, comprobantes, cierres, costos de inventario, documentos, gastos, liquidaciones y planilla. No se modifican las pantallas de POS. |
| Ayuda anunciaba como pendiente una bandeja de soporte que ya estaba implementada; el Administrador no tenía esos accesos en el menú. | Ayuda enlaza con la bandeja real. Administrador y Soporte Técnico tienen acceso visible al centro y a la bandeja, según los permisos existentes. |

También se rechazan altas de proveedores y aperturas de Caja en sucursales inactivas.

## Recorridos revisados

| Rol | Cobertura principal |
| --- | --- |
| Administrador | Accesos administrativos, alta de Call Center, sucursales, CRM, inventario, proveedores, Caja, Contabilidad y soporte. |
| Gerente | CRM de su sucursal, asignaciones, archivo y restauración, inventario, proveedores, consulta de Marketing y aislamiento entre sucursales. |
| Líder de Ventas | Supervisión comercial, actividades, reservas y pagos, registro y egreso de motocicletas de su sucursal. |
| Vendedor | Registros propios, seguimiento, reservas, consulta de inventario; rechazo de movimientos y operaciones ajenas. |
| Call Center | Cuenta con sucursal, acceso comercial entre sucursales, actividades identificadas por cliente/lead/expediente, asignación de atención y límites financieros. |
| Cajero | Acceso a Caja, factura creada desde su turno, emisión, persistencia y asiento contable; ayuda personal. |
| Contador | Gastos, documentos e impuestos, liquidaciones, pantallas contables y proveedores; rechazo del área comercial. |
| Marketing | Campañas, atribución, alcance global comercial de solo lectura y rechazo de modificaciones comerciales. |
| Soporte Técnico | Bandeja, asignación, prioridad, respuesta pública, notas internas, estados, cierre y reapertura; privacidad por usuario y sucursal. |

Las pruebas de servicio combinan acciones y consultas reales contra PostgreSQL con pruebas del motor contable. Algunas suites financieras históricas reproducen el cuerpo transaccional, por lo que no acreditan por sí solas la autorización de su pantalla. Cubren, entre otros, restricciones de sucursal, sesiones revocadas, concurrencia de turnos, reservas y comprobantes, enlaces de pago, notificaciones, documentos e impuestos, contabilización y reversión, períodos cerrados, duplicados y rollback ante mapeos faltantes.

Los recorridos de navegador inician sesión por el formulario real, revisan los módulos autorizados, completan operaciones y comprueban su persistencia. Cada uno de los nueve roles crea y responde un ticket.

## Resultado de validación

- Verificación final del repositorio: `npm run verify` terminó con código 0; TypeScript, ESLint, compilación y análisis de código sin uso aprobados. Se mantienen 20 advertencias heredadas, sin errores.
- Pruebas de servicio: 18 suites y 881 comprobaciones aprobadas, incluyendo soporte con nueve roles, proveedores y webhook sandbox de pagos.
- La última ejecución de navegador aprobó el alta, edición y desactivación de proveedores como Administrador, Contador y Gerente, y el recorrido del Administrador por sus módulos y el registro y respuesta de un ticket.
- En ejecuciones anteriores pasaron los ocho recorridos de CRM/Call Center, la emisión de una factura como Cajero con asiento contable y casos de documentos, impuestos y gastos.
- El usuario solicitó cerrar inmediatamente la revisión. La batería completa de navegador quedó interrumpida: no se declaran aprobados todos los escenarios ni la comprobación final de los nuevos selectores contables y de apertura de Caja.
- La aplicación local se reinició con la compilación nueva y `/login` respondió HTTP 200. No se desplegó esta versión en el VPS.

## Límites y siguientes comprobaciones operativas

- Meta y WhatsApp se prueban con respuestas externas simuladas y persistencia real local. No se envían mensajes ni se consumen cuentas publicitarias reales.
- El webhook de pagos se prueba con firma y secreto efímero del proveedor sandbox. Esto no acredita cobros bancarios reales.
- La auditoría local no acredita la disponibilidad del VPS, su versión desplegada ni el funcionamiento de credenciales externas de producción.
- Los recorridos enumerados son los casos verificados; no equivalen a todas las combinaciones posibles de datos, importaciones o dispositivos.
- Siguen existiendo advertencias de calidad heredadas en la verificación del repositorio; deben distinguirse de errores funcionales reproducidos.

Conviene completar, tras desplegar esta versión, una aceptación con usuarios reales por sucursal: lead → seguimiento identificado → expediente → reserva y revisión del pago → venta → documento de Caja → revisión contable. Para incidencias: ticket → respuesta de soporte → confirmación o reapertura por el solicitante.

## Repetir la auditoría

Ejecutar desde la carpeta del proyecto, con PostgreSQL local disponible y las dependencias instaladas:

```powershell
# Solo la primera vez: crea una base separada y aplica migraciones y catálogo.
node tools/audit-non-pos.mjs init

# Ejecutar en secuencia: las pruebas comparten la base desechable.
node tools/audit-non-pos.mjs smokes
npm run verify
node tools/audit-non-pos.mjs browser
```

El estado y los registros quedan en `.audit/non-pos/`, excluidos de Git. Las capturas y trazas del navegador quedan en `test-results/non-pos-browser/`. El ejecutor rechaza destinos de base de datos remotos y la configuración de navegador exige una base de auditoría. Las credenciales temporales de las pruebas no son cuentas de operación.
