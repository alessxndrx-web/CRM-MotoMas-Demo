# MotoMas — Flujos operativos

## 1. Objetivo

Este documento resume cómo debe funcionar MotoMas en escenarios reales.

No describe pantallas exactas.

Describe el comportamiento esperado del sistema.

---

## 2. Flujo completo de la demo

```txt
Cliente ve anuncio
↓
Cliente llena formulario
↓
Selecciona sucursal
↓
Lead entra a bandeja de sucursal
↓
Gerente asigna vendedor
↓
Vendedor contacta prospecto
↓
Vendedor crea cotización
↓
Vendedor crea expediente
↓
Lead se convierte en cliente
↓
Vendedor crea solicitud de crédito
↓
Vendedor reserva unidad
↓
Si no hay stock local, solicita traslado
↓
Gerente aprueba traslado
↓
Unidad viaja a sucursal destino
↓
Sucursal receptora confirma recepción
↓
Crédito se marca como aprobado
↓
Venta se completa
↓
Cliente consulta que su moto está lista para entrega
```

Este flujo debe poder demostrarse dentro de la demo funcional.

---

## 3. Flujo de entrada de lead

### Escenario

Juan Pérez ve un anuncio de Facebook Ads de una Pulsar NS200.

Ingresa al Portal Cliente.

Completa formulario:

```txt
Nombre: Juan Pérez
Teléfono: 8888-0000
Correo: juan@example.com
Moto de interés: Pulsar NS200
Sucursal: Plaza Inter
Origen: Facebook Ads
```

### Resultado esperado

El sistema crea un lead:

```txt
Estado: Nuevo Lead
Sucursal: Plaza Inter
Vendedor: Sin asignar
```

El lead entra a la bandeja de Plaza Inter.

No se asigna automáticamente.

---

## 4. Flujo de asignación manual

### Escenario

El gerente de Plaza Inter entra al Centro de Operaciones.

Ve:

```txt
Leads pendientes
- Juan Pérez
- Carlos Ruiz
- María López
```

También ve carga de trabajo:

```txt
Roberto
Leads activos: 24
Ventas del mes: 8

María
Leads activos: 12
Ventas del mes: 6
```

El gerente decide asignar Juan Pérez a María.

### Resultado esperado

El lead cambia a:

```txt
Estado: Asignado
Vendedor: María
Sucursal: Plaza Inter
```

El historial registra:

```txt
Lead asignado a María por gerente de Plaza Inter
```

---

## 5. Flujo comercial Lead → Cliente

Estados recomendados:

```txt
Nuevo Lead
↓
Asignado
↓
Contactado
↓
Interesado
↓
Cotización
↓
Expediente
↓
Cliente
↓
Crédito
↓
Venta
```

### Escenario

María llama a Juan Pérez.

Registra:

```txt
Contacto realizado.
Cliente interesado en Pulsar NS200.
Solicita cotización.
```

Después crea cotización.

Más adelante crea expediente.

En ese momento el lead se convierte en cliente formal.

### Resultado esperado

La información original no se pierde.

El cliente conserva:

- Origen del lead.
- Sucursal seleccionada.
- Vendedor asignado.
- Historial.
- Cotizaciones.
- Expediente.
- Créditos.
- Reserva.
- Venta.

---

## 6. Flujo cliente multi-sucursal

### Escenario

Juan Pérez solicita información en Plaza Inter.

Más tarde visita Ciudad Sandino.

Después escribe por WhatsApp a Masaya.

Interacciones:

```txt
Plaza Inter
Vendedora: María
Moto: Pulsar NS200
Estado: Cotización creada

Ciudad Sandino
Vendedor: Roberto
Moto: Boxer
Estado: Seguimiento

Masaya
Vendedor: José
Moto: Dominar
Estado: Contactado
```

### Resultado esperado

Juan Pérez existe una sola vez.

El sistema no debe crear tres clientes duplicados.

Debe mostrar historial multi-sucursal.

Ningún vendedor debe quedar bloqueado para atenderlo.

La venta puede cerrarse desde la sucursal donde el cliente decida comprar.

---

## 7. Flujo de crédito

### Escenario de la demo actual

Juan Pérez decide iniciar un seguimiento de crédito para Pulsar NS200.

María crea un seguimiento dentro del expediente y registra la financiera
seleccionada. Puede actualizar manualmente la financiera, la documentación
pendiente, el estado y las observaciones.

```txt
Expediente: EXP-20260619-025
Financiera: MongePay
Estado: En revisión
```

### Resultado esperado

Cada actualización conserva:

- Financiera.
- Estado.
- Fecha.
- Usuario.
- Observación.
- Historial.

No se requiere integración automática con financieras.

La actualización es manual.

Cada expediente admite un solo seguimiento de crédito activo en esta fase. Una
versión futura podrá modelar varias aplicaciones por expediente, pero no forma
parte de la demo actual.

---

## 8. Flujo de reserva

### Escenario

El crédito de Juan Pérez está avanzando.

María encuentra una Pulsar NS200 disponible.

Reserva una unidad específica:

```txt
Modelo: Pulsar NS200
VIN: VIN-DEMO-001
Sucursal: Plaza Inter
Estado anterior: Disponible
Estado nuevo: Reservada
Cliente: Juan Pérez
```

