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
