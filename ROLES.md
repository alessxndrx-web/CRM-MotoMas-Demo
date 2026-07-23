# MotoMas — Roles y permisos

## 1. Objetivo

MotoMas debe mostrar información distinta según el tipo de usuario.

No todos los usuarios deben ver los mismos módulos.

El Portal Cliente y el Centro de Operaciones están separados.

El rol Cliente no debe aparecer dentro del login operativo.

---

## 2. Matriz general

| Función | Cliente | Vendedor | Gerente | Administrador |
|---|---:|---:|---:|---:|
| Ver catálogo público | Sí | Sí | Sí | Sí |
| Solicitar información | Sí | Sí | Sí | Sí |
| Consultar expediente propio | Sí | No aplica | No aplica | No aplica |
| Ver leads asignados | No | Sí | Sí | Sí |
| Ver bandeja de leads de sucursal | No | Solo asignados | Sí | Sí |
| Asignar leads | No | No | Sí | Sí |
| Registrar clientes | No | Sí | Sí | Sí |
| Crear cotizaciones | No | Sí | Sí | Sí |
| Crear expedientes | No | Sí | Sí | Sí |
| Registrar seguimiento | No | Sí | Sí | Sí |
| Consultar inventario operativo | No | Sí | Sí | Sí |
| Reservar unidades | No | Sí | Sí | Sí |
| Solicitar traslado | No | Sí | Sí | Sí |
| Aprobar traslado | No | No | Sí | Sí |
| Confirmar recepción | No | No | Sí | Sí |
| Registrar ventas | No | Sí | Sí | Sí |
| Supervisar vendedores | No | No | Sí, solo sucursal | Sí, vista global |
| Ver reportes de sucursal | No | No | Sí | Sí |
| Ver reportes corporativos | No | No | No | Sí |
| Ver utilidades | No | No | Según definición futura | Sí |
| Gestionar usuarios | No | No | No | Sí |
| Gestionar permisos | No | No | No | Sí |
| Gestionar sucursales | No | No | No | Sí |
| Gestionar catálogos | No | No | No | Sí |

---

## 3. Cliente

### Descripción

El cliente utiliza el Portal Cliente.

No entra al ERP interno.

No ve el login operativo.

Puede consultar únicamente información relacionada con su propio proceso.

### Puede hacer

- Ver catálogo.
- Ver detalle de motocicletas.
- Solicitar información.
- Elegir sucursal de atención.
- Consultar estado de expediente.
- Consultar estado de crédito.
- Consultar reserva.
- Consultar entrega.
- Ver próximos pasos.

### No puede hacer

- Ver clientes de otras personas.
- Ver inventario operativo.
- Ver stock interno detallado.
- Ver vendedores como usuarios del sistema.
- Ver reportes.
- Ver ventas.
- Ver traslados internos.
- Ver configuración.
- Ver utilidades.

### Dashboard Cliente

Debe mostrar:

- Nombre.
- Moto seleccionada.
- Sucursal de atención.
- Estado actual.
- Crédito.
- Reserva.
- Entrega.
- Próximos pasos.
- Timeline de actualizaciones.

### Flujo ejemplo

Juan Pérez entra al Portal Cliente.

Busca una Pulsar NS200.

Selecciona Plaza Inter.

Llena el formulario.

Después puede consultar si:

- Su expediente fue creado.
- Su documentación fue recibida.
- Su crédito sigue en evaluación.
- Su moto fue reservada.
- Su unidad está lista para entrega.

---

## 4. Vendedor

### Descripción

El vendedor administra relaciones comerciales.

No es propietario de los clientes.

Los clientes pertenecen a MotoMas.

### Puede hacer

- Ver sus leads asignados.
- Contactar prospectos.
- Cambiar estados comerciales.
- Registrar seguimiento.
- Buscar clientes.
- Ver historial de interacciones.
- Crear cotizaciones.
- Crear expedientes.
- Crear solicitudes de crédito.
- Actualizar estados de crédito.
- Consultar inventario.
- Reservar unidades.
- Solicitar traslado si no hay stock local.
- Registrar ventas.

### No puede hacer