### Resultado esperado

La unidad deja de aparecer como disponible.

La reserva queda relacionada con:

- Cliente.
- Vendedor.
- Sucursal.
- Unidad.
- Fecha.
- Estado.

---

## 9. Flujo de inventario por sucursal

### Vista agregada

```txt
Pulsar NS200

Plaza Inter: 20
Rubenia: 12
Ciudad Sandino: 8

Total: 40
```

### Vista por unidad

```txt
VIN-DEMO-001
Modelo: Pulsar NS200
Sucursal actual: Plaza Inter
Estado: Reservada

VIN-DEMO-002
Modelo: Pulsar NS200
Sucursal actual: Rubenia
Estado: Disponible
```

### Resultado esperado

El usuario puede saber:

- Cuántas unidades existen.
- En qué sucursal se encuentran.
- Qué unidades están disponibles.
- Qué unidades están reservadas.
- Qué unidades están en tránsito.
- Qué unidades ya se vendieron.

---

## 10. Flujo de traslado

### Escenario

Juan Pérez quiere una Pulsar NS200 en Plaza Inter.

Plaza Inter no tiene stock disponible.

Rubenia sí tiene una unidad.

María solicita traslado:

```txt
Origen: Rubenia
Destino: Plaza Inter
Unidad: VIN-DEMO-002
Modelo: Pulsar NS200
Motivo: Reserva para cliente Juan Pérez
Estado: Pendiente
```

### Aprobación

El gerente revisa solicitud.

Marca:

```txt
Estado: Aprobado
```

### Despacho

La unidad sale de Rubenia.

Marca:

```txt
Estado: En tránsito
Sucursal actual: En tránsito
```

### Recepción

Plaza Inter confirma recepción.

Marca:

```txt
Estado: Recibido
Sucursal actual: Plaza Inter
```

### Resultado esperado

Se registra historial completo.

La unidad ya no aparece como disponible en Rubenia.

Ahora aparece en Plaza Inter.

---

## 11. Flujo de venta

### Escenario

MongePay aprueba crédito.

La unidad ya está disponible en Plaza Inter.

María completa venta.

Datos:

```txt
Cliente: Juan Pérez
Unidad: VIN-DEMO-002
Modelo: Pulsar NS200
Sucursal: Plaza Inter
Vendedor: María
Tipo: Crédito
Financiera: MongePay
Estado: Completada
```

### Resultado esperado

La unidad cambia a:

```txt
Vendida
```

Después, al entregarse:

```txt
Entregada
```

El historial permanece disponible.

---

## 12. Flujo Portal Cliente

### Escenario

Juan Pérez consulta su proceso.

El Portal Cliente debe mostrar:

```txt
Moto seleccionada: Pulsar NS200
Sucursal: Plaza Inter
Crédito: Aprobado
Reserva: Confirmada
Entrega: Lista para entrega
```

Timeline:

```txt
12 de junio
Lead registrado

13 de junio
Cotización creada

14 de junio
Expediente creado

15 de junio
Solicitud enviada a MongePay

17 de junio
Crédito aprobado

18 de junio
Unidad recibida en Plaza Inter

18 de junio
Moto lista para entrega
```

El cliente no debe ver información interna sensible.

---

## 13. Flujo de reasignación por salida de vendedor

### Escenario

María deja de trabajar en la empresa.

El gerente entra a su cartera.

Selecciona leads y clientes activos.

Los reasigna a Roberto.

### Resultado esperado

No se elimina historial.

Se conserva:

- Atención original de María.
- Fechas.
- Seguimientos.
- Cotizaciones.
- Expedientes.
- Créditos.
- Ventas.

El sistema registra:

```txt
Cartera reasignada de María a Roberto por gerente de Plaza Inter.
```

---

## 14. Flujo de reportes

### Vendedor

Ve únicamente información necesaria para su trabajo:

- Leads asignados.
- Seguimientos.
- Ventas propias.
- Créditos que gestiona.
- Reservas activas.

### Gerente

Ve:

- Ventas de sucursal.
- Leads pendientes.
- Conversión por vendedor.
- Inventario local.
- Traslados.
- Créditos.
- Reservas.

### Administrador

Ve:

- Ventas globales.
- Comparación de sucursales.
- Inventario consolidado.
- Traslados nacionales.
- Créditos por financiera.
- Ranking de sucursales.
- Ranking de vendedores.
- Actividad global.

---

## 15. Casos que el sistema debe evitar

### No duplicar clientes

No crear un nuevo cliente si ya existe.

Buscar por:

- Teléfono.
- Correo.
- Identificación cuando exista.

### No bloquear cliente por vendedor

Un cliente atendido por María puede ser atendido después por Roberto.

### No ocultar ubicación de unidades

Toda unidad debe tener sucursal actual o estado en tránsito.

### No actualizar inventario sin historial

Todo movimiento debe generar trazabilidad.

### No mostrar reportes a vendedores

La navegación y las rutas deben respetar permisos.

### No mezclar Portal Cliente y Centro de Operaciones

El cliente no debe entrar al mismo login que vendedor, gerente y administrador.
