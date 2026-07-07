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