- Asignar leads de toda la sucursal.
- Ver reportes corporativos.
- Ver utilidades.
- Ver métricas sensibles de toda la empresa.
- Gestionar usuarios.
- Gestionar permisos.
- Gestionar sucursales.
- Aprobar traslados.
- Ver configuración global.

### Dashboard Vendedor

Debe mostrar:

- Leads asignados.
- Clientes activos.
- Seguimientos pendientes.
- Cotizaciones.
- Expedientes.
- Créditos en trámite.
- Reservas activas.
- Ventas del mes.
- Inventario disponible.
- Actividad reciente propia.

### Consideraciones

El vendedor puede consultar clientes creados por otras sucursales.

Debe poder ver que el cliente ya existe.

No debe duplicar el registro.

No debe bloquearse una venta porque otro vendedor atendió al cliente anteriormente.

---

## 5. Gerente

### Descripción

El gerente administra la operación de su sucursal.

Debe tener visibilidad suficiente para equilibrar la carga de trabajo y supervisar resultados.

### Puede hacer

- Ver bandeja de leads de su sucursal.
- Asignar leads.
- Reasignar leads.
- Reasignar cartera.
- Supervisar vendedores.
- Consultar métricas de sucursal.
- Ver clientes relacionados con su operación.
- Ver inventario local.
- Consultar stock en otras sucursales.
- Aprobar traslados.
- Marcar traslado en tránsito.
- Confirmar recepción.
- Ver reportes de sucursal.
- Consultar ventas de sucursal.
- Consultar créditos activos.
- Consultar reservas.

### No puede hacer

- Gestionar usuarios globales.
- Gestionar permisos globales.
- Cambiar configuración corporativa.
- Ver reportes globales si no tiene autorización.
- Modificar catálogos globales si no tiene autorización.

### Dashboard Gerente

Debe mostrar:

- Leads pendientes.
- Leads asignados.
- Ventas de sucursal.
- Inventario local.
- Traslados pendientes.
- Traslados en tránsito.
- Créditos activos.
- Reservas activas.
- Ranking de vendedores.
- Conversión por vendedor.
- Actividad reciente.

### Distribución inteligente de trabajo

El gerente debe poder ver:

```txt
Roberto
Leads activos: 24
Ventas del mes: 8
Conversión: 33%

María
Leads activos: 12
Ventas del mes: 6
Conversión: 50%
```

La asignación sigue siendo manual.

El sistema aporta visibilidad, pero no decide automáticamente.

---

## 6. Administrador

### Descripción

El administrador tiene acceso completo.

Puede ver toda la operación y configurar la plataforma.

### Puede hacer

- Ver todas las sucursales.
- Ver todos los usuarios.
- Gestionar usuarios.
- Gestionar roles.
- Gestionar permisos.
- Gestionar sucursales.
- Gestionar catálogo.
- Gestionar financieras.
- Ver ventas globales.
- Ver inventario consolidado.
- Ver traslados nacionales.
- Ver créditos activos.
- Ver reportes globales.
- Comparar sucursales.
- Supervisar actividad.
- Ver logs.
- Auditar movimientos.

### Dashboard Administrador

Debe mostrar:

- Ventas globales.
- Ventas por sucursal.
- Inventario consolidado.
- Inventario por sucursal.
- Traslados activos.
- Créditos activos.
- Reservas.
- Ranking de sucursales.
- Ranking de vendedores.
- Actividad reciente.
- Alertas operativas.

---

## 7. Consideración sobre supervisor

Durante las reuniones se mencionó la posibilidad de que un supervisor participe en la asignación de leads y supervisión operativa.

Para la demo confirmada, los roles principales son:

- Cliente
- Vendedor
- Gerente
- Administrador

La lógica de supervisor puede mantenerse como ampliación futura o como permiso adicional asignable a un gerente.

---

## 8. Regla de acceso a reportes

Los vendedores no deben ver reportes corporativos.

Los gerentes ven reportes de su sucursal.

Los administradores ven reportes globales.

Esta separación debe aplicarse tanto en navegación como en permisos.

No basta con ocultar un botón.

Las rutas privadas deben validar acceso.

---

## 9. Regla de acceso por sucursal

El vendedor trabaja principalmente con su sucursal.

El gerente administra su sucursal.

El administrador tiene visión global.

Sin embargo:

- El vendedor debe poder consultar inventario disponible en otras sucursales.
- El vendedor debe poder detectar si un cliente ya existe.
- El vendedor debe poder ver historial necesario para continuar atención.
- La información sensible debe filtrarse según rol.

---

## 10. Regla actual de seguimiento de credito

El Vendedor gestiona un solo seguimiento manual de credito activo por
expediente. El Gerente supervisa los seguimientos de su sucursal y el
Administrador conserva la vista global. La financiera y el estado son
editables; no se crean solicitudes simultaneas por financiera en esta fase.

---

## 11. Supervision demo de vendedores

`/panel/vendedores` es una vista de supervision demo, no una gestion real de
usuarios. El Gerente consulta solo vendedores y metricas de su sucursal; el
Administrador conserva la vista global. El Vendedor no tiene navegacion ni
acceso a esta ruta.

La vista reutiliza los usuarios demo existentes y no permite crear usuarios,
editar permisos, cambiar contrasenas ni eliminar vendedores. Estas acciones
quedan para una futura autenticacion y base de datos centralizadas.

---

## 12. Contador

### Descripcion

El Contador es un rol interno separado del flujo comercial. Su espacio de
trabajo esta bajo `/panel/contabilidad` y sus subrutas. No reemplaza al
Vendedor, Gerente ni Administrador y no debe operar leads, reservas, traslados
o ventas comerciales.

### Puede hacer

- Ver dashboard contable.
- Registrar diarios contables.
- Registrar comprobantes de ingreso, egreso, cheque, transferencia, reembolso
  y ajuste.
- Registrar gastos.
- Ver documentos contables base.
- Ver inventario contable con costo.
- Ver detalle por item, saldo minimo y ultimo movimiento.
- Elaborar planilla salarial basica.
- Consultar reportes contables demo.

### No puede hacer

- Crear leads.
- Asignar leads.
- Gestionar vendedores.
- Crear reservas.
- Crear traslados.
- Crear ventas comerciales.
- Modificar catalogo publico.
- Operar Portal Cliente.
- Cambiar persistencia comercial salvo lectura necesaria para inventario
  contable.

### Regla de costos

- Contador ve costos globales.
- Administrador ve costos globales.
- Gerente ve costos solo de su sucursal.
- Vendedor no ve costos.

### Rutas

```txt
/panel/contabilidad
/panel/contabilidad/diarios
/panel/contabilidad/comprobantes
/panel/contabilidad/documentos
/panel/contabilidad/gastos
/panel/contabilidad/inventario
/panel/contabilidad/planilla
/panel/contabilidad/reportes
```

### QA de permisos contables

El Contador solo debe ver navegacion contable y queda bloqueado al intentar
entrar manualmente a rutas comerciales. El Vendedor no ve navegacion contable,
no entra a `/panel/contabilidad` y no ve costos.

El Administrador puede consultar y operar la base contable demo con alcance
global. El Gerente conserva su flujo comercial y solo consulta inventario y
reportes contables filtrados por su sucursal; los diarios, comprobantes y
documentos globales quedan reservados para Contador y Administrador.

### Documentos contables base

El Contador y el Administrador pueden preparar documentos contables base desde
`/panel/contabilidad/documentos`: Factura, Nota de Debito, Nota de Credito y
Recibo Oficial de Caja. Estos registros son internos para revision,
contabilizacion y conciliacion; no son facturacion fiscal completa y no generan
PDF. Los documentos operativos emitidos por Caja quedan disponibles para esta
revision contable.

El Vendedor no puede acceder a estos documentos. El Gerente no opera la seccion
documental; su acceso contable sigue limitado a inventario y reportes de su
sucursal.

---

## 13. Cajero

### Descripcion

El Cajero es un rol interno separado del flujo comercial y de la contabilidad
completa. Su espacio de trabajo esta bajo `/panel/caja` y sus subrutas. Caja
emite documentos operativos demo, registra pagos y prepara cierres diarios;
Contabilidad revisa, contabiliza y concilia.

### Puede hacer

- Ver dashboard de caja.
- Emitir facturas operativas demo.
- Emitir recibos oficiales de caja demo.
- Registrar abonos.
- Aplicar retencion 1% y retencion 2% como calculo operativo demo.
- Crear nota de debito demo.
- Crear nota de credito demo.
- Registrar forma de pago, banco y referencia cuando aplica.
- Ver documentos emitidos por Caja dentro de su sucursal.
- Preparar cierre diario de caja.

### No puede hacer

- Crear leads.
- Asignar leads.
- Gestionar vendedores.
- Crear reservas.
- Crear traslados.
- Modificar inventario.
- Ver costos de inventario.
- Acceder a contabilidad completa.
- Contabilizar documentos.
- Conciliar documentos.
- Anular fiscalmente documentos.
- Modificar catalogo publico.
- Operar Portal Cliente.
- Tocar Prisma o la base de datos futura.

### Rutas

```txt
/panel/caja
/panel/caja/facturacion
/panel/caja/recibos
/panel/caja/notas
/panel/caja/cierres
```

### Separacion Caja y Contabilidad

Caja emite documentos operativos demo y los deja disponibles como documentos
contables internos. Contabilidad no pierde su rol de revision, contabilizacion
y conciliacion. No hay integracion fiscal real, DGI, PDF ni anulacion fiscal
en esta fase.

### QA de permisos de Caja

El Cajero solo debe ver navegacion de Caja y queda bloqueado al intentar entrar
manualmente a rutas comerciales o a `/panel/contabilidad`. Puede emitir
facturas, recibos, notas y preparar cierres dentro de su sucursal, pero no
puede contabilizar, conciliar, ver costos ni operar inventario.

El Vendedor no ve Caja ni Contabilidad. El Contador ve desde Contabilidad los
documentos emitidos por Caja y puede marcarlos como revisados o contabilizados.
El Administrador conserva vista global. El Gerente mantiene sus accesos
comerciales y su consulta contable limitada a costos de su sucursal.

### Flujo de revisión contable

QA 2.22.1: los documentos nuevos de Contabilidad solo pueden iniciar como
Borrador o Emitido. Los estados Revisado, Contabilizado, Conciliado y Anulado
se alcanzan desde acciones contables autorizadas para Contador o Administrador,
respetando la secuencia Revisado -> Contabilizado -> Conciliado. La anulación
interna exige motivo y conserva trazabilidad.

El Contador y el Administrador pueden avanzar documentos internos por los
estados Borrador, Emitido, Revisado, Contabilizado, Conciliado y Anulado.
Contabilizar requiere revisión previa y conciliar requiere contabilización
previa. La anulación es interna de demo y exige motivo; no representa anulación
fiscal.

El Cajero emite documentos y prepara/cierra caja, pero no puede marcar
documentos como Revisado, Contabilizado ni Conciliado. Tampoco puede revisar
cierres desde Contabilidad. El Gerente solo consulta información contable de su
sucursal cuando el módulo lo permite.

### Contabilidad avanzada demo

El Contador y el Administrador tienen acceso al centro contable completo:
dashboard avanzado, catalogo de cuentas, diarios, comprobantes, documentos,
gastos, inventario valorizado, bancos, conciliacion interna, cierres, terceros,
planilla y reportes. El Cajero conserva solo Caja; Vendedor no ve Caja,
Contabilidad ni costos; Gerente conserva alcance por sucursal cuando aplica.
---

## 14. Patch 2.24 - Experiencia enfocada del Vendedor

El Vendedor trabaja desde un workspace comercial personal. Su navegacion
principal queda enfocada en Inicio, Mis leads, Clientes, Expedientes,
Actividades, Inventario, Reservas y Ventas.

No ve Caja, Contabilidad, Marketing, Reportes globales, Vendedores,
Configuracion global ni datos de costos. El seguimiento de credito permanece
dentro del expediente cuando aplica.

El inicio del Vendedor se presenta como "Mi trabajo de hoy" y prioriza leads
asignados, seguimientos vencidos, actividades de hoy, expedientes activos,
reservas activas, ventas en proceso e inventario disponible para oferta.

El inventario para Vendedor es consulta comercial de disponibilidad. La tabla
principal prioriza modelo, sucursal, estado, color y accion comercial; datos
tecnicos como VIN, chasis y motor quedan secundarios y no se exponen costos.

---

## 15. Patch 2.25 - Experiencia de supervision del Gerente

El Gerente trabaja desde una vista de comando de sucursal. Su navegacion
comercial se enfoca en Inicio, Leads, Clientes, Expedientes, Actividades,
Inventario, Traslados, Reservas, Ventas, Vendedores y Reportes.

El Gerente supervisa decisiones de sucursal: leads sin asignar, carga de
vendedores, actividades vencidas, reservas con riesgo, traslados pendientes,
ventas en progreso e inventario bajo. No debe sentirse como un Vendedor con
mas acciones, sino como responsable de equilibrar trabajo y resultados.

El alcance del Gerente sigue filtrado por sucursal. Puede asignar leads dentro
de su sucursal y consultar rendimiento de vendedores de su sucursal. El
Administrador conserva visibilidad global y el Vendedor conserva la experiencia
simplificada del Patch 2.24.

El acceso contable limitado del Gerente se mantiene solo donde las reglas del
proyecto ya lo permiten: consulta de costos/reportes de su sucursal. No obtiene
vista global de costos, no opera Caja y no administra configuracion global.

---

## 16. Patch 2.26 - Experiencia operativa del Cajero

El Cajero trabaja desde una estacion de caja enfocada, rapida y segura. Su
navegacion se limita a Caja (dashboard de turno), Facturacion, Recibos, Notas y
Cierres. No ve leads, gestion comercial de clientes, expedientes como flujo
comercial, vendedores, marketing, contabilidad completa, costos de inventario,
configuracion global ni areas tecnicas internas.

El dashboard de Caja responde a las preguntas operativas del turno: si la caja
esta abierta o cerrada, que documentos se emitieron, cuanto se recibio, cuanto
se pago por efectivo, transferencia, cheque o tarjeta, cuanta retencion 1% y 2%
se aplico, que documentos o cierres quedan pendientes y cual es la siguiente
accion.

Se mantiene la separacion Caja emite / Contabilidad revisa:

- El Cajero puede emitir facturas, recibos y notas, registrar abonos y
  retenciones, y preparar/cerrar el cierre diario dentro de su sucursal.
- El Cajero no puede contabilizar, conciliar, ver costos ni marcar un cierre o
  documento como Revisado por Contabilidad. La revision contable es de solo
  lectura desde Caja.
- El Contador y el Administrador conservan la revision de los documentos y
  cierres emitidos por Caja. El Vendedor no accede a Caja. Gerente y
  Administrador conservan su comportamiento previo.

---

## 17. Patch 2.27 - Centro de control contable del Contador

El Contador trabaja desde un centro de control contable, no desde una coleccion
de tablas. Su navegacion incluye Dashboard, Revisión de documentos, Asientos
contables, Comprobantes, Gastos, Inventario contable, Planilla, Plan de cuentas,
Bancos, Conciliación, Cierres, Terceros y Reportes.

El Contador no ve leads, flujo comercial del Vendedor, creacion de ventas,
reservas o traslados como operador comercial, ni la emision de documentos de
Caja, gestion de vendedores, marketing o Portal Cliente. La configuracion global
sigue reservada al Administrador.

El dashboard contable responde a las preguntas de control: que documentos
requieren revision, contabilizacion o conciliacion; que cierres de caja esperan
revision; que asientos estan descuadrados; que comprobantes, gastos, planilla e
inventario requieren atencion; y cual es la salud contable del negocio.

Se mantiene la separacion Caja emite / Contabilidad revisa, contabiliza,
concilia y controla:

- El Contador y el Administrador pueden revisar, contabilizar, conciliar y
  anular internamente (con motivo) los documentos, respetando la secuencia
  Revisado -> Contabilizado -> Conciliado.
- El Contador y el Administrador marcan la revision contable de los cierres de
  caja. El Cajero emite y prepara/cierra caja, pero no contabiliza, no concilia
  y no marca la revision contable.
- El Gerente conserva su acceso contable limitado a costos, inventario y
  reportes de su sucursal. El Vendedor y el Cajero no ven costos.
- El registro manual de documentos contables se mantiene como accion secundaria
  y colapsable; la revision sigue siendo el foco.

---

## 18. Patch 2.28 - Supervision global del Administrador

El Administrador no es un rol operativo separado como Vendedor, Cajero o
Contador: es el rol de supervision global y configuracion. Su navegacion incluye
Inicio, Leads, Clientes, Expedientes, Actividades, Inventario, Traslados,
Reservas, Ventas, Vendedores, Reportes y Configuracion. Conserva su acceso a
Caja y Contabilidad segun lo ya implementado; no se le fuerza acceso nuevo.

El dashboard del Administrador es "Supervisión global": responde que esta
pasando en todas las sucursales, que sucursales o vendedores requieren atencion,
que leads/reservas/traslados/ventas/entregas necesitan supervision, y que
alertas operativas existen. Prioriza una cola global de decisiones y un
comparativo de desempeño por sucursal, no la operacion diaria.

`/panel/configuracion` es una zona administrativa controlada solo para
Administrador: usuarios y roles, sucursales, reglas de negocio, alcances de datos
del sistema y notas de auditoria/seguridad. El reinicio de datos demo es una
accion destructiva aislada en una zona peligrosa con confirmacion; la gestion
real de usuarios, permisos y sucursales queda para una fase con autenticacion y
base de datos.

Permisos preservados:

- Administrador conserva visibilidad global y no pierde accesos.
- Gerente permanece con alcance por sucursal (Patch 2.25).
- Vendedor conserva su flujo simplificado sin costos (Patch 2.24).
- Cajero permanece aislado en Caja (Patch 2.26) y Contador en Contabilidad
  (Patch 2.27). Vendedor y Cajero no ven costos.

---

## 19. Patch 3.0 - Autenticacion real, usuarios y reglas de creacion

Los roles internos se mapean a un enum de base de datos: ADMIN (Administrador),
GERENTE (Gerente), VENDEDOR (Vendedor), CAJERO (Cajero) y CONTADOR (Contador).
El acceso al Centro de Operaciones ahora requiere iniciar sesion en `/login`;
`middleware.ts` protege `/panel/*` y redirige a `/login` sin sesion valida. La
sesion se firma en una cookie (HMAC) y se refleja en la sesion interna existente
para no cambiar el comportamiento de los paneles.

Reglas de creacion de usuarios:

- Administrador: crea usuarios de cualquier rol (ADMIN, GERENTE, VENDEDOR,
  CAJERO, CONTADOR) y asigna cualquier sucursal. Los roles globales (ADMIN,
  CONTADOR) se crean sin sucursal.
- Gerente: crea unicamente usuarios VENDEDOR y solo en su propia sucursal. No
  puede crear ADMIN, GERENTE, CAJERO ni CONTADOR, ni usuarios de otra sucursal.
- Vendedor: no puede crear usuarios.
- Cajero: no puede crear usuarios.
- Contador: no puede crear usuarios.

La gestion de usuarios vive en `/panel/configuracion` (Administrador y Gerente).
La creacion se persiste en la base de datos y deja traza en `UserAuditLog`. Las
decisiones de autorizacion se aplican en el servidor (server actions), no solo
en la interfaz.

Reglas de inventario de motocicletas (`/panel/inventario/movimientos`):

- Administrador: registra ingresos y egresos para cualquier sucursal.
- Gerente: registra ingresos y egresos solo de su sucursal.
- Vendedor: solo consulta disponibilidad en `/panel/inventario`; no gestiona
  inventario ni ve costos.
- Cajero: no gestiona inventario.
- Contador: mantiene su vista contable de inventario con costos; no es el
  operador de altas/bajas comerciales de unidades.

Costos: Contador y Administrador ven costos globales; Gerente ve costos de su
sucursal; Vendedor y Cajero no ven costos (`canViewCosts`).

Cuentas de desarrollo (solo cuando NO hay `DATABASE_URL`; cambiar antes de
produccion): `admin@motomas.local`, `gerente@motomas.local`,
`vendedor@motomas.local`, `cajero@motomas.local`, `contador@motomas.local`,
todas con contraseña `Motomas.2026`. Con base de datos configurada, estas
cuentas se ignoran y los usuarios provienen de la tabla `users` (seed inicial en
`prisma/seed.mjs`).

---

## 20. Patch 4.0B - Roles Marketing y Soporte Técnico preparados

El sistema reconoce dos roles internos adicionales en la base de datos, el
servidor y los tipos de interfaz:

- `MARKETING` se muestra como "Marketing" y tiene como ruta inicial preparada
  `/panel/marketing`.
- `SOPORTE_TECNICO` se muestra como "Soporte Técnico" y tiene como ruta inicial
  preparada `/panel/soporte`.

Ambos roles están en estado de scaffolding. Marketing no recibe todavía permisos
para operar campañas, atribución, CRM, inventario, reservas, ventas, Caja ni
Contabilidad; su activación funcional corresponde al Patch 4.0C. Soporte Técnico
no recibe todavia permisos comerciales, financieros, contables, de diagnostico o
de gestion de incidencias; su activacion funcional corresponde al Patch 4.0D.

Ninguno de los dos roles ve costos, gestiona usuarios, obtiene alcance global ni
evita las reglas de sucursal. Tickets / Ayuda y las rutas `/panel/ayuda*` no se
implementan en este patch; corresponden a los Patches 4.0E, 4.0F y 4.0G.

No se agregan cuentas de desarrollo ni usuarios de producción automáticos para
estos roles. Las identidades existentes y sus permisos se mantienen sin cambios.

---

## 21. Patch 4.0C - Activación del rol Marketing

`MARKETING` está activo únicamente dentro de `/panel/marketing*`. Su navegación
muestra solo Marketing y su ruta inicial sigue siendo `/panel/marketing`.

Puede consultar el dashboard de campañas, métricas de atribución y rendimiento;
crear, editar, pausar, reactivar y finalizar campañas con las capacidades que ya
ofrece el módulo. Su alcance transversal existe solo dentro de las consultas de
Marketing y no lo convierte en un rol global para otros datos del negocio.

La vista reducida de atribución muestra exclusivamente código y fecha del lead,
campaña, canal, sucursal, motocicleta de interés, estado general, resultado final
cuando existe y fecha de conversión cuando puede obtenerse del expediente. No
incluye nombre, teléfono, cédula, correo, vendedor, notas privadas, documentos,
evaluaciones de crédito, referencias, conversaciones ni observaciones sensibles.

Marketing no opera leads ni cambia su estado, asignación o sucursal; tampoco
gestiona clientes, expedientes, inventario, reservas, traslados, ventas, créditos,
Caja, Contabilidad, costos contables/financieros, usuarios o configuración. Meta
API, pagos de anuncios y Tickets / Ayuda permanecen diferidos.

No se agregan usuarios automáticos ni cuentas de desarrollo para Marketing. Un
usuario MARKETING creado por Administrador entra al módulo existente y queda
confinado a él.

---

## 22. Patch 4.0D - Activación del rol Soporte Técnico

`SOPORTE_TECNICO` está activo únicamente dentro de `/panel/soporte*`. Su
navegación muestra solo Soporte Técnico y su ruta inicial sigue siendo
`/panel/soporte`. Administrador puede entrar directamente para supervisar sin
añadir otro elemento a su navegación.

El rol accede a un dashboard técnico seguro con estado general de conectividad y
una auditoría técnica sanitizada de solo lectura. La auditoría muestra únicamente
categorías conocidas, tipo general, fecha y conteos; excluye descripciones libres,
usuarios actores, identificadores de destino y cualquier dato privado. Su alcance
global existe solo dentro de estas consultas de soporte y no convierte al rol en
global para datos del negocio.

Soporte Técnico no opera CRM, leads, clientes, expedientes, actividades,
inventario, reservas, traslados, ventas, Marketing, Caja, Contabilidad, costos,
usuarios ni configuración. Tampoco cambia roles, contraseñas, bloqueos o sesiones;
el soporte de acceso permanece como un futuro flujo de solicitud con aprobación de
Administrador.

El panel no incluye consola SQL, credenciales, valores de configuración, trazas
crudas, controles de despliegue, reinicio, mantenimiento destructivo ni borrado de
auditoría. Tickets / Ayuda y las rutas `/panel/ayuda*` permanecen diferidos a los
Patches 4.0E, 4.0F y 4.0G.

---

## 23. Patch 4.0E - Capa de servidor para Tickets / Ayuda

La base de datos y la capa interna de servidor para Tickets / Ayuda ya existen.
Este patch no agrega todavia `/panel/ayuda`, `/panel/soporte/tickets` ni otra
interfaz de tickets. Las rutas y formularios compartidos corresponden al Patch
4.0F; la bandeja operativa de Soporte Tecnico corresponde al Patch 4.0G.

Los siete roles internos pueden crear tickets y consultar sus propios tickets o
aquellos donde participan cuando la interfaz se publique en 4.0F. Gerente puede
consultar incidencias operativas de su sucursal, pero no tickets personales de
acceso o seguridad de otros empleados. Administrador supervisa todos los tickets
y Soporte Tecnico tiene alcance global dentro del sistema de tickets sin recibir
acceso global a CRM, inventario, Caja, Contabilidad o Marketing.

Los comentarios `PUBLIC` forman la conversacion visible del ticket. Los
comentarios `INTERNAL` son exclusivos de Administrador y Soporte Tecnico; no se
devuelven a creadores, participantes, Gerente ni otros roles. Los cambios de
estado, asignacion, prioridad, duplicado, incidente relacionado y comentarios
generan auditoria en `TicketEvent`.

La capa aplica enmascaramiento preventivo a texto y contexto antes de guardar,
pero este control es de mejor esfuerzo y no sustituye una solucion DLP. No deben
enviarse contrasenas, tokens, cookies, valores de `.env`, numeros completos de
tarjeta ni CVV. Los tickets publicos de clientes continuan diferidos y no forman
parte de este patch.

---

## 24. Patch 4.0F - Tickets / Ayuda compartido

Los siete roles internos pueden entrar a `/panel/ayuda*`, reportar un problema,
consultar sus tickets propios o participados, responder en la conversacion
publica y solicitar cancelacion o reapertura cuando el estado lo permite. Las
rutas usan el codigo publico `TKT-YYYY-NNNNN`; el identificador interno del
ticket no se publica en URL ni en la interfaz.

La visibilidad sigue siendo responsabilidad de la capa de servidor del Patch
4.0E: Vendedor, Cajero, Contador y Marketing tienen alcance personal; Gerente
tambien puede ver incidencias operativas autorizadas de su sucursal, sin acceder
a tickets personales de acceso o seguridad de otros empleados; Administrador y
Soporte Tecnico conservan su alcance global dentro del sistema de tickets.

Cajero queda confinado a Caja y Ayuda, Contador a Contabilidad y Ayuda,
Marketing a Marketing y Ayuda, y Soporte Tecnico a Soporte y Ayuda. Esta
ampliacion no habilita ninguna otra area del panel ni modifica permisos de
negocio.

Las notas internas solo se muestran a Administrador y Soporte Tecnico cuando el
DTO autorizado las devuelve. Los demas roles no reciben la seccion, conteos ni
contenido interno. La bandeja y los controles operativos de tickets permanecen
diferidos al Patch 4.0G; los tickets publicos de clientes permanecen diferidos
al Patch 4.0H.

Ningun usuario que crea un reporte desde el flujo compartido, incluidos
Administrador y Soporte Tecnico, puede seleccionar su alcance de visibilidad.
La accion de servidor crea siempre un ticket `USER` y no confia en un valor de
alcance incluido manualmente en la solicitud.

Clasificar un reporte como incidencia `BRANCH`, `MODULE` o `GLOBAL` es una
responsabilidad operativa futura de Administrador o Soporte Tecnico mediante
los controles autorizados del Patch 4.0G. Esos controles no forman parte de este
patch y los roles ordinarios no reciben una accion alternativa para ampliar el
alcance.
